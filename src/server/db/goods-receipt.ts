/**
 * Phase 3D / 3D.1 — governed Goods Receipt (GRN) service, server-authoritative.
 *
 * A GRN receives goods/services against an ISSUED governed Purchase Order. It is
 * a controlled receiving DOCUMENT with a full governance lifecycle
 * (DRAFT→SUBMITTED→APPROVED→POSTED, plus SUBMITTED→DRAFT return,
 * SUBMITTED→REJECTED, POSTED→REVERSED). DRAFT/SUBMITTED/APPROVED have ZERO
 * accounting, GRNI-subledger and inventory effect. Approval is maker-checker-
 * blocked and approve ≠ post; both reuse the SAME certified governance engine as
 * journals/vouchers (evaluateTransition + GRN_TRANSITIONS).
 *
 * ONLY the POST transition, in ONE transaction, atomically books:
 *
 *     Dr  receipt target   (Inventory for ITEM lines · the line's expense/asset/
 *                           any non-protected account for SERVICE/ASSET/EXPENSE/
 *                           OTHER lines)
 *         Cr  GRNI          (Goods Received Not Invoiced — an admin-confirmed
 *                            LIABILITY accrual)
 *
 * and, for ITEM lines only, increments inventory and writes exactly one stock
 * movement per line, and links the aggregated GRNI CREDIT line to the receipt in
 * the GRNI subledger (grni_journal_links, link_type='receipt'). It NEVER credits
 * Accounts Payable, NEVER writes suppliers.balance, NEVER creates
 * supplier_journal_links, and NEVER recognizes Input VAT — the Supplier Invoice
 * remains the sole AP-recognition document.
 *
 * REVERSE unwinds GL, the GRNI subledger (a mirror DEBIT link nets the governed
 * GRNI balance to 0) and inventory — but it can NEVER drive physical inventory
 * negative: stock availability is verified (all-or-nothing, under row locks)
 * BEFORE reverseEntry(); if any ITEM line's current available quantity is below
 * its received quantity the whole reversal is rejected (GRN_STOCK_ALREADY_
 * CONSUMED) with NO accounting reversal, NO GRNI reversal, NO stock movement and
 * NO status change.
 *
 * Governed received quantity is DERIVED by summing POSTED GRN lines (never a
 * competing manually-maintained column). Concurrent posting is serialized on an
 * advisory lock per Purchase Order so a line can never be over-received.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { resolvePage, paginatedResult, type PageParams } from "./pagination";
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
import { failpoint } from "./failpoint";
import { nextCode } from "./numbering";
import { hasPermission } from "./auth";
import {
  postBalancedEntry,
  reverseEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "./gl";
import { resolveConfirmedGrniAccount } from "./account-mapping";
import { accountMappedToAnyCashBank } from "./cash-bank";
import { linkEntryGrniLine, receiptGrniLink } from "./grni-link";
import { grnHasActivePostedInvoice, receiptMatchSummary } from "./invoice-matching";
import { recordWorkflowEvent } from "./finance-workflow";
import { LOCK_NS } from "./lock-namespaces";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  type JournalAction,
} from "@/lib/finance-permissions";
import { GRN_TRANSITIONS } from "@/lib/procurement-permissions";
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
 * Returns a Map(poLineId → receivedQty). Draft/submitted/approved/reversed
 * receipts do NOT count — only POSTED ones affect received-to-date.
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
async function loadGrnLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.goodsReceiptId, id))
    .orderBy(goodsReceiptLines.lineNumber);
}

// ------------------------------- Shared validation ----------------------

interface ResolvedLine {
  pl: any;
  qty: number;
  lineType: string;
  unitPrice: number;
  lineValue: number;
  description: string;
  itemId: string | null;
  costCenterId: string | null;
  /** Debit target actually booked: inventory for ITEM, the PO line account otherwise. */
  debitAccountId: string;
}

/**
 * Full server-side receipt validation, shared by create (draft), submit and post.
 * Never trusts the client for price/target. Resolves each line's debit target and
 * validates over-receive against POSTED receipts. Runs with `db` or a `tx`.
 *
 * `receivedOverride` lets POST pass the received-to-date it recomputed under the
 * PO advisory lock, so the authoritative over-receive fence is the one at POST.
 */
async function resolveReceipt(
  dbh: Db,
  input: GoodsReceiptInput,
  receivedOverride?: Map<string, number>,
): Promise<{ po: any; lines: ResolvedLine[]; totalValue: number }> {
  const po = (
    await dbh
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

  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  let vatId: string | null = null;
  try {
    vatId = await resolveSystemAccountId(dbh as any, SYS.INPUT_VAT);
  } catch {
    vatId = null;
  }
  // GRNI is resolved by system_key only for eligibility protection here (never as
  // a posting dependency — POST resolves the CONFIRMED GRNI separately).
  let grniProtectId: string | null = null;
  try {
    grniProtectId = await resolveSystemAccountId(dbh as any, SYS.GRNI);
  } catch {
    grniProtectId = null;
  }
  const inventoryId = await resolveSystemAccountId(dbh as any, SYS.INVENTORY);

  const poLines = (await dbh
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, po.id))) as any[];
  const poLineMap = new Map(poLines.map((l) => [l.id, l]));
  const received = receivedOverride ?? (await receivedByPoLine(dbh, po.id));

  // Guard against duplicate PO lines within one receipt (would defeat over-receive).
  const perLineQty = new Map<string, number>();
  const lines: ResolvedLine[] = [];
  let totalValue = 0;

  for (const rl of input.lines) {
    const pl = poLineMap.get(rl.poLineId);
    if (!pl) throw new AppError("سطر أمر الشراء غير موجود", 400, "PO_LINE_NOT_FOUND");
    const qty = Number(rl.quantityReceived || 0);
    if (!(qty > 0))
      throw new AppError("الكمية المستلمة يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");

    const priorInThisReceipt = perLineQty.get(pl.id) || 0;
    const alreadyReceived = received.get(pl.id) || 0;
    if (alreadyReceived + priorInThisReceipt + qty > Number(pl.quantity) + QTY_TOLERANCE)
      throw new AppError(
        `الكمية المستلمة للسطر "${pl.description}" تتجاوز المطلوب (المطلوب ${pl.quantity}، المستلم ${alreadyReceived})`,
        409,
        "OVER_RECEIVE",
      );
    perLineQty.set(pl.id, priorInThisReceipt + qty);

    const unitPrice = Number(pl.unitPrice || 0); // server-authoritative (from PO)
    const lineValue = r2(qty * unitPrice);
    totalValue = r2(totalValue + lineValue);
    const lineType = pl.lineType || PurchaseOrderLineType.ITEM;

    let debitAccountId: string;
    if (lineType === PurchaseOrderLineType.ITEM) {
      if (!pl.itemId)
        throw new AppError(
          `سطر صنف بدون صنف مخزني مرتبط — لا يمكن استلامه مخزنياً (${pl.description})`,
          400,
          "RECEIPT_ITEM_REQUIRED",
        );
      const item = (
        await dbh.select().from(inventoryItems).where(eq(inventoryItems.id, pl.itemId)).limit(1)
      )[0] as any;
      if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
      debitAccountId = inventoryId;
    } else {
      // SERVICE / ASSET / EXPENSE / OTHER → debit the PO line's chosen account.
      // Section 17: ANY valid active, postable, non-parent account is eligible —
      // there is NO expense-or-asset-only restriction. Only specifically protected
      // control accounts are rejected: Accounts Payable, GRNI, Input VAT, and any
      // Cashbox/Bank-linked account.
      const accId = pl.accountId;
      if (!accId)
        throw new AppError(
          `سطر غير مخزني بدون حساب استلام — حدّد حساب الاستلام في أمر الشراء (${pl.description})`,
          400,
          "RECEIPT_ACCOUNT_MISSING",
        );
      const acc = (
        await dbh.select().from(accounts).where(eq(accounts.id, accId)).limit(1)
      )[0] as any;
      if (!acc) throw new AppError("حساب الاستلام غير موجود", 400, "RECEIPT_ACCOUNT_NOT_FOUND");
      if (acc.status !== AccountStatus.ACTIVE)
        throw new AppError(`حساب الاستلام ${acc.name} غير نشط`, 400, "RECEIPT_ACCOUNT_INACTIVE");
      if (!acc.postable)
        throw new AppError(
          `حساب الاستلام ${acc.name} رئيسي/غير قابل للترحيل — اختر حساباً فرعياً`,
          400,
          "RECEIPT_ACCOUNT_NOT_POSTABLE",
        );
      if (acc.id === apId || acc.id === grniProtectId || (vatId && acc.id === vatId))
        throw new AppError(
          "حساب الاستلام لا يمكن أن يكون حساب رقابة محمي (ذمم دائنة / GRNI / ضريبة مدخلات)",
          400,
          "RECEIPT_ACCOUNT_IS_CONTROL",
        );
      if (await accountMappedToAnyCashBank(dbh, acc.id))
        throw new AppError(
          "حساب الاستلام لا يمكن أن يكون حساباً مرتبطاً بصندوق/بنك",
          400,
          "RECEIPT_ACCOUNT_IS_CASH_BANK",
        );
      debitAccountId = accId;
    }

    lines.push({
      pl,
      qty,
      lineType,
      unitPrice,
      lineValue,
      description: pl.description || "",
      itemId: pl.itemId ?? null,
      costCenterId: pl.costCenterId ?? null,
      debitAccountId,
    });
  }

  if (!(totalValue > 0))
    throw new AppError("قيمة الاستلام يجب أن تكون أكبر من صفر", 400, "VALUE_INVALID");
  return { po, lines, totalValue };
}

// ------------------------------- Create (DRAFT only) --------------------

/**
 * Create a DRAFT goods receipt. NO General Ledger, NO GRNI subledger, NO
 * inventory effect whatsoever — it only persists the receipt header + lines for
 * governance. Posting happens later through the APPROVED→POSTED transition.
 */
export async function createGoodsReceipt(ctx: Ctx, input: GoodsReceiptInput) {
  const id = genId("GRN");
  const ts = now();
  const receiptDate = input.receiptDate || ts.slice(0, 10);

  const resolved = await resolveReceipt(db, input); // full validation up front

  await db.transaction(async (tx) => {
    await tx.insert(goodsReceipts).values({
      id,
      grnNumber: await nextCode(tx as any, {
        table: "goods_receipts",
        column: "grn_number",
        prefix: "GRN-",
        year: true,
      }),
      purchaseOrderId: resolved.po.id,
      supplierId: resolved.po.supplierId ?? null,
      receiptDate,
      status: G.DRAFT,
      currency: resolved.po.currency,
      totalValue: resolved.totalValue,
      notes: input.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    let lineNo = 0;
    for (const l of resolved.lines) {
      await tx.insert(goodsReceiptLines).values({
        id: genId("GRL"),
        goodsReceiptId: id,
        poLineId: l.pl.id,
        lineNumber: ++lineNo,
        lineType: l.lineType,
        description: l.description,
        itemId: l.itemId,
        accountId: l.debitAccountId,
        quantityReceived: l.qty,
        unitPrice: l.unitPrice,
        lineValue: l.lineValue,
        costCenterId: l.costCenterId,
        stockMovementId: null,
        createdAt: ts,
      });
    }
    await recordWorkflowEvent(tx as any, {
      entityType: "goods_receipt",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: G.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadGrn(id);
  await addAudit({
    action: "GOODS_RECEIPT_CREATED",
    entityType: "goods_receipt",
    entityId: id,
    description: `إنشاء مسودة سند استلام ${created?.grnNumber} لأمر الشراء ${resolved.po.poNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updateGoodsReceipt(ctx: Ctx, id: string, input: GoodsReceiptInput) {
  const existing = await loadGrn(id);
  if (!existing) throw new AppError("سند الاستلام غير موجود", 404, "NOT_FOUND");
  if (existing.status !== G.DRAFT)
    throw new AppError("لا يمكن تعديل السند إلا في حالة المسودة", 409, "NOT_DRAFT");

  const resolved = await resolveReceipt(db, {
    purchaseOrderId: existing.purchaseOrderId,
    lines: input.lines,
  });
  const ts = now();

  await db.transaction(async (tx) => {
    const changed = await tx
      .update(goodsReceipts)
      .set({
        receiptDate: input.receiptDate || existing.receiptDate,
        totalValue: resolved.totalValue,
        notes: input.notes ?? existing.notes ?? "",
        updatedAt: ts,
      })
      .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.status, G.DRAFT)))
      .returning({ id: goodsReceipts.id });
    if (changed.length === 0)
      throw new AppError("تعذّر التعديل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    await tx.delete(goodsReceiptLines).where(eq(goodsReceiptLines.goodsReceiptId, id));
    let lineNo = 0;
    for (const l of resolved.lines) {
      await tx.insert(goodsReceiptLines).values({
        id: genId("GRL"),
        goodsReceiptId: id,
        poLineId: l.pl.id,
        lineNumber: ++lineNo,
        lineType: l.lineType,
        description: l.description,
        itemId: l.itemId,
        accountId: l.debitAccountId,
        quantityReceived: l.qty,
        unitPrice: l.unitPrice,
        lineValue: l.lineValue,
        costCenterId: l.costCenterId,
        stockMovementId: null,
        createdAt: ts,
      });
    }
  });

  await addAudit({
    action: "GOODS_RECEIPT_UPDATED",
    entityType: "goods_receipt",
    entityId: id,
    description: `تعديل مسودة سند الاستلام ${existing.grnNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return loadGrn(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "GOODS_RECEIPT_SUBMITTED",
  approve: "GOODS_RECEIPT_APPROVED",
  return: "GOODS_RECEIPT_RETURNED",
  reject: "GOODS_RECEIPT_REJECTED",
  post: "GOODS_RECEIPT_POSTED",
  reverse: "GOODS_RECEIPT_REVERSED",
  issue: "GOODS_RECEIPT_ISSUE",
  cancel: "GOODS_RECEIPT_CANCELLED",
};

export interface GrnTransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Single choke point for every GRN state change except create and draft edit.
 * Governance via the shared engine + GRN_TRANSITIONS (state → permission →
 * maker≠checker → reason). Only POST books GL/GRNI/inventory; only REVERSE
 * unwinds them (safely). Everything is atomic.
 */
export async function transitionGoodsReceipt(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<GrnTransitionResult> {
  const v = await loadGrn(id);
  if (!v) throw new AppError("سند الاستلام غير موجود", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, GRN_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: GRN_TRANSITIONS,
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
    if (action === "submit") {
      // Revalidate the receipt still makes sense before it leaves the maker.
      const lines = (await loadGrnLines(tx as any, id)) as any[];
      await resolveReceipt(tx as any, {
        purchaseOrderId: v.purchaseOrderId,
        lines: lines.map((l) => ({
          poLineId: l.poLineId,
          quantityReceived: Number(l.quantityReceived),
        })),
      });
      const changed = await tx
        .update(goodsReceipts)
        .set({ status: t.to, submittedBy: ctx.user.id, submittedAt: ts, updatedAt: ts })
        .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.status, t.from)))
        .returning({ id: goodsReceipts.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الإرسال — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else if (action === "post") {
      await postApprovedReceipt(tx, ctx, id);
    } else if (action === "reverse") {
      reversalId = await reversePostedReceipt(tx, ctx, id, cleanReason);
    } else {
      // approve / return / reject — pure guarded status change, ZERO accounting/
      // inventory/GRNI effect.
      const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
      if (action === "approve") {
        cols.approvedBy = ctx.user.id;
        cols.approvedAt = ts;
      }
      if (action === "return") {
        // Returning to DRAFT clears the prior approval trail.
        cols.approvedBy = null;
        cols.approvedAt = null;
        cols.submittedBy = null;
        cols.submittedAt = null;
      }
      const changed = await tx
        .update(goodsReceipts)
        .set(cols)
        .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.status, t.from)))
        .returning({ id: goodsReceipts.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "goods_receipt",
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
    entityType: "goods_receipt",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${v.grnNumber} (${v.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return { item: await loadGrn(id), reversalId };
}

// ------------------------------- POST (APPROVED → POSTED) ---------------

/**
 * Book an APPROVED receipt. Runs inside the transition transaction. Revalidates
 * EVERYTHING at posting time: locks the GRN, confirms it is APPROVED, serializes
 * on the PO advisory lock, recomputes received-to-date, re-checks over-receipt,
 * resolves the CONFIRMED GRNI account, resolves the receipt debit targets, posts
 * the balanced journal, mutates inventory + stock, links the GRNI credit line to
 * the GRNI subledger, and flips the status to POSTED — all atomically.
 */
async function postApprovedReceipt(tx: any, ctx: Ctx, id: string) {
  const locked = (
    await tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).for("update").limit(1)
  )[0] as any;
  if (!locked || locked.status !== G.APPROVED)
    throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
  if (await existingSourceEntryId(tx, "goods_receipt", id))
    throw new AppError("سبق ترحيل هذا الاستلام", 409, "ALREADY_POSTED");

  // Serialize all posting for this PO so concurrent receipts cannot both pass the
  // over-receive check on the same line.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.GRN_POSTING}, hashtext(${locked.purchaseOrderId}))`,
  );

  const storedLines = (await loadGrnLines(tx, id)) as any[];
  // Recompute received-to-date under the lock and revalidate over-receipt + targets.
  const received = await receivedByPoLine(tx, locked.purchaseOrderId);
  const resolved = await resolveReceipt(
    tx,
    {
      purchaseOrderId: locked.purchaseOrderId,
      lines: storedLines.map((l) => ({
        poLineId: l.poLineId,
        quantityReceived: Number(l.quantityReceived),
      })),
    },
    received,
  );

  // The single admin-confirmed GRNI account (system_key + confirmation + valid).
  const grniId = await resolveConfirmedGrniAccount(tx);

  const jLines: any[] = [];
  const ts = now();
  const stockByLine = new Map<string, string>(); // grnLineId → stockMovementId

  // Match resolved lines back to stored line rows by poLineId + order.
  for (let i = 0; i < resolved.lines.length; i++) {
    const rl = resolved.lines[i];
    const stored = storedLines[i];
    let stockMovementId: string | null = null;
    if (rl.lineType === PurchaseOrderLineType.ITEM && rl.itemId) {
      const item = (
        await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, rl.itemId))
          .for("update")
          .limit(1)
      )[0] as any;
      if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
      const newQty = r2(Number(item.quantity || 0) + rl.qty);
      await tx
        .update(inventoryItems)
        .set({ quantity: newQty, updatedAt: ts })
        .where(eq(inventoryItems.id, rl.itemId));
      stockMovementId = genId("MV");
      await tx.insert(stockMovements).values({
        id: stockMovementId,
        itemId: rl.itemId,
        warehouseId: item.warehouseId || null,
        type: StockMovementType.IN,
        quantity: rl.qty,
        balanceAfter: newQty,
        sourceType: "goods_receipt",
        sourceId: id,
        reference: `GRN ${locked.grnNumber}`,
        date: locked.receiptDate,
        notes: `استلام بضاعة — أمر شراء ${resolved.po.poNumber}`,
        createdBy: ctx.user.id,
        createdAt: ts,
      });
      stockByLine.set(stored.id, stockMovementId);
    }
    jLines.push({
      accountId: rl.debitAccountId,
      debit: rl.lineValue,
      costCenterId: rl.costCenterId ?? null,
      description: `استلام — ${rl.description}`.trim(),
    });
  }

  // REL-D failpoint: inventory rows + stock movements have already been mutated
  // in this transaction, but the journal is not yet posted. A failure here must
  // roll back the inventory quantity increments and the stock movements too.
  failpoint("grn.during_inventory");

  // … single aggregated GRNI credit — NEVER Accounts Payable.
  jLines.push({
    accountId: grniId,
    credit: locked.totalValue,
    description: `GRNI — استلام أمر شراء ${resolved.po.poNumber}`,
  });

  const entryId = await postBalancedEntry(tx, {
    date: locked.receiptDate,
    description: `سند استلام ${locked.grnNumber} — أمر شراء ${resolved.po.poNumber}`,
    currency: locked.currency,
    source: "goods_receipt",
    sourceType: "goods_receipt",
    sourceId: id,
    lines: jLines,
    userId: ctx.user.id,
    status: JournalStatus.POSTED,
  });

  // REL-C failpoint: journal is posted; GRNI subledger link not yet written. A
  // failure here must roll back the journal too (no posted GRN without its GRNI
  // link, no GRNI-reconciliation damage).
  failpoint("grn.before_grni_link");

  // Link the GRNI CREDIT line to the receipt in the GRNI subledger.
  await linkEntryGrniLine(tx, {
    goodsReceiptId: id,
    entryId,
    accountId: grniId,
    linkType: "receipt",
    userId: ctx.user.id,
  });

  // Persist the stock movement ids on the ITEM lines.
  for (const [grnLineId, mvId] of stockByLine)
    await tx
      .update(goodsReceiptLines)
      .set({ stockMovementId: mvId })
      .where(eq(goodsReceiptLines.id, grnLineId));

  const changed = await tx
    .update(goodsReceipts)
    .set({
      status: G.POSTED,
      journalEntryId: entryId,
      postedBy: ctx.user.id,
      postedAt: ts,
      updatedAt: ts,
    })
    .where(and(eq(goodsReceipts.id, id), eq(goodsReceipts.status, G.APPROVED)))
    .returning({ id: goodsReceipts.id });
  if (changed.length === 0)
    throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
}

// ------------------------------- REVERSE (POSTED → REVERSED) ------------

/**
 * Reverse a POSTED receipt. CRITICAL invariant: a reversal can NEVER drive
 * physical inventory negative. Order:
 *   1. lock the GRN, confirm POSTED, has a journal
 *   2. lock every affected inventory row FOR UPDATE in deterministic order
 *   3. verify ALL ITEM quantities are removable (all-or-nothing) — if any line's
 *      current available quantity < its received quantity → reject
 *      GRN_STOCK_ALREADY_CONSUMED with NO GL/GRNI/stock/status change
 *   4. reverseEntry() (GL mirror)
 *   5. link the reversal GRNI DEBIT mirror to the SAME receipt (nets to 0)
 *   6. subtract inventory + write one OUT movement per ITEM line
 *   7. set status REVERSED
 * The stock check MUST precede reverseEntry().
 */
async function reversePostedReceipt(
  tx: any,
  ctx: Ctx,
  id: string,
  cleanReason: string,
): Promise<string> {
  const locked = (
    await tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).for("update").limit(1)
  )[0] as any;
  if (!locked || locked.status !== G.POSTED)
    throw new AppError("تعذّر العكس — تغيّرت حالة الاستلام", 409, "STATE_CONFLICT");
  if (!locked.journalEntryId) throw new AppError("لا يوجد قيد لعكسه", 409, "NO_JOURNAL");

  // Phase 3E guard: a receipt whose quantity/value is matched to an ACTIVE POSTED
  // Supplier Invoice must NOT be reversed underneath the payable. The invoice must
  // be reversed first (which releases the matched quantity), then the GRN.
  if (await grnHasActivePostedInvoice(tx, id))
    throw new AppError(
      "لا يمكن عكس سند الاستلام لوجود فاتورة مورد مُرحَّلة مطابِقة له — اعكس الفاتورة أولاً",
      409,
      "GRN_HAS_POSTED_SUPPLIER_INVOICE",
    );

  const grnLines = (await loadGrnLines(tx, id)) as any[];

  // Aggregate the quantity to remove per inventory item (a line reverses only if
  // it actually moved stock on POST — itemId + stockMovementId set).
  const removeByItem = new Map<string, number>();
  for (const gl of grnLines) {
    if (gl.itemId && gl.stockMovementId)
      removeByItem.set(
        gl.itemId,
        (removeByItem.get(gl.itemId) || 0) + Number(gl.quantityReceived || 0),
      );
  }

  // Lock affected inventory rows in a deterministic order (by itemId) to avoid
  // deadlocks, and verify EVERY item is fully removable BEFORE any GL reversal.
  const itemIds = [...removeByItem.keys()].sort();
  const currentQty = new Map<string, { qty: number; warehouseId: string | null }>();
  for (const itemId of itemIds) {
    const item = (
      await tx
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, itemId))
        .for("update")
        .limit(1)
    )[0] as any;
    if (!item) throw new AppError("الصنف المخزني غير موجود", 400, "ITEM_NOT_FOUND");
    currentQty.set(itemId, {
      qty: Number(item.quantity || 0),
      warehouseId: item.warehouseId || null,
    });
  }
  for (const itemId of itemIds) {
    const have = currentQty.get(itemId)!.qty;
    const need = removeByItem.get(itemId)!;
    if (have + QTY_TOLERANCE < need)
      throw new AppError(
        "تعذّر عكس سند الاستلام — الكمية المستلمة استُهلكت جزئياً أو كلياً من المخزون (لا يمكن أن يصبح المخزون سالباً)",
        409,
        "GRN_STOCK_ALREADY_CONSUMED",
      );
  }

  // All checks passed → reverse the GL (mirror: Dr GRNI / Cr receipt targets).
  const reversalId = await reverseEntry(tx, locked.journalEntryId, ctx.user.id);

  // Link the reversal GRNI DEBIT mirror to the SAME receipt (link_type='reversal')
  // so the governed GRNI subledger balance for this receipt nets to 0. Pin the
  // account to the ORIGINAL receipt-link's account so a later mapping change can
  // never mis-target the mirror.
  const orig = await receiptGrniLink(tx, id);
  if (orig)
    await linkEntryGrniLine(tx, {
      goodsReceiptId: id,
      entryId: reversalId,
      accountId: orig.accountId,
      linkType: "reversal",
      userId: ctx.user.id,
    });

  // Subtract inventory + one offsetting OUT movement per ITEM line.
  const ts = now();
  for (const gl of grnLines) {
    if (!(gl.itemId && gl.stockMovementId)) continue;
    const before = currentQty.get(gl.itemId)!.qty;
    const newQty = r2(before - Number(gl.quantityReceived || 0));
    currentQty.set(gl.itemId, { ...currentQty.get(gl.itemId)!, qty: newQty });
    await tx
      .update(inventoryItems)
      .set({ quantity: newQty, updatedAt: ts })
      .where(eq(inventoryItems.id, gl.itemId));
    await tx.insert(stockMovements).values({
      id: genId("MV"),
      itemId: gl.itemId,
      warehouseId: currentQty.get(gl.itemId)!.warehouseId,
      type: StockMovementType.OUT,
      quantity: Number(gl.quantityReceived || 0),
      balanceAfter: newQty,
      sourceType: "goods_receipt_reversal",
      sourceId: id,
      reference: `GRN ${locked.grnNumber} عكس`,
      date: ts.slice(0, 10),
      notes: `عكس استلام — ${cleanReason}`,
      createdBy: ctx.user.id,
      createdAt: ts,
    });
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

  return reversalId;
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
  // Phase 3E — derived matched/invoiced value (never a stored balance).
  let matchSummary: any = null;
  if (item.status === G.POSTED || item.status === G.REVERSED)
    matchSummary = await receiptMatchSummary(db, id);
  return { item, lines, history, po, supplier, matchSummary };
}

export interface GoodsReceiptFilters {
  status?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/** Shared WHERE for the GRN list + summary — filters in SQL, not JS. */
function goodsReceiptWhere(filters: GoodsReceiptFilters) {
  const conds: any[] = [];
  if (filters.status) conds.push(eq(goodsReceipts.status, filters.status));
  if (filters.purchaseOrderId)
    conds.push(eq(goodsReceipts.purchaseOrderId, filters.purchaseOrderId));
  if (filters.supplierId) conds.push(eq(goodsReceipts.supplierId, filters.supplierId));
  if (filters.dateFrom) conds.push(gte(goodsReceipts.receiptDate, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(goodsReceipts.receiptDate, filters.dateTo));
  const q = (filters.search || "").trim();
  if (q) conds.push(sql`${goodsReceipts.grnNumber} ILIKE ${`%${q}%`}`);
  return conds.length ? and(...conds) : undefined;
}

/**
 * Phase 4A — bounded, SQL-filtered GRN list. Status counts + posted GRNI value
 * computed over the full filtered set (SQL FILTER); only the page is
 * materialized. `{ items, summary }` preserved; page fields added.
 */
export async function listGoodsReceipts(filters: GoodsReceiptFilters & PageParams = {}) {
  const pg = resolvePage(filters);
  const where = goodsReceiptWhere(filters);
  const agg = (
    await (db as any)
      .select({
        total: sql<number>`COUNT(*)`,
        draft: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.DRAFT})`,
        submitted: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.SUBMITTED})`,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.APPROVED})`,
        posted: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.POSTED})`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.REJECTED})`,
        reversed: sql<number>`COUNT(*) FILTER (WHERE ${goodsReceipts.status} = ${G.REVERSED})`,
        grniValue: sql<number>`COALESCE(SUM(${goodsReceipts.totalValue}) FILTER (WHERE ${goodsReceipts.status} = ${G.POSTED}), 0)`,
      })
      .from(goodsReceipts)
      .where(where)
  )[0] as any;
  const summary = {
    total: Number(agg?.total || 0),
    draft: Number(agg?.draft || 0),
    submitted: Number(agg?.submitted || 0),
    approved: Number(agg?.approved || 0),
    posted: Number(agg?.posted || 0),
    rejected: Number(agg?.rejected || 0),
    reversed: Number(agg?.reversed || 0),
    grniValue: Number(agg?.grniValue || 0),
  };
  const items = (await (db as any)
    .select()
    .from(goodsReceipts)
    .where(where)
    .orderBy(desc(goodsReceipts.createdAt))
    .limit(pg.limit)
    .offset(pg.offset)) as any[];
  return { ...paginatedResult(items, summary.total, pg), items, summary };
}
