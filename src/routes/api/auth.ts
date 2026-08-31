import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  login,
  logout,
  getCurrentUser,
  changePassword,
  forceChangePassword,
  verifyUserPassword,
} from "@/server/db/auth";
import {
  safeHandler,
  parseBody,
  guard,
  err,
  getSessionToken,
  clientIp,
} from "@/server/db/api-utils";

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

function clearCookie() {
  const parts = [`${COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Strict", "Max-Age=0"];
  if (isSecure()) parts.push("Secure");
  return parts.join("; ");
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const changePwSchema = z.object({
  action: z.literal("change_password"),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

const forceChangePwSchema = z.object({
  action: z.literal("force_change_password"),
  newPassword: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

async function POST({ request }: { request: Request }) {
  return guard(async () => {
    // Peek at the action without consuming the stream twice.
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const action = (body as { action?: string }).action;

    if (action === "logout") {
      const token = getSessionToken(request);
      if (token) await logout(token);
      return Response.json({ success: true }, { headers: { "Set-Cookie": clearCookie() } });
    }

    if (action === "change_password") {
      const token = getSessionToken(request);
      const user = await getCurrentUser(token);
      if (!user) return err("يجب تسجيل الدخول", 401, "UNAUTHENTICATED");
      const parsed = changePwSchema.safeParse(body);
      if (!parsed.success) return err("بيانات غير صالحة", 422, "VALIDATION_ERROR");
      if (!(await verifyUserPassword(user.id, parsed.data.currentPassword))) {
        return err("كلمة المرور الحالية غير صحيحة", 400, "BAD_PASSWORD");
      }
      await changePassword(user.id, parsed.data.newPassword);
      return Response.json({ success: true }, { headers: { "Set-Cookie": clearCookie() } });
    }

    if (action === "force_change_password") {
      // Forced first-login change: the session is already authenticated (user
      // logged in with the temporary password) and must currently be flagged
      // mustChangePassword. Only a new password is required; the session stays.
      const token = getSessionToken(request);
      const user = await getCurrentUser(token);
      if (!user) return err("يجب تسجيل الدخول", 401, "UNAUTHENTICATED");
      if (!user.mustChangePassword) return err("لا يلزم تغيير كلمة المرور", 400, "NOT_REQUIRED");
      const parsed = forceChangePwSchema.safeParse(body);
      if (!parsed.success)
        return err(parsed.error.issues[0]?.message || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
      await forceChangePassword(user.id, parsed.data.newPassword);
      return Response.json({ success: true });
    }

    // Login
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return err("البريد الإلكتروني وكلمة المرور مطلوبان", 400, "BAD_REQUEST");

    const result = await login(
      parsed.data.email,
      parsed.data.password,
      clientIp(request),
      request.headers.get("user-agent") || "",
    );
    if ("error" in result) return err(result.error!, 401, result.code);

    return Response.json(
      { user: result.user, token: result.token, mustChangePassword: result.mustChangePassword },
      { headers: { "Set-Cookie": sessionCookie(result.token!) } },
    );
  });
}

async function GET({ request }: { request: Request }) {
  const token = getSessionToken(request);
  if (!token) return Response.json({ user: null });
  const user = await getCurrentUser(token);
  return Response.json({ user });
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      POST: safeHandler(POST),
      GET: safeHandler(GET),
    },
  },
});
