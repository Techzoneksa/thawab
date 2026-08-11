/**
 * Reset users and create a single super-admin with a password YOU choose.
 *
 * Deletes ALL users (nullifying their references first so it never FK-fails),
 * then creates one super-admin (role-admin = full permissions "*").
 *
 * Run (PowerShell):
 *   $env:DATABASE_URL="postgres://..."
 *   $env:ADMIN_PASSWORD="اختر_كلمة_مرور_قوية"
 *   # optional: $env:ADMIN_EMAIL="maherkaifsa@gmail.com"  (default below)
 *   npm run create-admin
 */
import { randomBytes, scryptSync } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "maherkaifsa@gmail.com").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_NAME = process.env.ADMIN_NAME || "ماهر";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error("ADMIN_PASSWORD is required (8+ chars). Set it via the environment.");
  process.exit(1);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384 }).toString("hex");
  return `scrypt$16384$${salt}$${hash}`;
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

async function main() {
  const ts = new Date().toISOString();

  // 1) Null out every FK column that references users, so deletion is safe.
  await sql.unsafe(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
          AND tc.table_name <> 'sessions'
      LOOP
        EXECUTE format('UPDATE %I SET %I = NULL WHERE %I IS NOT NULL', r.table_name, r.column_name, r.column_name);
      END LOOP;
    END $$;
  `);

  // 2) Remove sessions and all users.
  await sql`DELETE FROM sessions`;
  const del = await sql`DELETE FROM users`;
  console.log(`[create-admin] deleted all users (${del.count}) and their sessions`);

  // 3) Ensure the super-admin role exists (full permissions).
  const roleId = "role-admin";
  const role = (await db.select().from(schema.roles).where(eq(schema.roles.id, roleId)).limit(1))[0];
  if (!role) {
    await db.insert(schema.roles).values({
      id: roleId,
      name: "مدير النظام",
      description: "صلاحيات كاملة",
      permissions: JSON.stringify(["*"]),
      createdAt: ts,
    });
  } else {
    await db.update(schema.roles).set({ permissions: JSON.stringify(["*"]) }).where(eq(schema.roles.id, roleId));
  }

  // 4) Create the super-admin with your chosen password.
  await db.insert(schema.users).values({
    id: "USR-superadmin",
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password: hashPassword(ADMIN_PASSWORD),
    role: roleId,
    status: "active",
    mustChangePassword: false,
    createdAt: ts,
  });

  console.log("\n========================================");
  console.log("  تم إنشاء السوبر أدمن:");
  console.log(`  الاسم:  ${ADMIN_NAME}`);
  console.log(`  البريد: ${ADMIN_EMAIL}`);
  console.log("  كلمة المرور: (التي أدخلتها)");
  console.log("========================================\n");

  await sql.end();
}

main().catch(async (e) => {
  console.error("[create-admin] failed:", e);
  await sql.end();
  process.exit(1);
});
