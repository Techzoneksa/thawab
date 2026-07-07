import { db, now, genId } from "./index";
import { users, sessions, roles } from "./schema";
import { eq } from "drizzle-orm";

export function hashPassword(p: string) {
  return Buffer.from(p).toString("base64");
}

export function verifyPassword(p: string, hash: string) {
  return Buffer.from(p).toString("base64") === hash;
}

export function createSession(userId: string) {
  const token = genId("sess");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.insert(sessions)
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

export function getCurrentUser(token: string | undefined) {
  if (!token) return null;
  const session = db.select().from(sessions).where(eq(sessions.token, token)).limit(1).all()[0];
  if (!session) return null;
  const expires = new Date(session.expiresAt);
  if (expires < new Date()) {
    db.delete(sessions).where(eq(sessions.id, session.id)).run();
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, session.userId)).limit(1).all()[0];
  if (!user || user.status !== "نشط") return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

export function login(email: string, password: string) {
  const user = db.select().from(users).where(eq(users.email, email)).limit(1).all()[0];
  if (!user) return { error: "المستخدم غير موجود" };
  if (!verifyPassword(password, user.password)) return { error: "كلمة المرور غير صحيحة" };
  if (user.status !== "نشط") return { error: "الحساب غير نشط" };

  db.update(users).set({ lastLogin: now() }).where(eq(users.id, user.id)).run();

  const token = createSession(user.id);
  const { password: _, ...safeUser } = user;
  return { user: safeUser, token };
}

export function logout(token: string) {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export function getRolePermissions(roleId: string) {
  const roleRow = db.select().from(roles).where(eq(roles.id, roleId)).limit(1).all()[0];
  if (!roleRow) return [];
  try {
    return JSON.parse(roleRow.permissions);
  } catch {
    return [];
  }
}

export function hasPermission(roleId: string, permission: string) {
  const perms = getRolePermissions(roleId);
  return (
    perms.includes("*") ||
    perms.includes(permission) ||
    perms.includes(`${permission.split(".")[0]}.*`)
  );
}
