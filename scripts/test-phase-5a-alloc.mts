/**
 * Phase 5A — Supplier Payment Allocation & AP Aging, on REAL PostgreSQL.
 *
 * Drives the REAL services (createSupplierInvoice/transition, paySupplier,
 * allocate/unallocate, apAging, apAgingReconciliation) and proves:
 *  - allocation is settlement metadata that creates ZERO accounting;
 *  - outstanding/unapplied are GL-derived from posted AP lines − Σ allocations;
 *  - cross-supplier / non-posted / over-invoice / over-payment are rejected;
 *  - concurrent allocation is PostgreSQL-safe;
 *  - a posted invoice with allocations cannot be reversed;
 *  - aging uses outstanding (not gross), buckets by due date, and reconciles to AP GL.
 *
 * Suites: ALLOC-A..J, ALLOC-RACE-A..D, REV-ALLOC-A..C, AGING-A..H, AGING-REC-A.
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-phase-5a-alloc.mts
 */
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "@/server/db/index";
import { createSupplier } from "@/server/db/supplier";
import { paySupplier } from "@/server/db/supplier";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import {
  allocate,
  unallocate,
  invoiceSettlement,
  paymentSettlement,
  apAging,
  apAgingReconciliation,
} from "@/server/db/supplier-payment-allocation";
import { accounts } from "@/server/db/schema";

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
async function rejects(name: string, code: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(name, false, "did not throw");
  } catch (e: any) {
    ok(name, e?.code === code, `got ${e?.code}:${e?.message}`);
  }
}

const ctx: any = {
  user: { id: "u-bench", name: "Bench Maker", role: "role-admin" },
  ip: "127.0.0.1",
  userAgent: "5a",
  request: new Request("http://localhost/"),
};
const ctx2: any = { ...ctx, user: { id: "u-bench2", name: "Bench Approver", role: "role-admin" } };

let seq = 0;
async function main() {
  await db.execute(sql`INSERT INTO users (id,name,email,password) VALUES
    ('u-bench','Bench Maker','u-bench@example.com','x'),('u-bench2','Bench Approver','u-bench2@example.com','x')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`TRUNCATE
    journal_lines, journal_entries, supplier_journal_links, supplier_payments,
    supplier_payment_allocations, suppliers, finance_workflow_events, audit_log,
    supplier_invoices, supplier_invoice_lines, supplier_invoice_grn_allocations
    RESTART IDENTITY CASCADE`);
  const expId = (
    await (db as any).select().from(accounts).where(eq(accounts.code, "5101")).limit(1)
  )[0].id as string;

  const mkSupplier = async (name: string) =>
    ((await createSupplier(ctx, { name, currency: "SAR" } as any)) as any).id as string;

  async function mkPostedInvoice(
    supplierId: string,
    amount: number,
    dueDate?: string,
    invoiceDate = "2026-06-01",
  ) {
    seq++;
    const inv = await createSupplierInvoice(ctx, {
      supplierId,
      supplierInvoiceNumber: `EXT-${seq}`,
      invoiceDate,
      dueDate: dueDate ?? null,
      lines: [
        { accountingMode: "direct", accountId: expId, quantity: 1, unitPrice: amount, taxRate: 0 },
      ],
    });
    const id = (inv as any).id;
    await transitionSupplierInvoice(ctx, id, "submit");
    await transitionSupplierInvoice(ctx2, id, "approve");
    await transitionSupplierInvoice(ctx2, id, "post");
    return id as string;
  }
  async function mkPostedPayment(supplierId: string, amount: number) {
    seq++;
    const r = await paySupplier(ctx, {
      supplierId,
      amount,
      method: "bank",
      idempotencyKey: `PAY-${supplierId}-${seq}`,
    });
    return r.payment.id as string;
  }
  const jcounts = async () => {
    const r = (await db.execute(
      sql`SELECT (SELECT count(*) FROM journal_entries) AS e, (SELECT count(*) FROM journal_lines) AS l, (SELECT count(*) FROM supplier_journal_links) AS s`,
    )) as any;
    const row = (r.rows ?? r)[0];
    return { e: Number(row.e), l: Number(row.l), s: Number(row.s) };
  };

  // ---- ALLOC-A: full allocation ----
  console.log("\nALLOC-A — full allocation → outstanding 0, unapplied 0");
  {
    const s = await mkSupplier("A");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1000 });
    const si = await invoiceSettlement(db as any, inv);
    const sp = await paymentSettlement(db as any, pay);
    ok("invoice outstanding = 0", Math.abs(si.outstanding) < 0.005, `${si.outstanding}`);
    ok("payment unapplied = 0", Math.abs(sp.unapplied) < 0.005, `${sp.unapplied}`);
    ok("original payable = 1000 (from posted AP credit)", si.originalPayable === 1000);
    ok("payment ap debit = 1000 (from posted AP debit)", sp.apDebit === 1000);
  }

  // ---- ALLOC-B: partial allocation ----
  console.log("\nALLOC-B — partial allocation (invoice 1150, pay 400)");
  {
    const s = await mkSupplier("B");
    const inv = await mkPostedInvoice(s, 1150);
    const pay = await mkPostedPayment(s, 400);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 400 });
    const si = await invoiceSettlement(db as any, inv);
    const sp = await paymentSettlement(db as any, pay);
    ok("invoice outstanding = 750", Math.abs(si.outstanding - 750) < 0.005, `${si.outstanding}`);
    ok("payment unapplied = 0", Math.abs(sp.unapplied) < 0.005, `${sp.unapplied}`);
  }

  // ---- ALLOC-C: one payment → many invoices ----
  console.log("\nALLOC-C — one payment 10,000 → invoices 3,000 + 2,500 + 4,500");
  {
    const s = await mkSupplier("C");
    const i1 = await mkPostedInvoice(s, 3000);
    const i2 = await mkPostedInvoice(s, 2500);
    const i3 = await mkPostedInvoice(s, 4500);
    const pay = await mkPostedPayment(s, 10000);
    await allocate(ctx, { paymentId: pay, invoiceId: i1, amount: 3000 });
    await allocate(ctx, { paymentId: pay, invoiceId: i2, amount: 2500 });
    await allocate(ctx, { paymentId: pay, invoiceId: i3, amount: 4500 });
    const sp = await paymentSettlement(db as any, pay);
    ok("payment allocated = 10,000", Math.abs(sp.allocated - 10000) < 0.005, `${sp.allocated}`);
    ok("payment unapplied = 0", Math.abs(sp.unapplied) < 0.005);
    ok("3 allocations on payment", sp.allocations.length === 3, `${sp.allocations.length}`);
  }

  // ---- ALLOC-D: many payments → one invoice ----
  console.log("\nALLOC-D — invoice 10,000 ← payments 3,000 + 2,000 + 5,000");
  {
    const s = await mkSupplier("D");
    const inv = await mkPostedInvoice(s, 10000);
    for (const amt of [3000, 2000, 5000]) {
      const pay = await mkPostedPayment(s, amt);
      await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: amt });
    }
    const si = await invoiceSettlement(db as any, inv);
    ok("invoice outstanding = 0", Math.abs(si.outstanding) < 0.005, `${si.outstanding}`);
    ok("3 payment allocations on invoice", si.allocations.length === 3, `${si.allocations.length}`);
  }

  // ---- ALLOC-E: cross-supplier REJECT ----
  console.log("\nALLOC-E — cross-supplier allocation rejected");
  {
    const sA = await mkSupplier("E-A");
    const sB = await mkSupplier("E-B");
    const inv = await mkPostedInvoice(sA, 500);
    const pay = await mkPostedPayment(sB, 500);
    await rejects("cross-supplier → CROSS_SUPPLIER_ALLOCATION", "CROSS_SUPPLIER_ALLOCATION", () =>
      allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 100 }),
    );
  }

  // ---- ALLOC-F: non-POSTED invoice REJECT ----
  console.log("\nALLOC-F — allocation to non-POSTED invoice rejected");
  {
    const s = await mkSupplier("F");
    const pay = await mkPostedPayment(s, 500);
    seq++;
    const draft = await createSupplierInvoice(ctx, {
      supplierId: s,
      supplierInvoiceNumber: `EXT-${seq}`,
      invoiceDate: "2026-06-01",
      lines: [
        { accountingMode: "direct", accountId: expId, quantity: 1, unitPrice: 500, taxRate: 0 },
      ],
    });
    await rejects("draft invoice → INVOICE_NOT_POSTED", "INVOICE_NOT_POSTED", () =>
      allocate(ctx, { paymentId: pay, invoiceId: (draft as any).id, amount: 100 }),
    );
  }

  // ---- ALLOC-G: over-invoice REJECT ----
  console.log("\nALLOC-G — over-invoice allocation rejected");
  {
    const s = await mkSupplier("G");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 5000);
    await rejects("1001 on 1000 invoice → INVOICE_OVER_ALLOCATED", "INVOICE_OVER_ALLOCATED", () =>
      allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1001 }),
    );
  }

  // ---- ALLOC-H: over-payment REJECT ----
  console.log("\nALLOC-H — over-payment allocation rejected");
  {
    const s = await mkSupplier("H");
    const i1 = await mkPostedInvoice(s, 5000);
    const i2 = await mkPostedInvoice(s, 5000);
    const pay = await mkPostedPayment(s, 500);
    await allocate(ctx, { paymentId: pay, invoiceId: i1, amount: 300 });
    await rejects(
      "600 when only 200 unapplied → PAYMENT_OVER_ALLOCATED",
      "PAYMENT_OVER_ALLOCATED",
      () => allocate(ctx, { paymentId: pay, invoiceId: i2, amount: 600 }),
    );
  }

  // ---- ALLOC-I: unallocate, no GL change, values restored ----
  console.log("\nALLOC-I — unallocate restores outstanding/unapplied, no GL change");
  {
    const s = await mkSupplier("I");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1000 });
    const before = await jcounts();
    await unallocate(ctx, { paymentId: pay, invoiceId: inv });
    const after = await jcounts();
    const si = await invoiceSettlement(db as any, inv);
    const sp = await paymentSettlement(db as any, pay);
    ok("outstanding back to 1000", Math.abs(si.outstanding - 1000) < 0.005, `${si.outstanding}`);
    ok("unapplied back to 1000", Math.abs(sp.unapplied - 1000) < 0.005, `${sp.unapplied}`);
    ok(
      "no journal entries/lines/links changed by unallocate",
      before.e === after.e && before.l === after.l && before.s === after.s,
    );
  }

  // ---- ALLOC-J: allocation creates zero journals ----
  console.log("\nALLOC-J — allocate/update create zero accounting");
  {
    const s = await mkSupplier("J");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    const before = await jcounts();
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 400 });
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 700 }); // update
    const after = await jcounts();
    ok("no journal entry created", before.e === after.e, `${before.e}→${after.e}`);
    ok("no journal line created", before.l === after.l, `${before.l}→${after.l}`);
    ok("no supplier_journal_link created", before.s === after.s, `${before.s}→${after.s}`);
    const si = await invoiceSettlement(db as any, inv);
    ok(
      "absolute re-set: outstanding = 300 (700 not 1100)",
      Math.abs(si.outstanding - 300) < 0.005,
      `${si.outstanding}`,
    );
  }

  // ---- ALLOC-RACE-A: two 700 allocations to one 1000 invoice ----
  console.log("\nALLOC-RACE-A — two concurrent 700 on a 1000 invoice → one succeeds");
  {
    const s = await mkSupplier("RA");
    const inv = await mkPostedInvoice(s, 1000);
    const p1 = await mkPostedPayment(s, 700);
    const p2 = await mkPostedPayment(s, 700);
    const res = await Promise.allSettled([
      allocate(ctx, { paymentId: p1, invoiceId: inv, amount: 700 }),
      allocate(ctx, { paymentId: p2, invoiceId: inv, amount: 700 }),
    ]);
    const okc = res.filter((r) => r.status === "fulfilled").length;
    const si = await invoiceSettlement(db as any, inv);
    ok("exactly one allocation succeeded", okc === 1, `${okc}`);
    ok("invoice allocated ≤ 1000 (never 1400)", si.allocated <= 1000.005, `${si.allocated}`);
  }

  // ---- ALLOC-RACE-B: two 700 from one 1000 payment ----
  console.log("\nALLOC-RACE-B — two concurrent 700 from a 1000 payment → one succeeds");
  {
    const s = await mkSupplier("RB");
    const i1 = await mkPostedInvoice(s, 700);
    const i2 = await mkPostedInvoice(s, 700);
    const pay = await mkPostedPayment(s, 1000);
    const res = await Promise.allSettled([
      allocate(ctx, { paymentId: pay, invoiceId: i1, amount: 700 }),
      allocate(ctx, { paymentId: pay, invoiceId: i2, amount: 700 }),
    ]);
    const okc = res.filter((r) => r.status === "fulfilled").length;
    const sp = await paymentSettlement(db as any, pay);
    ok("exactly one allocation succeeded", okc === 1, `${okc}`);
    ok("payment allocated ≤ 1000 (never 1400)", sp.allocated <= 1000.005, `${sp.allocated}`);
  }

  // ---- ALLOC-RACE-C: compatible 400 + 600 both succeed ----
  console.log("\nALLOC-RACE-C — compatible 400 + 600 from a 1000 payment → both succeed");
  {
    const s = await mkSupplier("RC");
    const i1 = await mkPostedInvoice(s, 400);
    const i2 = await mkPostedInvoice(s, 600);
    const pay = await mkPostedPayment(s, 1000);
    const res = await Promise.allSettled([
      allocate(ctx, { paymentId: pay, invoiceId: i1, amount: 400 }),
      allocate(ctx, { paymentId: pay, invoiceId: i2, amount: 600 }),
    ]);
    const okc = res.filter((r) => r.status === "fulfilled").length;
    const sp = await paymentSettlement(db as any, pay);
    ok("both allocations succeeded", okc === 2, `${okc}`);
    ok("payment fully applied = 1000", Math.abs(sp.allocated - 1000) < 0.005, `${sp.allocated}`);
  }

  // ---- ALLOC-RACE-D: same request retried concurrently ----
  console.log("\nALLOC-RACE-D — same allocation retried concurrently → one effective row");
  {
    const s = await mkSupplier("RD");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 400 }),
      ),
    );
    const rows = (await db.execute(
      sql`SELECT count(*)::int AS c, COALESCE(SUM(amount),0) AS s FROM supplier_payment_allocations WHERE supplier_payment_id=${pay} AND supplier_invoice_id=${inv}`,
    )) as any;
    const row = (rows.rows ?? rows)[0];
    ok("exactly ONE allocation row", Number(row.c) === 1, `${row.c}`);
    ok(
      "effective amount = 400 (no duplication)",
      Math.abs(Number(row.s) - 400) < 0.005,
      `${row.s}`,
    );
  }

  // ---- REV-ALLOC-A/B: invoice reversal guard ----
  console.log(
    "\nREV-ALLOC-A/B — invoice with allocations can't be reversed; unallocate then reverse",
  );
  {
    const s = await mkSupplier("REVA");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1000 });
    await rejects(
      "reverse with allocations → SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      "SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      () => transitionSupplierInvoice(ctx2, inv, "reverse", "test"),
    );
    await unallocate(ctx, { paymentId: pay, invoiceId: inv });
    let reversed = false;
    try {
      await transitionSupplierInvoice(ctx2, inv, "reverse", "test");
      reversed = true;
    } catch (e: any) {
      reversed = false;
    }
    ok("after unallocate, reversal allowed", reversed);
  }

  // ---- REV-ALLOC-C: payment reversal policy (documented: no reversal state) ----
  console.log("\nREV-ALLOC-C — supplier payment has no reversal state (documented policy)");
  {
    const cols = (await db.execute(
      sql`SELECT string_agg(column_name,',') AS c FROM information_schema.columns WHERE table_name='supplier_payments'`,
    )) as any;
    const has = String((cols.rows ?? cols)[0].c);
    ok(
      "no reversed/void columns on supplier_payments (post-only event)",
      !/revers|void|cancel/i.test(has),
      has,
    );
  }

  // ---- AGING-A..H ----
  console.log("\nAGING-A..H — buckets by due date, outstanding not gross");
  {
    const asOf = "2026-07-01";
    const s = await mkSupplier("AGE");
    const D = "2026-01-01"; // invoice date, earlier than every due date below
    const notDue = await mkPostedInvoice(s, 100, "2026-07-15", D); // future
    const d15 = await mkPostedInvoice(s, 100, "2026-06-16", D); // 15 overdue
    const d45 = await mkPostedInvoice(s, 100, "2026-05-17", D); // 45 overdue
    const d75 = await mkPostedInvoice(s, 100, "2026-04-17", D); // 75 overdue
    const d120 = await mkPostedInvoice(s, 100, "2026-03-03", D); // 120 overdue
    const noDue = await mkPostedInvoice(s, 100, undefined, D); // null due
    const partial = await mkPostedInvoice(s, 1000, "2026-06-16", D); // 15 overdue, pay 400
    const full = await mkPostedInvoice(s, 500, "2026-06-16", D); // fully paid
    const payP = await mkPostedPayment(s, 400);
    await allocate(ctx, { paymentId: payP, invoiceId: partial, amount: 400 });
    const payF = await mkPostedPayment(s, 500);
    await allocate(ctx, { paymentId: payF, invoiceId: full, amount: 500 });
    const a = await apAging(db as any, { asOfDate: asOf, supplierId: s });
    ok(
      "AGING-A NOT_DUE = 100",
      Math.abs(a.buckets.NOT_DUE.amount - 100) < 0.005,
      `${a.buckets.NOT_DUE.amount}`,
    );
    ok(
      "AGING-B D1_30 = 100 (d15) + 600 (partial) = 700",
      Math.abs(a.buckets.D1_30.amount - 700) < 0.005,
      `${a.buckets.D1_30.amount}`,
    );
    ok(
      "AGING-C D31_60 = 100",
      Math.abs(a.buckets.D31_60.amount - 100) < 0.005,
      `${a.buckets.D31_60.amount}`,
    );
    ok(
      "AGING-D D61_90 = 100",
      Math.abs(a.buckets.D61_90.amount - 100) < 0.005,
      `${a.buckets.D61_90.amount}`,
    );
    ok(
      "AGING-E D91_PLUS = 100",
      Math.abs(a.buckets.D91_PLUS.amount - 100) < 0.005,
      `${a.buckets.D91_PLUS.amount}`,
    );
    ok(
      "AGING-F NO_DUE_DATE = 100",
      Math.abs(a.buckets.NO_DUE_DATE.amount - 100) < 0.005,
      `${a.buckets.NO_DUE_DATE.amount}`,
    );
    ok(
      "AGING-G partial invoice aged at outstanding (600 not 1000)",
      a.buckets.D1_30.amount === 700,
    );
    ok(
      "AGING-H fully-paid invoice contributes 0",
      a.buckets.D1_30.count === 2,
      `count=${a.buckets.D1_30.count}`,
    );
  }

  // ---- AGING-REC-A ----
  console.log("\nAGING-REC-A — aging/allocation reconciles to GL AP");
  {
    const s = await mkSupplier("REC");
    const i = await mkPostedInvoice(s, 10000, "2026-06-16");
    const pApplied = await mkPostedPayment(s, 7000);
    await allocate(ctx, { paymentId: pApplied, invoiceId: i, amount: 7000 });
    const pUnapplied = await mkPostedPayment(s, 500); // unapplied
    const rec = await apAgingReconciliation(db as any, { supplierId: s });
    ok(
      "aged invoice outstanding = 3000",
      Math.abs(rec.agedInvoiceOutstanding - 3000) < 0.005,
      `${rec.agedInvoiceOutstanding}`,
    );
    ok(
      "unapplied payments = 500",
      Math.abs(rec.unappliedPayments - 500) < 0.005,
      `${rec.unappliedPayments}`,
    );
    ok(
      "supplier AP payable contribution = 2500",
      Math.abs(rec.apGl - 2500) < 0.005,
      `apGl=${rec.apGl}`,
    );
    ok(
      "reconciled (derived == GL)",
      rec.reconciled,
      `derived=${rec.derivedApGl} gl=${rec.apGl} other=${rec.otherAp}`,
    );
  }

  // ---- global reconciliation across everything ----
  console.log("\nGLOBAL — AP aging reconciliation over the whole dataset");
  {
    const rec = await apAgingReconciliation(db as any, {});
    ok(
      "global reconciliation holds",
      rec.reconciled,
      `derived=${rec.derivedApGl} gl=${rec.apGl} other=${rec.otherAp}`,
    );
  }

  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Phase 5A allocation+aging: ${pass} passed, ${fail} failed`,
  );
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
