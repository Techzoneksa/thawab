/**
 * Apply pending migrations to EVERY tenant database, through the SAME controlled
 * runner the single-tenant app uses at boot — the finance-integrity gate is
 * respected (gated migrations are deferred when a tenant's data has blocking
 * issues; nothing is forced).
 *
 * Multi-tenant mode has no default DATABASE_URL, so boot migrations are skipped;
 * the deploy runs this BEFORE restarting the app instead.
 *
 *   node_modules/.bin/tsx scripts/migrate-tenants.ts
 *
 * Registry: $TENANTS_JSON, else the file $THAWAB_TENANTS_FILE
 * (default /root/thawab-tenants.json). Exit code 1 if any tenant failed.
 */
import { existsSync, readFileSync } from "node:fs";

const file = process.env.THAWAB_TENANTS_FILE || "/root/thawab-tenants.json";
const raw = process.env.TENANTS_JSON || (existsSync(file) ? readFileSync(file, "utf8") : "");
if (!raw.trim()) {
  console.log("[migrate-tenants] no tenant registry — nothing to migrate");
  process.exit(0);
}
process.env.TENANTS_JSON = raw;
const registry = JSON.parse(raw) as Record<string, { databaseUrl?: string }>;

const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { db, closeDb } = await import("../src/server/db/client.ts");
const { runBootMigrations, resolveDrizzleFolder } = await import(
  "../src/server/db/migrate-controlled.ts"
);

const folder = resolveDrizzleFolder();
if (!folder) {
  console.error("[migrate-tenants] migrations folder not found");
  process.exit(1);
}

let failed = 0;
for (const [slug, t] of Object.entries(registry)) {
  if (!t?.databaseUrl) {
    console.error(`[migrate-tenants] ${slug}: no databaseUrl — skipped`);
    failed++;
    continue;
  }
  try {
    // Bind the tenant so any code path using the shared `db` hits this tenant.
    await runWithTenant({ id: slug, host: slug, databaseUrl: t.databaseUrl }, () =>
      runBootMigrations(db as never, folder),
    );
    console.log(`[migrate-tenants] ${slug}: up to date`);
  } catch (e) {
    failed++;
    console.error(`[migrate-tenants] ${slug}: FAILED — ${e instanceof Error ? e.message : e}`);
  }
}
await closeDb();
process.exit(failed ? 1 : 0);
