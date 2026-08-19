/**
 * Phase 4A.1 — real-service concurrency matrix completion + reliability
 * failure-injection matrix, on REAL PostgreSQL only.
 *
 * Completes the CONC matrix the reviewer required by driving the ACTUAL domain
 * services (not primitives, not mirrors) under real concurrent connections:
 *   REAL-CONC-SPAY-A/B  paySupplier: 20 distinct / 20 same-intent retries
 *   REAL-CONC-RV-A/B    Receipt Voucher: 20 posts / same-voucher parallel retry
 *   REAL-CONC-GRN-A     20 independent governed GRN POSTs (GL+GRNI+inventory)
 *   REAL-CONC-GRN-B     shared-PO contention → over-receipt prevented
 * And the reliability matrix via test-only failpoints (see failpoint.ts):
 *   REL-B  fail before AP link (Supplier Invoice)     → full rollback
 *   REL-C  fail before GRNI link (GRN)                → full rollback
 *   REL-D  fail during inventory mutation (GRN)       → inventory rolled back
 *   REL-F  connection-acquisition pressure (pool=10)  → recover, no corruption
 * (REL-A partial rollback and REL-E client-loss+retry are in test-phase-4a-conc.)
 *
 * REQUIRES a migrated + seeded real-PG DB whose name contains conc/bench.
 * Run: DATABASE_URL=postgres://.../thawab_conc THAWAB_FAILPOINTS=1 \
 *      node_modules/.bin/tsx scripts/test-phase-4a1-conc.mts
 */
import { sql, eq } from "drizzle-orm";
import { db, closeDb, genId, now } from "@/server/db/index";
import {
  createSupplier,
  paySupplier,
  getSupplierBalance,
  apReconciliation,
} from "@/server/db/supplier";
import { postBalancedEntry, resolveSystemAccountId, SYS } from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";
import { createReceiptVoucher, transitionReceiptVoucher } from "@/server/db/receipt-voucher";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import { createPurchaseOrder, transitionPurchaseOrder } from "@/server/db/purchase-order";
import { createGoodsReceipt, transitionGoodsReceipt } from "@/server/db/goods-receipt";
import { assignGrniAccount } from "@/server/db/account-mapping";
import { armFailpoint, clearFailpoints } from "@/server/db/failpoint";
import { accounts, cashboxes, inventoryItems } from "@/server/db/schema";
import { JournalSource, JournalStatus } from "@/lib/enums";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
  process.exit(2);
}
if (process.env.THAWAB_FAILPOINTS !== "1") {
  console.error("Set THAWAB_FAILPOINTS=1 to run the REL failure-injection matrix.");
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
const settledOk = (r: PromiseSettledResult<any>) => r.status === "fulfilled";

const ctx: any = {
  user: { id: "u-bench", name: "Bench Maker", role: "role-admin" },
  ip: "127.0.0.1",
  userAgent: "phase4a1",
  request: new Request("http://localhost/"),
};
const ctx2: any = {
  user: { id: "u-bench2", name: "Bench Approver", role: "role-admin" },
  ip: "127.0.0.1",
  userAgent: "phase4a1",
  request: new Request("http://localhost/"),
};

async function ensureUsers() {
  await db.execute(
    sql`INSERT INTO users (id, name, email, password) VALUES
      ('u-bench','Bench Maker','u-bench@example.com','x'),
      ('u-bench2','Bench Approver','u-bench2@example.com','x')
      ON CONFLICT (id) DO NOTHING`,
  );
}
async function reset() {
  await db.execute(sql`TRUNCATE
    journal_lines, journal_entries, supplier_journal_links, supplier_payments,
    grni_journal_links, suppliers, finance_workflow_events, audit_log,
    cashboxes, payment_vouchers, payment_voucher_lines,
    receipt_vouchers, receipt_voucher_lines,
    supplier_invoices, supplier_invoice_lines, supplier_invoice_grn_allocations,
    purchase_orders, purchase_order_lines,
    goods_receipts, goods_receipt_lines, stock_movements, inventory_items
    RESTART IDENTITY CASCADE`);
}
async function acctBal(id: string) {
  return Number((await getAccountBalance(db as any, id)).closing);
}
async function mkAccount(code: string, classification: string): Promise<string> {
  const id = genId("ACC");
  await db.execute(
    sql`INSERT INTO accounts (id, code, name, classification, level, currency, balance, postable, status, created_at, updated_at)
        VALUES (${id}, ${code}, ${"Bench " + code}, ${classification}, 3, 'SAR', 0, true, 'active', ${now()}, ${now()})
        ON CONFLICT (code) DO NOTHING`,
  );
  return (
    (await (db as any).select().from(accounts).where(eq(accounts.code, code)).limit(1))[0] as any
  ).id;
}

async function main() {
  await ensureUsers();
  await reset();
  const apId = await resolveSystemAccountId(db as any, SYS.ACCOUNTS_PAYABLE);
  const bankId = await resolveSystemAccountId(db as any, SYS.BANK);
  const incomeId = (
    await (db as any).select().from(accounts).where(eq(accounts.code, "4101")).limit(1)
  )[0].id as string; // donations_revenue
  const expId = (
    await (db as any).select().from(accounts).where(eq(accounts.code, "5101")).limit(1)
  )[0].id as string; // aid_expense

  async function seedPayable(supplierId: string, amount: number) {
    const { linkEntryApLine } = await import("@/server/db/supplier");
    await db.transaction(async (tx) => {
      const eid = await postBalancedEntry(tx as any, {
        date: "2026-06-01",
        description: `seed payable ${supplierId}`,
        source: JournalSource.PURCHASE,
        sourceType: "manual",
        sourceId: genId("SEED"),
        lines: [
          { accountId: bankId, debit: amount },
          { accountId: apId, credit: amount },
        ],
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });
      await linkEntryApLine(tx as any, { supplierId, entryId: eid, userId: ctx.user.id });
    });
  }
  async function mkSupplier(name: string) {
    return ((await createSupplier(ctx, { name, currency: "SAR" } as any)) as any).id as string;
  }
  async function ensureCashbox(id: string, linkedAccountId: string, fund: number) {
    await db.transaction(async (tx) => {
      await tx
        .insert(cashboxes)
        .values({
          id,
          code: id.toUpperCase(),
          name: `Bench ${id}`,
          linkedAccountId,
          currency: "SAR",
          status: "active",
          createdBy: ctx.user.id,
          createdAt: now(),
          updatedAt: now(),
        } as any)
        .onConflictDoNothing();
      if (fund > 0)
        await postBalancedEntry(tx as any, {
          date: "2026-05-01",
          description: `fund ${id}`,
          source: JournalSource.MANUAL,
          sourceType: "opening_balance",
          sourceId: genId("FUND"),
          lines: [
            { accountId: linkedAccountId, debit: fund },
            { accountId: incomeId, credit: fund },
          ],
          userId: ctx.user.id,
          status: JournalStatus.POSTED,
        });
    });
  }

  // ============ REAL-CONC-SPAY-A: 20 distinct concurrent Supplier Payments =====
  console.log("\nREAL-CONC-SPAY-A — 20 distinct concurrent paySupplier() (real service)");
  {
    const N = 20,
      amt = 75;
    const supplierId = await mkSupplier("SPAY-A Supplier");
    await seedPayable(supplierId, N * amt);
    const apBefore = await acctBal(apId);
    const payableBefore = (await getSupplierBalance(db as any, supplierId)).payableBalance;
    const res = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        paySupplier(ctx, {
          supplierId,
          amount: amt,
          method: "bank",
          idempotencyKey: `SPAY-A-${supplierId}-${i}`,
        }),
      ),
    );
    const okc = res.filter(settledOk).length;
    const entryIds = new Set(res.filter(settledOk).map((r: any) => r.value.entryId));
    const links = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM supplier_journal_links WHERE supplier_id=${supplierId}`,
      )
    )[0] as any;
    const apAfter = await acctBal(apId);
    const payableAfter = (await getSupplierBalance(db as any, supplierId)).payableBalance;
    ok(`all ${N} payments committed`, okc === N, `${okc}`);
    ok("20 distinct journal entries", entryIds.size === N, `${entryIds.size}`);
    ok("20 AP links (+1 seed) for supplier", Number(links.c) === N + 1, `${links.c}`);
    ok(
      "AP debited exactly N×amt",
      Math.abs(apBefore - apAfter - N * amt) < 0.005,
      `Δ=${apBefore - apAfter}`,
    );
    ok("payable reduced exactly N×amt", Math.abs(payableBefore - payableAfter - N * amt) < 0.005);
  }

  // ============ REAL-CONC-SPAY-B: 20 parallel retries, SAME intent ============
  console.log("\nREAL-CONC-SPAY-B — 20 parallel retries of ONE payment intent");
  {
    const amt = 400;
    const supplierId = await mkSupplier("SPAY-B Supplier");
    await seedPayable(supplierId, amt);
    const apBefore = await acctBal(apId);
    const key = `SPAY-B-${supplierId}-ONE`;
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        paySupplier(ctx, { supplierId, amount: amt, method: "bank", idempotencyKey: key }),
      ),
    );
    const entryIds = new Set(res.filter(settledOk).map((r: any) => r.value.entryId));
    const rows = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM journal_entries WHERE source_type='supplier_payment' AND source_id=${`SPY-${key}`}`,
      )
    )[0] as any;
    const links = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM supplier_journal_links WHERE supplier_id=${supplierId}`,
      )
    )[0] as any;
    const apAfter = await acctBal(apId);
    ok("all retries resolved", res.filter(settledOk).length === 20);
    ok(
      "exactly ONE journal entry",
      entryIds.size === 1 && Number(rows.c) === 1,
      `ids=${entryIds.size} rows=${rows.c}`,
    );
    ok("exactly ONE payment AP link (+1 seed)", Number(links.c) === 2, `${links.c}`);
    ok(
      "AP moved by amt exactly once",
      Math.abs(apBefore - apAfter - amt) < 0.005,
      `Δ=${apBefore - apAfter}`,
    );
  }

  // ============ REAL-CONC-RV-A: 20 concurrent Receipt Voucher POSTs ===========
  console.log("\nREAL-CONC-RV-A — 20 concurrent Receipt Voucher POSTs (real service)");
  const rvCashAcc = await mkAccount("110181", "asset");
  await ensureCashbox("cbrv", rvCashAcc, 0);
  async function makeApprovedRV(amount: number) {
    const v = await createReceiptVoucher(ctx, {
      voucherDate: "2026-06-11",
      cashboxId: "cbrv",
      payerName: "Bench Payer",
      totalAmount: amount,
      lines: [{ accountId: incomeId, amount }],
    });
    await transitionReceiptVoucher(ctx, (v as any).id, "submit");
    await transitionReceiptVoucher(ctx2, (v as any).id, "approve");
    return (v as any).id as string;
  }
  {
    const N = 20,
      amt = 30;
    const ids = [];
    for (let i = 0; i < N; i++) ids.push(await makeApprovedRV(amt));
    const cashBefore = await acctBal(rvCashAcc);
    const res = await Promise.allSettled(
      ids.map((id) => transitionReceiptVoucher(ctx2, id, "post")),
    );
    const okc = res.filter(settledOk).length;
    const cashAfter = await acctBal(rvCashAcc);
    const posted = (
      await db.execute(
        sql`SELECT count(*)::int AS c, count(DISTINCT voucher_number)::int AS d FROM receipt_vouchers WHERE status='posted' AND cashbox_id='cbrv'`,
      )
    )[0] as any;
    ok(`all ${N} receipt vouchers posted`, okc === N, `${okc}`);
    ok(
      "voucher numbers all distinct",
      Number(posted.d) === Number(posted.c),
      `${posted.d}/${posted.c}`,
    );
    ok(
      "cash increased by exactly N×amt",
      Math.abs(cashAfter - cashBefore - N * amt) < 0.005,
      `Δ=${cashAfter - cashBefore}`,
    );
  }

  // ============ REAL-CONC-RV-B: same voucher parallel retry ====================
  console.log("\nREAL-CONC-RV-B — post the SAME approved Receipt Voucher 20× concurrently");
  {
    const amt = 90;
    const id = await makeApprovedRV(amt);
    const cashBefore = await acctBal(rvCashAcc);
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, () => transitionReceiptVoucher(ctx2, id, "post")),
    );
    const okc = res.filter(settledOk).length;
    const cashAfter = await acctBal(rvCashAcc);
    const posted = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM journal_entries WHERE source_type='receipt_voucher' AND source_id=${id}`,
      )
    )[0] as any;
    ok("exactly ONE attempt succeeded", okc === 1, `${okc} succeeded`);
    ok("exactly ONE accounting effect (one journal)", Number(posted.c) === 1, `rows=${posted.c}`);
    ok(
      "cash increased by amt exactly once",
      Math.abs(cashAfter - cashBefore - amt) < 0.005,
      `Δ=${cashAfter - cashBefore}`,
    );
  }

  // ============ GRN setup: confirmed GRNI account ==============================
  const grniAcc = await mkAccount("210180", "liability");
  await db.transaction(async (tx) => {
    await assignGrniAccount(tx as any, { accountId: grniAcc, userId: ctx.user.id });
  });
  const inventoryId = await resolveSystemAccountId(db as any, SYS.INVENTORY);

  async function mkItem(name: string): Promise<string> {
    const id = genId("ITM");
    await db.insert(inventoryItems).values({
      id,
      name,
      unit: "unit",
      quantity: 0,
      minQuantity: 0,
      price: 0,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    } as any);
    return id;
  }
  async function mkIssuedPO(supplierId: string, itemId: string, qty: number, price: number) {
    const po = await createPurchaseOrder(ctx, {
      supplierId,
      subject: "Bench PO",
      lines: [{ lineType: "ITEM", itemId, description: "item", quantity: qty, unitPrice: price }],
    });
    await transitionPurchaseOrder(ctx, (po as any).id, "submit");
    await transitionPurchaseOrder(ctx2, (po as any).id, "approve");
    await transitionPurchaseOrder(ctx2, (po as any).id, "issue");
    return (po as any).id as string;
  }
  async function mkApprovedGRN(poId: string, poLineId: string, qty: number) {
    const grn = await createGoodsReceipt(ctx, {
      purchaseOrderId: poId,
      lines: [{ poLineId, quantityReceived: qty } as any],
    });
    await transitionGoodsReceipt(ctx, (grn as any).id, "submit");
    await transitionGoodsReceipt(ctx2, (grn as any).id, "approve");
    return (grn as any).id as string;
  }
  async function poLineId(poId: string): Promise<string> {
    return (
      await db.execute(
        sql`SELECT id FROM purchase_order_lines WHERE order_id=${poId} ORDER BY line_number LIMIT 1`,
      )
    )[0].id as string;
  }

  // ============ REAL-CONC-GRN-A: 20 independent GRN POSTs =====================
  console.log("\nREAL-CONC-GRN-A — 20 independent governed GRN POSTs (GL+GRNI+inventory)");
  {
    const N = 20,
      qty = 5,
      price = 10;
    const supplierId = await mkSupplier("GRN-A Supplier");
    const grnIds: string[] = [];
    const itemIds: string[] = [];
    for (let i = 0; i < N; i++) {
      const itemId = await mkItem(`GRN-A item ${i}`);
      itemIds.push(itemId);
      const poId = await mkIssuedPO(supplierId, itemId, qty, price);
      grnIds.push(await mkApprovedGRN(poId, await poLineId(poId), qty));
    }
    const grniBefore = await acctBal(grniAcc);
    const invBefore = await acctBal(inventoryId);
    const res = await Promise.allSettled(
      grnIds.map((id) => transitionGoodsReceipt(ctx2, id, "post")),
    );
    const okc = res.filter(settledOk).length;
    const grniAfter = await acctBal(grniAcc);
    const invAfter = await acctBal(inventoryId);
    const posted = (
      await db.execute(
        sql`SELECT count(*)::int AS c, count(DISTINCT grn_number)::int AS d FROM goods_receipts WHERE status='posted'`,
      )
    )[0] as any;
    const links = (
      await db.execute(sql`SELECT count(*)::int AS c FROM grni_journal_links`)
    )[0] as any;
    const moves = (
      await db.execute(sql`SELECT count(*)::int AS c FROM stock_movements WHERE type='in'`)
    )[0] as any;
    const totalStock = (
      await db.execute(sql`SELECT COALESCE(SUM(quantity),0)::numeric AS q FROM inventory_items`)
    )[0] as any;
    ok(`all ${N} GRNs posted`, okc === N, `${okc}`);
    ok(
      "GRN numbers all distinct",
      Number(posted.d) === Number(posted.c) && Number(posted.c) === N,
      `${posted.d}/${posted.c}`,
    );
    ok(
      "GRNI credited exactly N×qty×price",
      Math.abs(grniAfter - grniBefore - N * qty * price) < 0.005,
      `Δ=${grniAfter - grniBefore}`,
    );
    ok(
      "Inventory (GL) debited exactly N×qty×price",
      Math.abs(invAfter - invBefore - N * qty * price) < 0.005,
      `Δ=${invAfter - invBefore}`,
    );
    ok("one GRNI link per receipt", Number(links.c) === N, `${links.c}`);
    ok("one IN stock movement per receipt", Number(moves.c) === N, `${moves.c}`);
    ok(
      "physical stock = N×qty",
      Math.abs(Number(totalStock.q) - N * qty) < 0.005,
      `${totalStock.q}`,
    );
  }

  // ============ REAL-CONC-GRN-B: shared-PO over-receipt contention ============
  console.log("\nREAL-CONC-GRN-B — 3 GRNs (40 each) on ONE PO line of qty 100 → no over-receipt");
  {
    const supplierId = await mkSupplier("GRN-B Supplier");
    const itemId = await mkItem("GRN-B shared item");
    const poId = await mkIssuedPO(supplierId, itemId, 100, 10);
    const lineId = await poLineId(poId);
    const g1 = await mkApprovedGRN(poId, lineId, 40);
    const g2 = await mkApprovedGRN(poId, lineId, 40);
    const g3 = await mkApprovedGRN(poId, lineId, 40); // 120 attempted > 100 ordered
    const res = await Promise.allSettled(
      [g1, g2, g3].map((id) => transitionGoodsReceipt(ctx2, id, "post")),
    );
    const okc = res.filter(settledOk).length;
    const rejected = 3 - okc;
    const received = (
      await db.execute(
        sql`SELECT COALESCE(SUM(quantity_received),0)::numeric AS q FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id=grl.goods_receipt_id WHERE gr.status='posted' AND grl.po_line_id=${lineId}`,
      )
    )[0] as any;
    const stock = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    ok("over-receipt prevented (3rd GRN rejected)", rejected === 1, `rejected ${rejected}`);
    ok("received-to-date ≤ ordered (100)", Number(received.q) <= 100.005, `received ${received.q}`);
    ok(
      "received-to-date = 80 (two of three)",
      Math.abs(Number(received.q) - 80) < 0.005,
      `received ${received.q}`,
    );
    ok(
      "physical stock matches received (no lost update)",
      Math.abs(Number(stock.q) - Number(received.q)) < 0.005,
      `stock ${stock.q}`,
    );
  }

  // ============ REL-B: fail BEFORE AP link (Supplier Invoice) =================
  console.log("\nREL-B — Supplier Invoice POST fails before AP link → full rollback");
  {
    const supplierId = await mkSupplier("REL-B Supplier");
    const inv = await createSupplierInvoice(ctx, {
      supplierId,
      supplierInvoiceNumber: "REL-B-1",
      invoiceDate: "2026-06-12",
      lines: [
        { accountingMode: "direct", accountId: expId, quantity: 1, unitPrice: 100, taxRate: 0 },
      ],
    });
    await transitionSupplierInvoice(ctx, (inv as any).id, "submit");
    await transitionSupplierInvoice(ctx2, (inv as any).id, "approve");
    const apBefore = await acctBal(apId);
    const jBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    armFailpoint("si.before_ap_link", 1);
    let threw = false;
    try {
      await transitionSupplierInvoice(ctx2, (inv as any).id, "post");
    } catch {
      threw = true;
    }
    clearFailpoints();
    const apAfter = await acctBal(apId);
    const jAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    const st = (
      await db.execute(sql`SELECT status FROM supplier_invoices WHERE id=${(inv as any).id}`)
    )[0] as any;
    const links = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM supplier_journal_links WHERE supplier_id=${supplierId}`,
      )
    )[0] as any;
    ok("post threw (failure surfaced)", threw);
    ok("invoice NOT posted", st.status !== "posted", st.status);
    ok("no journal persisted", Number(jAfter.c) === Number(jBefore.c), `${jBefore.c}→${jAfter.c}`);
    ok("no AP link created", Number(links.c) === 0, `${links.c}`);
    ok("AP unchanged", Math.abs(apAfter - apBefore) < 0.005, `Δ=${apAfter - apBefore}`);
    // Recovery: without the failpoint, the same invoice posts cleanly.
    await transitionSupplierInvoice(ctx2, (inv as any).id, "post");
    const st2 = (
      await db.execute(sql`SELECT status FROM supplier_invoices WHERE id=${(inv as any).id}`)
    )[0] as any;
    ok("invoice posts cleanly after failpoint cleared", st2.status === "posted", st2.status);
  }

  // ============ REL-C: fail BEFORE GRNI link (GRN) ============================
  console.log("\nREL-C — GRN POST fails before GRNI link → full rollback");
  {
    const supplierId = await mkSupplier("REL-C Supplier");
    const itemId = await mkItem("REL-C item");
    const poId = await mkIssuedPO(supplierId, itemId, 10, 10);
    const grnId = await mkApprovedGRN(poId, await poLineId(poId), 10);
    const jBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    const linksBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM grni_journal_links`)
    )[0] as any;
    const stockBefore = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    armFailpoint("grn.before_grni_link", 1);
    let threw = false;
    try {
      await transitionGoodsReceipt(ctx2, grnId, "post");
    } catch {
      threw = true;
    }
    clearFailpoints();
    const jAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    const linksAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM grni_journal_links`)
    )[0] as any;
    const stockAfter = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    const st = (
      await db.execute(sql`SELECT status FROM goods_receipts WHERE id=${grnId}`)
    )[0] as any;
    ok("post threw", threw);
    ok("GRN NOT posted", st.status !== "posted", st.status);
    ok("no journal persisted", Number(jAfter.c) === Number(jBefore.c));
    ok(
      "no GRNI link persisted",
      Number(linksAfter.c) === Number(linksBefore.c),
      `${linksBefore.c}→${linksAfter.c}`,
    );
    ok(
      "inventory unchanged (rolled back)",
      Math.abs(Number(stockAfter.q) - Number(stockBefore.q)) < 0.005,
      `${stockBefore.q}→${stockAfter.q}`,
    );
    await transitionGoodsReceipt(ctx2, grnId, "post");
    const st2 = (
      await db.execute(sql`SELECT status FROM goods_receipts WHERE id=${grnId}`)
    )[0] as any;
    ok("GRN posts cleanly after failpoint cleared", st2.status === "posted", st2.status);
  }

  // ============ REL-D: fail DURING inventory mutation (GRN) ====================
  console.log("\nREL-D — GRN POST fails during inventory mutation → inventory rolled back");
  {
    const supplierId = await mkSupplier("REL-D Supplier");
    const itemId = await mkItem("REL-D item");
    const poId = await mkIssuedPO(supplierId, itemId, 7, 10);
    const grnId = await mkApprovedGRN(poId, await poLineId(poId), 7);
    const stockBefore = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    const movesBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM stock_movements`)
    )[0] as any;
    const jBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    armFailpoint("grn.during_inventory", 1);
    let threw = false;
    try {
      await transitionGoodsReceipt(ctx2, grnId, "post");
    } catch {
      threw = true;
    }
    clearFailpoints();
    const stockAfter = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    const movesAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM stock_movements`)
    )[0] as any;
    const jAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    const st = (
      await db.execute(sql`SELECT status FROM goods_receipts WHERE id=${grnId}`)
    )[0] as any;
    ok("post threw", threw);
    ok("GRN NOT posted", st.status !== "posted", st.status);
    ok(
      "inventory quantity rolled back",
      Math.abs(Number(stockAfter.q) - Number(stockBefore.q)) < 0.005,
      `${stockBefore.q}→${stockAfter.q}`,
    );
    ok(
      "no stock movement persisted",
      Number(movesAfter.c) === Number(movesBefore.c),
      `${movesBefore.c}→${movesAfter.c}`,
    );
    ok("no journal persisted", Number(jAfter.c) === Number(jBefore.c));
    await transitionGoodsReceipt(ctx2, grnId, "post");
    const st2 = (
      await db.execute(sql`SELECT status FROM goods_receipts WHERE id=${grnId}`)
    )[0] as any;
    const stock2 = (
      await db.execute(sql`SELECT quantity::numeric AS q FROM inventory_items WHERE id=${itemId}`)
    )[0] as any;
    ok(
      "GRN posts cleanly + inventory +7 after clear",
      st2.status === "posted" && Math.abs(Number(stock2.q) - (Number(stockBefore.q) + 7)) < 0.005,
      `${st2.status} stock ${stock2.q}`,
    );
  }

  // ============ REL-F: connection-acquisition pressure (pool=10) ==============
  console.log("\nREL-F — 40 concurrent real payments against pool max=10 → recover, no corruption");
  {
    const N = 40,
      amt = 5;
    const supplierId = await mkSupplier("REL-F Supplier");
    await seedPayable(supplierId, N * amt);
    const t0 = process.hrtime.bigint();
    const res = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        paySupplier(ctx, {
          supplierId,
          amount: amt,
          method: "bank",
          idempotencyKey: `REL-F-${supplierId}-${i}`,
        }),
      ),
    );
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const okc = res.filter(settledOk).length;
    const entryIds = new Set(res.filter(settledOk).map((r: any) => r.value.entryId));
    const payableAfter = (await getSupplierBalance(db as any, supplierId)).payableBalance;
    // Pool recovers: a normal query works right after the pressure burst.
    const probe = (await db.execute(sql`SELECT 1 AS ok`))[0] as any;
    ok(`all ${N} payments completed despite pool=10`, okc === N, `${okc}`);
    ok(
      "N distinct journals (no lost/duplicate under pressure)",
      entryIds.size === N,
      `${entryIds.size}`,
    );
    ok(
      "payable fully cleared (exact accounting)",
      Math.abs(payableAfter) < 0.005,
      `payable ${payableAfter}`,
    );
    ok("pool recovered (post-pressure query works)", Number(probe.ok) === 1);
    console.log(`    [REL-F] ${N} ops / pool 10 in ${elapsedMs.toFixed(0)} ms (queued + drained)`);
  }

  // ============ GL INTEGRITY after the whole battery ==========================
  console.log("\nGL-INTEGRITY");
  {
    const tb = (
      await db.execute(
        sql`SELECT COALESCE(SUM(jl.debit),0)::numeric AS d, COALESCE(SUM(jl.credit),0)::numeric AS c FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.status IN ('posted','reversed')`,
      )
    )[0] as any;
    ok(
      "trial balance balances",
      Math.abs(Number(tb.d) - Number(tb.c)) < 0.005,
      `d=${tb.d} c=${tb.c}`,
    );
    const recon = (await apReconciliation(db as any)) as any;
    ok(
      "AP reconciles (GL = subledger + unallocated)",
      Math.abs(Number(recon.difference)) < 0.005,
      `diff=${recon.difference}`,
    );
  }

  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Phase 4A.1 concurrency+reliability: ${pass} passed, ${fail} failed`,
  );
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
