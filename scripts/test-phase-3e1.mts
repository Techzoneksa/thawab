/**
 * Phase 3E.1 — GRNI partial-match value & rounding integrity.
 *
 * Uses the shared matching harness (REAL validateInvoice / GRNI links / GL engine)
 * plus the REAL Phase 3E.1 building blocks:
 *   getGrnLineMatchingPosition / expectedGrniClearValue / activeClearedGrniValue
 *   grniReconciliation / receiptMatchSummary
 * to prove partial matches telescope to EXACTLY the original posted GRNI value with
 * no orphan halala and no over-clearing, that a 1-halala deviation is rejected as
 * an unsupported price variance, and that reversal restores the exact cleared value.
 *
 * Suites: ROUND-A..H, VALUE-RACE-A..B, GRNI-ROUND-A. Run:
 *   node_modules/.bin/tsx scripts/test-phase-3e1.mts
 */
import {
  freshDb,
  mkSupplier,
  mkItem,
  postGrn,
  draftInvoice,
  postInvoice,
  reverseInvoice,
  acctBal,
  receiptGrniNet,
  near,
} from "./_matching-harness.mjs";
import {
  getGrnLineMatchingPosition,
  expectedGrniClearValue,
  activeClearedGrniValue,
  receiptMatchSummary,
} from "@/server/db/invoice-matching";
import { grniReconciliation } from "@/server/db/grni-link";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
async function throwsCode(fn: () => Promise<any>, code: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return e?.code === code || String(e?.message).includes(code);
  }
}

/** Draft a matched invoice with an EXPLICIT net (unit = net/qty), for variance tests. */
function tryMatch(db: any, supplierId: string, grnLineId: string, qty: number, net: number) {
  return draftInvoice(db, {
    supplierId,
    lines: [
      {
        accountingMode: "grn_matched",
        goodsReceiptLineId: grnLineId,
        quantity: qty,
        unitPrice: net / qty,
      },
    ],
  });
}
/** Compute the cumulative expected clear for the next match, from the REAL position. */
async function expectedNext(db: any, grnLineId: string, qty: number): Promise<number> {
  const pos = await getGrnLineMatchingPosition(db, grnLineId);
  return expectedGrniClearValue({
    vTotal: pos.originalPostedGrniValue,
    qTotal: pos.receivedQuantity,
    prevQty: pos.activeMatchedQuantity,
    prevValue: pos.activeClearedGrniValue,
    newQty: qty,
  });
}
/** Match `qty` units using the exact cumulative expected net, and POST. */
async function matchAndPost(db: any, supplierId: string, grnLineId: string, qty: number) {
  const expected = await expectedNext(db, grnLineId, qty);
  const inv = await tryMatch(db, supplierId, grnLineId, qty, expected);
  await postInvoice(db, inv);
  return { inv, expected };
}
/** A GRN line whose posted line_value is exactly 100.00 over 3 units (33.3333…/unit). */
async function grn3over100(db: any, client: any, supplierId: string, poId: string) {
  const { grnId, grnLineByPoLine } = await postGrn(db, client, supplierId, poId, [
    { id: "l1", type: "ITEM", itemId: "item1", qty: 3, price: 33.3333 },
  ]);
  return { grnId, grnLineId: grnLineByPoLine.get("l1")! };
}

async function main() {
  // ===================== ROUND-A..C — cumulative telescoping to exact V_total =====================
  console.log("\nROUND-A..C — partial matches clear EXACTLY the posted GRNI (no orphan halala)");
  for (const [name, seq] of [
    ["ROUND-A", [1, 1, 1]],
    ["ROUND-B", [2, 1]],
    ["ROUND-C", [1, 2]],
  ] as [string, number[]][]) {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    ok(
      `${name}: GRN posted GRNI line value = 100.00`,
      near((await getGrnLineMatchingPosition(db, grnLineId)).originalPostedGrniValue, 100),
    );
    const cleared: number[] = [];
    for (const q of seq) cleared.push((await matchAndPost(db, "sup1", grnLineId, q)).expected);
    const pos = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      `${name}: cumulative cleared sums to EXACTLY 100.00 (${cleared.join(" + ")})`,
      near(
        cleared.reduce((a, b) => a + b, 0),
        100,
      ),
    );
    ok(
      `${name}: remaining quantity = 0 AND remaining GRNI value = 0.00`,
      near(pos.remainingQuantity, 0) && near(pos.remainingGrniValue, 0),
    );
    ok(
      `${name}: receipt GRNI subledger nets to 0 · GRNI GL = 0`,
      near(await receiptGrniNet(client, grnId), 0) &&
        near((await acctBal(client, "a-grni")).net, 0),
    );
    ok(`${name}: matching status = FULL`, pos.status === "FULL");
  }

  // ===================== ROUND-D..E — exact-match / variance at final =====================
  console.log("\nROUND-D..E — final match must equal the exact remaining GRNI value");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    await matchAndPost(db, "sup1", grnLineId, 2); // clears cumulative 66.67
    const pos = await getGrnLineMatchingPosition(db, grnLineId);
    const required = pos.remainingGrniValue; // exact final clear (33.33)
    ok(
      "ROUND-D/E: after 2 units, remaining qty 1 and remaining GRNI = required final",
      near(pos.remainingQuantity, 1) && required > 0,
    );
    ok(
      `ROUND-D: final invoice NET ≠ required (${required} − 0.01) → PURCHASE_PRICE_VARIANCE_UNSUPPORTED (no journal)`,
      await throwsCode(
        () => tryMatch(db, "sup1", grnLineId, 1, require0(required - 0.01)),
        "PURCHASE_PRICE_VARIANCE_UNSUPPORTED",
      ),
    );
    // ROUND-E: exact required → success, remaining GRNI 0.
    const inv = await tryMatch(db, "sup1", grnLineId, 1, required);
    await postInvoice(db, inv);
    const pos2 = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      "ROUND-E: exact final NET posts → remaining GRNI = 0.00 · status FULL",
      near(pos2.remainingGrniValue, 0) && pos2.status === "FULL",
    );
  }

  // ===================== ROUND-F — integrity mismatch surfaced =====================
  console.log("\nROUND-F — qty 0 but non-zero GRNI must NOT report FULL");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    // Simulate the OLD broken state directly: qty fully consumed but 0.01 residual.
    // (This state can never arise from the cumulative algorithm; we force it to prove
    // the status guard refuses to show FULL.)
    await matchAndPost(db, "sup1", grnLineId, 3); // proper full match → 0 residual
    // Tamper: reduce one posted GRNI debit by 0.01 so cleared = 99.99 (orphan halala).
    const line = (
      await client.query(
        `SELECT jl.id FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE g.goods_receipt_line_id=$1 AND g.link_type='invoice' AND jl.debit>0 LIMIT 1`,
        [grnLineId],
      )
    ).rows[0];
    await client.query(`UPDATE journal_lines SET debit=debit-0.01 WHERE id=$1`, [line.id]);
    const pos = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      "ROUND-F: qty remaining 0 but GRNI residual 0.01 → status INTEGRITY_MISMATCH (not FULL)",
      near(pos.remainingQuantity, 0) &&
        near(pos.remainingGrniValue, 0.01) &&
        pos.status === "INTEGRITY_MISMATCH",
    );
    const sum = await receiptMatchSummary(
      db,
      (await getGrnLineMatchingPosition(db, grnLineId)).goodsReceiptId,
    );
    ok(
      "ROUND-F: receiptMatchSummary flags integrityMismatch and NOT fullyInvoiced",
      sum.integrityMismatch === true && sum.fullyInvoiced === false,
    );
  }

  // ===================== ROUND-G..H — reversal precision + re-match =====================
  console.log(
    "\nROUND-G..H — reversal restores the EXACT cleared value; re-match reaches exact full",
  );
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    await matchAndPost(db, "sup1", grnLineId, 1); // 33.33
    await matchAndPost(db, "sup1", grnLineId, 1); // 33.34
    const third = await matchAndPost(db, "sup1", grnLineId, 1); // 33.33 (final)
    ok(
      "ROUND-G: (setup) fully matched → remaining GRNI 0",
      near((await getGrnLineMatchingPosition(db, grnLineId)).remainingGrniValue, 0),
    );
    await reverseInvoice(db, third.inv);
    const pos = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      `ROUND-G: reversing the final invoice restores EXACTLY its cleared value (remaining GRNI = ${third.expected})`,
      near(pos.remainingGrniValue, third.expected) && near(pos.remainingQuantity, 1),
    );
    // ROUND-H: re-match the released unit → back to exact full, repeatedly.
    const re = await matchAndPost(db, "sup1", grnLineId, 1);
    ok(
      "ROUND-H: replacement final match requires the exact released value and reaches full",
      near(re.expected, third.expected),
    );
    const posF = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      "ROUND-H: after re-match remaining qty 0 AND remaining GRNI 0.00 · GRNI GL 0",
      near(posF.remainingQuantity, 0) &&
        near(posF.remainingGrniValue, 0) &&
        near((await acctBal(client, "a-grni")).net, 0),
    );
  }

  // ===================== VALUE-RACE-A..B — quantity + monetary capacity under serialization =====================
  console.log("\nVALUE-RACE-A..B — concurrent final matches never over-clear qty or value");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    await matchAndPost(db, "sup1", grnLineId, 2); // remaining qty 1, remaining 33.33
    const req = (await getGrnLineMatchingPosition(db, grnLineId)).remainingGrniValue;
    // Two concurrent final drafts (both see remaining 1 at draft time).
    const a = await tryMatch(db, "sup1", grnLineId, 1, req);
    const b = await tryMatch(db, "sup1", grnLineId, 1, req);
    await postInvoice(db, a);
    ok(
      "VALUE-RACE-A: first final posts; second rejected at POST (OVER_INVOICED_RECEIPT) — never over-clears",
      await throwsCode(() => postInvoice(db, b), "OVER_INVOICED_RECEIPT"),
    );
    const pos = await getGrnLineMatchingPosition(db, grnLineId);
    ok(
      "VALUE-RACE-A: final remaining qty 0 AND GRNI 0.00 (never −0.01)",
      near(pos.remainingQuantity, 0) && near(pos.remainingGrniValue, 0),
    );

    // B: concurrent 2 + 1 both valid after serialization → total exactly 100.00.
    const { db: db2, client: c2 } = await freshDb();
    await mkSupplier(c2, "sup1");
    await mkItem(c2, "item1", 0);
    const { grnId: g2, grnLineId: gl2 } = await grn3over100(db2, c2, "sup1", "PO1");
    const e2 = await expectedNext(db2, gl2, 2);
    const inv2 = await tryMatch(db2, "sup1", gl2, 2, e2);
    const e1 = await expectedNext(db2, gl2, 1);
    const inv1 = await tryMatch(db2, "sup1", gl2, 1, e1);
    await postInvoice(db2, inv2);
    await postInvoice(db2, inv1);
    const posB = await getGrnLineMatchingPosition(db2, gl2);
    ok(
      "VALUE-RACE-B: 2 + 1 both post after serialization → matched 3, GRNI cleared 100.00, remaining 0.00",
      near(posB.remainingQuantity, 0) &&
        near(posB.remainingGrniValue, 0) &&
        near(await receiptGrniNet(c2, g2), 0),
    );
  }

  // ===================== GRNI-ROUND-A — reconciliation exact under fractional allocation =====================
  console.log("\nGRNI-ROUND-A — full fractional match keeps GRNI reconciliation exact");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineId } = await grn3over100(db, client, "sup1", "PO1");
    await matchAndPost(db, "sup1", grnLineId, 1);
    await matchAndPost(db, "sup1", grnLineId, 1);
    await matchAndPost(db, "sup1", grnLineId, 1);
    ok(
      "GRNI-ROUND-A: receipt-attributable GRNI subledger = 0.00",
      near(await receiptGrniNet(client, grnId), 0),
    );
    ok(
      "GRNI-ROUND-A: GRNI GL for the account = 0.00",
      near((await acctBal(client, "a-grni")).net, 0),
    );
    ok(
      "GRNI-ROUND-A: active cleared value for the line = 100.00 (exact)",
      near(await activeClearedGrniValue(db, grnLineId), 100),
    );
    const rec = await grniReconciliation(db);
    ok(
      "GRNI-ROUND-A: reconciliation difference = 0.00",
      near(rec.difference, 0) && near(rec.grniGl, 0),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
/** Round to 2dp (avoids float noise when deliberately offsetting by 0.01). */
function require0(n: number): number {
  return Math.round(n * 100) / 100;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
