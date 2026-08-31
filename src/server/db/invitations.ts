/**
 * Account-setup / password-reset tokens.
 *
 * A raw token is generated, its SHA-256 hash is stored, and only the raw value
 * is placed in the emailed link. Tokens are single-use and time-bounded. Setting
 * a password via a valid token activates the account, clears mustChangePassword,
 * consumes the token, and invalidates any existing sessions for that user.
 */
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db, now, genId } from "./index";
import { authTokens, users, sessions } from "./schema";
import { hashPassword } from "./auth";
import { UserStatus } from "@/lib/enums";

export type TokenPurpose = "invite" | "reset";
export const INVITE_TTL_HOURS = 72;
export const RESET_TTL_HOURS = 2;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function addHoursISO(hours: number): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

/**
 * Issue a fresh setup token for a user, invalidating that user's earlier unused
 * tokens of the same purpose. Returns the RAW token (store only the hash).
 */
export async function createSetupToken(
  userId: string,
  purpose: TokenPurpose,
  ttlHours = purpose === "invite" ? INVITE_TTL_HOURS : RESET_TTL_HOURS,
): Promise<{ token: string; expiresAt: string }> {
  // Burn any still-pending token of the same purpose so only one link is live.
  await db
    .update(authTokens)
    .set({ usedAt: now() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
      ),
    );
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = addHoursISO(ttlHours);
  await db.insert(authTokens).values({
    id: genId("ATK"),
    userId,
    tokenHash: hashToken(raw),
    purpose,
    expiresAt,
    createdAt: now(),
  });
  return { token: raw, expiresAt };
}

interface VerifiedToken {
  ok: true;
  userId: string;
  email: string;
  name: string;
  purpose: string;
}
/** Validate a raw token WITHOUT consuming it (for the set-password page to load). */
export async function verifySetupToken(raw: string): Promise<VerifiedToken | { ok: false }> {
  if (!raw) return { ok: false };
  const row = (
    await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, hashToken(raw)))
      .limit(1)
  )[0];
  if (!row || row.usedAt) return { ok: false };
  if (new Date(row.expiresAt) < new Date()) return { ok: false };
  const user = (await db.select().from(users).where(eq(users.id, row.userId)).limit(1))[0];
  if (!user) return { ok: false };
  return { ok: true, userId: user.id, email: user.email, name: user.name, purpose: row.purpose };
}

/**
 * Consume a valid token and set the user's password. Atomic: re-checks the token
 * under the same transaction, sets the password, activates the account, clears
 * mustChangePassword, marks the token used, and drops the user's sessions.
 */
export async function setPasswordWithToken(
  raw: string,
  newPassword: string,
): Promise<{ ok: true; userId: string } | { ok: false; code: string }> {
  if (!raw) return { ok: false, code: "INVALID_TOKEN" };
  if (!newPassword || newPassword.length < 8) return { ok: false, code: "WEAK_PASSWORD" };
  const tokenHash = hashToken(raw);
  return db.transaction(async (tx) => {
    const row = (
      await tx
        .select()
        .from(authTokens)
        .where(eq(authTokens.tokenHash, tokenHash))
        .for("update")
        .limit(1)
    )[0];
    if (!row || row.usedAt) return { ok: false as const, code: "INVALID_TOKEN" };
    if (new Date(row.expiresAt) < new Date()) return { ok: false as const, code: "EXPIRED_TOKEN" };
    const ts = now();
    await tx
      .update(users)
      .set({
        password: hashPassword(newPassword),
        mustChangePassword: false,
        status: UserStatus.ACTIVE,
      })
      .where(eq(users.id, row.userId));
    await tx.update(authTokens).set({ usedAt: ts }).where(eq(authTokens.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    return { ok: true as const, userId: row.userId };
  });
}
