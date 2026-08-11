/**
 * Bootstrap seed — production-safe. NO demo data.
 *
 * Creates: RBAC roles, one admin user (random password, must-change on first
 * login), a classified standard charity chart of accounts (with system-key
 * tags used by the GL posting engine), and an open fiscal period for the year.
 *
 * Idempotent: skips anything that already exists.
 *
 * Run:  DATABASE_URL=postgres://... node --experimental-strip-types scripts/seed.ts
 */
import { randomBytes, scryptSync } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/db/schema.ts";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384 }).toString("hex");
  return `scrypt$16384$${salt}$${hash}`;
}

const nowIso = () => new Date().toISOString();

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

// ---------- Roles ----------
const ROLES = [
  { id: "role-admin", name: "مدير النظام", description: "صلاحيات كاملة", permissions: ["*"] },
  {
    id: "role-accountant",
    name: "محاسب",
    description: "إدارة الشؤون المالية",
    permissions: ["finance.*", "donations.*", "receipts.*", "donors.view", "reports.view", "audit.view"],
  },
  {
    id: "role-manager",
    name: "مدير تنفيذي",
    description: "إدارة البرامج والمشاريع",
    permissions: ["projects.*", "aid.*", "beneficiaries.*", "donations.*", "approvals.*", "*.view"],
  },
  {
    id: "role-data-entry",
    name: "مدخل بيانات",
    description: "إدخال المتبرعين والمستفيدين",
    permissions: ["donors.*", "donations.view", "donations.create", "beneficiaries.*", "aid.view", "aid.create"],
  },
  { id: "role-viewer", name: "مطالع", description: "اطلاع فقط", permissions: ["*.view"] },
];

// ---------- Chart of accounts ----------
// [code, name, classification, postable, parentCode|null, systemKey|null]
type Row = [string, string, string, boolean, string | null, string | null];
const COA: Row[] = [
  ["1", "الأصول", "asset", false, null, null],
  ["11", "الأصول المتداولة", "asset", false, "1", null],
  ["1101", "الصندوق", "asset", true, "11", "cash"],
  ["1102", "البنك — الحساب الرئيسي", "asset", true, "11", "bank_main"],
  ["1103", "المدينون والسُّلف", "asset", true, "11", null],
  ["12", "الأصول الثابتة", "asset", false, "1", null],
  ["1201", "الأصول الثابتة", "asset", true, "12", null],
  ["1202", "مجمع إهلاك الأصول الثابتة", "asset", true, "12", null],

  ["2", "الالتزامات", "liability", false, null, null],
  ["21", "الالتزامات المتداولة", "liability", false, "2", null],
  ["2101", "الدائنون والموردون", "liability", true, "21", "accounts_payable"],
  ["2102", "مصروفات مستحقة", "liability", true, "21", null],

  ["3", "صافي الأصول", "equity", false, null, null],
  ["31", "صافي الأصول غير المقيّدة", "equity", true, "3", "net_assets_unrestricted"],
  ["32", "صافي الأصول المقيّدة", "equity", true, "3", "net_assets_restricted"],
  ["33", "الأوقاف", "equity", true, "3", "net_assets_endowment"],

  ["4", "الإيرادات", "revenue", false, null, null],
  ["41", "التبرعات والهبات", "revenue", false, "4", null],
  ["4101", "إيرادات التبرعات", "revenue", true, "41", "donations_revenue"],
  ["4102", "إيرادات الزكاة", "revenue", true, "41", null],
  ["4103", "ريع الأوقاف", "revenue", true, "41", null],
  ["42", "إيرادات أخرى", "revenue", true, "4", null],

  ["5", "المصروفات", "expense", false, null, null],
  ["51", "مصروفات البرامج والمساعدات", "expense", false, "5", null],
  ["5101", "مصروف المساعدات", "expense", true, "51", "aid_expense"],
  ["5102", "مصروفات المشاريع", "expense", true, "51", null],
  ["52", "المصروفات الإدارية والعمومية", "expense", false, "5", null],
  ["5201", "الرواتب والأجور", "expense", true, "52", null],
  ["5202", "مصروفات إدارية وعمومية", "expense", true, "52", null],
  ["5203", "مصروف الإهلاك", "expense", true, "52", null],
];

async function main() {
  const ts = nowIso();

  // Roles
  for (const r of ROLES) {
    const existing = (await db.select().from(schema.roles).where(eq(schema.roles.id, r.id)).limit(1))[0];
    if (!existing) {
      await db.insert(schema.roles).values({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: JSON.stringify(r.permissions),
        createdAt: ts,
      });
    }
  }
  console.log(`[seed] roles ready (${ROLES.length})`);

  // Chart of accounts
  const codeToId = new Map<string, string>();
  for (const [code, name, classification, postable, parentCode, systemKey] of COA) {
    const existing = (await db.select().from(schema.accounts).where(eq(schema.accounts.code, code)).limit(1))[0];
    if (existing) {
      codeToId.set(code, existing.id);
      continue;
    }
    const id = `ACC-${code}`;
    const level = code.length <= 1 ? 1 : code.length === 2 ? 2 : 3;
    await db.insert(schema.accounts).values({
      id,
      code,
      name,
      classification,
      level,
      parentId: parentCode ? codeToId.get(parentCode) ?? `ACC-${parentCode}` : null,
      systemKey: systemKey ?? null,
      currency: "SAR",
      balance: 0,
      postable,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    });
    codeToId.set(code, id);
  }
  console.log(`[seed] chart of accounts ready (${COA.length} accounts)`);

  // Admin user (only if no users exist at all)
  const anyUser = (await db.select().from(schema.users).limit(1))[0];
  if (!anyUser) {
    const password = randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "A9!";
    await db.insert(schema.users).values({
      id: "USR-admin",
      name: "مدير النظام",
      email: "admin@thawab.local",
      password: hashPassword(password),
      role: "role-admin",
      status: "active",
      mustChangePassword: true,
      createdAt: ts,
    });
    console.log("\n========================================");
    console.log("  تم إنشاء حساب المدير:");
    console.log("  البريد: admin@thawab.local");
    console.log(`  كلمة المرور المؤقتة: ${password}`);
    console.log("  (يجب تغييرها عند أول تسجيل دخول)");
    console.log("========================================\n");
  } else {
    console.log("[seed] users already exist — admin not re-created");
  }

  // Open fiscal period for the current year
  const year = new Date().getFullYear();
  const periodId = `FP-${year}`;
  const existingPeriod = (await db.select().from(schema.fiscalPeriods).where(eq(schema.fiscalPeriods.id, periodId)).limit(1))[0];
  if (!existingPeriod) {
    await db.insert(schema.fiscalPeriods).values({
      id: periodId,
      name: `السنة المالية ${year}`,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      status: "open",
      createdAt: ts,
      updatedAt: ts,
    });
    console.log(`[seed] fiscal period ${year} created (open)`);
  }

  console.log("[seed] bootstrap complete.");
  await sql.end();
}

main().catch(async (e) => {
  console.error("[seed] failed:", e);
  await sql.end();
  process.exit(1);
});
