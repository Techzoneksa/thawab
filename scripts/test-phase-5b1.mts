/**
 * Phase 5B.1 — GRN reversal ↔ receipt-capacity serialization (P1-A) + Purchase
 * Return read-scale / eligible-GRN reachability (P1-B), on REAL PostgreSQL.
 *
 * P1-A: GRN reverse, Supplier Invoice matched POST, Purchase Return POST and
 * Purchase Return REVERSE all serialize on the shared RECEIPT_CAPACITY advisory
 * gate (keyed by goods_receipt_id). Forced both orderings prove no interleaving
 * yields a REVERSED GRN with an active downstream document; independent GRNs stay
 * concurrent; zero deadlocks.
 *
 * P1-B: 10,000+ purchase returns + 2,000+ eligible governed POSTED GRNs; the list
 * and eligible-GRN lookup are server-bounded + searchable, old records remain
 * reachable, p50/p95 measured, EXPLAIN summarized, responses bounded.
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-phase-5b1.mts
 */
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { db, now, genId, closeDb } from "@/server/db/index";
import {
  goodsReceipts,
  goodsReceiptLines,
  purchaseOrders,
  purchaseOrderLines,
  inventoryItems,
  stockMovements,
  accounts,
} from "@/server/db/schema";
import { postBalancedEntry } from "@/server/db/gl";
import { linkEntryGrniLine } from "@/server/db/grni-link";
import {
  createPurchaseReturn,
  transitionPurchaseReturn,
  getPurchaseReturnDetail,
  listPurchaseReturns,
  eligibleGrnsForReturn,
} from "@/server/db/purchase-return";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import { transitionGoodsReceipt } from "@/server/db/goods-receipt";
import { createSupplier } from "@/server/db/supplier";
import { LOCK_NS } from "@/server/db/lock-namespaces";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const p50 = pct(t, 0.5),
    p95 = pct(t, 0.95);
  console.log(`  ${label.padEnd(34)} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  return p95;
}
const kb = (o: any) => (Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1) + " KB";

const ctx: any = {
  user: { id: "u-bench", name: "M", role: "role-admin" },
  ip: "127.0.0.1",
  request: new Request("http://localhost/"),
};
const ctx2: any = { ...ctx, user: { id: "u-bench2", name: "A", role: "role-admin" } };
const gate = postgres(url, { max: 3, prepare: false, onnotice: () => {} });
const RUN = Date.now().toString(36);
let INV = "",
  GRNI = "";
let seq = 0;

/** Seed a certified POSTED GRN with one ITEM line (received `qty` @ `unit`). */
async function seedGrn(supplierId: string, qty: number, unit: number) {
  seq++;
  const grnId = genId("GRN"),
    poId = genId("PO"),
    poLineId = genId("POL"),
    grnLineId = genId("GRL"),
    itemId = genId("ITM");
  const lineValue = Math.round(qty * unit * 100) / 100;
  const ts = now();
  await db.transaction(async (tx) => {
    await tx
      .insert(purchaseOrders)
      .values({
        id: poId,
        poNumber: `PO-5B1-${RUN}-${seq}`,
        supplierId,
        governanceMode: "governed",
        subject: "5B1",
        date: "2026-03-01",
        status: "issued",
        currency: "SAR",
        createdAt: ts,
        updatedAt: ts,
      } as any);
    await tx
      .insert(inventoryItems)
      .values({
        id: itemId,
        name: `I${seq}`,
        unit: "قطعة",
        quantity: qty,
        price: unit,
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      } as any);
    await tx
      .insert(purchaseOrderLines)
      .values({
        id: poLineId,
        orderId: poId,
        lineNumber: 1,
        itemId,
        description: "i",
        quantity: qty,
        unitPrice: unit,
        receivedQuantity: qty,
        lineType: "ITEM",
      } as any);
    const entryId = await postBalancedEntry(
      tx as any,
      {
        date: "2026-03-10",
        description: `GRN ${seq}`,
        currency: "SAR",
        source: "goods_receipt",
        sourceType: "goods_receipt",
        sourceId: grnId,
        lines: [
          { accountId: INV, debit: lineValue, description: "r" },
          { accountId: GRNI, credit: lineValue, description: "g" },
        ],
        userId: ctx.user.id,
        status: "posted",
      } as any,
    );
    const mvId = genId("MV");
    await tx
      .insert(goodsReceipts)
      .values({
        id: grnId,
        grnNumber: `GRN-5B1-${RUN}-${seq}`,
        purchaseOrderId: poId,
        supplierId,
        receiptDate: "2026-03-10",
        status: "posted",
        currency: "SAR",
        totalValue: lineValue,
        journalEntryId: entryId,
        createdAt: ts,
        updatedAt: ts,
      } as any);
    await tx
      .insert(goodsReceiptLines)
      .values({
        id: grnLineId,
        goodsReceiptId: grnId,
        poLineId,
        lineNumber: 1,
        lineType: "ITEM",
        description: "i",
        itemId,
        accountId: INV,
        quantityReceived: qty,
        unitPrice: unit,
        lineValue,
        stockMovementId: mvId,
        createdAt: ts,
      } as any);
    await tx
      .insert(stockMovements)
      .values({
        id: mvId,
        itemId,
        type: "in",
        quantity: qty,
        balanceAfter: qty,
        sourceType: "goods_receipt",
        sourceId: grnId,
        date: "2026-03-10",
        createdAt: ts,
      } as any);
    await linkEntryGrniLine(tx as any, {
      goodsReceiptId: grnId,
      entryId,
      accountId: GRNI,
      linkType: "receipt",
      userId: ctx.user.id,
    });
  });
  return { grnId, grnLineId, itemId };
}
async function mkReturn(grnId: string, grnLineId: string, quantity: number) {
  return (
    (await createPurchaseReturn(ctx, {
      goodsReceiptId: grnId,
      lines: [{ goodsReceiptLineId: grnLineId, quantity }],
    })) as any
  ).id as string;
}
async function approvedReturn(grnId: string, grnLineId: string, quantity: number) {
  const id = await mkReturn(grnId, grnLineId, quantity);
  await transitionPurchaseReturn(ctx, id, "submit");
  await transitionPurchaseReturn(ctx2, id, "approve");
  return id;
}
async function postedReturn(grnId: string, grnLineId: string, quantity: number) {
  const id = await approvedReturn(grnId, grnLineId, quantity);
  await transitionPurchaseReturn(ctx2, id, "post");
  return id;
}
async function approvedMatchedInvoice(
  supplierId: string,
  grnLineId: string,
  qty: number,
  unit: number,
) {
  const inv = (await createSupplierInvoice(ctx, {
    supplierId,
    supplierInvoiceNumber: `SIV-5B1-${RUN}-${++seq}`,
    invoiceDate: "2026-03-12",
    dueDate: null,
    lines: [
      {
        accountingMode: "grn_matched",
        goodsReceiptLineId: grnLineId,
        quantity: qty,
        unitPrice: unit,
        taxRate: 0,
      },
    ],
  } as any)) as any;
  await transitionSupplierInvoice(ctx, inv.id, "submit");
  await transitionSupplierInvoice(ctx2, inv.id, "approve");
  return inv.id as string;
}
async function grnStatus(grnId: string) {
  const r = (await db.execute(sql`SELECT status s FROM goods_receipts WHERE id=${grnId}`)) as any;
  return (r.rows ?? r ?? [])[0]?.s;
}
async function activeReturnCount(grnId: string) {
  const r = (await db.execute(
    sql`SELECT count(*)::int c FROM purchase_returns WHERE goods_receipt_id=${grnId} AND status='posted'`,
  )) as any;
  return Number((r.rows ?? r ?? [])[0]?.c || 0);
}

/** Force `firstFn` then `secondFn` on the receipt-capacity gate for `grnId`. */
async function forceOrder(
  grnId: string,
  firstFn: () => Promise<any>,
  secondFn: () => Promise<any>,
) {
  let release!: () => void;
  const releaser = new Promise<void>((r) => (release = r));
  let acquired!: () => void;
  const acqP = new Promise<void>((r) => (acquired = r));
  const held = gate.begin(async (g) => {
    await g`SELECT pg_advisory_xact_lock(${LOCK_NS.RECEIPT_CAPACITY}, hashtext(${grnId}))`;
    acquired();
    await releaser;
  });
  await acqP;
  const p1 = firstFn().then(
    (v) => ({ status: "fulfilled", value: v }),
    (e) => ({ status: "rejected", reason: e }),
  );
  await sleep(200);
  const p2 = secondFn().then(
    (v) => ({ status: "fulfilled", value: v }),
    (e) => ({ status: "rejected", reason: e }),
  );
  await sleep(200);
  release();
  await held;
  const [first, second] = await Promise.all([p1, p2]);
  return { first, second } as any;
}

async function main() {
  await db.execute(
    sql`INSERT INTO users (id,name,email,password) VALUES ('u-bench','M','ub@e.com','x'),('u-bench2','A','ub2@e.com','x') ON CONFLICT (id) DO NOTHING`,
  );
  INV = (await db.select().from(accounts).where(eq(accounts.systemKey, "inventory")).limit(1))[0]
    .id as string;
  GRNI = (await db.select().from(accounts).where(eq(accounts.systemKey, "grni")).limit(1))[0]
    .id as string;
  const sup = ((await createSupplier(ctx, { name: "5B1 Supplier", currency: "SAR" } as any)) as any)
    .id as string;

  // ============ P1-A — FORCED RACES ============
  console.log("\nGRN-RACE-RET-A — return POST wins → GRN reverse REJECT (active return)");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const rid = await approvedReturn(grnId, grnLineId, 4);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionPurchaseReturn(ctx2, rid, "post"),
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
    );
    ok("return POST (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "GRN reverse (second) rejected GRN_HAS_POSTED_PURCHASE_RETURN",
      second.status === "rejected" && second.reason?.code === "GRN_HAS_POSTED_PURCHASE_RETURN",
      `${second.reason?.code}`,
    );
    ok(
      "GRN remains POSTED with active return",
      (await grnStatus(grnId)) === "posted" && (await activeReturnCount(grnId)) === 1,
    );
  }

  console.log("\nGRN-RACE-RET-B — GRN reverse wins → return POST REJECT (GRN not posted)");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const rid = await approvedReturn(grnId, grnLineId, 4);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
      () => transitionPurchaseReturn(ctx2, rid, "post"),
    );
    ok("GRN reverse (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "return POST (second) rejected (GRN not posted)",
      second.status === "rejected" && second.reason?.code === "GRN_NOT_POSTED",
      `${second.reason?.code}`,
    );
    ok(
      "GRN REVERSED, no active return",
      (await grnStatus(grnId)) === "reversed" && (await activeReturnCount(grnId)) === 0,
    );
  }

  console.log("\nGRN-RACE-INV-A — matched invoice POST wins → GRN reverse REJECT");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const invId = await approvedMatchedInvoice(sup, grnLineId, 4, 10);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionSupplierInvoice(ctx2, invId, "post"),
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
    );
    ok("invoice POST (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "GRN reverse (second) rejected GRN_HAS_POSTED_SUPPLIER_INVOICE",
      second.status === "rejected" && second.reason?.code === "GRN_HAS_POSTED_SUPPLIER_INVOICE",
      `${second.reason?.code}`,
    );
    ok("GRN remains POSTED", (await grnStatus(grnId)) === "posted");
  }

  console.log("\nGRN-RACE-INV-B — GRN reverse wins → matched invoice POST REJECT");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const invId = await approvedMatchedInvoice(sup, grnLineId, 4, 10);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
      () => transitionSupplierInvoice(ctx2, invId, "post"),
    );
    ok("GRN reverse (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "invoice POST (second) rejected (GRN reversed/not posted)",
      second.status === "rejected" &&
        ["GRN_REVERSED", "GRN_NOT_POSTED"].includes(second.reason?.code),
      `${second.reason?.code}`,
    );
    ok("GRN REVERSED, no active invoice match", (await grnStatus(grnId)) === "reversed");
  }

  console.log("\nGRN-RACE-RETREV-A — return reverse wins → GRN reverse may proceed");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const rid = await postedReturn(grnId, grnLineId, 4);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionPurchaseReturn(ctx2, rid, "reverse", "u"),
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
    );
    ok("return reverse (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "GRN reverse (second) succeeded (capacity released)",
      second.status === "fulfilled",
      second.reason?.code,
    );
    ok(
      "GRN REVERSED, no active return",
      (await grnStatus(grnId)) === "reversed" && (await activeReturnCount(grnId)) === 0,
    );
  }

  console.log("\nGRN-RACE-RETREV-B — GRN reverse checks first → REJECT (active return)");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const rid = await postedReturn(grnId, grnLineId, 4);
    const { first, second } = await forceOrder(
      grnId,
      () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
      () => transitionPurchaseReturn(ctx2, rid, "reverse", "u"),
    );
    ok(
      "GRN reverse (first) rejected GRN_HAS_POSTED_PURCHASE_RETURN",
      first.status === "rejected" && first.reason?.code === "GRN_HAS_POSTED_PURCHASE_RETURN",
      `${first.reason?.code}`,
    );
    ok("return reverse (second) succeeded", second.status === "fulfilled", second.reason?.code);
    ok(
      "GRN stays POSTED (never reversed with active return)",
      (await grnStatus(grnId)) === "posted",
    );
  }

  console.log(
    "\nGRN-RACE-STRESS — 30 alternating interleavings: no REVERSED+active, zero deadlocks",
  );
  {
    let bad = 0,
      deadlocks = 0,
      reversed = 0,
      keptDown = 0;
    for (let i = 0; i < 30; i++) {
      const { grnId, grnLineId } = await seedGrn(sup, 6, 5);
      const useReturn = i % 2 === 0;
      const downId = useReturn
        ? await approvedReturn(grnId, grnLineId, 3)
        : await approvedMatchedInvoice(sup, grnLineId, 3, 5);
      const downFn = useReturn
        ? () => transitionPurchaseReturn(ctx2, downId, "post")
        : () => transitionSupplierInvoice(ctx2, downId, "post");
      const revFn = () => transitionGoodsReceipt(ctx2, grnId, "reverse", "x");
      const downFirst = i % 4 < 2;
      let res: any;
      try {
        res = downFirst
          ? await forceOrder(grnId, downFn, revFn)
          : await forceOrder(grnId, revFn, downFn);
      } catch (e: any) {
        if (/deadlock/i.test(e?.message || "") || e?.code === "40P01") deadlocks++;
        continue;
      }
      for (const r of [res.first, res.second])
        if (
          r.status === "rejected" &&
          (/deadlock/i.test(r.reason?.message || "") || r.reason?.code === "40P01")
        )
          deadlocks++;
      const st = await grnStatus(grnId);
      const activeInv = (await db.execute(
        sql`SELECT count(*)::int c FROM supplier_invoice_grn_allocations a JOIN supplier_invoices si ON a.supplier_invoice_id=si.id WHERE a.goods_receipt_id=${grnId} AND si.status='posted'`,
      )) as any;
      const active =
        (await activeReturnCount(grnId)) + Number((activeInv.rows ?? activeInv ?? [])[0]?.c || 0);
      if (st === "reversed" && active > 0) bad++;
      if (st === "reversed") reversed++;
      if (st === "posted" && active > 0) keptDown++;
    }
    ok("never REVERSED GRN with an active downstream document", bad === 0, `bad=${bad}`);
    ok("zero deadlocks across 30 forced races", deadlocks === 0, `deadlocks=${deadlocks}`);
    ok("both outcomes exercised", reversed > 0 && keptDown > 0, `rev=${reversed} kept=${keptDown}`);
  }

  console.log("\nGRN-CONCURRENCY — 20 independent GRNs post returns concurrently");
  {
    const grns: Array<{ grnId: string; grnLineId: string }> = [];
    for (let i = 0; i < 20; i++) grns.push(await seedGrn(sup, 5, 4));
    const t0 = Date.now();
    const res = await Promise.allSettled(grns.map((g) => postedReturn(g.grnId, g.grnLineId, 2)));
    const okc = res.filter((r) => r.status === "fulfilled").length;
    const ms = Date.now() - t0;
    ok("all 20 independent returns posted concurrently", okc === 20, `${okc}`);
    ok("independent GRNs are NOT globally serialized (< 20s)", ms < 20000, `${ms}ms`);
  }

  // ============ P1-B — SCALE + PICKER ============
  console.log("\nSCALE — bulk-generate eligible GRNs + purchase returns");
  const otherSup = (
    (await createSupplier(ctx, { name: "5B1 Other", currency: "SAR" } as any)) as any
  ).id as string;
  {
    // 2,000 eligible governed POSTED GRNs (structural; picker reads no journal),
    // ascending dates so #1 is the OLDEST → reachability target.
    const N_ELIG = 2000;
    await db.execute(sql`
      INSERT INTO purchase_orders (id, po_number, supplier_id, governance_mode, subject, date, status, currency, created_at, updated_at)
      SELECT 'POE-${sql.raw(RUN)}-'||g, 'POE-${sql.raw(RUN)}-'||g, ${sup}, 'governed', 'e', '2026-01-01', 'issued', 'SAR', now()::text, now()::text
      FROM generate_series(1, ${N_ELIG}) g`);
    await db.execute(sql`
      INSERT INTO inventory_items (id, name, unit, quantity, price, status, created_at, updated_at)
      SELECT 'ITE-${sql.raw(RUN)}-'||g, 'ie'||g, 'ق', 5, 5, 'active', now()::text, now()::text FROM generate_series(1, ${N_ELIG}) g`);
    await db.execute(sql`
      INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, status, currency, total_value, created_at, updated_at)
      SELECT 'GRE-${sql.raw(RUN)}-'||g, 'GRE-${sql.raw(RUN)}-'||lpad(g::text,6,'0'),
             'POE-${sql.raw(RUN)}-'||g, ${sup},
             to_char(date '2020-01-01' + g, 'YYYY-MM-DD'), 'posted', 'SAR', 25, now()::text, now()::text
      FROM generate_series(1, ${N_ELIG}) g`);
    await db.execute(sql`
      INSERT INTO purchase_order_lines (id, order_id, line_number, item_id, description, quantity, unit_price, received_quantity, line_type)
      SELECT 'POLE-${sql.raw(RUN)}-'||g, 'POE-${sql.raw(RUN)}-'||g, 1, 'ITE-${sql.raw(RUN)}-'||g, 'e', 5, 5, 5, 'ITEM' FROM generate_series(1, ${N_ELIG}) g`);
    await db.execute(sql`
      INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, line_number, line_type, item_id, account_id, quantity_received, unit_price, line_value, created_at)
      SELECT 'GLE-${sql.raw(RUN)}-'||g, 'GRE-${sql.raw(RUN)}-'||g, 'POLE-${sql.raw(RUN)}-'||g, 1, 'ITEM',
             'ITE-${sql.raw(RUN)}-'||g, ${INV}, 5, 5, 25, now()::text FROM generate_series(1, ${N_ELIG}) g`);

    // Pool B: 40 GRNs to carry the 10,000 bulk returns (varied statuses).
    const N_POOLB = 40;
    await db.execute(sql`
      INSERT INTO purchase_orders (id, po_number, supplier_id, governance_mode, subject, date, status, currency, created_at, updated_at)
      SELECT 'POB-${sql.raw(RUN)}-'||g, 'POB-${sql.raw(RUN)}-'||g, ${sup}, 'governed', 'b', '2026-01-01', 'issued', 'SAR', now()::text, now()::text FROM generate_series(1, ${N_POOLB}) g`);
    await db.execute(sql`
      INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, status, currency, total_value, created_at, updated_at)
      SELECT 'GRB-${sql.raw(RUN)}-'||g, 'GRB-${sql.raw(RUN)}-'||g, 'POB-${sql.raw(RUN)}-'||g, ${sup}, '2026-02-01', 'posted', 'SAR', 100, now()::text, now()::text FROM generate_series(1, ${N_POOLB}) g`);
    await db.execute(sql`
      INSERT INTO purchase_order_lines (id, order_id, line_number, description, quantity, unit_price, received_quantity, line_type)
      SELECT 'POLB-${sql.raw(RUN)}-'||g, 'POB-${sql.raw(RUN)}-'||g, 1, 'b', 100, 1, 100, 'ITEM' FROM generate_series(1, ${N_POOLB}) g`);
    await db.execute(sql`
      INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, line_number, line_type, item_id, account_id, quantity_received, unit_price, line_value, created_at)
      SELECT 'GLB-${sql.raw(RUN)}-'||g, 'GRB-${sql.raw(RUN)}-'||g, 'POLB-${sql.raw(RUN)}-'||g, 1, 'ITEM', NULL, ${INV}, 100, 1, 100, now()::text FROM generate_series(1, ${N_POOLB}) g`);
    // 10,000 purchase returns, statuses cycled, referencing pool B.
    const N_RET = 10000;
    await db.execute(sql`
      INSERT INTO purchase_returns (id, return_number, goods_receipt_id, purchase_order_id, supplier_id, return_date, status, currency, total_value, created_at, updated_at)
      SELECT 'PRB-${sql.raw(RUN)}-'||g, 'PRET-${sql.raw(RUN)}-'||lpad(g::text,7,'0'),
             'GRB-${sql.raw(RUN)}-'||(1+(g % ${N_POOLB})), 'POB-${sql.raw(RUN)}-'||(1+(g % ${N_POOLB})), ${sup},
             to_char(date '2021-01-01' + (g % 900), 'YYYY-MM-DD'),
             (ARRAY['draft','submitted','approved','rejected','reversed'])[1+(g % 5)], 'SAR', 1, now()::text, now()::text
      FROM generate_series(1, ${N_RET}) g`);
    await db.execute(sql`
      INSERT INTO purchase_return_lines (id, purchase_return_id, goods_receipt_line_id, line_number, line_type, quantity_returned, line_value, created_at)
      SELECT 'PRLB-${sql.raw(RUN)}-'||g, 'PRB-${sql.raw(RUN)}-'||g, 'GLB-${sql.raw(RUN)}-'||(1+(g % ${N_POOLB})), 1, 'ITEM', 1, 1, now()::text
      FROM generate_series(1, ${N_RET}) g`);

    const rc = (await db.execute(sql`SELECT count(*)::int c FROM purchase_returns`)) as any;
    const gc = (await db.execute(
      sql`SELECT count(*)::int c FROM goods_receipts WHERE status='posted'`,
    )) as any;
    console.log(
      `  dataset: purchase_returns=${(rc.rows ?? rc)[0].c}  posted GRNs=${(gc.rows ?? gc)[0].c}`,
    );
    ok(
      "≥ 10,000 purchase returns present",
      Number((rc.rows ?? rc)[0].c) >= 10000,
      `${(rc.rows ?? rc)[0].c}`,
    );
  }

  console.log("\nRET-PICK — eligibility + old-record reachability");
  {
    // A: an eligible GRN older than the first 1,000 (GRE #1 = oldest date) found by number.
    const oldNum = `GRE-${RUN}-000001`;
    const a = await eligibleGrnsForReturn(db as any, { q: oldNum });
    ok(
      "RET-PICK-A old eligible GRN found by number",
      a.items.some((x) => x.grnNumber === oldNum),
      `${a.items.length}`,
    );
    // B: REVERSED GRN excluded.
    const rev = await seedGrn(sup, 5, 5);
    await transitionGoodsReceipt(ctx2, rev.grnId, "reverse", "x");
    const revNum = (
      await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, rev.grnId)).limit(1)
    )[0].grnNumber;
    ok(
      "RET-PICK-B REVERSED GRN excluded",
      (await eligibleGrnsForReturn(db as any, { q: revNum })).items.length === 0,
    );
    // C: non-POSTED (draft) GRN excluded — insert a governed draft.
    const draftNum = `GRD-${RUN}-1`;
    await db.execute(
      sql`INSERT INTO purchase_orders (id,po_number,supplier_id,governance_mode,subject,date,status,currency,created_at,updated_at) VALUES ('POD-${sql.raw(RUN)}','POD-${sql.raw(RUN)}',${sup},'governed','d','2026-01-01','issued','SAR',now()::text,now()::text)`,
    );
    await db.execute(
      sql`INSERT INTO goods_receipts (id,grn_number,purchase_order_id,supplier_id,receipt_date,status,currency,total_value,created_at,updated_at) VALUES ('GRD-${sql.raw(RUN)}',${draftNum},'POD-${sql.raw(RUN)}',${sup},'2026-01-01','draft','SAR',10,now()::text,now()::text)`,
    );
    ok(
      "RET-PICK-C non-POSTED GRN excluded",
      (await eligibleGrnsForReturn(db as any, { q: draftNum })).items.length === 0,
    );
    // D: fully invoiced posted GRN excluded.
    const dGrn = await seedGrn(sup, 5, 5);
    const dInv = await approvedMatchedInvoice(sup, dGrn.grnLineId, 5, 5);
    await transitionSupplierInvoice(ctx2, dInv, "post");
    const dNum = (
      await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, dGrn.grnId)).limit(1)
    )[0].grnNumber;
    ok(
      "RET-PICK-D fully invoiced GRN excluded",
      (await eligibleGrnsForReturn(db as any, { q: dNum })).items.length === 0,
    );
    // E: fully returned posted GRN excluded.
    const eGrn = await seedGrn(sup, 5, 5);
    await postedReturn(eGrn.grnId, eGrn.grnLineId, 5);
    const eNum = (
      await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, eGrn.grnId)).limit(1)
    )[0].grnNumber;
    ok(
      "RET-PICK-E fully returned GRN excluded",
      (await eligibleGrnsForReturn(db as any, { q: eNum })).items.length === 0,
    );
    // F: different supplier excluded when supplier fixed.
    const fGrn = await seedGrn(otherSup, 5, 5);
    const fNum = (
      await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, fGrn.grnId)).limit(1)
    )[0].grnNumber;
    const fRes = await eligibleGrnsForReturn(db as any, { q: fNum, supplierId: sup });
    ok("RET-PICK-F other-supplier GRN excluded when supplier fixed", fRes.items.length === 0);
    ok(
      "eligible lookup bounded ≤ 50",
      (await eligibleGrnsForReturn(db as any, { limit: 50 })).items.length <= 50,
    );
  }

  console.log("\nPERF — p50/p95 (repeated runs) + response sizes");
  {
    const p1 = await bench("purchase return list (page 1)", () =>
      listPurchaseReturns({ page: 1, pageSize: 25 }),
    );
    ok("list p95 ≤ 500ms", p1 <= 500, `${p1}`);
    const p2 = await bench("return number search", () =>
      listPurchaseReturns({ search: `PRET-${RUN}-0005000`, pageSize: 25 }),
    );
    ok("return search p95 ≤ 300ms", p2 <= 300, `${p2}`);
    const p3 = await bench("eligible GRN lookup", () =>
      eligibleGrnsForReturn(db as any, { limit: 20 }),
    );
    ok("eligible lookup p95 ≤ 500ms", p3 <= 500, `${p3}`);
    const p4 = await bench("old eligible GRN search", () =>
      eligibleGrnsForReturn(db as any, { q: `GRE-${RUN}-000001` }),
    );
    ok("old GRN search p95 ≤ 500ms", p4 <= 500, `${p4}`);
    const someRet = (await listPurchaseReturns({ page: 1, pageSize: 1 })).items[0];
    const p5 = await bench("return detail (position)", () => getPurchaseReturnDetail(someRet.id));
    ok("return detail p95 ≤ 750ms", p5 <= 750, `${p5}`);
    // actual POST latency without contention (real service)
    const postT: number[] = [];
    for (let i = 0; i < 8; i++) {
      const g = await seedGrn(sup, 4, 5);
      const rid = await approvedReturn(g.grnId, g.grnLineId, 2);
      const s = process.hrtime.bigint();
      await transitionPurchaseReturn(ctx2, rid, "post");
      postT.push(Number(process.hrtime.bigint() - s) / 1e6);
    }
    const postP95 = pct(postT, 0.95);
    console.log(
      `  actual return POST                 p50=${pct(postT, 0.5).toFixed(1)}ms p95=${postP95.toFixed(1)}ms`,
    );
    ok("actual return POST p95 ≤ 1500ms", postP95 <= 1500, `${postP95}`);

    const listResp = await listPurchaseReturns({ page: 1, pageSize: 25 });
    const pickResp = await eligibleGrnsForReturn(db as any, { limit: 20 });
    console.log(
      `  response sizes: list=${kb(listResp)} eligible=${kb(pickResp)} detail=${kb(await getPurchaseReturnDetail(someRet.id))}`,
    );
    ok("list response bounded (< 64KB)", Buffer.byteLength(JSON.stringify(listResp)) < 64 * 1024);
    ok(
      "eligible response bounded (< 32KB)",
      Buffer.byteLength(JSON.stringify(pickResp)) < 32 * 1024,
    );
  }

  console.log("\nEXPLAIN — summarized plans");
  {
    const plan = async (label: string, q: any) => {
      const r = (await db.execute(q)) as any;
      const rows = (r.rows ?? r ?? []).map((x: any) => x["QUERY PLAN"]);
      const scan = rows
        .find((l: string) => /Scan/.test(l))
        ?.trim()
        .slice(0, 90);
      const exec = rows.find((l: string) => /Execution Time/.test(l))?.trim();
      console.log(`  ${label}: ${scan} … ${exec}`);
    };
    await plan(
      "list",
      sql`EXPLAIN (ANALYZE, COSTS OFF) SELECT pr.* FROM purchase_returns pr LEFT JOIN goods_receipts gr ON pr.goods_receipt_id=gr.id ORDER BY pr.return_date DESC, pr.return_number DESC LIMIT 25`,
    );
    await plan(
      "return search",
      sql`EXPLAIN (ANALYZE, COSTS OFF) SELECT pr.* FROM purchase_returns pr WHERE pr.return_number ILIKE ${"%PRET-" + RUN + "-0005000%"} LIMIT 25`,
    );
    ok("EXPLAIN plans printed", true);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Phase 5B.1: ${pass} passed, ${fail} failed`);
  await gate.end({ timeout: 5 });
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error("FATAL", e);
  try {
    await gate.end({ timeout: 5 });
  } catch {}
  await closeDb();
  process.exit(1);
});
