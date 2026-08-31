/**
 * Public account-setup endpoint for the emailed one-time link (no session).
 *   POST { action:"validate", token }        → { valid, name?, email?, purpose? }
 *   POST { action:"set", token, newPassword } → { success } and clears any session cookie
 * The token itself is the credential; it is single-use and time-bounded.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { safeHandler, parseBody, guard, err } from "@/server/db/api-utils";
import { verifySetupToken, setPasswordWithToken } from "@/server/db/invitations";

const COOKIE = "session_token";
function clearCookie() {
  const parts = [`${COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Strict", "Max-Age=0"];
  if (process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false")
    parts.push("Secure");
  return parts.join("; ");
}

const setSchema = z.object({
  action: z.literal("set"),
  token: z.string().min(1),
  newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

async function POST({ request }: { request: Request }) {
  return guard(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = (body as { action?: string }).action;

    if (action === "validate") {
      const token = String((body as { token?: string }).token || "");
      const v = await verifySetupToken(token);
      if (!v.ok) return Response.json({ valid: false });
      return Response.json({ valid: true, name: v.name, email: v.email, purpose: v.purpose });
    }

    if (action === "set") {
      const parsed = setSchema.safeParse(body);
      if (!parsed.success)
        return err(parsed.error.issues[0]?.message || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
      const r = await setPasswordWithToken(parsed.data.token, parsed.data.newPassword);
      if (!r.ok) {
        const msg =
          r.code === "EXPIRED_TOKEN"
            ? "انتهت صلاحية الرابط — اطلب دعوة جديدة"
            : r.code === "WEAK_PASSWORD"
              ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
              : "الرابط غير صالح أو استُخدم من قبل";
        return err(msg, 400, r.code);
      }
      return Response.json({ success: true }, { headers: { "Set-Cookie": clearCookie() } });
    }

    return err("إجراء غير معروف", 400, "BAD_ACTION");
  });
}

export const Route = createFileRoute("/api/auth-setup")({
  server: { handlers: { POST: safeHandler(POST) } },
});
