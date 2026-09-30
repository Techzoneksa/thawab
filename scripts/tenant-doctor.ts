/**
 * Tenant schema doctor — compares what the app EXPECTS (Drizzle schema) with
 * what a tenant database ACTUALLY has, and explains migration tracking.
 * Read-only unless a --fix-* flag is given. Never prints connection strings.
 *
 *   node_modules/.bin/tsx scripts/tenant-doctor.ts <slug>             # report
 *   node_modules/.bin/tsx scripts/tenant-doctor.ts <slug> --fix-org   # + repair org_settings
 *
 * Registry: $TENANTS_JSON, else $THAWAB_TENANTS_FILE (default /root/thawab-tenants.json).
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const slug = process.argv[2];
const fixOrg = process.argv.includes("--fix-org");
if (!slug || slug.startsWith("-")) {
  console.log("usage: tsx scripts/tenant-doctor.ts <slug> [--fix-org]");
  process.exit(1);
}
const file = process.env.THAWAB_TENANTS_FILE || "/root/thawab-tenants.json";
const raw = process.env.TENANTS_JSON || (existsSync(file) ? readFileSync(file, "utf8") : "");
const registry = raw.trim() ? (JSON.parse(raw) as Record<string, { databaseUrl?: string }>) : {};
const url = registry[slug]?.databaseUrl;
if (!url) {
  console.error(`[doctor] tenant '${slug}' is not registered`);
  process.exit(1);
}
process.env.TENANTS_JSON = raw;

const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { db, closeDb } = await import("../src/server/db/client.ts");
const schema = await import("../src/server/db/schema.ts");
const { resolveDrizzleFolder } = await import("../src/server/db/migrate-controlled.ts");
const { is, sql } = await import("drizzle-orm");
const { PgTable, getTableConfig } = await import("drizzle-orm/pg-core");

type Row = Record<string, unknown>;
const q = async (text: string): Promise<Row[]> => {
  const r = (await db.execute(sql.raw(text))) as unknown as Row[] | { rows: Row[] };
  return Array.isArray(r) ? r : r.rows;
};

// Idempotent: the full current shape of org_settings (0002 + 0004 + 0038).
const ORG_FIX = [
  `CREATE TABLE IF NOT EXISTS "org_settings" ("id" text PRIMARY KEY NOT NULL, "updated_at" text DEFAULT '' NOT NULL)`,
  ...["name", "reg_no", "unified_no", "tax_no", "email", "phone", "ceo", "fiscal_year",
      "building_no", "street", "district", "city", "postal_code", "additional_no"].map(
    (c) => `ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "${c}" text DEFAULT ''`,
  ),
  `ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'SAR'`,
];

await runWithTenant({ id: slug, host: slug, databaseUrl: url }, async () => {
  // 1) What exists
  const cols = await q(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const have = new Map<string, Set<string>>();
  for (const r of cols) {
    const t = String(r.table_name);
    if (!have.has(t)) have.set(t, new Set());
    have.get(t)!.add(String(r.column_name));
  }

  // 2) What the app expects
  const missingTables: string[] = [];
  const missingCols: string[] = [];
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue;
    const cfg = getTableConfig(v);
    const got = have.get(cfg.name);
    if (!got) {
      missingTables.push(cfg.name);
      continue;
    }
    for (const c of cfg.columns) if (!got.has(c.name)) missingCols.push(`${cfg.name}.${c.name}`);
  }

  // 3) Migration tracking
  const folder = resolveDrizzleFolder();
  let tracking = "no drizzle.__drizzle_migrations table";
  const notApplied: string[] = [];
  try {
    const mig = await q(`SELECT hash, created_at FROM drizzle."__drizzle_migrations"`);
    const hashes = new Set(mig.map((m) => String(m.hash)));
    const last = Math.max(0, ...mig.map((m) => Number(m.created_at)));
    tracking = `${mig.length} tracked, last created_at=${last} (${new Date(last).toISOString()})`;
    if (folder) {
      const journal = JSON.parse(readFileSync(resolve(folder, "meta/_journal.json"), "utf8"));
      for (const e of journal.entries as { tag: string; when: number }[]) {
        const f = resolve(folder, e.tag + ".sql");
        if (!existsSync(f)) continue;
        const h = createHash("sha256").update(readFileSync(f, "utf8")).digest("hex");
        if (!hashes.has(h)) notApplied.push(`${e.tag}${Number(e.when) <= last ? " (skipped as 'old')" : ""}`);
      }
    }
  } catch {
    /* tracking table missing — reported above */
  }

  console.log(`[doctor] tenant: ${slug}`);
  console.log(`[doctor] migrations: ${tracking}`);
  console.log(`[doctor] journal entries not recorded as applied: ${notApplied.length ? notApplied.join(", ") : "none"}`);
  console.log(`[doctor] missing tables (${missingTables.length}): ${missingTables.join(", ") || "none"}`);
  console.log(`[doctor] missing columns (${missingCols.length}): ${missingCols.join(", ") || "none"}`);

  if (fixOrg) {
    for (const s of ORG_FIX) await q(s);
    await q(`SELECT "id","name","unified_no","reg_no","building_no" FROM "org_settings" LIMIT 1`);
    console.log("[doctor] org_settings repaired ✅ (idempotent; existing data untouched)");
  }
});
await closeDb();
