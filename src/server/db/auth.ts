/**
 * Authentication: password hashing (scrypt), CSPRNG session tokens,
 * session lifecycle, login rate-limiting, and RBAC permission checks.
 *
 * No external dependencies — uses node:crypto only.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, now, genId } from "./index";
import { users, sessions, roles, loginAttempts } from "./schema";
import { UserStatus } from "@/lib/enums";

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Lockout policy
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// ---------- password hashing ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N }).toString("hex");
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, salt, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hashHex) return false;
    const n = Number(nStr) || SCRYPT_N;
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, expected.length, { N: n });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- session tokens ----------

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string, ip = "", userAgent = "") {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.insert(sessions).values({
    id: genId("S"),
    userId,
    token,
    ip,
    userAgent,
    expiresAt,
    createdAt: now(),
  });
  return token;
}

export async function getCurrentUser(token: string | undefined | null) {
  if (!token) return null;
  const session = (await db.select().from(sessions).where(eq(sessions.token, token)).limit(1))[0];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const user = (await db.select().from(users).where(eq(users.id, session.userId)).limit(1))[0];
  if (!user || user.status !== UserStatus.ACTIVE) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

// ---------- login with rate limiting ----------

async function recentFailures(email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(and(eq(loginAttempts.success, false), gt(loginAttempts.at, since)));
  return rows.filter((r) => r.email === email || r.ip === ip).length;
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  await db.insert(loginAttempts).values({
    id: genId("LA"),
    email,
    ip,
    success,
    at: now(),
  });
}

const GENERIC_ERROR = "البريد الإلكتروني أو كلمة المرور غير صحيحة";

export async function login(email: string, password: string, ip = "", userAgent = "") {
  if (await recentFailures(email, ip) >= MAX_FAILS) {
    return { error: "تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.", code: "LOCKED_OUT" };
  }

  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  const ok = !!user && user.status === UserStatus.ACTIVE && verifyPassword(password, user.password);

  await recordAttempt(email, ip, ok);
  if (!user || !ok) return { error: GENERIC_ERROR, code: "INVALID_CREDENTIALS" };

  await db.update(users).set({ lastLogin: now() }).where(eq(users.id, user.id));
  const token = await createSession(user.id, ip, userAgent);
  const { password: _pw, ...safe } = user;
  return { user: safe, token, mustChangePassword: user.mustChangePassword };
}

export async function logout(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  return !!user && verifyPassword(password, user.password);
}

export async function changePassword(userId: string, newPassword: string) {
  await db
    .update(users)
    .set({ password: hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, userId));
  // Invalidate all other sessions on password change.
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ---------- RBAC ----------

export async function getRolePermissions(roleId: string): Promise<string[]> {
  const row = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0];
  if (!row) return [];
  try {
    return JSON.parse(row.permissions);
  } catch {
    return [];
  }
}

export async function hasPermission(roleId: string, permission: string): Promise<boolean> {
  const perms = await getRolePermissions(roleId);
  const [mod, action] = permission.split(".");
  return (
    perms.includes("*") ||
    perms.includes(permission) ||
    perms.includes(`${mod}.*`) ||
    (!!action && perms.includes(`*.${action}`))
  );
}
