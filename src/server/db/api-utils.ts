/**
 * API handler helpers: DB init, auth enforcement, permission checks,
 * request parsing, and zod validation.
 */
import type { ZodType } from "zod";
import { ensureInit } from "./index";
import { getCurrentUser, hasPermission } from "./auth";
import { AppError } from "./errors";

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  branchId: string | null;
  [k: string]: unknown;
}

export interface Ctx {
  user: AuthedUser;
  ip: string;
  userAgent: string;
  request: Request;
}

const SESSION_COOKIE = "session_token";

export function getSessionToken(request: Request): string | undefined {
  const header = request.headers.get("x-session-token");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    ""
  );
}

export function err(message: string, status = 400, code?: string) {
  return Response.json({ error: true, message, code }, { status });
}

/** Public handler: DB init + error catching. NO auth. Use for /auth, /health. */
export function safeHandler(
  fn: (event: { request: Request }) => Promise<Response>,
): (event: { request: Request }) => Promise<Response> {
  return async (event) => {
    try {
      await ensureInit();
      return await fn(event);
    } catch (e) {
      if (e instanceof AppError) return err(e.message, e.status, e.code);
      console.error("[api] error:", e instanceof Error ? e.message : e);
      return err("حدث خطأ داخلي", 500, "INTERNAL_ERROR");
    }
  };
}

/**
 * Authenticated handler: DB init + session enforcement + optional permission.
 * The handler receives a validated Ctx with the session-derived user.
 * NEVER trust userId/userName from the request body — use ctx.user.
 */
export function authHandler(
  permission: string | null,
  fn: (event: { request: Request }, ctx: Ctx) => Promise<Response>,
): (event: { request: Request }) => Promise<Response> {
  return async (event) => {
    try {
      await ensureInit();
      const token = getSessionToken(event.request);
      const user = (await getCurrentUser(token)) as AuthedUser | null;
      if (!user) return err("يجب تسجيل الدخول", 401, "UNAUTHENTICATED");
      if (permission && !(await hasPermission(user.role, permission))) {
        return err("لا تملك صلاحية لهذا الإجراء", 403, "FORBIDDEN");
      }
      const ctx: Ctx = {
        user,
        ip: clientIp(event.request),
        userAgent: event.request.headers.get("user-agent") || "",
        request: event.request,
      };
      return await fn(event, ctx);
    } catch (e) {
      if (e instanceof AppError) return err(e.message, e.status, e.code);
      console.error("[api] error:", e instanceof Error ? e.message : e);
      return err("حدث خطأ داخلي", 500, "INTERNAL_ERROR");
    }
  };
}

/** Parse + validate a JSON body with a zod schema. Throws a Response on failure. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw err("صيغة الطلب غير صحيحة", 400, "BAD_JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
  }
  return result.data;
}

/** Run an async handler body that may throw a Response (from parseBody). */
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
