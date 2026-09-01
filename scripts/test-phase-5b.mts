/**
 * Phase 5B — governed Purchase Returns of UNINVOICED received quantity, on REAL
 * PostgreSQL. Seeds a certified POSTED GRN state (Dr Inventory / Cr GRNI + GRNI
 * receipt link + inventory) exactly as the GRN POST engine produces, then drives
 * the REAL purchase-return + supplier-invoice services.
 *
 * Invariants proven:
 *  - matched + returned ≤ received (shared receipt-line capacity)
 *  - return: Dr historical GRNI / Cr historical actual receipt debit — no AP/VAT
 *  - stock decremented, never negative
 *  - partial invoice + partial return share one quantity/value truth
 *  - full consumption clears the line's GRNI to EXACTLY 0.00
 *  - return reversal restores stock + capacity + GRNI
 *  - an active posted return blocks GRN reversal
 *  - Invoice POST and Return POST serialize on the same goods_receipt_line lock
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-phase-5b.mts
 */
import { and, eq, sql } from "drizzle-orm";
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
  suppliers,
} from "@/server/db/schema";
import { postBalancedEntry } from "@/server/db/gl";
import { linkEntryGrniLine } from "@/server/db/grni-link";
import {
  createPurchaseReturn,
  transitionPurchaseReturn,
  getPurchaseReturnDetail,
  returnableGrnLines,
} from "@/server/db/purchase-return";
import { getGrnLineMatchingPosition, receiptMatchSummary } from "@/server/db/invoice-matching";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import { transitionGoodsReceipt } from "@/server/db/goods-receipt";
import { createSupplier } from "@/server/db/supplier";

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ctx: any = {
  user: { id: "u-bench", name: "M", role: "role-admin" },
  ip: "127.0.0.1",
  request: new Request("http://localhost/"),
};
const ctx2: any = { ...ctx, user: { id: "u-bench2", name: "A", role: "role-admin" } };
const gate = postgres(url, { max: 2, prepare: false, onnotice: () => {} });

let INV = "",
  GRNI = "",
  AP = "";
let seq = 0;
const RUN = Date.now().toString(36); // run-unique so seeded doc numbers never collide

async function acctNet(accountId: string) {
  const r = (await db.execute(
    sql`SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE jl.account_id=${accountId} AND je.status IN ('posted','reversed')`,
  )) as any;
  const row = (r.rows ?? r ?? [])[0];
  return { debit: Number(row.d), credit: Number(row.c) };
}
async function itemQty(itemId: string) {
  const r = (await db.execute(
    sql`SELECT quantity q FROM inventory_items WHERE id=${itemId}`,
  )) as any;
  return Number((r.rows ?? r ?? [])[0]?.q || 0);
}
/** GRNI subledger net for a receipt (credit − debit over its linked lines). */
async function receiptGrniNet(grnId: string) {
  const r = (await db.execute(
    sql`SELECT COALESCE(SUM(jl.credit),0)-COALESCE(SUM(jl.debit),0) net FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE g.goods_receipt_id=${grnId} AND je.status IN ('posted','reversed')`,
  )) as any;
  return Number((r.rows ?? r ?? [])[0]?.net || 0);
}

/** Seed a certified POSTED GRN with ONE ITEM line (received `qty` @ `unit`). */
async function seedGrn(supplierId: string, qty: number, unit: number) {
  seq++;
  const grnId = genId("GRN");
  const poId = genId("PO");
  const poLineId = genId("POL");
  const grnLineId = genId("GRL");
  const itemId = genId("ITM");
  const lineValue = Math.round(qty * unit * 100) / 100;
  const ts = now();
  await db.transaction(async (tx) => {
    await tx.insert(purchaseOrders).values({
      id: poId,
      poNumber: `PO-5B-${RUN}-${seq}`,
      supplierId,
      governanceMode: "governed",
      subject: "5B",
      date: "2026-03-01",
      status: "issued",
      currency: "SAR",
      createdAt: ts,
      updatedAt: ts,
    } as any);
    await tx.insert(inventoryItems).values({
      id: itemId,
      name: `Item ${seq}`,
      unit: "قطعة",
      quantity: qty, // received stock is on hand
      price: unit,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    } as any);
    await tx.insert(purchaseOrderLines).values({
      id: poLineId,
      orderId: poId,
      lineNumber: 1,
      itemId,
      description: "item",
      quantity: qty,
      unitPrice: unit,
      receivedQuantity: qty,
      lineType: "ITEM",
    } as any);
    const entryId = await postBalancedEntry(
      tx as any,
      {
        date: "2026-03-10",
        description: `GRN seed ${seq}`,
        currency: "SAR",
        source: "goods_receipt",
        sourceType: "goods_receipt",
        sourceId: grnId,
        lines: [
          { accountId: INV, debit: lineValue, description: "recv" },
          { accountId: GRNI, credit: lineValue, description: "grni" },
        ],
        userId: ctx.user.id,
        status: "posted",
      } as any,
    );
    const mvId = genId("MV");
    await tx.insert(goodsReceipts).values({
      id: grnId,
      grnNumber: `GRN-5B-${RUN}-${seq}`,
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
    await tx.insert(goodsReceiptLines).values({
      id: grnLineId,
      goodsReceiptId: grnId,
      poLineId,
      lineNumber: 1,
      lineType: "ITEM",
      description: "item",
      itemId,
      accountId: INV,
      quantityReceived: qty,
      unitPrice: unit,
      lineValue,
      stockMovementId: mvId,
      createdAt: ts,
    } as any);
    await tx.insert(stockMovements).values({
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
  return { grnId, grnLineId, itemId, lineValue };
}

async function mkReturn(grnId: string, grnLineId: string, quantity: number) {
  const r = (await createPurchaseReturn(ctx, {
    goodsReceiptId: grnId,
    lines: [{ goodsReceiptLineId: grnLineId, quantity }],
  })) as any;
  return r.id as string;
}
async function approveReturn(id: string) {
  await transitionPurchaseReturn(ctx, id, "submit");
  await transitionPurchaseReturn(ctx2, id, "approve");
}
async function postReturn(grnId: string, grnLineId: string, quantity: number) {
  const id = await mkReturn(grnId, grnLineId, quantity);
  await approveReturn(id);
  await transitionPurchaseReturn(ctx2, id, "post");
  return id;
}
/** Full create→approve→post of a return; returns the failure code if any (the
 *  capacity guard may fire at create OR at post). */
async function tryPostReturn(grnId: string, grnLineId: string, quantity: number) {
  try {
    const id = await mkReturn(grnId, grnLineId, quantity);
    await approveReturn(id);
    await transitionPurchaseReturn(ctx2, id, "post");
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, code: e?.code };
  }
}
async function tryInvoiceMatch(supplierId: string, grnLineId: string, qty: number, unit: number) {
  try {
    const invId = await approvedMatchedInvoice(supplierId, grnLineId, qty, unit);
    await transitionSupplierInvoice(ctx2, invId, "post");
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, code: e?.code };
  }
}
/** Draft+approve a GRN_MATCHED supplier invoice (net = expected clear), no post. */
async function approvedMatchedInvoice(
  supplierId: string,
  grnLineId: string,
  qty: number,
  unit: number,
) {
  const inv = (await createSupplierInvoice(ctx, {
    supplierId,
    supplierInvoiceNumber: `SIV-5B-${RUN}-${++seq}`,
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

async function main() {
  await db.execute(sql`INSERT INTO users (id,name,email,password) VALUES
    ('u-bench','M','ub@e.com','x'),('u-bench2','A','ub2@e.com','x') ON CONFLICT (id) DO NOTHING`);
  INV = (await db.select().from(accounts).where(eq(accounts.systemKey, "inventory")).limit(1))[0]
    .id as string;
  GRNI = (await db.select().from(accounts).where(eq(accounts.systemKey, "grni")).limit(1))[0]
    .id as string;
  AP = (
    await db.select().from(accounts).where(eq(accounts.systemKey, "accounts_payable")).limit(1)
  )[0].id as string;
  const sup = ((await createSupplier(ctx, { name: "PR Supplier", currency: "SAR" } as any)) as any)
    .id as string;

  // ---- RET-A: basic return of uninvoiced qty: Dr GRNI / Cr Inventory, no AP ----
  console.log("\nRET-A — return uninvoiced qty books Dr GRNI / Cr inventory, no AP/VAT");
  {
    const { grnId, grnLineId, itemId, lineValue } = await seedGrn(sup, 10, 10); // 100
    const grniBefore = await acctNet(GRNI);
    const apBefore = await acctNet(AP);
    const invBefore = await acctNet(INV);
    await postReturn(grnId, grnLineId, 4); // value 40
    const grniAfter = await acctNet(GRNI);
    const invAfter = await acctNet(INV);
    const apAfter = await acctNet(AP);
    ok(
      "GRNI debited 40 (accrual reduced)",
      Math.abs(grniAfter.debit - grniBefore.debit - 40) < 0.005,
      `${grniAfter.debit - grniBefore.debit}`,
    );
    ok(
      "inventory credited 40 (asset reduced)",
      Math.abs(invAfter.credit - invBefore.credit - 40) < 0.005,
      `${invAfter.credit - invBefore.credit}`,
    );
    ok("no AP movement", apAfter.debit === apBefore.debit && apAfter.credit === apBefore.credit);
    ok(
      "stock reduced 10→6",
      Math.abs((await itemQty(itemId)) - 6) < 0.0001,
      `${await itemQty(itemId)}`,
    );
    ok(
      "receipt GRNI net reduced to 60",
      Math.abs((await receiptGrniNet(grnId)) - 60) < 0.005,
      `${await receiptGrniNet(grnId)}`,
    );
    void lineValue;
  }

  // ---- RET-C: over-return rejected (matched + returned ≤ received) ----
  console.log("\nRET-C — over-return of received capacity rejected");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    await postReturn(grnId, grnLineId, 7);
    const r = await tryPostReturn(grnId, grnLineId, 5); // 7+5 > 10
    ok(
      "return 7+5 > 10 rejected OVER_RETURN_RECEIPT",
      !r.ok && r.code === "OVER_RETURN_RECEIPT",
      `${r.code}`,
    );
    const pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok(
      "returnable remaining = 3",
      Math.abs(pos.remainingQuantity - 3) < 0.0001,
      `${pos.remainingQuantity}`,
    );
    ok("returning the remaining 3 succeeds", (await tryPostReturn(grnId, grnLineId, 3)).ok);
  }

  // ---- RET-D: partial invoice + partial return share truth; full → GRNI 0.00 ----
  console.log(
    "\nRET-D — partial invoice + partial return share truth; full consumption clears GRNI to 0.00",
  );
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10); // 100
    const invId = await approvedMatchedInvoice(sup, grnLineId, 6, 10); // match 6 → 60
    await transitionSupplierInvoice(ctx2, invId, "post");
    let pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok(
      "after invoice 6: consumed 6, remaining 4",
      pos.consumedQuantity === 6 && Math.abs(pos.remainingQuantity - 4) < 1e-6,
      `${pos.consumedQuantity}/${pos.remainingQuantity}`,
    );
    await postReturn(grnId, grnLineId, 4); // return remaining 4 → 40
    pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok(
      "after return 4: fully consumed, remaining qty 0",
      Math.abs(pos.remainingQuantity) < 1e-6,
      `${pos.remainingQuantity}`,
    );
    ok(
      "line GRNI cleared to EXACTLY 0.00",
      Math.abs(pos.remainingGrniValue) < 0.005,
      `${pos.remainingGrniValue}`,
    );
    ok(
      "receipt GRNI net = 0.00",
      Math.abs(await receiptGrniNet(grnId)) < 0.005,
      `${await receiptGrniNet(grnId)}`,
    );
    const sum = await receiptMatchSummary(db as any, grnId);
    ok(
      "summary invoiced 60 + returned 40 = received 100",
      Math.abs(sum.invoicedValue - 60) < 0.005 && Math.abs((sum as any).returnedValue - 40) < 0.005,
      `${sum.invoicedValue}/${(sum as any).returnedValue}`,
    );
  }

  // ---- RET-I: a return consumes capacity so a later invoice can't over-invoice ----
  console.log("\nRET-I — returned qty consumes capacity: a later invoice match is bounded");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    await postReturn(grnId, grnLineId, 7); // consume 7 by return
    const bad = await tryInvoiceMatch(sup, grnLineId, 5, 10); // 7+5 > 10
    ok(
      "invoice 5 after return 7 rejected OVER_INVOICED_RECEIPT",
      !bad.ok && bad.code === "OVER_INVOICED_RECEIPT",
      `${bad.code}`,
    );
    ok("invoice of the remaining 3 posts", (await tryInvoiceMatch(sup, grnLineId, 3, 10)).ok);
  }

  // ---- RET-F: stock cannot go negative ----
  console.log("\nRET-F — return cannot drive stock negative");
  {
    const { grnId, grnLineId, itemId } = await seedGrn(sup, 5, 10);
    // Consume 4 of the 5 physical units elsewhere (simulate an issue) so only 1 on hand.
    await db.execute(sql`UPDATE inventory_items SET quantity = 1 WHERE id=${itemId}`);
    const rid = await mkReturn(grnId, grnLineId, 3); // capacity ok (uninvoiced 5) but stock only 1
    await approveReturn(rid);
    await rejects(
      "return 3 with 1 on hand → RETURN_STOCK_INSUFFICIENT",
      "RETURN_STOCK_INSUFFICIENT",
      () => transitionPurchaseReturn(ctx2, rid, "post"),
    );
    ok(
      "stock unchanged (still 1)",
      Math.abs((await itemQty(itemId)) - 1) < 1e-6,
      `${await itemQty(itemId)}`,
    );
  }

  // ---- RET-G: return reversal restores stock + capacity + GRNI ----
  console.log("\nRET-G — return reversal restores stock + capacity + GRNI");
  {
    const { grnId, grnLineId, itemId } = await seedGrn(sup, 10, 10);
    const rid = await postReturn(grnId, grnLineId, 4);
    ok("stock 10→6 after return", Math.abs((await itemQty(itemId)) - 6) < 1e-6);
    await transitionPurchaseReturn(ctx2, rid, "reverse", "test");
    ok(
      "stock restored to 10",
      Math.abs((await itemQty(itemId)) - 10) < 1e-6,
      `${await itemQty(itemId)}`,
    );
    const pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok(
      "returnable capacity restored to 10",
      Math.abs(pos.remainingQuantity - 10) < 1e-6,
      `${pos.remainingQuantity}`,
    );
    ok(
      "receipt GRNI net back to 100",
      Math.abs((await receiptGrniNet(grnId)) - 100) < 0.005,
      `${await receiptGrniNet(grnId)}`,
    );
  }

  // ---- RET-H: an active posted return blocks GRN reversal ----
  console.log("\nRET-H — active posted return blocks GRN reversal; after reverse, GRN reversible");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const rid = await postReturn(grnId, grnLineId, 4);
    await rejects("GRN reverse blocked by posted return", "GRN_HAS_POSTED_PURCHASE_RETURN", () =>
      transitionGoodsReceipt(ctx2, grnId, "reverse", "x"),
    );
    await transitionPurchaseReturn(ctx2, rid, "reverse", "undo");
    let grnReversed = false;
    try {
      await transitionGoodsReceipt(ctx2, grnId, "reverse", "x");
      grnReversed = true;
    } catch {
      grnReversed = false;
    }
    ok("after return reversed, GRN reverses cleanly", grnReversed);
  }

  // ---- REV-RACE: two concurrent return POSTs on the same line → one succeeds ----
  console.log("\nRET-RACE-A — two concurrent returns (7 + 5) on a 10 line → one succeeds");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const r1 = await mkReturn(grnId, grnLineId, 7);
    const r2 = await mkReturn(grnId, grnLineId, 5);
    await approveReturn(r1);
    await approveReturn(r2);
    const res = await Promise.allSettled([
      transitionPurchaseReturn(ctx2, r1, "post"),
      transitionPurchaseReturn(ctx2, r2, "post"),
    ]);
    const okc = res.filter((r) => r.status === "fulfilled").length;
    const pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok("exactly one return posted", okc === 1, `${okc}`);
    ok(
      "returned never exceeds received (≤10)",
      pos.activeReturnedQuantity <= 10 + 1e-6,
      `${pos.activeReturnedQuantity}`,
    );
  }

  // ---- INV-RET-RACE: invoice POST and return POST serialize on the receipt line ----
  console.log("\nINV-RET-RACE — invoice(6) + return(6) on a 10 line serialize → total ≤ 10");
  {
    const { grnId, grnLineId } = await seedGrn(sup, 10, 10);
    const invId = await approvedMatchedInvoice(sup, grnLineId, 6, 10);
    const rid = await mkReturn(grnId, grnLineId, 6);
    await approveReturn(rid);
    // Force both to contend on the SAME goods_receipt_line row lock via a gate.
    let release!: () => void;
    const releaser = new Promise<void>((r) => (release = r));
    let acquired!: () => void;
    const acqP = new Promise<void>((r) => (acquired = r));
    const held = gate.begin(async (g) => {
      await g`SELECT id FROM goods_receipt_lines WHERE id=${grnLineId} FOR UPDATE`;
      acquired();
      await releaser;
    });
    await acqP;
    const pInv = transitionSupplierInvoice(ctx2, invId, "post").then(
      () => ({ ok: true }),
      (e) => ({ ok: false, code: e?.code }),
    );
    await sleep(200);
    const pRet = transitionPurchaseReturn(ctx2, rid, "post").then(
      () => ({ ok: true }),
      (e) => ({ ok: false, code: e?.code }),
    );
    await sleep(200);
    release();
    await held;
    const [ri, rr] = await Promise.all([pInv, pRet]);
    const okc = [ri, rr].filter((r) => (r as any).ok).length;
    const pos = await getGrnLineMatchingPosition(db as any, grnLineId);
    ok(
      "exactly one of invoice/return posted (6+6 > 10)",
      okc === 1,
      `inv=${JSON.stringify(ri)} ret=${JSON.stringify(rr)}`,
    );
    ok(
      "consumed never exceeds received (≤10)",
      pos.consumedQuantity <= 10 + 1e-6,
      `${pos.consumedQuantity}`,
    );
  }

  // ---- SCALE: many lines/returns keep the position bounded + exact ----
  console.log("\nSCALE-RET — 200 returns keep position exact + fast");
  {
    const t0 = Date.now();
    let clean = true;
    for (let i = 0; i < 200; i++) {
      const { grnId, grnLineId } = await seedGrn(sup, 4, 5); // 20
      await postReturn(grnId, grnLineId, 4); // full return → GRNI 0
      if (Math.abs(await receiptGrniNet(grnId)) > 0.005) clean = false;
    }
    const ms = Date.now() - t0;
    ok("200 full returns each clear GRNI to 0.00", clean);
    ok("bulk return throughput reasonable", ms < 60000, `${ms}ms`);
    void returnableGrnLines;
    void getPurchaseReturnDetail;
  }

  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Phase 5B purchase returns: ${pass} passed, ${fail} failed`,
  );
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
