/**
 * Phase 5A — scale + performance for allocation/aging on REAL PostgreSQL.
 *
 * Bulk-builds a realistic AP dataset (5,000 suppliers · 25,000 POSTED invoices ·
 * 20,000 POSTED payments · ~12,000 allocations) with genuine posted journal
 * structure (each invoice entry has an AP CREDIT line; each payment entry an AP
 * DEBIT line), then benchmarks the set-based aging/candidate/reconciliation paths
 * and asserts bounded responses.
 *
 * SCALE-ALLOC-A allocation candidate lookup bounded; SCALE-ALLOC-B supplier
 * statement/settlement bounded; SCALE-AGING-A global aging set-based (no N+1).
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-phase-5a-scale.mts
 */
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "@/server/db/index";
import { resolveSystemAccountId, SYS } from "@/server/db/gl";
import { accounts } from "@/server/db/schema";
import {
  apAging,
  apAgingBySupplier,
  apAgingReconciliation,
  allocationCandidates,
} from "@/server/db/supplier-payment-allocation";

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
function pct(a: number[], p: number) {
  a.sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}
async function bench(label: string, fn: () => Promise<any>, n = 20) {
  for (let i = 0; i < 3; i++) await fn();
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = process.hrtime.bigint();
    await fn();
    t.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  console.log(
    `  ${label.padEnd(34)} p50=${pct(t, 0.5).toFixed(1)}ms p95=${pct(t, 0.95).toFixed(1)}ms`,
  );
  return pct(t, 0.95);
}
const kb = (o: any) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1) + " KB";

async function main() {
  const apId = await resolveSystemAccountId(db as any, SYS.ACCOUNTS_PAYABLE);
  const bankId = await resolveSystemAccountId(db as any, SYS.BANK);
  const expId = (
    (await (db as any).select().from(accounts).where(eq(accounts.code, "5101")).limit(1))[0] as any
  ).id;
  const period =
    ((await db.execute(sql`SELECT id FROM fiscal_periods LIMIT 1`)) as any).rows?.[0]?.id ??
    ((await db.execute(sql`SELECT id FROM fiscal_periods LIMIT 1`)) as any)[0]?.id;
  await db.execute(
    sql`INSERT INTO users (id,name,email,password) VALUES ('u-bench','B','b@e.com','x') ON CONFLICT (id) DO NOTHING`,
  );
  await db.execute(sql`TRUNCATE journal_lines, journal_entries, supplier_journal_links, supplier_payments,
    supplier_payment_allocations, suppliers, supplier_invoices, supplier_invoice_lines RESTART IDENTITY CASCADE`);

  const t0 = Date.now();
  // 5,000 suppliers
  await db.execute(sql`INSERT INTO suppliers (id, supplier_code, name, currency, status, created_at, updated_at)
    SELECT 'S-'||g,'SUP-'||lpad(g::text,6,'0'),'مورد '||g,'SAR','active','2026-01-01','2026-01-01' FROM generate_series(1,5000) g`);
  // 25,000 posted invoice journal entries + AP credit + expense debit lines.
  await db.execute(sql`INSERT INTO journal_entries (id, number, date, description, fund, currency, period_id, source, source_type, source_id, status, posted_by, created_by, created_at, updated_at)
    SELECT 'JE-INV-'||g,'JV-2026-I'||lpad(g::text,6,'0'),'2026-01-01','inv '||g,'general','SAR',${period},'supplier_invoice','supplier_invoice','SINV-'||g,'posted','u-bench','u-bench','2026-01-01','2026-01-01' FROM generate_series(1,25000) g`);
  await db.execute(sql`INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description)
    SELECT 'JL-IE-'||g,'JE-INV-'||g,${expId},1,1000,0,'exp' FROM generate_series(1,25000) g`);
  await db.execute(sql`INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description)
    SELECT 'JL-IC-'||g,'JE-INV-'||g,${apId},2,0,1000,'ap' FROM generate_series(1,25000) g`);
  // 25,000 posted invoices; due dates spread across buckets; ~1/6 with no due date.
  await db.execute(sql`INSERT INTO supplier_invoices
    (id, invoice_number, supplier_invoice_number, supplier_invoice_number_normalized, supplier_id, invoice_date, due_date, status, currency, subtotal, tax_amount, total_amount, journal_entry_id, created_at, updated_at)
    SELECT 'INV-'||g,'SINV-2026-'||lpad(g::text,6,'0'),'EXT-'||g,'ext-'||g,'S-'||(1+(g%5000)),'2026-01-01',
      CASE WHEN g%6=0 THEN NULL ELSE to_char(date '2026-01-01' + ((g%400)) , 'YYYY-MM-DD') END,
      'posted','SAR',1000,0,1000,'JE-INV-'||g,'2026-01-01','2026-01-01' FROM generate_series(1,25000) g`);
  // 20,000 posted payment entries + AP debit + bank credit lines.
  await db.execute(sql`INSERT INTO journal_entries (id, number, date, description, fund, currency, period_id, source, source_type, source_id, status, posted_by, created_by, created_at, updated_at)
    SELECT 'JE-PAY-'||g,'JV-2026-P'||lpad(g::text,6,'0'),'2026-02-01','pay '||g,'general','SAR',${period},'purchase','supplier_payment','SPY-'||g,'posted','u-bench','u-bench','2026-02-01','2026-02-01' FROM generate_series(1,20000) g`);
  await db.execute(sql`INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description)
    SELECT 'JL-PD-'||g,'JE-PAY-'||g,${apId},1,600,0,'ap' FROM generate_series(1,20000) g`);
  await db.execute(sql`INSERT INTO journal_lines (id, journal_entry_id, account_id, line_number, debit, credit, description)
    SELECT 'JL-PC-'||g,'JE-PAY-'||g,${bankId},2,0,600,'bank' FROM generate_series(1,20000) g`);
  await db.execute(sql`INSERT INTO supplier_payments (id, supplier_id, amount, payment_method, payment_date, status, journal_entry_id, created_by, created_at, updated_at)
    SELECT 'SPY-'||g,'S-'||(1+(g%5000)),600,'bank','2026-02-01','posted','JE-PAY-'||g,'u-bench','2026-02-01','2026-02-01' FROM generate_series(1,20000) g`);
  // ~12,000 allocations (payment g → invoice g, both same supplier by construction: g%5000), amount 600 ≤ invoice 1000 and ≤ payment 600.
  await db.execute(sql`INSERT INTO supplier_payment_allocations (id, supplier_payment_id, supplier_invoice_id, amount, created_by, created_at)
    SELECT 'SPA-'||g,'SPY-'||g,'INV-'||g,600,'u-bench','2026-02-05' FROM generate_series(1,12000) g`);
  console.log(`  dataset built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const counts = (await db.execute(sql`SELECT
    (SELECT count(*) FROM supplier_invoices) inv,(SELECT count(*) FROM supplier_payments) pay,
    (SELECT count(*) FROM supplier_payment_allocations) alc,(SELECT count(*) FROM journal_lines) jl`)) as any;
  console.log("  counts:", (counts.rows ?? counts)[0]);

  // pick a heavy supplier for single-supplier tests
  const heavy = "S-1";

  console.log("\nSCALE-AGING-A — global AP aging (set-based, no N+1) + budgets");
  {
    const p95 = await bench("global aging", () => apAging(db as any, {}));
    ok("global aging p95 ≤ 2000ms", p95 <= 2000, `${p95}`);
    const a = await apAging(db as any, {});
    ok(
      "global aging returns 6 buckets + total",
      Object.keys(a.buckets).length === 6 && a.totalOutstanding > 0,
    );
    const p95s = await bench("single-supplier aging", () =>
      apAging(db as any, { supplierId: heavy }),
    );
    ok("single-supplier aging p95 ≤ 750ms", p95s <= 750, `${p95s}`);
    const p95b = await bench("aging-by-supplier (page 50)", () =>
      apAgingBySupplier(db as any, { limit: 50 }),
    );
    ok("aging-by-supplier p95 ≤ 2000ms", p95b <= 2000, `${p95b}`);
  }

  console.log("\nSCALE-ALLOC-A — allocation candidate lookup bounded + fast");
  {
    // find a payment whose supplier still has outstanding invoices
    const pay = "SPY-13000"; // g>12000 has no allocation → its supplier has unpaid invoices
    const p95 = await bench("allocation candidates", () =>
      allocationCandidates(db as any, pay, {}),
    );
    ok("candidate lookup p95 ≤ 300ms", p95 <= 300, `${p95}`);
    const c = await allocationCandidates(db as any, pay, {});
    ok("candidates bounded ≤ 20", c.items.length <= 20, `${c.items.length}`);
    ok("candidate response small", Buffer.byteLength(JSON.stringify(c)) < 30 * 1024);
    console.log("    candidate response:", kb(c), `(${c.items.length} rows)`);
  }

  console.log("\nSCALE-ALLOC-B — reconciliation bounded + reconciles at scale");
  {
    const p95 = await bench("global reconciliation", () => apAgingReconciliation(db as any, {}));
    ok("global reconciliation p95 ≤ 2000ms", p95 <= 2000, `${p95}`);
    const rec = await apAgingReconciliation(db as any, {});
    ok(
      "global reconciliation holds at scale",
      rec.reconciled,
      `derived=${rec.derivedApGl} gl=${rec.apGl} other=${rec.otherAp}`,
    );
    const p95s = await bench("single-supplier reconciliation", () =>
      apAgingReconciliation(db as any, { supplierId: heavy }),
    );
    ok("single-supplier reconciliation p95 ≤ 750ms", p95s <= 750, `${p95s}`);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Phase 5A scale: ${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
