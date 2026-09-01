/**
 * Phase 3E — Supplier Invoice ↔ Goods Receipt matching helpers, server-authoritative.
 *
 * The matchable quantity of a governed GRN line is DERIVED (never a stored
 * competing column):
 *
 *   invoiceable(grnLine) = posted GRN received qty
 *                        − Σ matched_quantity over ACTIVE (POSTED) supplier invoices
 *
 * A reversed invoice releases its allocation automatically (its rows stay for
 * audit but no longer count, because it is no longer POSTED). Only POSTED governed
 * GRNs are matchable; the receipt value cleared per line is the receipt's own
 * immutable posted line value (goods_receipt_lines.line_value / unit_price), never
 * recomputed from today's PO price.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  supplierInvoiceGrnAllocations,
  supplierInvoices,
  goodsReceipts,
  goodsReceiptLines,
  grniJournalLinks,
  journalLines,
  journalEntries,
  purchaseOrders,
  purchaseReturns,
  purchaseReturnLines,
} from "./schema";
import { GoodsReceiptStatus, SupplierInvoiceStatus, PurchaseReturnStatus } from "@/lib/enums";
import { LOCK_NS } from "./lock-namespaces";

type Db = { select: (...a: any[]) => any };

/**
 * Phase 5B.1 — the shared receipt-CAPACITY gate. Every operation that validates,
 * consumes, releases or reverses a governed receipt's line capacity — Supplier
 * Invoice matched POST, Purchase Return POST, Purchase Return REVERSE and GRN
 * REVERSE — MUST call this FIRST in its transaction, before any FOR UPDATE row
 * lock. It takes one advisory xact lock per DISTINCT goods_receipt_id, in sorted
 * order, so two operations touching the same receipt fully serialize (no race
 * window between a downstream-state check and its commit) while independent
 * receipts stay concurrent. Advisory-first + deterministic order avoids the FK
 * KEY-SHARE / row-lock deadlock class (the Phase 5A.1 lesson).
 */
export async function lockReceiptCapacity(
  tx: { execute: (q: any) => Promise<any> },
  goodsReceiptIds: Array<string | null | undefined>,
): Promise<void> {
  const ids = [...new Set(goodsReceiptIds.filter((x): x is string => !!x))].sort();
  for (const id of ids)
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${LOCK_NS.RECEIPT_CAPACITY}, hashtext(${id}))`,
    );
}

const QTY_TOLERANCE = 0.0001;
const MONEY_TOLERANCE = 0.005; // project halala precision (2 dp)
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Supplier-invoice statuses whose allocations actively consume GRN quantity. */
const ACTIVE_INVOICE_STATES = [SupplierInvoiceStatus.POSTED];
/** Purchase-return statuses whose lines actively consume GRN quantity. */
const ACTIVE_RETURN_STATES = [PurchaseReturnStatus.POSTED];

/**
 * Phase 5B — Σ returned quantity per GRN line over ACTIVE (POSTED) purchase
 * returns. A returned quantity consumes the SAME receipt-line capacity as an
 * invoice match, so invoiceable/returnable = received − matched − returned.
 * `excludeReturnId` ignores a given return's own lines (under-lock revalidation).
 */
export async function returnedQtyByGrnLine(
  dbh: Db,
  grnLineIds: string[],
  opts: { excludeReturnId?: string } = {},
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!grnLineIds.length) return map;
  const conds = [
    inArray(purchaseReturnLines.goodsReceiptLineId, grnLineIds),
    inArray(purchaseReturns.status, ACTIVE_RETURN_STATES),
  ];
  if (opts.excludeReturnId)
    conds.push(sql`${purchaseReturnLines.purchaseReturnId} <> ${opts.excludeReturnId}`);
  const rows = (await (dbh as any)
    .select({
      grnLineId: purchaseReturnLines.goodsReceiptLineId,
      qty: purchaseReturnLines.quantityReturned,
    })
    .from(purchaseReturnLines)
    .innerJoin(purchaseReturns, eq(purchaseReturnLines.purchaseReturnId, purchaseReturns.id))
    .where(and(...conds))) as any[];
  for (const r of rows) map.set(r.grnLineId, (map.get(r.grnLineId) || 0) + Number(r.qty || 0));
  return map;
}

/**
 * Phase 5B — GRNI value ALREADY CLEARED for a GRN line by ACTIVE (POSTED) purchase
 * returns — GL-derived (sum of the debit amounts of the return-clearing GRNI
 * journal lines, link_type='return', on a POSTED purchase_return entry). Mirrors
 * activeClearedGrniValue for the return side.
 */
export async function activeReturnedGrniValue(
  dbh: Db,
  goodsReceiptLineId: string,
  opts: { excludeReturnId?: string } = {},
): Promise<number> {
  const conds = [
    eq(grniJournalLinks.goodsReceiptLineId, goodsReceiptLineId),
    eq(grniJournalLinks.linkType, "return"),
    eq(journalEntries.sourceType, "purchase_return"),
    eq(journalEntries.status, SupplierInvoiceStatus.POSTED),
  ];
  if (opts.excludeReturnId) conds.push(sql`${journalEntries.sourceId} <> ${opts.excludeReturnId}`);
  const r = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.debit}),0)` })
      .from(grniJournalLinks)
      .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(...conds))
  )[0] as any;
  return r2(Number(r?.v || 0));
}

/**
 * Σ matched quantity per GRN line over ACTIVE (POSTED) supplier invoices. Pass
 * `excludeInvoiceId` to ignore a given invoice's own allocations (used when
 * revalidating that invoice under lock). Returns Map(goodsReceiptLineId → qty).
 */
export async function matchedQtyByGrnLine(
  dbh: Db,
  grnLineIds: string[],
  opts: { excludeInvoiceId?: string } = {},
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!grnLineIds.length) return map;
  const conds = [
    inArray(supplierInvoiceGrnAllocations.goodsReceiptLineId, grnLineIds),
    inArray(supplierInvoices.status, ACTIVE_INVOICE_STATES),
  ];
  if (opts.excludeInvoiceId)
    conds.push(sql`${supplierInvoiceGrnAllocations.supplierInvoiceId} <> ${opts.excludeInvoiceId}`);
  const rows = (await (dbh as any)
    .select({
      grnLineId: supplierInvoiceGrnAllocations.goodsReceiptLineId,
      qty: supplierInvoiceGrnAllocations.matchedQuantity,
    })
    .from(supplierInvoiceGrnAllocations)
    .innerJoin(
      supplierInvoices,
      eq(supplierInvoiceGrnAllocations.supplierInvoiceId, supplierInvoices.id),
    )
    .where(and(...conds))) as any[];
  for (const r of rows) map.set(r.grnLineId, (map.get(r.grnLineId) || 0) + Number(r.qty || 0));
  return map;
}

/**
 * The GRNI monetary value ALREADY CLEARED for a GRN line by ACTIVE (POSTED)
 * Supplier Invoices — derived from REAL GL lines, never a stored balance: the sum
 * of the debit amounts of the invoice-clearing GRNI journal lines
 * (grni_journal_links.link_type='invoice') whose journal entry is a POSTED supplier
 * invoice. A reversed invoice's original clearing entry becomes status='reversed'
 * and therefore drops out automatically. `excludeInvoiceId` ignores a given
 * invoice's own clearing (safety mirror for under-lock revalidation).
 */
export async function activeClearedGrniValue(
  dbh: Db,
  goodsReceiptLineId: string,
  opts: { excludeInvoiceId?: string } = {},
): Promise<number> {
  const conds = [
    eq(grniJournalLinks.goodsReceiptLineId, goodsReceiptLineId),
    eq(grniJournalLinks.linkType, "invoice"),
    eq(journalEntries.sourceType, "supplier_invoice"),
    eq(journalEntries.status, SupplierInvoiceStatus.POSTED),
  ];
  if (opts.excludeInvoiceId)
    conds.push(sql`${journalEntries.sourceId} <> ${opts.excludeInvoiceId}`);
  const r = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.debit}),0)` })
      .from(grniJournalLinks)
      .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(...conds))
  )[0] as any;
  return r2(Number(r?.v || 0));
}

export interface GrnLineMatchingPosition {
  goodsReceiptId: string;
  goodsReceiptLineId: string;
  receivedQuantity: number;
  /** The exact immutable GRNI value posted for this line (goods_receipt_lines.line_value). */
  originalPostedGrniValue: number;
  activeMatchedQuantity: number;
  /** GRNI value already cleared by active POSTED invoices — GL-derived. */
  activeClearedGrniValue: number;
  /** Phase 5B — quantity already returned by active POSTED purchase returns. */
  activeReturnedQuantity: number;
  /** Phase 5B — GRNI value already cleared by active POSTED returns — GL-derived. */
  activeReturnedGrniValue: number;
  /**
   * Quantity/value CONSUMED = matched (invoices) + returned (returns). Both drain
   * the same received capacity and clear the same GRNI, so consumers telescope
   * against one shared truth.
   */
  consumedQuantity: number;
  consumedGrniValue: number;
  remainingQuantity: number;
  remainingGrniValue: number;
  status: "UNMATCHED" | "PARTIAL" | "FULL" | "INTEGRITY_MISMATCH";
}

/**
 * Authoritative quantity + monetary position of a governed GRN line for matching.
 * originalPostedGrniValue is the line's immutable posted accounting value
 * (goods_receipt_lines.line_value — the exact amount that fed the receipt's GRNI
 * credit); activeClearedGrniValue is GL-derived from the invoice-clearing links.
 * FULL requires BOTH remaining quantity AND remaining GRNI value ≈ 0; a zero
 * remaining quantity with a non-zero remaining value surfaces as INTEGRITY_MISMATCH
 * (must never happen under the Phase 3E.1 cumulative allocation).
 */
export async function getGrnLineMatchingPosition(
  dbh: Db,
  goodsReceiptLineId: string,
  opts: { excludeInvoiceId?: string; excludeReturnId?: string } = {},
): Promise<GrnLineMatchingPosition> {
  const gl = (
    await (dbh as any)
      .select({
        id: goodsReceiptLines.id,
        goodsReceiptId: goodsReceiptLines.goodsReceiptId,
        received: goodsReceiptLines.quantityReceived,
        lineValue: goodsReceiptLines.lineValue,
      })
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.id, goodsReceiptLineId))
      .limit(1)
  )[0] as any;
  if (!gl) throw new Error("GRN line not found");

  const qMatched = (await matchedQtyByGrnLine(dbh, [goodsReceiptLineId], opts)).get(
    goodsReceiptLineId,
  ) as number | undefined;
  const activeMatchedQuantity = Number(qMatched || 0);
  const cleared = await activeClearedGrniValue(dbh, goodsReceiptLineId, opts);
  // Phase 5B — returns consume the SAME capacity and clear the SAME GRNI.
  const qReturned = (await returnedQtyByGrnLine(dbh, [goodsReceiptLineId], opts)).get(
    goodsReceiptLineId,
  ) as number | undefined;
  const activeReturnedQuantity = Number(qReturned || 0);
  const returnedValue = await activeReturnedGrniValue(dbh, goodsReceiptLineId, opts);

  const receivedQuantity = Number(gl.received || 0);
  const originalPostedGrniValue = r2(Number(gl.lineValue || 0));
  const consumedQuantity = r2(activeMatchedQuantity + activeReturnedQuantity);
  const consumedGrniValue = r2(cleared + returnedValue);
  const remainingQuantity = r2(receivedQuantity - consumedQuantity);
  const remainingGrniValue = r2(originalPostedGrniValue - consumedGrniValue);

  let status: GrnLineMatchingPosition["status"];
  if (consumedQuantity <= QTY_TOLERANCE && Math.abs(consumedGrniValue) <= MONEY_TOLERANCE)
    status = "UNMATCHED";
  else if (remainingQuantity <= QTY_TOLERANCE)
    status = Math.abs(remainingGrniValue) <= MONEY_TOLERANCE ? "FULL" : "INTEGRITY_MISMATCH";
  else status = "PARTIAL";

  return {
    goodsReceiptId: gl.goodsReceiptId,
    goodsReceiptLineId,
    receivedQuantity,
    originalPostedGrniValue,
    activeMatchedQuantity,
    activeClearedGrniValue: cleared,
    activeReturnedQuantity,
    activeReturnedGrniValue: returnedValue,
    consumedQuantity,
    consumedGrniValue,
    remainingQuantity,
    remainingGrniValue,
    status,
  };
}

/**
 * Deterministic cumulative GRNI clearing amount for a new match, so partial matches
 * telescope to EXACTLY the original posted value with no orphan halala and no
 * over-clearing:
 *   Q_after = prevQty + newQty
 *   final (Q_after == Q_total):  V_total − prevValue        (absorbs the residual)
 *   non-final:                   round(V_total × Q_after / Q_total) − prevValue
 */
export function expectedGrniClearValue(input: {
  vTotal: number;
  qTotal: number;
  prevQty: number;
  prevValue: number;
  newQty: number;
}): number {
  const qAfter = input.prevQty + input.newQty;
  if (qAfter >= input.qTotal - QTY_TOLERANCE) return r2(input.vTotal - input.prevValue);
  const target = r2((input.vTotal * qAfter) / input.qTotal);
  return r2(target - input.prevValue);
}

/** Phase 5B — True if the GRN has any ACTIVE (POSTED) purchase return. */
export async function grnHasActivePostedReturn(dbh: Db, goodsReceiptId: string): Promise<boolean> {
  const rows = (await (dbh as any)
    .select({ id: purchaseReturns.id })
    .from(purchaseReturns)
    .where(
      and(
        eq(purchaseReturns.goodsReceiptId, goodsReceiptId),
        inArray(purchaseReturns.status, ACTIVE_RETURN_STATES),
      ),
    )
    .limit(1)) as any[];
  return rows.length > 0;
}

/** True if the GRN has any allocation belonging to an ACTIVE (POSTED) invoice. */
export async function grnHasActivePostedInvoice(dbh: Db, goodsReceiptId: string): Promise<boolean> {
  const rows = (await (dbh as any)
    .select({ id: supplierInvoiceGrnAllocations.id })
    .from(supplierInvoiceGrnAllocations)
    .innerJoin(
      supplierInvoices,
      eq(supplierInvoiceGrnAllocations.supplierInvoiceId, supplierInvoices.id),
    )
    .where(
      and(
        eq(supplierInvoiceGrnAllocations.goodsReceiptId, goodsReceiptId),
        inArray(supplierInvoices.status, ACTIVE_INVOICE_STATES),
      ),
    )
    .limit(1)) as any[];
  return rows.length > 0;
}

export interface MatchableGrnLine {
  goodsReceiptId: string;
  grnNumber: string;
  goodsReceiptLineId: string;
  purchaseOrderId: string;
  poNumber: string | null;
  poLineId: string;
  receiptDate: string;
  lineType: string;
  description: string;
  itemId: string | null;
  unitPrice: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  remainingQuantity: number;
  remainingGrniValue: number;
}

/**
 * POSTED governed GRN lines for a supplier that still have invoiceable quantity
 * (> 0), for the matching UI. Never exposes other suppliers' receipts.
 */
export async function matchableGrnLinesForSupplier(
  dbh: Db,
  supplierId: string,
  opts: { limit?: number; q?: string } = {},
): Promise<MatchableGrnLine[]> {
  // Phase 4A.2 — bounded AND reachable matchable-GRN lookup. The response is
  // always small (≤ limit, default 20), but ANY still-invoiceable line is
  // discoverable by SERVER SEARCH across GRN number / PO number / receipt date /
  // line description — no silent "newest 1000" cap. The certified accounting
  // filters (same supplier · POSTED · remaining invoiceable qty > 0) are
  // enforced here and NEVER weakened by search; POST remains authoritative.
  const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  const q = (opts.q || "").trim();
  // With a search term the candidate set is already narrow, so we scan a generous
  // window; with no term we scan the most-recent window for the convenience
  // default. Either way only `limit` rows are RETURNED (early exit below), which
  // also bounds the per-line GRNI-clearing lookups.
  const fetchWindow = q ? 400 : 120;
  const conds: any[] = [
    eq(goodsReceipts.supplierId, supplierId),
    eq(goodsReceipts.status, GoodsReceiptStatus.POSTED),
  ];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(${goodsReceipts.grnNumber} ILIKE ${like} OR ${purchaseOrders.poNumber} ILIKE ${like} OR ${goodsReceipts.receiptDate} ILIKE ${like} OR ${goodsReceiptLines.description} ILIKE ${like})`,
    );
  }
  const rows = (await (dbh as any)
    .select({
      goodsReceiptId: goodsReceipts.id,
      grnNumber: goodsReceipts.grnNumber,
      receiptDate: goodsReceipts.receiptDate,
      purchaseOrderId: goodsReceipts.purchaseOrderId,
      poNumber: purchaseOrders.poNumber,
      grnLineId: goodsReceiptLines.id,
      poLineId: goodsReceiptLines.poLineId,
      lineType: goodsReceiptLines.lineType,
      description: goodsReceiptLines.description,
      itemId: goodsReceiptLines.itemId,
      unitPrice: goodsReceiptLines.unitPrice,
      lineValue: goodsReceiptLines.lineValue,
      qty: goodsReceiptLines.quantityReceived,
    })
    .from(goodsReceipts)
    .innerJoin(goodsReceiptLines, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
    .leftJoin(purchaseOrders, eq(goodsReceipts.purchaseOrderId, purchaseOrders.id))
    .where(and(...conds))
    .orderBy(desc(goodsReceipts.receiptDate))
    .limit(fetchWindow)) as any[];

  const grnLineIds = rows.map((r) => r.grnLineId);
  const matched = await matchedQtyByGrnLine(dbh, grnLineIds);
  const returned = await returnedQtyByGrnLine(dbh, grnLineIds);
  const out: MatchableGrnLine[] = [];
  for (const r of rows) {
    if (out.length >= limit) break; // bound response + per-line GRNI lookups
    const received = Number(r.qty || 0);
    const invoiced = matched.get(r.grnLineId) || 0;
    // Phase 5B — returned quantity also consumes capacity; a fully returned line
    // is no longer invoiceable.
    const returnedQty = returned.get(r.grnLineId) || 0;
    const remaining = r2(received - invoiced - returnedQty);
    if (remaining <= QTY_TOLERANCE) continue;
    // remainingGrniValue is the EXACT posted line value minus the GL-cleared value
    // (invoices AND returns), never qty × price, so partial matching can't drift.
    const cleared = await activeClearedGrniValue(dbh, r.grnLineId);
    const returnedVal = await activeReturnedGrniValue(dbh, r.grnLineId);
    out.push({
      goodsReceiptId: r.goodsReceiptId,
      grnNumber: r.grnNumber,
      goodsReceiptLineId: r.grnLineId,
      purchaseOrderId: r.purchaseOrderId,
      poNumber: r.poNumber ?? null,
      poLineId: r.poLineId,
      receiptDate: r.receiptDate,
      lineType: r.lineType,
      description: r.description || "",
      itemId: r.itemId ?? null,
      unitPrice: Number(r.unitPrice || 0),
      receivedQuantity: received,
      invoicedQuantity: invoiced,
      remainingQuantity: remaining,
      remainingGrniValue: r2(Number(r.lineValue || 0) - cleared - returnedVal),
    });
  }
  return out;
}

/**
 * Derived matched-value summary for a receipt (GRN detail UI). received/invoiced/
 * remaining are money; invoiced is Σ (matched qty × receipt unit price) over active
 * posted invoices. No stored balance is read.
 */
export async function receiptMatchSummary(dbh: Db, goodsReceiptId: string) {
  const lines = (await (dbh as any)
    .select({
      grnLineId: goodsReceiptLines.id,
      lineValue: goodsReceiptLines.lineValue,
      qty: goodsReceiptLines.quantityReceived,
    })
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId))) as any[];
  let receivedValue = 0;
  let invoicedValue = 0; // EXACT cleared value from GL (never qty × price)
  let returnedValue = 0; // Phase 5B — GRNI cleared by returns (GL-derived)
  let receivedQty = 0;
  let matchedQty = 0;
  let returnedQty = 0;
  for (const l of lines) {
    receivedValue = r2(receivedValue + Number(l.lineValue || 0));
    invoicedValue = r2(invoicedValue + (await activeClearedGrniValue(dbh, l.grnLineId)));
    returnedValue = r2(returnedValue + (await activeReturnedGrniValue(dbh, l.grnLineId)));
    receivedQty = r2(receivedQty + Number(l.qty || 0));
    matchedQty = r2(
      matchedQty + ((await matchedQtyByGrnLine(dbh, [l.grnLineId])).get(l.grnLineId) || 0),
    );
    returnedQty = r2(
      returnedQty + ((await returnedQtyByGrnLine(dbh, [l.grnLineId])).get(l.grnLineId) || 0),
    );
  }
  // Remaining = received − invoiced − returned (both consume the same GRNI/capacity).
  const remainingValue = r2(receivedValue - invoicedValue - returnedValue);
  const remainingQty = r2(receivedQty - matchedQty - returnedQty);
  // FULL (no residual GRNI) requires BOTH zero remaining quantity AND zero value.
  return {
    receivedValue,
    invoicedValue,
    returnedValue,
    remainingValue,
    remainingQuantity: remainingQty,
    fullyInvoiced: remainingQty <= QTY_TOLERANCE && Math.abs(remainingValue) <= MONEY_TOLERANCE,
    integrityMismatch: remainingQty <= QTY_TOLERANCE && Math.abs(remainingValue) > MONEY_TOLERANCE,
  };
}

/** Allocation rows for one supplier invoice (detail / audit / print). */
export async function invoiceAllocations(dbh: Db, supplierInvoiceId: string) {
  return (dbh as any)
    .select({
      id: supplierInvoiceGrnAllocations.id,
      supplierInvoiceLineId: supplierInvoiceGrnAllocations.supplierInvoiceLineId,
      goodsReceiptId: supplierInvoiceGrnAllocations.goodsReceiptId,
      goodsReceiptLineId: supplierInvoiceGrnAllocations.goodsReceiptLineId,
      purchaseOrderId: supplierInvoiceGrnAllocations.purchaseOrderId,
      matchedQuantity: supplierInvoiceGrnAllocations.matchedQuantity,
      grnNumber: goodsReceipts.grnNumber,
    })
    .from(supplierInvoiceGrnAllocations)
    .leftJoin(goodsReceipts, eq(supplierInvoiceGrnAllocations.goodsReceiptId, goodsReceipts.id))
    .where(eq(supplierInvoiceGrnAllocations.supplierInvoiceId, supplierInvoiceId));
}
