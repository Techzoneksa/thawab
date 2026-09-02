/**
 * Phase Sales-2 — Customer Receipts & AR settlement allocation (real PostgreSQL).
 *
 * Drives the REAL services against an isolated Postgres: createCustomer,
 * createSalesInvoice + transitionSalesInvoice, receiveFromCustomer, allocate /
 * unallocate, invoiceSettlement / receiptSettlement, arAging /
 * arAgingReconciliation, getCustomerBalance. Proves:
 *  - a receipt posts Dr Cash|Bank / Cr AR and lowers the customer receivable;
 *  - receipt posting is idempotent under a reused key;
 *  - allocation is settlement metadata only (NO journal / GL change);
 *  - over-allocation (invoice + receipt), cross-customer, sub-cent, and
 *    unposted-document guards all reject;
 *  - a posted invoice with active allocations cannot be reversed until unallocated;
 *  - aging uses outstanding (not gross) and reconciles to the AR GL.
 *
 * Run: DATABASE_URL=postgres://bench@127.0.0.1:5433/thawab_conc \
 *      node_modules/.bin/tsx scripts/test-phase-sales2.mts
 */
import { sql, eq } from "drizzle-orm";
import { db } from "@/server/db/index";
import { accounts } from "@/server/db/schema";
import { createCustomer, getCustomerBalance } from "@/server/db/customer";
import { createSalesInvoice, transitionSalesInvoice } from "@/server/db/sales-invoice";
import { receiveFromCustomer } from "@/server/db/customer-receipt";
import {
  allocate,
  unallocate,
  invoiceSettlement,
  receiptSettlement,
} from "@/server/db/customer-receipt-allocation";
import { arAging, arAgingReconciliation } from "@/server/db/ar-aging";

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
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const ctx: any = {
  user: { id: "u-bench", name: "Bench Maker", role: "role-admin" },
  ip: "127.0.0.1",
  userAgent: "sales2",
  request: new Request("http://localhost/"),
};
const ctx2: any = { ...ctx, user: { id: "u-bench2", name: "Bench Approver", role: "role-admin" } };

let seq = 0;
async function main() {
  await db.execute(sql`INSERT INTO users (id,name,email,password) VALUES
    ('u-bench','Bench Maker','u-bench@example.com','x'),('u-bench2','Bench Approver','u-bench2@example.com','x')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`TRUNCATE
    journal_lines, journal_entries, customer_journal_links, customer_receipts,
    customer_receipt_allocations, customers, finance_workflow_events, audit_log,
    sales_invoices, sales_invoice_lines
    RESTART IDENTITY CASCADE`);

  const revId = (
    await (db as any).select().from(accounts).where(eq(accounts.code, "4402")).limit(1)
  )[0].id as string;

  const mkCustomer = async (name: string) =>
    ((await createCustomer(ctx, { name, currency: "SAR" } as any)) as any).id as string;

  async function mkPostedInvoice(
    customerId: string,
    amount: number,
    dueDate?: string,
    invoiceDate = "2026-06-01",
  ) {
    seq++;
    const inv = await createSalesInvoice(ctx, {
      customerId,
      invoiceDate,
      dueDate: dueDate ?? null,
      lines: [{ accountId: revId, quantity: 1, unitPrice: amount }],
    });
    const id = (inv as any).id;
    await transitionSalesInvoice(ctx, id, "submit");
    await transitionSalesInvoice(ctx2, id, "approve");
    await transitionSalesInvoice(ctx2, id, "post");
    return id as string;
  }
  async function mkPostedReceipt(customerId: string, amount: number, key?: string) {
    seq++;
    const r = await receiveFromCustomer(ctx, {
      customerId,
      amount,
      method: "bank",
      idempotencyKey: key ?? `RCPT-${customerId}-${seq}`,
    });
    return r;
  }
  const jcounts = async () => {
    const r = (await db.execute(
      sql`SELECT (SELECT count(*) FROM journal_entries) AS e, (SELECT count(*) FROM journal_lines) AS l, (SELECT count(*) FROM customer_journal_links) AS s`,
    )) as any;
    const row = (r.rows ?? r)[0];
    return { e: Number(row.e), l: Number(row.l), s: Number(row.s) };
  };

  // ---- RCPT — receipt posts & lowers receivable; idempotent ----
  console.log("\nRCPT — receipt lowers receivable; idempotent");
  {
    const c = await mkCustomer("R");
    await mkPostedInvoice(c, 1000);
    ok(
      "RCPT-A receivable = 1000 after invoice",
      near((await getCustomerBalance(db, c)).receivableBalance, 1000),
    );
    const r1 = await mkPostedReceipt(c, 400, "RCPT-DUP");
    ok("RCPT-B receipt posted (not reused)", r1.reused === false);
    ok(
      "RCPT-C receivable = 600 after receipt",
      near((await getCustomerBalance(db, c)).receivableBalance, 600),
    );
    const before = await jcounts();
    const r2 = await receiveFromCustomer(ctx, {
      customerId: c,
      amount: 400,
      method: "bank",
      idempotencyKey: "RCPT-DUP",
    });
    const after = await jcounts();
    ok("RCPT-D retry same key → reused", r2.reused === true && r2.entryId === r1.entryId);
    ok("RCPT-E no second journal on retry", before.e === after.e && before.l === after.l);
    await rejects(
      "RCPT-F reused key different amount → IDEMPOTENCY_PAYLOAD_MISMATCH",
      "IDEMPOTENCY_PAYLOAD_MISMATCH",
      () =>
        receiveFromCustomer(ctx, {
          customerId: c,
          amount: 999,
          method: "bank",
          idempotencyKey: "RCPT-DUP",
        }),
    );
  }

  // ---- ALLOC-A: full allocation → outstanding 0, unapplied 0 ----
  console.log("\nALLOC-A — full allocation");
  {
    const c = await mkCustomer("A");
    const inv = await mkPostedInvoice(c, 1000);
    const rec = (await mkPostedReceipt(c, 1000)).receipt.id;
    const before = await jcounts();
    await allocate(ctx, { receiptId: rec, invoiceId: inv, amount: 1000 });
    const after = await jcounts();
    const iset = await invoiceSettlement(db, inv);
    const rset = await receiptSettlement(db, rec);
    ok("ALLOC-A invoice outstanding 0", near(iset.outstanding, 0), `${iset.outstanding}`);
    ok("ALLOC-A receipt unapplied 0", near(rset.unapplied, 0), `${rset.unapplied}`);
    ok(
      "ALLOC-A NO journal/line/link change",
      before.e === after.e && before.l === after.l && before.s === after.s,
    );
  }

  // ---- ALLOC-B: partial + one receipt across many invoices ----
  console.log("\nALLOC-B — partial + one receipt across invoices");
  {
    const c = await mkCustomer("B");
    const i1 = await mkPostedInvoice(c, 3000);
    const i2 = await mkPostedInvoice(c, 2500);
    const rec = (await mkPostedReceipt(c, 4000)).receipt.id;
    await allocate(ctx, { receiptId: rec, invoiceId: i1, amount: 3000 });
    await allocate(ctx, { receiptId: rec, invoiceId: i2, amount: 1000 });
    ok("ALLOC-B i1 outstanding 0", near((await invoiceSettlement(db, i1)).outstanding, 0));
    ok("ALLOC-B i2 outstanding 1500", near((await invoiceSettlement(db, i2)).outstanding, 1500));
    ok("ALLOC-B receipt fully applied", near((await receiptSettlement(db, rec)).unapplied, 0));
  }

  // ---- ALLOC guards ----
  console.log("\nALLOC guards — over-allocation, cross-customer, sub-cent, unposted");
  {
    const c = await mkCustomer("G");
    const inv = await mkPostedInvoice(c, 1000);
    const rec = (await mkPostedReceipt(c, 1000)).receipt.id;
    await rejects("GUARD over-invoice → INVOICE_OVER_ALLOCATED", "INVOICE_OVER_ALLOCATED", () =>
      allocate(ctx, { receiptId: rec, invoiceId: inv, amount: 1001 }),
    );
    // Fill the receipt on one invoice, then a second invoice exceeds the receipt.
    const i2 = await mkPostedInvoice(c, 1000);
    await allocate(ctx, { receiptId: rec, invoiceId: inv, amount: 700 });
    await rejects("GUARD over-receipt → RECEIPT_OVER_ALLOCATED", "RECEIPT_OVER_ALLOCATED", () =>
      allocate(ctx, { receiptId: rec, invoiceId: i2, amount: 400 }),
    );
    await rejects("GUARD sub-cent → INVALID_MONEY_PRECISION", "INVALID_MONEY_PRECISION", () =>
      allocate(ctx, { receiptId: rec, invoiceId: i2, amount: 100.005 }),
    );
    // Cross-customer
    const other = await mkCustomer("G2");
    const oInv = await mkPostedInvoice(other, 500);
    await rejects(
      "GUARD cross-customer → CROSS_CUSTOMER_ALLOCATION",
      "CROSS_CUSTOMER_ALLOCATION",
      () => allocate(ctx, { receiptId: rec, invoiceId: oInv, amount: 100 }),
    );
    // Draft invoice (unposted)
    const draft = await createSalesInvoice(ctx, {
      customerId: c,
      invoiceDate: "2026-06-01",
      lines: [{ accountId: revId, quantity: 1, unitPrice: 50 }],
    });
    await rejects("GUARD draft invoice → INVOICE_NOT_POSTED", "INVOICE_NOT_POSTED", () =>
      allocate(ctx, { receiptId: rec, invoiceId: (draft as any).id, amount: 10 }),
    );
  }

  // ---- Unallocate restores, no GL change ----
  console.log("\nUNALLOC — restores outstanding/unapplied, no GL change");
  {
    const c = await mkCustomer("U");
    const inv = await mkPostedInvoice(c, 800);
    const rec = (await mkPostedReceipt(c, 800)).receipt.id;
    await allocate(ctx, { receiptId: rec, invoiceId: inv, amount: 800 });
    const before = await jcounts();
    await unallocate(ctx, { receiptId: rec, invoiceId: inv });
    const after = await jcounts();
    ok(
      "UNALLOC invoice outstanding restored 800",
      near((await invoiceSettlement(db, inv)).outstanding, 800),
    );
    ok(
      "UNALLOC receipt unapplied restored 800",
      near((await receiptSettlement(db, rec)).unapplied, 800),
    );
    ok(
      "UNALLOC no GL change",
      before.e === after.e && before.l === after.l && before.s === after.s,
    );
  }

  // ---- Reverse guard: cannot reverse an allocated invoice ----
  console.log("\nREV-GUARD — allocated invoice blocks reversal until unallocated");
  {
    const c = await mkCustomer("V");
    const inv = await mkPostedInvoice(c, 500);
    const rec = (await mkPostedReceipt(c, 500)).receipt.id;
    await allocate(ctx, { receiptId: rec, invoiceId: inv, amount: 500 });
    await rejects(
      "REV-GUARD allocated → SALES_INVOICE_HAS_RECEIPT_ALLOCATIONS",
      "SALES_INVOICE_HAS_RECEIPT_ALLOCATIONS",
      () => transitionSalesInvoice(ctx2, inv, "reverse", "correction"),
    );
    await unallocate(ctx, { receiptId: rec, invoiceId: inv });
    const res = await transitionSalesInvoice(ctx2, inv, "reverse", "correction");
    ok("REV-GUARD reverse OK after unallocate", (res as any).item.status === "reversed");
    // Invoice +500 netted by its reversal −500; the receipt −500 remains → −500
    // (an unapplied customer credit). The subledger stays reconciled to AR GL.
    ok(
      "REV-GUARD receivable = -500 (receipt credit remains)",
      near((await getCustomerBalance(db, c)).receivableBalance, -500),
    );
  }

  // ---- Aging by outstanding + reconciliation ----
  console.log("\nAGING — outstanding-based buckets + reconciliation");
  {
    const c = await mkCustomer("AG");
    const i1 = await mkPostedInvoice(c, 1000, "2026-06-15"); // current at asOf 2026-06-10
    const i2 = await mkPostedInvoice(c, 2000, "2026-05-01", "2026-04-01"); // overdue
    const rec = (await mkPostedReceipt(c, 500)).receipt.id;
    await allocate(ctx, { receiptId: rec, invoiceId: i2, amount: 500 }); // i2 outstanding 1500
    const aging = await arAging(db, { asOfDate: "2026-06-10", customerId: c });
    ok(
      "AGING total outstanding = 2500 (3000 gross − 500 allocated)",
      near(aging.total, 2500),
      `${aging.total}`,
    );
    ok(
      "AGING current bucket includes i1 (1000)",
      near(aging.buckets.current, 1000),
      JSON.stringify(aging.buckets),
    );
    const recon = await arAgingReconciliation(db, { customerId: c });
    // AR GL = 3000 (invoices) − 500 (receipt) = 2500; unapplied receipt 0 (fully allocated)
    ok("RECON arGl = 2500", near(recon.arGl, 2500), `${recon.arGl}`);
    ok(
      "RECON reconciled (aged − unapplied + other = arGl)",
      recon.reconciled,
      JSON.stringify(recon),
    );
    ok("RECON difference ~0", near(recon.difference, 0));
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await db.execute(sql`SELECT 1`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
