/**
 * Backup/restore engine E2E on a REAL Postgres tenant database.
 *   TENANTS_JSON='{"t":{"databaseUrl":"postgres://…"}}' BACKUP_DIR=/tmp/x \
 *   node_modules/.bin/tsx scripts/test-backup-restore.ts t [otherTenant]
 * Proves: backup → mutate → restore gives back byte-identical table contents;
 * history (audit_log/backup_records) survives; sessions are cleared; a
 * tampered file, another tenant's file, or a changed schema are refused.
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
const [tenant, other] = process.argv.slice(2);
const reg = JSON.parse(process.env.TENANTS_JSON || "{}");
const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { db, closeDb } = await import("../src/server/db/client.ts");
const { sql } = await import("drizzle-orm");
const B = await import("../src/server/db/backup.ts");

const ctxOf = (id: string) => ({ id, host: `${id}.jaadpro.com`, databaseUrl: reg[id].databaseUrl });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  ok ? pass++ : fail++;
};
const rows = async (q: string) => {
  const r: any = await db.execute(sql.raw(q));
  return (Array.isArray(r) ? r : r.rows) as any[];
};
const SKIP = new Set(["sessions", "login_attempts", "auth_tokens", "audit_log", "backup_records"]);
/** Per-table fingerprint: row count + md5 of all rows in a deterministic order. */
async function fingerprint() {
  const tables = (await rows(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`)).map((r) => r.table_name as string);
  const fp: Record<string, string> = {};
  for (const t of tables) {
    if (SKIP.has(t)) continue;
    const [r] = await rows(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS h FROM "${t}" x`);
    fp[t] = `${r.n}:${r.h}`;
  }
  return fp;
}
const diff = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).filter((k) => a[k] !== b[k]);

await runWithTenant(ctxOf(tenant), async () => {
  const before = await fingerprint();
  const nonEmpty = Object.values(before).filter((v) => !v.startsWith("0:")).length;
  const r = await B.createBackup();
  check("backup file written", !!r.fileName && r.sizeBytes > 0, `${r.fileName} · ${r.sizeBytes} bytes · ${r.tablesCount} tables · ${r.rowsCount} rows · sha ${r.sha256.slice(0, 12)}…`);
  check("backup covers all data tables", r.tablesCount >= Object.keys(before).length, `${nonEmpty} non-empty`);

  // ---- mutate: insert, update, delete across several tables (unique ids per run:
  // audit_log is preserved across restores by design, so ids must not repeat)
  const run = Date.now().toString(36);
  const auditBefore = (await rows(`SELECT count(*)::int n FROM audit_log`))[0].n;
  await rows(`INSERT INTO donors (id, name, type, created_at, updated_at) VALUES ('D-after-backup-${run}','متبرع بعد النسخة','individual','x','x')`);
  await rows(`UPDATE accounts SET name = name || ' (معدّل)' WHERE code = '4101'`);
  await rows(`UPDATE inventory_items SET quantity = quantity + 999 WHERE id = 'ITM-blanket'`);
  await rows(`DELETE FROM receipts WHERE status = 'cancelled'`);
  await rows(`INSERT INTO audit_log (id, user_name, action, entity_type, entity_id, timestamp) VALUES ('AUD-after-backup-${run}','test','mutate','test','x','${new Date().toISOString()}')`);
  await rows(`INSERT INTO sessions (id, user_id, token, expires_at, created_at) SELECT 'S-test-${run}', id, 'tok-test-${run}', '2099-01-01', 'x' FROM users LIMIT 1`);
  const mutated = await fingerprint();
  check("data changed after backup", diff(before, mutated).length >= 3, diff(before, mutated).join(", "));

  // ---- restore
  const res = await B.restoreBackup(r.fileName, r.sha256);
  const after = await fingerprint();
  const d = diff(before, after);
  check("restore → every table identical to the backup moment", d.length === 0, d.length ? "differs: " + d.join(",") : `${res.rows} rows restored`);
  check("history preserved (audit_log not rolled back)", (await rows(`SELECT count(*)::int n FROM audit_log`))[0].n >= auditBefore + 1);
  check("sessions cleared (everyone signs in again)", (await rows(`SELECT count(*)::int n FROM sessions`))[0].n === 0);
  check("post-backup donor gone, account name back", (await rows(`SELECT count(*)::int n FROM donors WHERE id='D-after-backup-${run}'`))[0].n === 0 && (await rows(`SELECT name FROM accounts WHERE code='4101'`))[0].name.indexOf("معدّل") < 0);

  // ---- guards
  const tampered = r.fileName.replace(".thawab.gz", "-tampered.thawab.gz");
  const buf = readFileSync(B.backupPath(r.fileName)); buf[buf.length - 20] ^= 0xff;
  writeFileSync(B.backupPath(tampered), buf);
  try { await B.restoreBackup(tampered, r.sha256); check("tampered file refused", false); }
  catch (e: any) { check("tampered file refused", e.code === "CHECKSUM_MISMATCH", e.code); }

  await rows(`INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ('fake-hash-test', 1)`);
  try { await B.restoreBackup(r.fileName, r.sha256); check("schema change refused", false); }
  catch (e: any) { check("schema change refused", e.code === "SCHEMA_MISMATCH", e.code); }
  await rows(`DELETE FROM drizzle."__drizzle_migrations" WHERE hash='fake-hash-test'`);
  check("nothing changed by refused restores", diff(before, await fingerprint()).length === 0);

  if (other) {
    const otherPath = B.backupPath(r.fileName).replace(`/${tenant}/`, `/${other}/`);
    await runWithTenant(ctxOf(other), async () => { B.backupDir(); });
    copyFileSync(B.backupPath(r.fileName), otherPath);
    await runWithTenant(ctxOf(other), async () => {
      try { await B.restoreBackup(r.fileName, r.sha256); check("another association's backup refused", false); }
      catch (e: any) { check("another association's backup refused", e.code === "WRONG_TENANT", e.code); }
    });
  }
});
await closeDb();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
