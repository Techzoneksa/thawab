/* The SQL "sensitive" filter and the UI classifier must agree, on a real DB.
   TENANT_URL=postgres://… node_modules/.bin/tsx scripts/test-audit-sensitive.ts */
const URL = process.env.TENANT_URL || "postgres://postgres@127.0.0.1:5433/thawab_c";
process.env.TENANTS_JSON = JSON.stringify({ t: { databaseUrl: URL } });
const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { db, closeDb } = await import("../src/server/db/client.ts");
const { auditLog } = await import("../src/server/db/schema.ts");
const { sql, like } = await import("drizzle-orm");
const L = await import("../src/lib/audit-sensitive.ts");

const cases: [string, string | null][] = [
  ["delete", "delete"], ["update", "edit"], ["cancel", "cancel"], ["void", "cancel"],
  ["reject", "reject"], ["return_to_draft", "reject"], ["reopen", "reopen"], ["unlock", "reopen"],
  ["JOURNAL_UNPOSTED", "unpost"], ["JOURNAL_REJECTED", "reject"], ["JOURNAL_RESTORED", "reopen"],
  ["SALES_INVOICE_CANCELLED", "cancel"], ["RECEIPT_VOUCHER_REVERSED", "reverse"],
  ["SUPPLIER_INVOICE_UPDATED", "edit"], ["SUPPLIER_PAYMENT_ALLOCATION_REMOVED", "delete"],
  ["create", null], ["approve", null], ["JOURNAL_POSTED", null], ["import", null],
  ["SALES_INVOICE_CREATED", null], ["backup_run", null], ["JOURNAL_SUBMITTED", null],
];
let pass = 0, fail = 0;
await runWithTenant({ id: "t", host: "t", databaseUrl: URL }, async () => {
  await db.delete(auditLog).where(like(auditLog.id, "T-%"));
  for (const [a] of cases)
    await db.insert(auditLog).values({ id: `T-${a}`, action: a, entityType: "x", entityId: "1", userName: "t", timestamp: "2026-01-01" });
  const rows = await db.select({ action: auditLog.action }).from(auditLog).where(sql`${auditLog.id} like 'T-%' and (lower(${auditLog.action}) in (${sql.join(L.SENSITIVE_EXACT_ACTIONS.map((a) => sql`${a}`), sql`, `)}) or ${auditLog.action} ~* ${L.SENSITIVE_SUFFIX_REGEX})`);
  const inSql = new Set(rows.map((r) => r.action));
  for (const [a, want] of cases) {
    const ui = L.classifyAuditAction(a);
    const ok = ui === want && inSql.has(a) === (want !== null);
    ok ? pass++ : fail++;
    console.log(`${ok ? "✓" : "✗"} ${a.padEnd(38)} ui=${ui ?? "—"} sql=${inSql.has(a) ? "✓" : "—"}`);
  }
  await db.delete(auditLog).where(like(auditLog.id, "T-%"));
});
await closeDb();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
