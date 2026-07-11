import { db, now, genId } from "./index";
import { users, sessions, roles } from "./schema";
import { eq } from "drizzle-orm";

export function hashPassword(p: string) {
  return Buffer.from(p).toString("base64");
}

export function verifyPassword(p: string, hash: string) {
  return Buffer.from(p).toString("base64") === hash;
}

export async function createSession(userId: string) {
  const token = genId("sess");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(sessions)
    .values({
      id: genId("S"),
      userId,
      token,
      expiresAt: expires,
      createdAt: now(),
    })
    .run();
  return token;
}

export async function getCurrentUser(token: string | undefined) {
  if (!token) return null;
  const session = (await db.select().from(sessions).where(eq(sessions.token, token)).limit(1).all())[0];
  if (!session) return null;
  const expires = new Date(session.expiresAt);
  if (expires < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }
  const user = (await db.select().from(users).where(eq(users.id, session.userId)).limit(1).all())[0];
  if (!user || user.status !== "نشط") return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

export async function login(email: string, password: string) {
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1).all())[0];
  if (!user) return { error: "المستخدم غير موجود" };
  if (!verifyPassword(password, user.password)) return { error: "كلمة المرور غير صحيحة" };
  if (user.status !== "نشط") return { error: "الحساب غير نشط" };

  await db.update(users).set({ lastLogin: now() }).where(eq(users.id, user.id)).run();

  const token = await createSession(user.id);
  const { password: _, ...safeUser } = user;
  return { user: safeUser, token };
}

export async function logout(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token)).run();
}

export async function getRolePermissions(roleId: string) {
  const roleRow = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1).all())[0];
  if (!roleRow) return [];
  try {
    return JSON.parse(roleRow.permissions);
  } catch {
    return [];
  }
}

export async function hasPermission(roleId: string, permission: string) {
  const perms = await getRolePermissions(roleId);
  return (
    perms.includes("*") ||
    perms.includes(permission) ||
    perms.includes(`${permission.split(".")[0]}.*`)
  );
}
