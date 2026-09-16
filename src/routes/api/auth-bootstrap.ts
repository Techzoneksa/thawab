/**
 * First-run setup endpoint (SaaS onboarding) — PUBLIC, no session.
 *   GET                       → { needsSetup }  (true only when 0 users exist)
 *   POST { name,email,password} → creates the owner super-admin + opens a session
 *
 * bootstrapFirstAdmin is guarded server-side: it succeeds only while the tenant
 * database has zero users, so this public endpoint cannot add admins afterwards.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { safeHandler, guard, err, clientIp } from "@/server/db/api-utils";
import { needsBootstrap, bootstrapFirstAdmin } from "@/server/db/auth";

const COOKIE = "session_token";
const MAX_AGE = 7 * 24 * 60 * 60;

function isSecure() {
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

function sessionCookie(token: string) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${MAX_AGE}`,
  ];
  if (isSecure()) parts.push("Secure");
  return parts.join("; ");
}

const setupSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب"),
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

async function GET() {
  return guard(async () => Response.json({ needsSetup: await needsBootstrap() }));
}

async function POST({ request }: { request: Request }) {
  return guard(async () => {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success)
      return err(parsed.error.issues[0]?.message || "بيانات غير صالحة", 422, "VALIDATION_ERROR");

    const res = await bootstrapFirstAdmin(
      parsed.data,
      clientIp(request),
      request.headers.get("user-agent") || "",
    );
    if ("error" in res) return err(res.error, 403, res.code);

    return Response.json(
      { user: res.user },
      { headers: { "Set-Cookie": sessionCookie(res.token) } },
    );
  });
}

export const Route = createFileRoute("/api/auth-bootstrap")({
  server: { handlers: { GET: safeHandler(GET), POST: safeHandler(POST) } },
});
