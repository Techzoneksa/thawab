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
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  supplierInvoiceGrnAllocations,
  supplierInvoices,
  goodsReceipts,
  goodsReceiptLines,
  purchaseOrders,
} from "./schema";
import { GoodsReceiptStatus, SupplierInvoiceStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

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
): Promise<MatchableGrnLine[]> {
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
      qty: goodsReceiptLines.quantityReceived,
    })
    .from(goodsReceipts)
    .innerJoin(goodsReceiptLines, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
    .leftJoin(purchaseOrders, eq(goodsReceipts.purchaseOrderId, purchaseOrders.id))
    .where(
      and(
        eq(goodsReceipts.supplierId, supplierId),
        eq(goodsReceipts.status, GoodsReceiptStatus.POSTED),
      ),
    )
    .orderBy(goodsReceipts.receiptDate)) as any[];

  const matched = await matchedQtyByGrnLine(
    dbh,
    rows.map((r) => r.grnLineId),
  );
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const out: MatchableGrnLine[] = [];
  for (const r of rows) {
    const received = Number(r.qty || 0);
    const invoiced = matched.get(r.grnLineId) || 0;
    const remaining = r2(received - invoiced);
    if (remaining <= 0.0001) continue;
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
      remainingGrniValue: r2(remaining * Number(r.unitPrice || 0)),
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
      unitPrice: goodsReceiptLines.unitPrice,
      lineValue: goodsReceiptLines.lineValue,
      qty: goodsReceiptLines.quantityReceived,
    })
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId))) as any[];
  const matched = await matchedQtyByGrnLine(
    dbh,
    lines.map((l) => l.grnLineId),
  );
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let receivedValue = 0;
  let invoicedValue = 0;
  for (const l of lines) {
    receivedValue = r2(receivedValue + Number(l.lineValue || 0));
    invoicedValue = r2(invoicedValue + (matched.get(l.grnLineId) || 0) * Number(l.unitPrice || 0));
  }
  return {
    receivedValue,
    invoicedValue,
    remainingValue: r2(receivedValue - invoicedValue),
    fullyInvoiced: r2(receivedValue - invoicedValue) <= 0.0001,
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
