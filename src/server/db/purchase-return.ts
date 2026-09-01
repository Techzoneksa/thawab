/**
 * Phase 5B — governed Purchase Return service, server-authoritative.
 *
 * A Purchase Return sends back UNINVOICED received quantity of a POSTED governed
 * GRN. It is a controlled document with the SAME governance lifecycle as the GRN
 * (DRAFT→SUBMITTED→APPROVED→POSTED, plus SUBMITTED→DRAFT return, SUBMITTED→
 * REJECTED, POSTED→REVERSED). DRAFT/SUBMITTED/APPROVED have ZERO accounting,
 * GRNI-subledger and inventory effect. Approval is maker-checker-blocked;
 * approve ≠ post.
 *
 * ONLY the POST transition, in ONE transaction, atomically books per return line:
 *
 *     Dr  GRNI  (the receipt's HISTORICAL GRNI account)
 *         Cr  the line's HISTORICAL actual receipt debit account
 *                       (goods_receipt_lines.account_id — Inventory for ITEM lines)
 *
 * and, for ITEM lines, DECREMENTS inventory (never below zero) writing one OUT
 * stock movement, and links each GRNI DEBIT line to the receipt line in the GRNI
 * subledger (grni_journal_links, link_type='return'). It NEVER touches Accounts
 * Payable, VAT, suppliers.balance or supplier_journal_links.
 *
 * CAPACITY: a returned quantity consumes the SAME receipt-line capacity as an
 * invoice match — matched + returned ≤ received — and clears the SAME GRNI. Both
 * consumers telescope against one shared truth (getGrnLineMatchingPosition), so a
 * partial invoice + partial return share the same quantity/value, and full
 * consumption clears the line's GRNI to EXACTLY 0.00. POST serializes with
 * Supplier Invoice POST on the SAME goods_receipt_lines row locks.
 *
 * REVERSE unwinds GL (mirror), the GRNI subledger (a 'return_reversal' credit
 * mirror nets the clearing back) and restores inventory + receipt capacity.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { resolvePage, paginatedResult, type PageParams } from "./pagination";
import { db, now, genId, addAudit } from "./index";
import {
  purchaseReturns,
  purchaseReturnLines,
  goodsReceipts,
  goodsReceiptLines,
  purchaseOrders,
  inventoryItems,
  stockMovements,
  journalLines,
  financeWorkflowEvents,
} from "./schema";
import { AppError } from "./errors";
import { nextCode } from "./numbering";
import { hasPermission } from "./auth";
import { postBalancedEntry, reverseEntry, existingSourceEntryId } from "./gl";
import { receiptGrniLink, createGrniLink } from "./grni-link";
import { getGrnLineMatchingPosition, expectedGrniClearValue } from "./invoice-matching";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  type JournalAction,
} from "@/lib/finance-permissions";
import { PURCHASE_RETURN_TRANSITIONS } from "@/lib/procurement-permissions";
import {
  PurchaseReturnStatus as R,
  GoodsReceiptStatus as G,
  PurchaseOrderLineType,
  StockMovementType,
  JournalStatus,
} from "@/lib/enums";
import type { Ctx } from "./api-utils";

const QTY_TOLERANCE = 0.0001;
const AMOUNT_TOLERANCE = 0.005;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
type Db = { select: (...a: any[]) => any };

export interface PurchaseReturnLineInput {
  goodsReceiptLineId: string;
  quantity: number;
}
export interface PurchaseReturnInput {
  goodsReceiptId: string;
  returnDate?: string;
  reason?: string;
  lines: PurchaseReturnLineInput[];
}

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "submit",
  approve: "approve",
  return: "return",
  reject: "reject",
  post: "post",
  reverse: "reverse",
} as any;

// ------------------------------- loaders --------------------------------

async function loadReturn(id: string) {
  return (
    ((
      await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).limit(1)
    )[0] as any) ?? null
  );
}
async function loadReturnLines(dbh: Db, id: string) {
  return (await (dbh as any)
    .select()
    .from(purchaseReturnLines)
    .where(eq(purchaseReturnLines.purchaseReturnId, id))
    .orderBy(asc(purchaseReturnLines.lineNumber))) as any[];
}

/**
 * Validate a return against its GRN: the GRN is POSTED, every line targets a line
 * of THAT receipt, quantities are > 0 and do not exceed the still-returnable
 * quantity (received − matched − returned by OTHER returns). Returns per-line
 * computed metadata + the telescoped GRNI clear value. `opts.excludeReturnId`
 * excludes this return's own consumption (used at POST under lock).
 */
async function computeReturn(
  dbh: Db,
  header: any,
  lines: Array<{ goodsReceiptLineId: string; quantity: number }>,
) {
  const grn = (
    await (dbh as any)
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, header.goodsReceiptId))
      .limit(1)
  )[0] as any;
  if (!grn) throw new AppError("سند الاستلام غير موجود", 404, "GRN_NOT_FOUND");
  if (grn.status !== G.POSTED)
    throw new AppError("لا يمكن الإرجاع إلا من سند استلام مُرحَّل (POSTED)", 409, "GRN_NOT_POSTED");

  const link = await receiptGrniLink(dbh, grn.id);
  if (!link) throw new AppError("لا يوجد ربط GRNI لسند الاستلام", 409, "GRNI_LINK_MISSING");
  const grniAccountId = link.accountId as string;

  if (!lines.length) throw new AppError("يجب إضافة سطر واحد على الأقل", 400, "NO_LINES");

  const priorQty = new Map<string, number>();
  const priorValue = new Map<string, number>();
  const computed: Array<{
    goodsReceiptLineId: string;
    itemId: string | null;
    accountId: string;
    lineType: string;
    description: string;
    costCenterId: string | null;
    quantity: number;
    clearValue: number;
  }> = [];

  for (const l of lines) {
    const quantity = Number(l.quantity || 0);
    if (!(quantity > 0)) throw new AppError("الكمية يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");
    const grnLine = (
      await (dbh as any)
        .select()
        .from(goodsReceiptLines)
        .where(eq(goodsReceiptLines.id, l.goodsReceiptLineId))
        .limit(1)
    )[0] as any;
    if (!grnLine) throw new AppError("سطر الاستلام غير موجود", 400, "GRN_LINE_NOT_FOUND");
    if (grnLine.goodsReceiptId !== grn.id)
      throw new AppError("سطر الاستلام لا يخص هذا السند", 400, "GRN_LINE_MISMATCH");
    if (!grnLine.accountId)
      throw new AppError("سطر الاستلام لا يحمل حساب المدين الأصلي", 409, "GRN_LINE_NO_ACCOUNT");

    // Shared capacity/GRNI truth (excl this return): consumed = matched + returned.
    const pos = await getGrnLineMatchingPosition(dbh, grnLine.id, {
      excludeReturnId: header.id,
    });
    const prevQty = pos.consumedQuantity + (priorQty.get(grnLine.id) || 0);
    const prevVal = pos.consumedGrniValue + (priorValue.get(grnLine.id) || 0);
    const qTotal = pos.receivedQuantity;
    const vTotal = pos.originalPostedGrniValue;

    if (prevQty + quantity > qTotal + QTY_TOLERANCE)
      throw new AppError(
        `كمية الإرجاع تتجاوز المتبقّي غير المفوتر من الاستلام (المستلم ${qTotal}، المستهلك ${r2(prevQty)})`,
        409,
        "OVER_RETURN_RECEIPT",
      );

    // Telescoped GRNI clearing — partial invoices AND returns share the exact same
    // proportional truth; the final consumer absorbs the rounding residual so full
    // consumption clears GRNI to EXACTLY the original posted value.
    const clearValue = expectedGrniClearValue({
      vTotal,
      qTotal,
      prevQty,
      prevValue: prevVal,
      newQty: quantity,
    });
    if (!(clearValue > 0))
      throw new AppError("قيمة الإرجاع المحسوبة غير صالحة", 409, "RETURN_VALUE_INVALID");
    if (prevVal + clearValue > vTotal + AMOUNT_TOLERANCE)
      throw new AppError(
        "قيمة الإرجاع تتجاوز قيمة GRNI الأصلية المُرحَّلة",
        409,
        "GRNI_OVER_CLEAR",
      );

    priorQty.set(grnLine.id, (priorQty.get(grnLine.id) || 0) + quantity);
    priorValue.set(grnLine.id, (priorValue.get(grnLine.id) || 0) + clearValue);
    computed.push({
      goodsReceiptLineId: grnLine.id,
      itemId: grnLine.itemId ?? null,
      accountId: grnLine.accountId,
      lineType: grnLine.lineType,
      description: grnLine.description || "",
      costCenterId: grnLine.costCenterId ?? null,
      quantity,
      clearValue,
    });
  }
  return { grn, grniAccountId, computed };
}

// ------------------------------- create (DRAFT) -------------------------

export async function createPurchaseReturn(ctx: Ctx, input: PurchaseReturnInput) {
  const grn = (
    await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, input.goodsReceiptId)).limit(1)
  )[0] as any;
  if (!grn) throw new AppError("سند الاستلام غير موجود", 404, "GRN_NOT_FOUND");
  if (grn.status !== G.POSTED)
    throw new AppError("لا يمكن إنشاء مرتجع إلا من سند استلام مُرحَّل", 409, "GRN_NOT_POSTED");

  const id = genId("PRET");
  const ts = now();
  const header = {
    id,
    goodsReceiptId: grn.id,
    // Validate the requested lines up front (soft — authoritative recheck at POST).
  };
  const { computed } = await computeReturn(db, { id, goodsReceiptId: grn.id }, input.lines);

  await db.transaction(async (tx) => {
    await tx.insert(purchaseReturns).values({
      id,
      returnNumber: await nextCode(tx as any, {
        table: "purchase_returns",
        column: "return_number",
        prefix: "PRET-",
        year: true,
      }),
      goodsReceiptId: grn.id,
      purchaseOrderId: grn.purchaseOrderId ?? null,
      supplierId: grn.supplierId ?? null,
      returnDate: input.returnDate || ts.slice(0, 10),
      status: R.DRAFT,
      currency: grn.currency || "SAR",
      totalValue: 0,
      reason: input.reason || "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    let n = 1;
    for (const c of computed) {
      await tx.insert(purchaseReturnLines).values({
        id: genId("PRL"),
        purchaseReturnId: id,
        goodsReceiptLineId: c.goodsReceiptLineId,
        lineNumber: n++,
        lineType: c.lineType,
        description: c.description,
        itemId: c.itemId,
        accountId: c.accountId,
        quantityReturned: c.quantity,
        lineValue: 0, // authoritative value computed + persisted at POST
        costCenterId: c.costCenterId,
        createdAt: ts,
      });
    }
  });

  await addAudit({
    action: "create",
    entityType: "purchase_return",
    entityId: id,
    description: `إنشاء مرتجع مشتريات على سند الاستلام ${grn.grnNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  void header;
  return await loadReturn(id);
}

// ------------------------------- transition -----------------------------

export async function transitionPurchaseReturn(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
) {
  const v = await loadReturn(id);
  if (!v) throw new AppError("مرتجع المشتريات غير موجود", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, PURCHASE_RETURN_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: PURCHASE_RETURN_TRANSITIONS,
  });
  if (!decision.ok || !t)
    throw new AppError(
      decision.message ?? "إجراء غير مسموح",
      decisionHttpStatus(decision.code),
      decision.code ?? "FORBIDDEN",
    );

  const cleanReason = (reason ?? "").trim();
  const ts = now();
  let reversalId: string | undefined;

  await db.transaction(async (tx) => {
    if (action === "post") {
      await postApprovedReturn(tx, ctx, id);
    } else if (action === "reverse") {
      reversalId = await reversePostedReturn(tx, ctx, id, cleanReason);
    } else {
      const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
      if (action === "submit") {
        cols.submittedBy = ctx.user.id;
        cols.submittedAt = ts;
      }
      if (action === "approve") {
        cols.approvedBy = ctx.user.id;
        cols.approvedAt = ts;
      }
      if (action === "return") {
        cols.approvedBy = null;
        cols.approvedAt = null;
        cols.submittedBy = null;
        cols.submittedAt = null;
      }
      // Revalidate a submit still makes accounting sense before it leaves the maker.
      if (action === "submit") {
        const lines = await loadReturnLines(tx as any, id);
        await computeReturn(
          tx as any,
          { id, goodsReceiptId: v.goodsReceiptId },
          lines.map((l) => ({
            goodsReceiptLineId: l.goodsReceiptLineId,
            quantity: Number(l.quantityReturned),
          })),
        );
      }
      const changed = await tx
        .update(purchaseReturns)
        .set(cols)
        .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.status, t.from)))
        .returning({ id: purchaseReturns.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة المرتجع", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "purchase_return",
      entityId: id,
      action,
      fromStatus: v.status,
      toStatus: t.to,
      userId: ctx.user.id,
      userName: ctx.user.name,
      reason: cleanReason,
      metadata: reversalId ? { reversalId } : {},
    });
  });

  await addAudit({
    action: AUDIT_ACTION[action],
    entityType: "purchase_return",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${v.returnNumber} (${v.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return { item: await loadReturn(id), reversalId };
}

// ------------------------------- POST -----------------------------------

async function postApprovedReturn(tx: any, ctx: Ctx, id: string) {
  const locked = (
    await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).for("update").limit(1)
  )[0] as any;
  if (!locked || locked.status !== R.APPROVED)
    throw new AppError("تعذّر الترحيل — تغيّرت حالة المرتجع", 409, "STATE_CONFLICT");
  if (await existingSourceEntryId(tx, "purchase_return", id))
    throw new AppError("سبق ترحيل هذا المرتجع", 409, "ALREADY_POSTED");

  const storedLines = await loadReturnLines(tx, id);
  if (!storedLines.length) throw new AppError("لا توجد سطور للمرتجع", 400, "NO_LINES");

  // Serialize with Supplier Invoice POST on the SAME receipt-line capacity: lock
  // every referenced goods_receipt_line row FOR UPDATE, deterministic order (by id).
  const grnLineIds = [
    ...new Set(storedLines.map((l: any) => l.goodsReceiptLineId as string)),
  ].sort();
  for (const glId of grnLineIds)
    await tx
      .select({ id: goodsReceiptLines.id })
      .from(goodsReceiptLines)
      .where(eq(goodsReceiptLines.id, glId))
      .for("update")
      .limit(1);

  // Recompute EVERYTHING under the locks (capacity + telescoped clearing).
  const { grn, grniAccountId, computed } = await computeReturn(
    tx,
    { id, goodsReceiptId: locked.goodsReceiptId },
    storedLines.map((l: any) => ({
      goodsReceiptLineId: l.goodsReceiptLineId,
      quantity: Number(l.quantityReturned),
    })),
  );

  const ts = now();
  const stockByLine = new Map<string, string>(); // returnLineId → stockMovementId

  // ITEM lines reduce inventory — never below zero (all under FOR UPDATE row locks).
  for (let i = 0; i < computed.length; i++) {
    const c = computed[i];
    const stored = storedLines[i];
    if (c.lineType === PurchaseOrderLineType.ITEM && c.itemId) {
      const item = (
        await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, c.itemId))
          .for("update")
          .limit(1)
      )[0] as any;
      if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
      const have = Number(item.quantity || 0);
      if (have + QTY_TOLERANCE < c.quantity)
        throw new AppError(
          "تعذّر ترحيل المرتجع — الكمية المطلوب إرجاعها تتجاوز المتوفر بالمخزون (لا يمكن أن يصبح المخزون سالباً)",
          409,
          "RETURN_STOCK_INSUFFICIENT",
        );
      const newQty = r2(have - c.quantity);
      await tx
        .update(inventoryItems)
        .set({ quantity: newQty, updatedAt: ts })
        .where(eq(inventoryItems.id, c.itemId));
      const mvId = genId("MV");
      await tx.insert(stockMovements).values({
        id: mvId,
        itemId: c.itemId,
        warehouseId: item.warehouseId || null,
        type: StockMovementType.OUT,
        quantity: c.quantity,
        balanceAfter: newQty,
        sourceType: "purchase_return",
        sourceId: id,
        reference: `مرتجع ${locked.returnNumber}`,
        date: locked.returnDate,
        notes: `مرتجع مشتريات — سند الاستلام ${grn.grnNumber}`,
        createdBy: ctx.user.id,
        createdAt: ts,
      });
      stockByLine.set(stored.id, mvId);
    }
  }

  // Journal: per line  Dr GRNI (clearValue)  /  Cr historical receipt debit account.
  // GRNI debit legs come FIRST (positions 0..n-1) so we can link each to its GRN
  // line after posting, mirroring the invoice-clearing linkage.
  const desc = `مرتجع مشتريات ${locked.returnNumber} — سند الاستلام ${grn.grnNumber}`;
  const jLines: any[] = [];
  for (const c of computed)
    jLines.push({
      accountId: grniAccountId,
      debit: c.clearValue,
      description: `GRNI — إرجاع ${c.description}`.trim(),
    });
  for (const c of computed)
    jLines.push({
      accountId: c.accountId,
      credit: c.clearValue,
      costCenterId: c.costCenterId ?? null,
      description: `إرجاع — ${c.description}`.trim(),
    });

  const entryId = await postBalancedEntry(tx, {
    date: locked.returnDate,
    description: desc,
    currency: locked.currency,
    source: "purchase_return",
    sourceType: "purchase_return",
    sourceId: id,
    lines: jLines,
    userId: ctx.user.id,
    status: JournalStatus.POSTED,
  });

  // Link each GRNI DEBIT leg (first n, in order) to its GRN line — clears the
  // receipt's GRNI subledger by returns. journal_line_id is UNIQUE.
  const postedLines = (await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId))
    .orderBy(asc(journalLines.lineNumber))) as any[];
  for (let i = 0; i < computed.length; i++) {
    await createGrniLink(tx, {
      goodsReceiptId: grn.id,
      goodsReceiptLineId: computed[i].goodsReceiptLineId,
      journalLineId: postedLines[i].id,
      linkType: "return",
      expectedAccountId: grniAccountId,
      userId: ctx.user.id,
    });
  }

  // Persist per-line cleared value + stock movement id.
  let total = 0;
  for (let i = 0; i < computed.length; i++) {
    total = r2(total + computed[i].clearValue);
    await tx
      .update(purchaseReturnLines)
      .set({
        lineValue: computed[i].clearValue,
        stockMovementId: stockByLine.get(storedLines[i].id) ?? null,
      })
      .where(eq(purchaseReturnLines.id, storedLines[i].id));
  }

  const changed = await tx
    .update(purchaseReturns)
    .set({
      status: R.POSTED,
      journalEntryId: entryId,
      totalValue: total,
      postedBy: ctx.user.id,
      postedAt: ts,
      updatedAt: ts,
    })
    .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.status, R.APPROVED)))
    .returning({ id: purchaseReturns.id });
  if (changed.length === 0)
    throw new AppError("تعذّر الترحيل — تغيّرت حالة المرتجع", 409, "STATE_CONFLICT");
}

// ------------------------------- REVERSE --------------------------------

async function reversePostedReturn(
  tx: any,
  ctx: Ctx,
  id: string,
  cleanReason: string,
): Promise<string> {
  const locked = (
    await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).for("update").limit(1)
  )[0] as any;
  if (!locked || locked.status !== R.POSTED)
    throw new AppError("تعذّر العكس — تغيّرت حالة المرتجع", 409, "STATE_CONFLICT");
  if (!locked.journalEntryId) throw new AppError("لا يوجد قيد لعكسه", 409, "NO_JOURNAL");

  const grn = (
    await tx
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, locked.goodsReceiptId))
      .limit(1)
  )[0] as any;
  const grniLink = await receiptGrniLink(tx, locked.goodsReceiptId);
  const grniAccountId = grniLink?.accountId as string;
  const lines = await loadReturnLines(tx, id);

  // Reverse the GL (mirror: Dr historical receipt debit / Cr GRNI).
  const reversalId = await reverseEntry(tx, locked.journalEntryId, ctx.user.id);

  // Link the reversal GRNI CREDIT mirror per line ('return_reversal') so the
  // return's GRNI clearing nets back and the receipt line becomes returnable again.
  const revLines = (await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, reversalId))
    .orderBy(asc(journalLines.lineNumber))) as any[];
  const grniRevLines = revLines.filter((l) => l.accountId === grniAccountId);
  for (let i = 0; i < lines.length && i < grniRevLines.length; i++) {
    await createGrniLink(tx, {
      goodsReceiptId: locked.goodsReceiptId,
      goodsReceiptLineId: lines[i].goodsReceiptLineId,
      journalLineId: grniRevLines[i].id,
      linkType: "return_reversal",
      expectedAccountId: grniAccountId,
      expectedReversedOf: locked.journalEntryId,
      userId: ctx.user.id,
    });
  }

  // Restore inventory for ITEM lines (one IN movement each) — reversal only ADDS
  // stock back, so it can never drive inventory negative.
  const ts = now();
  for (const l of lines) {
    if (!(l.itemId && l.stockMovementId)) continue;
    const item = (
      await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, l.itemId))
        .for("update")
        .limit(1)
    )[0] as any;
    if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
    const newQty = r2(Number(item.quantity || 0) + Number(l.quantityReturned || 0));
    await tx
      .update(inventoryItems)
      .set({ quantity: newQty, updatedAt: ts })
      .where(eq(inventoryItems.id, l.itemId));
    await tx.insert(stockMovements).values({
      id: genId("MV"),
      itemId: l.itemId,
      warehouseId: item.warehouseId || null,
      type: StockMovementType.IN,
      quantity: Number(l.quantityReturned || 0),
      balanceAfter: newQty,
      sourceType: "purchase_return_reversal",
      sourceId: id,
      reference: `مرتجع ${locked.returnNumber} عكس`,
      date: ts.slice(0, 10),
      notes: `عكس مرتجع مشتريات — ${cleanReason}`,
      createdBy: ctx.user.id,
      createdAt: ts,
    });
  }
  void grn;

  const changed = await tx
    .update(purchaseReturns)
    .set({
      status: R.REVERSED,
      reversalJournalEntryId: reversalId,
      reversedBy: ctx.user.id,
      reversedAt: ts,
      reversalReason: cleanReason,
      updatedAt: ts,
    })
    .where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.status, R.POSTED)))
    .returning({ id: purchaseReturns.id });
  if (changed.length === 0)
    throw new AppError("تعذّر العكس — تغيّرت حالة المرتجع", 409, "STATE_CONFLICT");

  return reversalId;
}

// ------------------------------- reads ----------------------------------

export async function purchaseReturnWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "purchase_return"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(asc(financeWorkflowEvents.createdAt));
}

export async function getPurchaseReturnDetail(id: string) {
  const item = await loadReturn(id);
  if (!item) return null;
  const lines = await loadReturnLines(db as any, id);
  const grn = (
    await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, item.goodsReceiptId)).limit(1)
  )[0] as any;
  const history = await purchaseReturnWorkflowHistory(id);
  return { item, lines, grn: grn ?? null, history };
}

export interface PurchaseReturnFilters {
  status?: string;
  goodsReceiptId?: string;
  supplierId?: string;
  search?: string;
}
export async function listPurchaseReturns(filters: PurchaseReturnFilters & PageParams = {}) {
  const conds: any[] = [];
  if (filters.status) conds.push(eq(purchaseReturns.status, filters.status));
  if (filters.goodsReceiptId)
    conds.push(eq(purchaseReturns.goodsReceiptId, filters.goodsReceiptId));
  if (filters.supplierId) conds.push(eq(purchaseReturns.supplierId, filters.supplierId));
  if (filters.search) {
    const like = `%${filters.search}%`;
    conds.push(
      sql`(${purchaseReturns.returnNumber} ILIKE ${like} OR ${purchaseReturns.reason} ILIKE ${like})`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const pg = resolvePage(filters);
  const rows = await db
    .select({
      id: purchaseReturns.id,
      returnNumber: purchaseReturns.returnNumber,
      goodsReceiptId: purchaseReturns.goodsReceiptId,
      grnNumber: goodsReceipts.grnNumber,
      supplierId: purchaseReturns.supplierId,
      returnDate: purchaseReturns.returnDate,
      status: purchaseReturns.status,
      totalValue: purchaseReturns.totalValue,
      poNumber: purchaseOrders.poNumber,
    })
    .from(purchaseReturns)
    .leftJoin(goodsReceipts, eq(purchaseReturns.goodsReceiptId, goodsReceipts.id))
    .leftJoin(purchaseOrders, eq(purchaseReturns.purchaseOrderId, purchaseOrders.id))
    .where(where)
    .orderBy(desc(purchaseReturns.returnDate), desc(purchaseReturns.returnNumber))
    .limit(pg.pageSize)
    .offset(pg.offset);
  const totalRow = (await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(purchaseReturns)
    .where(where)) as any[];
  return paginatedResult(rows, Number(totalRow[0]?.c || 0), pg);
}

/**
 * Returnable position of a POSTED GRN's lines for the return UI: per line the
 * received / invoiced / returned / still-returnable quantity (received − matched
 * − returned) and remaining GRNI value. Only lines with returnable > 0 by default.
 */
export async function returnableGrnLines(
  dbh: Db,
  goodsReceiptId: string,
  opts: { includeZero?: boolean } = {},
) {
  const grn = (
    await (dbh as any)
      .select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.id, goodsReceiptId))
      .limit(1)
  )[0] as any;
  if (!grn) throw new AppError("سند الاستلام غير موجود", 404, "GRN_NOT_FOUND");
  const lines = (await (dbh as any)
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId))
    .orderBy(asc(goodsReceiptLines.lineNumber))) as any[];
  const out: any[] = [];
  for (const l of lines) {
    const pos = await getGrnLineMatchingPosition(dbh, l.id);
    if (!opts.includeZero && pos.remainingQuantity <= QTY_TOLERANCE) continue;
    out.push({
      goodsReceiptLineId: l.id,
      lineType: l.lineType,
      description: l.description || "",
      itemId: l.itemId ?? null,
      accountId: l.accountId ?? null,
      unitPrice: Number(l.unitPrice || 0),
      receivedQuantity: pos.receivedQuantity,
      invoicedQuantity: pos.activeMatchedQuantity,
      returnedQuantity: pos.activeReturnedQuantity,
      returnableQuantity: pos.remainingQuantity,
      remainingGrniValue: pos.remainingGrniValue,
    });
  }
  return {
    grn: { id: grn.id, grnNumber: grn.grnNumber, supplierId: grn.supplierId, status: grn.status },
    lines: out,
  };
}
