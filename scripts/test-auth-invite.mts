/**
 * Auth invitation + forced-change flow, on REAL PostgreSQL.
 *
 * Covers: emailed one-time set-password token (issue / validate / consume /
 * single-use / expiry / weak-password / re-issue invalidation), login with the
 * newly-set password, and forced first-login password change.
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-auth-invite.mts
 */
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, now, genId, closeDb } from "@/server/db/index";
import { users, authTokens } from "@/server/db/schema";
import { hashPassword, login, forceChangePassword } from "@/server/db/auth";
import { createSetupToken, verifySetupToken, setPasswordWithToken } from "@/server/db/invitations";
import { isMailerConfigured, sendMail } from "@/server/db/mailer";
import { UserStatus } from "@/lib/enums";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
  process.exit(2);
}
let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const ROLE = "role-admin";
let seq = 0;
async function mkUser(opts: { mustChange?: boolean; password?: string } = {}) {
  seq++;
  const id = genId("USR");
  const email = `invite-${Date.now()}-${seq}@example.com`;
  await db.insert(users).values({
    id,
    name: `Invitee ${seq}`,
    email,
    password: hashPassword(opts.password ?? "unusable-" + genId()),
    role: ROLE,
    status: UserStatus.ACTIVE,
    mustChangePassword: opts.mustChange ?? false,
    createdAt: now(),
  });
  return { id, email };
}

async function main() {
  // Clean prior test rows.
  await db.delete(authTokens);

  console.log("\nMAILER — unconfigured environment is a graceful no-op");
  {
    ok("isMailerConfigured() is false without SMTP env", isMailerConfigured() === false);
    const r = await sendMail({ to: "x@example.com", subject: "t", html: "<b>t</b>" });
    ok(
      "sendMail returns not_configured (no throw)",
      r.sent === false && r.reason === "not_configured",
    );
  }

  console.log("\nINVITE — issue token, validate, consume, login with the new password");
  {
    const u = await mkUser();
    const { token } = await createSetupToken(u.id, "invite");
    const v = await verifySetupToken(token);
    ok("token validates and resolves the user", v.ok === true && (v as any).email === u.email);
    const r = await setPasswordWithToken(token, "NewPass123");
    ok("set password succeeds", r.ok === true);
    const after = (await db.select().from(users).where(eq(users.id, u.id)).limit(1))[0];
    ok("mustChangePassword cleared", after.mustChangePassword === false);
    const li = await login(u.email, "NewPass123");
    ok("login works with the new password", !("error" in li), (li as any).code);
  }

  console.log("\nSINGLE-USE — a consumed token cannot be reused");
  {
    const u = await mkUser();
    const { token } = await createSetupToken(u.id, "invite");
    await setPasswordWithToken(token, "FirstPass123");
    const v = await verifySetupToken(token);
    ok("consumed token no longer validates", v.ok === false);
    const r2 = await setPasswordWithToken(token, "SecondPass123");
    ok(
      "re-consume rejected INVALID_TOKEN",
      r2.ok === false && (r2 as any).code === "INVALID_TOKEN",
    );
    const li = await login(u.email, "SecondPass123");
    ok("second password never took effect (login fails)", "error" in li);
  }

  console.log("\nEXPIRY — an expired token is rejected");
  {
    const u = await mkUser();
    // Insert a token whose expiry is already in the past.
    const raw = "expired-raw-token-" + genId();
    await db.insert(authTokens).values({
      id: genId("ATK"),
      userId: u.id,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      purpose: "invite",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: now(),
    });
    ok("expired token fails validation", (await verifySetupToken(raw)).ok === false);
    const r = await setPasswordWithToken(raw, "WhateverPass123");
    ok(
      "expired token rejected EXPIRED_TOKEN",
      r.ok === false && (r as any).code === "EXPIRED_TOKEN",
    );
  }

  console.log("\nWEAK — sub-8-char passwords are rejected");
  {
    const u = await mkUser();
    const { token } = await createSetupToken(u.id, "invite");
    const r = await setPasswordWithToken(token, "short");
    ok(
      "weak password rejected WEAK_PASSWORD",
      r.ok === false && (r as any).code === "WEAK_PASSWORD",
    );
    ok(
      "token still valid after a rejected weak attempt",
      (await verifySetupToken(token)).ok === true,
    );
  }

  console.log("\nRE-ISSUE — a new token invalidates the previous unused one");
  {
    const u = await mkUser();
    const first = (await createSetupToken(u.id, "invite")).token;
    const second = (await createSetupToken(u.id, "invite")).token;
    ok("old token is invalidated", (await verifySetupToken(first)).ok === false);
    ok("new token is valid", (await verifySetupToken(second)).ok === true);
  }

  console.log("\nFORCE-CHANGE — forced first-login change clears the flag and sets the password");
  {
    const u = await mkUser({ mustChange: true, password: "TempPass123" });
    const pre = await login(u.email, "TempPass123");
    ok("login returns mustChangePassword=true", (pre as any).mustChangePassword === true);
    await forceChangePassword(u.id, "ChosenPass456");
    const after = (await db.select().from(users).where(eq(users.id, u.id)).limit(1))[0];
    ok("mustChangePassword cleared after force change", after.mustChangePassword === false);
    const li = await login(u.email, "ChosenPass456");
    ok(
      "login works with the chosen password",
      !("error" in li) && (li as any).mustChangePassword === false,
    );
    const old = await login(u.email, "TempPass123");
    ok("old temporary password no longer works", "error" in old);
  }

  await db.delete(authTokens);
  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Auth invite/forced-change: ${pass} passed, ${fail} failed`,
  );
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
