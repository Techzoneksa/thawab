/**
 * Phase 3D — governed Goods Receipt (GRN) service, server-authoritative.
 *
 * A GRN receives goods/services against an ISSUED governed Purchase Order. On
 * POST it atomically books, in ONE transaction:
 *
 *     Dr  receipt target   (Inventory for ITEM lines · the line's expense/asset
 *                           account for SERVICE/ASSET/EXPENSE/OTHER lines)
 *         Cr  GRNI          (Goods Received Not Invoiced — an admin-confirmed
 *                            LIABILITY accrual)
 *
 * and, for ITEM lines only, increments inventory and writes exactly one stock
 * movement. It NEVER credits Accounts Payable, NEVER writes suppliers.balance,
 * NEVER creates supplier_journal_links, and NEVER recognizes Input VAT — the
 * Supplier Invoice remains the sole AP-recognition document, and clearing GRNI
 * against AP is a later matching phase.
 *
 * Governed received quantity is DERIVED by summing posted GRN lines (never a
 * competing manually-maintained column). Concurrent receipts are serialized on
 * an advisory lock per Purchase Order so a line can never be over-received.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  goodsReceipts,
  goodsReceiptLines,
  purchaseOrders,
  purchaseOrderLines,
  inventoryItems,
  stockMovements,
  accounts,
  suppliers,
  financeWorkflowEvents,
} from "./schema";
import { AppError } from "./errors";
import { nextCode } from "./numbering";
import {
  postBalancedEntry,
  reverseEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "./gl";
import { resolveConfirmedGrniAccount } from "./account-mapping";
import { recordWorkflowEvent } from "./finance-workflow";
import { LOCK_NS } from "./lock-namespaces";
import {
  GoodsReceiptStatus as G,
  PurchaseOrderGovernedStatus as POS,
  PurchaseOrderGovernance,
  PurchaseOrderLineType,
  AccountStatus,
  StockMovementType,
  JournalStatus,
} from "@/lib/enums";
import type { Ctx } from "./api-utils";

const QTY_TOLERANCE = 0.0001;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const GOVERNED = PurchaseOrderGovernance.GOVERNED;

type Db = { select: (...a: any[]) => any };

export interface GoodsReceiptLineInput {
  poLineId: string;
  quantityReceived: number;
}
export interface GoodsReceiptInput {
  purchaseOrderId: string;
  receiptDate?: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
}

/**
 * Quantity already received per PO line, DERIVED from POSTED GRN lines only.
 * Returns a Map(poLineId → receivedQty).
 */
export async function receivedByPoLine(
  dbh: Db,
  purchaseOrderId: string,
): Promise<Map<string, number>> {
  const rows = (await (dbh as any)
    .select({
      poLineId: goodsReceiptLines.poLineId,
      qty: goodsReceiptLines.quantityReceived,
      status: goodsReceipts.status,
    })
    .from(goodsReceiptLines)
    .innerJoin(goodsReceipts, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
    .where(
      and(eq(goodsReceipts.purchaseOrderId, purchaseOrderId), eq(goodsReceipts.status, G.POSTED)),
    )) as any[];
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.poLineId, (map.get(r.poLineId) || 0) + Number(r.qty || 0));
  return map;
}

/** PO lines with ordered / received-to-date / remaining, for the receiving UI. */
export async function receivablePoLines(dbh: Db, purchaseOrderId: string) {
  const lines = (await dbh
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, purchaseOrderId))
    .orderBy(purchaseOrderLines.lineNumber)) as any[];
  const received = await receivedByPoLine(dbh, purchaseOrderId);
  return lines.map((l) => {
    const rec = received.get(l.id) || 0;
    return {
      poLineId: l.id,
      lineNumber: l.lineNumber,
      description: l.description,
      lineType: l.lineType,
      itemId: l.itemId,
      accountId: l.accountId,
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      orderedQuantity: Number(l.quantity),
      receivedQuantity: rec,
      remainingQuantity: r2(Number(l.quantity) - rec),
    };
  });
}

/** True if the PO has any POSTED goods receipt (used to block PO cancellation). */
export async function hasPostedGoodsReceipt(dbh: Db, purchaseOrderId: string): Promise<boolean> {
  const rows = (await dbh
    .select({ id: goodsReceipts.id })
    .from(goodsReceipts)
    .where(
      and(eq(goodsReceipts.purchaseOrderId, purchaseOrderId), eq(goodsReceipts.status, G.POSTED)),
    )
    .limit(1)) as any[];
  return rows.length > 0;
}

async function loadGrn(id: string) {
  const v = (await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).limit(1))[0];
  return (v as any) ?? null;
}

// ------------------------------- Create + post (atomic) -----------------

export async function createGoodsReceipt(ctx: Ctx, input: GoodsReceiptInput) {
  const id = genId("GRN");
  const ts = now();
  const receiptDate = input.receiptDate || ts.slice(0, 10);

  await db.transaction(async (tx) => {
    // Serialize all receiving for this PO so concurrent receipts cannot both pass
    // the over-receive check on the same line.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${LOCK_NS.GRN_POSTING}, hashtext(${input.purchaseOrderId}))`,
    );

    const po = (
      await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.purchaseOrderId))
        .limit(1)
    )[0] as any;
    if (!po) throw new AppError("أمر الشراء غير موجود", 404, "PO_NOT_FOUND");
    if (po.governanceMode !== GOVERNED)
      throw new AppError("لا يمكن الاستلام إلا لأوامر الشراء المحكومة", 409, "NOT_GOVERNED");
    if (po.status !== POS.ISSUED)
      throw new AppError("لا يمكن الاستلام إلا لأمر شراء صادر (ISSUED)", 409, "PO_NOT_ISSUED");

    if (!input.lines || input.lines.length < 1)
      throw new AppError("يجب تحديد سطر استلام واحد على الأقل", 400, "NO_LINES");

    // Resolve the admin-confirmed GRNI account BEFORE any work — a missing/
    // unconfirmed mapping fails the whole receipt (no journal, no stock).
    const grniId = await resolveConfirmedGrniAccount(tx as any);
    const apId = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_PAYABLE);
    let vatId: string | null = null;
    try {
      vatId = await resolveSystemAccountId(tx as any, SYS.INPUT_VAT);
    } catch {
      vatId = null;
    }
    const inventoryId = await resolveSystemAccountId(tx as any, SYS.INVENTORY);

    const poLines = (await tx
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, po.id))) as any[];
    const poLineMap = new Map(poLines.map((l) => [l.id, l]));
    const received = await receivedByPoLine(tx as any, po.id);

    const jLines: any[] = [];
    const grnLineRows: any[] = [];
    let totalValue = 0;
    let lineNo = 0;

    for (const rl of input.lines) {
      const pl = poLineMap.get(rl.poLineId);
      if (!pl) throw new AppError("سطر أمر الشراء غير موجود", 400, "PO_LINE_NOT_FOUND");
      const qty = Number(rl.quantityReceived || 0);
      if (!(qty > 0))
        throw new AppError("الكمية المستلمة يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");

      const alreadyReceived = received.get(pl.id) || 0;
      if (alreadyReceived + qty > Number(pl.quantity) + QTY_TOLERANCE)
        throw new AppError(
          `الكمية المستلمة للسطر "${pl.description}" تتجاوز المطلوب (المطلوب ${pl.quantity}، المستلم ${alreadyReceived})`,
          409,
          "OVER_RECEIVE",
        );

      const unitPrice = Number(pl.unitPrice || 0); // server-authoritative (from PO)
      const lineValue = r2(qty * unitPrice);
      totalValue = r2(totalValue + lineValue);
      const lineType = pl.lineType || PurchaseOrderLineType.ITEM;

      let debitAccountId: string;
      let stockMovementId: string | null = null;

      if (lineType === PurchaseOrderLineType.ITEM) {
        // ITEM → book into inventory and move stock exactly once.
        if (!pl.itemId)
          throw new AppError(
            `سطر صنف بدون صنف مخزني مرتبط — لا يمكن استلامه مخزنياً (${pl.description})`,
            400,
            "RECEIPT_ITEM_REQUIRED",
          );
        debitAccountId = inventoryId;
        const item = (
          await tx.select().from(inventoryItems).where(eq(inventoryItems.id, pl.itemId)).limit(1)
        )[0] as any;
        if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
        const newQty = r2(Number(item.quantity || 0) + qty);
        await tx
          .update(inventoryItems)
          .set({ quantity: newQty, updatedAt: ts })
          .where(eq(inventoryItems.id, pl.itemId));
        stockMovementId = genId("MV");
        await tx.insert(stockMovements).values({
          id: stockMovementId,
          itemId: pl.itemId,
          warehouseId: item.warehouseId || null,
          type: StockMovementType.IN,
          quantity: qty,
          balanceAfter: newQty,
          sourceType: "goods_receipt",
          sourceId: id,
          reference: `GRN ${id}`,
          date: receiptDate,
          notes: `استلام بضاعة — أمر شراء ${po.poNumber}`,
          createdBy: ctx.user.id,
          createdAt: ts,
        });
      } else {
        // SERVICE / ASSET / EXPENSE / OTHER → debit the PO line's target account.
        const accId = pl.accountId;
        if (!accId)
          throw new AppError(
            `سطر غير مخزني بدون حساب استلام — حدّد حساب المصروف/الأصل في أمر الشراء (${pl.description})`,
            400,
            "RECEIPT_ACCOUNT_MISSING",
          );
        const acc = (
          await tx.select().from(accounts).where(eq(accounts.id, accId)).limit(1)
        )[0] as any;
        if (!acc) throw new AppError("حساب الاستلام غير موجود", 400, "RECEIPT_ACCOUNT_NOT_FOUND");
        if (acc.status !== AccountStatus.ACTIVE)
          throw new AppError(`حساب الاستلام ${acc.name} غير نشط`, 400, "RECEIPT_ACCOUNT_INACTIVE");
        if (!acc.postable)
          throw new AppError(
            `حساب الاستلام ${acc.name} غير قابل للترحيل`,
            400,
            "RECEIPT_ACCOUNT_NOT_POSTABLE",
          );
        if (acc.id === apId || acc.id === grniId || (vatId && acc.id === vatId))
          throw new AppError(
            "حساب الاستلام لا يمكن أن يكون حساب رقابة (ذمم/GRNI/ضريبة)",
            400,
            "RECEIPT_ACCOUNT_IS_CONTROL",
          );
        debitAccountId = accId;
      }

      jLines.push({
        accountId: debitAccountId,
        debit: lineValue,
        costCenterId: pl.costCenterId ?? null,
        description: `استلام — ${pl.description || ""}`.trim(),
      });
      grnLineRows.push({
        id: genId("GRL"),
        goodsReceiptId: id,
        poLineId: pl.id,
        lineNumber: ++lineNo,
        lineType,
        description: pl.description,
        itemId: pl.itemId ?? null,
        accountId: debitAccountId,
        quantityReceived: qty,
        unitPrice,
        lineValue,
        costCenterId: pl.costCenterId ?? null,
        stockMovementId,
        createdAt: ts,
      });
    }

    if (!(totalValue > 0))
      throw new AppError("قيمة الاستلام يجب أن تكون أكبر من صفر", 400, "VALUE_INVALID");

    // … single aggregated GRNI credit — NEVER Accounts Payable.
    jLines.push({
      accountId: grniId,
      credit: totalValue,
      description: `GRNI — استلام أمر شراء ${po.poNumber}`,
    });

    if (await existingSourceEntryId(tx as any, "goods_receipt", id))
      throw new AppError("سبق ترحيل هذا الاستلام", 409, "ALREADY_POSTED");

    const entryId = await postBalancedEntry(tx as any, {
      date: receiptDate,
      description: `سند استلام — أمر شراء ${po.poNumber}`,
      currency: po.currency,
      source: "goods_receipt",
      sourceType: "goods_receipt",
      sourceId: id,
      lines: jLines,
      userId: ctx.user.id,
      status: JournalStatus.POSTED,
    });

    await tx.insert(goodsReceipts).values({
      id,
      grnNumber: await nextCode(tx as any, {
        table: "goods_receipts",
        column: "grn_number",
        prefix: "GRN-",
        year: true,
      }),
      purchaseOrderId: po.id,
      supplierId: po.supplierId ?? null,
      receiptDate,
      status: G.POSTED,
      currency: po.currency,
      totalValue,
      journalEntryId: entryId,
      notes: input.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    for (const row of grnLineRows) await tx.insert(goodsReceiptLines).values(row);

    await recordWorkflowEvent(tx as any, {
      entityType: "goods_receipt",
      entityId: id,
      action: "post",
      fromStatus: null,
      toStatus: G.POSTED,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadGrn(id);
  await addAudit({
    action: "GOODS_RECEIPT_POSTED",
    entityType: "goods_receipt",
    entityId: id,
    description: `تسجيل استلام ${created?.grnNumber} بقيمة ${created?.totalValue}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Reverse (atomic) -----------------------

export async function reverseGoodsReceipt(ctx: Ctx, id: string, reason?: string) {
  const cleanReason = (reason ?? "").trim();
  if (!cleanReason) throw new AppError("السبب مطلوب لعكس الاستلام", 400, "REASON_REQUIRED");
  const ts = now();
  let reversalId: string | undefined;

  await db.transaction(async (tx) => {
    const locked = (
      await tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).for("update").limit(1)
    )[0] as any;
    if (!locked) throw new AppError("سند الاستلام غير موجود", 404, "NOT_FOUND");
    if (locked.status !== G.POSTED)
      throw new AppError("تعذّر العكس — تغيّرت حالة الاستلام", 409, "STATE_CONFLICT");
    if (!locked.journalEntryId) throw new AppError("لا يوجد قيد لعكسه", 409, "NO_JOURNAL");

    // Reverse the GL (mirror: Dr GRNI / Cr receipt targets) via the certified engine.
    reversalId = await reverseEntry(tx as any, locked.journalEntryId, ctx.user.id);

    // Reverse inventory for ITEM lines — one offsetting OUT movement each.
    const grnLines = (await tx
      .select()
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.goodsReceiptId, id))) as any[];
    for (const gl of grnLines) {
      if (gl.itemId && gl.stockMovementId) {
        const item = (
          await tx.select().from(inventoryItems).where(eq(inventoryItems.id, gl.itemId)).limit(1)
        )[0] as any;
        if (item) {
          const newQty = r2(Number(item.quantity || 0) - Number(gl.quantityReceived || 0));
          await tx
            .update(inventoryItems)
            .set({ quantity: newQty, updatedAt: ts })
            .where(eq(inventoryItems.id, gl.itemId));
          await tx.insert(stockMovements).values({
            id: genId("MV"),
            itemId: gl.itemId,
            warehouseId: item.warehouseId || null,
            type: StockMovementType.OUT,
            quantity: Number(gl.quantityReceived || 0),
            balanceAfter: newQty,
            sourceType: "goods_receipt_reversal",
            sourceId: id,
            reference: `GRN ${id} عكس`,
            date: ts.slice(0, 10),
            notes: `عكس استلام — ${cleanReason}`,
            createdBy: ctx.user.id,
            createdAt: ts,
          });
        }
      }
    }

    const changed = await tx
      .update(goodsReceipts)
      .set({
        status: G.REVERSED,
        reversalJournalEntryId: reversalId,
        reversedBy: ctx.user.id,
        reversedAt: ts,
        reversalReason: cleanReason,
        updatedAt: ts,
      })
      .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.status, G.POSTED)))
      .returning({ id: goodsReceipts.id });
    if (changed.length === 0)
      throw new AppError("تعذّر العكس — تغيّرت حالة الاستلام", 409, "STATE_CONFLICT");

    await recordWorkflowEvent(tx as any, {
      entityType: "goods_receipt",
      entityId: id,
      action: "reverse",
      fromStatus: G.POSTED,
      toStatus: G.REVERSED,
      userId: ctx.user.id,
      userName: ctx.user.name,
      reason: cleanReason,
      metadata: reversalId ? { reversalId } : {},
    });
  });

  await addAudit({
    action: "GOODS_RECEIPT_REVERSED",
    entityType: "goods_receipt",
    entityId: id,
    description: `عكس سند استلام ${id} — ${cleanReason}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return { item: await loadGrn(id), reversalId };
}

// ------------------------------- Reads ---------------------------------

export async function goodsReceiptWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "goods_receipt"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getGoodsReceiptDetail(id: string) {
  const item = await loadGrn(id);
  if (!item) return null;
  const lines = await db
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, id))
    .orderBy(goodsReceiptLines.lineNumber);
  const history = await goodsReceiptWorkflowHistory(id);
  const po = (
    await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, item.purchaseOrderId))
      .limit(1)
  )[0];
  const supplier = item.supplierId
    ? (await db.select().from(suppliers).where(eq(suppliers.id, item.supplierId)).limit(1))[0]
    : null;
  return { item, lines, history, po, supplier };
}

export interface GoodsReceiptFilters {
  status?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listGoodsReceipts(filters: GoodsReceiptFilters = {}) {
  const rows = (await db
    .select()
    .from(goodsReceipts)
    .orderBy(sql`${goodsReceipts.createdAt} DESC`)) as any[];
  const q = (filters.search || "").trim().toLowerCase();
  const items = rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.purchaseOrderId && r.purchaseOrderId !== filters.purchaseOrderId) return false;
    if (filters.supplierId && r.supplierId !== filters.supplierId) return false;
    if (filters.dateFrom && r.receiptDate < filters.dateFrom) return false;
    if (filters.dateTo && r.receiptDate > filters.dateTo) return false;
    if (q && !`${r.grnNumber}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const summary = {
    total: items.length,
    posted: items.filter((r) => r.status === G.POSTED).length,
    reversed: items.filter((r) => r.status === G.REVERSED).length,
    grniValue: items
      .filter((r) => r.status === G.POSTED)
      .reduce((s, r) => s + Number(r.totalValue || 0), 0),
  };
  return { items, summary };
}
