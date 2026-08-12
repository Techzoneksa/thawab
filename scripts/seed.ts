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
    permissions: [
      "finance.*",
      "donations.*",
      "campaigns.*",
      "grants.*",
      "endowments.*",
      "receipts.*",
      "donors.view",
      "reports.*",
      "audit.view",
      "documents.*",
    ],
  },
  {
    id: "role-manager",
    name: "مدير تنفيذي",
    description: "إدارة البرامج والمشاريع",
    permissions: [
      "projects.*",
      "aid.*",
      "beneficiaries.*",
      "donations.*",
      "campaigns.*",
      "grants.*",
      "endowments.*",
      "memberships.*",
      "meetings.*",
      "hr.*",
      "approvals.*",
      "*.view",
      "documents.*",
    ],
  },
  {
    id: "role-data-entry",
    name: "مدخل بيانات",
    description: "إدخال المتبرعين والمستفيدين",
    permissions: [
      "donors.*",
      "donations.view",
      "donations.create",
      "beneficiaries.*",
      "aid.view",
      "aid.create",
    ],
  },
  { id: "role-viewer", name: "مطالع", description: "اطلاع فقط", permissions: ["*.view"] },
];

// ---------- Chart of accounts (comprehensive charity/NGO COA) ----------
// [code, name, classification, postable, systemKey?]  — parent & level derived from code.
// Code lengths: 1=main, 2=group, 4=sub-group, 6=detail(postable).
type Row = [string, string, string, boolean, string?];
const COA: Row[] = [
  // ========================= 1) الأصول =========================
  ["1", "الأصول", "asset", false],
  ["11", "الأصول المتداولة", "asset", false],
  ["1101", "النقد وما في حكمه", "asset", false],
  ["110101", "الصندوق العام", "asset", true, "cash"],
  ["110102", "صندوق المصروفات النثرية", "asset", true],
  ["110103", "عُهد نقدية", "asset", true],
  ["1102", "البنوك", "asset", false],
  ["110201", "البنك — الحساب الرئيسي", "asset", true, "bank_main"],
  ["110202", "البنك — حساب التبرعات المقيّدة", "asset", true],
  ["110203", "البنك — حساب الزكاة", "asset", true],
  ["110204", "البنك — حساب الأوقاف", "asset", true],
  ["1103", "الذمم المدينة والسُّلف", "asset", false],
  ["110301", "ذمم مدينة — جهات مانحة", "asset", true],
  ["110302", "سلف وعُهد الموظفين", "asset", true],
  ["110303", "مصروفات مدفوعة مقدماً", "asset", true],
  ["110304", "إيرادات مستحقة القبض", "asset", true],
  ["110305", "مستحق من المشاريع", "asset", true],
  ["1104", "الاستثمارات قصيرة الأجل", "asset", false],
  ["110401", "ودائع قصيرة الأجل", "asset", true],
  ["110402", "استثمارات متداولة", "asset", true],
  ["1105", "المخزون", "asset", false],
  ["110501", "مخزون المواد الإغاثية", "asset", true],
  ["110502", "مخزون السلال الغذائية", "asset", true],
  ["110503", "مخزون عام", "asset", true, "inventory"],
  ["12", "الأصول غير المتداولة", "asset", false],
  ["1201", "الأصول الثابتة", "asset", false],
  ["120101", "الأراضي", "asset", true],
  ["120102", "المباني والإنشاءات", "asset", true],
  ["120103", "الأثاث والتجهيزات المكتبية", "asset", true],
  ["120104", "الأجهزة والمعدات", "asset", true],
  ["120105", "أجهزة الحاسب والبرمجيات", "asset", true],
  ["120106", "وسائل النقل والسيارات", "asset", true],
  ["1202", "مجمع الإهلاك", "asset", false],
  ["120201", "مجمع إهلاك المباني", "asset", true],
  ["120202", "مجمع إهلاك الأثاث والتجهيزات", "asset", true],
  ["120203", "مجمع إهلاك الأجهزة والمعدات", "asset", true],
  ["120204", "مجمع إهلاك الحاسب", "asset", true],
  ["120205", "مجمع إهلاك السيارات", "asset", true],
  ["1203", "مشاريع تحت التنفيذ", "asset", false],
  ["120301", "مشاريع رأسمالية تحت التنفيذ", "asset", true],
  ["1204", "أصول واستثمارات الأوقاف", "asset", false],
  ["120401", "عقارات وقفية", "asset", true],
  ["120402", "استثمارات وقفية طويلة الأجل", "asset", true],

  // ========================= 2) الالتزامات =========================
  ["2", "الالتزامات", "liability", false],
  ["21", "الالتزامات المتداولة", "liability", false],
  ["2101", "الذمم الدائنة", "liability", false],
  ["210101", "ذمم دائنة — موردون", "liability", true, "accounts_payable"],
  ["210102", "مصروفات مستحقة الدفع", "liability", true],
  ["210103", "رواتب وأجور مستحقة", "liability", true],
  ["210104", "مستحق للمشاريع", "liability", true],
  ["2102", "الأمانات والتأمينات", "liability", false],
  ["210201", "أمانات ومحتجزات", "liability", true],
  ["210202", "تأمينات مستردة", "liability", true],
  ["2103", "المستحقات النظامية", "liability", false],
  ["210301", "التأمينات الاجتماعية (GOSI)", "liability", true],
  ["210302", "مستحقات حكومية أخرى", "liability", true],
  ["2104", "قروض وتسهيلات قصيرة الأجل", "liability", false],
  ["210401", "قروض قصيرة الأجل", "liability", true],
  ["22", "الالتزامات غير المتداولة", "liability", false],
  ["2201", "المخصصات", "liability", false],
  ["220101", "مخصص مكافأة نهاية الخدمة", "liability", true],
  ["2202", "قروض طويلة الأجل", "liability", false],
  ["220201", "قروض طويلة الأجل", "liability", true],

  // ========================= 3) صافي الأصول =========================
  ["3", "صافي الأصول", "equity", false],
  ["31", "صافي الأصول غير المقيّدة", "equity", false],
  ["3101", "صافي الأصول غير المقيّدة", "equity", true, "net_assets_unrestricted"],
  ["3102", "الفائض/العجز المتراكم", "equity", true],
  ["32", "صافي الأصول المقيّدة", "equity", false],
  ["3201", "صافي الأصول المقيّدة — مشاريع", "equity", true, "net_assets_restricted"],
  ["3202", "صافي الأصول المقيّدة — برامج", "equity", true],
  ["33", "صافي أصول الأوقاف", "equity", false],
  ["3301", "صافي أصول الأوقاف", "equity", true, "net_assets_endowment"],
  ["34", "نتيجة الفترة الحالية", "equity", false],
  ["3401", "فائض/عجز الفترة الحالية", "equity", true],

  // ========================= 4) الإيرادات =========================
  ["4", "الإيرادات", "revenue", false],
  ["41", "التبرعات والهبات", "revenue", false],
  ["4101", "تبرعات نقدية عامة", "revenue", true, "donations_revenue"],
  ["4102", "تبرعات مقيّدة (لمشاريع)", "revenue", true],
  ["4103", "تبرعات عينية", "revenue", true],
  ["4104", "صدقات جارية", "revenue", true],
  ["4105", "كفارات ونذور", "revenue", true],
  ["4106", "زكاة الأموال", "revenue", true],
  ["4107", "زكاة الفطر", "revenue", true],
  ["4108", "الأضاحي والهدي", "revenue", true],
  ["42", "المنح", "revenue", false],
  ["4201", "منح حكومية", "revenue", true],
  ["4202", "منح مؤسسات خيرية", "revenue", true],
  ["4203", "منح دولية", "revenue", true],
  ["43", "إيرادات الأوقاف والاستثمار", "revenue", false],
  ["4301", "ريع الأوقاف", "revenue", true],
  ["4302", "أرباح الاستثمارات", "revenue", true],
  ["4303", "عوائد الودائع", "revenue", true],
  ["44", "إيرادات أخرى", "revenue", false],
  ["4401", "رسوم اشتراكات العضوية", "revenue", true],
  ["4402", "إيرادات فعاليات وبرامج", "revenue", true],
  ["4403", "إيرادات متنوعة", "revenue", true],

  // ========================= 5) المصروفات =========================
  ["5", "المصروفات", "expense", false],
  ["51", "مصروفات البرامج والمساعدات", "expense", false],
  ["5101", "مساعدات نقدية للمستفيدين", "expense", true, "aid_expense"],
  ["5102", "مساعدات عينية", "expense", true, "inkind_aid"],
  ["5103", "سلال غذائية", "expense", true],
  ["5104", "كفالة الأيتام", "expense", true],
  ["5105", "مساعدات طبية وعلاجية", "expense", true],
  ["5106", "مساعدات تعليمية", "expense", true],
  ["5107", "مساعدات سكنية وإيجارات", "expense", true],
  ["5108", "مشاريع موسمية (رمضان/العيد/الأضاحي)", "expense", true],
  ["5109", "مشاريع المياه والآبار", "expense", true],
  ["5110", "مصروفات مشاريع أخرى", "expense", true],
  ["52", "مصروفات الرواتب والموظفين", "expense", false],
  ["5201", "الرواتب والأجور", "expense", true],
  ["5202", "البدلات والحوافز", "expense", true],
  ["5203", "التأمينات الاجتماعية (حصة المنشأة)", "expense", true],
  ["5204", "مكافأة نهاية الخدمة", "expense", true],
  ["5205", "التدريب والتطوير", "expense", true],
  ["53", "المصروفات الإدارية والعمومية", "expense", false],
  ["5301", "الإيجارات", "expense", true],
  ["5302", "الكهرباء والمياه", "expense", true],
  ["5303", "الاتصالات والإنترنت", "expense", true],
  ["5304", "القرطاسية واللوازم المكتبية", "expense", true],
  ["5305", "الصيانة والنظافة", "expense", true],
  ["5306", "المحروقات ووسائل النقل", "expense", true],
  ["5307", "الضيافة والاستقبال", "expense", true],
  ["5308", "التأمين", "expense", true],
  ["5309", "أتعاب مهنية واستشارية", "expense", true],
  ["5310", "المصاريف البنكية والتحويلات", "expense", true],
  ["5311", "الدعاية والإعلان والتوعية", "expense", true],
  ["5312", "مصروف الإهلاك", "expense", true],
  ["5313", "مصروفات الحوكمة (المجلس/الاجتماعات)", "expense", true],
  ["5314", "رسوم واشتراكات حكومية", "expense", true],
  ["5315", "مصروفات متنوعة", "expense", true],
  ["5316", "تسويات المخزون (عجز/فائض)", "expense", true, "inventory_adjustment"],
];

function levelOf(code: string): number {
  if (code.length === 1) return 1;
  if (code.length === 2) return 2;
  if (code.length === 4) return 3;
  return 4;
}
function parentCodeOf(code: string): string | null {
  if (code.length === 1) return null;
  if (code.length === 2) return code.slice(0, 1);
  return code.slice(0, code.length - 2);
}

async function main() {
  const ts = nowIso();

  // Roles
  for (const r of ROLES) {
    const existing = (
      await db.select().from(schema.roles).where(eq(schema.roles.id, r.id)).limit(1)
    )[0];
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

  // Chart of accounts — upsert by code (safe to re-run). Clear system keys
  // first so they can be reassigned without violating the UNIQUE constraint.
  await db.update(schema.accounts).set({ systemKey: null });
  for (const [code, name, classification, postable, systemKey] of COA) {
    const id = `ACC-${code}`;
    const parentCode = parentCodeOf(code);
    await db
      .insert(schema.accounts)
      .values({
        id,
        code,
        name,
        classification,
        level: levelOf(code),
        parentId: parentCode ? `ACC-${parentCode}` : null,
        systemKey: systemKey ?? null,
        currency: "SAR",
        balance: 0,
        postable,
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: schema.accounts.code,
        set: {
          name,
          classification,
          level: levelOf(code),
          parentId: parentCode ? `ACC-${parentCode}` : null,
          systemKey: systemKey ?? null,
          postable,
          updatedAt: ts,
        },
      });
  }
  console.log(`[seed] chart of accounts ready (${COA.length} accounts)`);

  // Admin user (only if no users exist at all)
  const anyUser = (await db.select().from(schema.users).limit(1))[0];
  if (!anyUser) {
    const password =
      randomBytes(9)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 12) + "A9!";
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
  const existingPeriod = (
    await db
      .select()
      .from(schema.fiscalPeriods)
      .where(eq(schema.fiscalPeriods.id, periodId))
      .limit(1)
  )[0];
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
