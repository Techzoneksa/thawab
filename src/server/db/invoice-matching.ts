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
} from "./schema";
import { GoodsReceiptStatus, SupplierInvoiceStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

const QTY_TOLERANCE = 0.0001;
const MONEY_TOLERANCE = 0.005; // project halala precision (2 dp)
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Supplier-invoice statuses whose allocations actively consume GRN quantity. */
const ACTIVE_INVOICE_STATES = [SupplierInvoiceStatus.POSTED];

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
  opts: { excludeInvoiceId?: string } = {},
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

  const receivedQuantity = Number(gl.received || 0);
  const originalPostedGrniValue = r2(Number(gl.lineValue || 0));
  const remainingQuantity = r2(receivedQuantity - activeMatchedQuantity);
  const remainingGrniValue = r2(originalPostedGrniValue - cleared);

  let status: GrnLineMatchingPosition["status"];
  if (activeMatchedQuantity <= QTY_TOLERANCE && Math.abs(cleared) <= MONEY_TOLERANCE)
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

  const matched = await matchedQtyByGrnLine(
    dbh,
    rows.map((r) => r.grnLineId),
  );
  const out: MatchableGrnLine[] = [];
  for (const r of rows) {
    if (out.length >= limit) break; // bound response + per-line GRNI lookups
    const received = Number(r.qty || 0);
    const invoiced = matched.get(r.grnLineId) || 0;
    const remaining = r2(received - invoiced);
    if (remaining <= QTY_TOLERANCE) continue;
    // remainingGrniValue is the EXACT posted line value minus the GL-cleared value
    // (never qty × price), so partial matching against it can never drift.
    const cleared = await activeClearedGrniValue(dbh, r.grnLineId);
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
      remainingGrniValue: r2(Number(r.lineValue || 0) - cleared),
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
  let receivedQty = 0;
  let matchedQty = 0;
  for (const l of lines) {
    receivedValue = r2(receivedValue + Number(l.lineValue || 0));
    invoicedValue = r2(invoicedValue + (await activeClearedGrniValue(dbh, l.grnLineId)));
    receivedQty = r2(receivedQty + Number(l.qty || 0));
    matchedQty = r2(
      matchedQty + ((await matchedQtyByGrnLine(dbh, [l.grnLineId])).get(l.grnLineId) || 0),
    );
  }
  const remainingValue = r2(receivedValue - invoicedValue);
  const remainingQty = r2(receivedQty - matchedQty);
  // FULL requires BOTH zero remaining quantity AND zero remaining GRNI value.
  return {
    receivedValue,
    invoicedValue,
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
