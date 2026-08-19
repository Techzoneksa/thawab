/**
 * Phase 3B — Supplier Invoice (فاتورة مورد) service, server-authoritative.
 *
 * A Supplier Invoice is a controlled financial DOCUMENT recording what we owe a
 * supplier for goods/services received. Its header and lines are NOT accounting
 * truth: only POSTING creates the certified accrual journal
 *
 *     Dr  expense / asset        (each line's net)
 *     Dr  input VAT              (recoverable, if any tax)
 *         Cr  accounts payable   (gross total)
 *
 * and links the AP CREDIT line to the supplier subledger (supplier_journal_links)
 * so the supplier payable rises automatically. The General Ledger stays the only
 * accounting source of truth; suppliers.balance is never read or written here.
 *
 * Reuse (never duplicated):
 *   - governance decisions  → evaluateTransition + SUPPLIER_INVOICE_TRANSITIONS
 *   - workflow history      → recordWorkflowEvent (finance_workflow_events)
 *   - posting / reversal    → the certified Phase 1A engine (gl.ts)
 *   - period guard          → free via postBalancedEntry → resolvePostingPeriod
 *   - numbering             → nextCode (advisory-locked, concurrency-safe)
 *   - AP subledger link     → linkEntryApLine (Phase 3A) — for both the invoice
 *                             AP credit and the reversal-mirror AP debit
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  supplierInvoices,
  supplierInvoiceLines,
  supplierInvoiceGrnAllocations,
  suppliers,
  accounts,
  goodsReceipts,
  goodsReceiptLines,
  grniJournalLinks,
  journalEntries,
  journalLines,
  financeWorkflowEvents,
} from "./schema";
import { hasPermission } from "./auth";
import { AppError } from "./errors";
import { nextCode } from "./numbering";
import {
  postBalancedEntry,
  reverseEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "./gl";
import { accountMappedToAnyCashBank } from "./cash-bank";
import { resolveConfirmedInputVatAccount } from "./account-mapping";
import { linkEntryApLine } from "./supplier";
import { createGrniLink, receiptGrniLink } from "./grni-link";
import { matchedQtyByGrnLine, invoiceAllocations } from "./invoice-matching";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  SUPPLIER_INVOICE_TRANSITIONS,
  type JournalAction,
} from "@/lib/finance-permissions";
import {
  SupplierInvoiceStatus,
  GoodsReceiptStatus,
  AccountStatus,
  SupplierStatus,
  JournalStatus,
} from "@/lib/enums";
import type { Ctx } from "./api-utils";

/** Supplier-invoice line accounting mode. */
export const INVOICE_LINE_MODE = { DIRECT: "direct", GRN_MATCHED: "grn_matched" } as const;
const QTY_TOLERANCE = 0.0001;

const AMOUNT_TOLERANCE = 0.005;
/** Round to 2 decimals (halala precision) so line arithmetic stays exact. */
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Db = { select: (...a: any[]) => any };

export interface SupplierInvoiceLineInput {
  /** 'direct' (Phase 3B) or 'grn_matched' (clears a posted GRN line's GRNI). */
  accountingMode?: "direct" | "grn_matched";
  /** DIRECT: the chosen expense/asset/liability debit account. Ignored for matched. */
  accountId?: string;
  /** GRN_MATCHED: the posted governed GRN line this line clears. */
  goodsReceiptLineId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number; // percent, e.g. 15
  costCenterId?: string | null;
}

/** Immutable matching evidence for a GRN_MATCHED line (no money stored here). */
export interface LineAllocation {
  goodsReceiptId: string;
  goodsReceiptLineId: string;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  matchedQuantity: number;
  /** The GRN's ACTUAL posted GRNI account (may differ from today's mapping). */
  grniAccountId: string;
}
export interface SupplierInvoiceInput {
  supplierId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency?: string;
  externalReference?: string | null;
  description?: string;
  notes?: string;
  lines: SupplierInvoiceLineInput[];
}

interface ComputedLine {
  accountingMode: "direct" | "grn_matched";
  /** Effective debit target actually posted (GRNI account for matched lines). */
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
  allocation: LineAllocation | null;
}
interface Computed {
  lines: ComputedLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/** Normalized supplier document number for duplicate detection (upper + trim). */
function normalizeDocNumber(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/**
 * Full server-side validation + resolution shared by create, update, submit and
 * post. Never trusts client numbers. Each line's net/tax/gross are recomputed
 * from quantity·unit_price·tax_rate; the header sums are recomputed.
 *
 * DIRECT lines (Phase 3B): the chosen debit must exist/active/postable/non-parent
 * and NOT be AP, the input-VAT control, or a cashbox/bank-mapped account
 * (classification is otherwise unrestricted).
 *
 * GRN_MATCHED lines (Phase 3E): reference a POSTED governed GRN line of the SAME
 * supplier; the debit is server-resolved to the receipt's ACTUAL posted GRNI
 * account (never client-chosen, never today's mapping if it changed). The line net
 * must EXACTLY equal the receipt value being cleared (else
 * PURCHASE_PRICE_VARIANCE_UNSUPPORTED), and the matched quantity must not exceed
 * the GRN line's remaining invoiceable quantity (derived from posted GRN qty − Σ
 * matched over active posted invoices), counting other matched lines in this same
 * invoice.
 *
 * `opts.invoiceId` excludes this invoice's own active allocations from the
 * remaining-quantity derivation (used when revalidating under lock at post).
 */
export async function validateInvoice(
  dbh: Db,
  input: SupplierInvoiceInput,
  opts: { invoiceId?: string } = {},
): Promise<Computed> {
  const sup = (
    await dbh.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1)
  )[0];
  if (!sup) throw new AppError("المورد غير موجود", 404, "SUPPLIER_NOT_FOUND");
  if (sup.status !== SupplierStatus.ACTIVE)
    throw new AppError("المورد غير نشط — لا يمكن تسجيل فاتورة له", 400, "SUPPLIER_INACTIVE");

  if (!normalizeDocNumber(input.supplierInvoiceNumber))
    throw new AppError("رقم فاتورة المورد مطلوب", 400, "SUPPLIER_INVOICE_NUMBER_REQUIRED");

  if (!input.invoiceDate) throw new AppError("تاريخ الفاتورة مطلوب", 400, "INVOICE_DATE_REQUIRED");
  if (input.dueDate && input.dueDate < input.invoiceDate)
    throw new AppError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة", 400, "DUE_BEFORE_INVOICE");

  if (!input.lines || input.lines.length < 1)
    throw new AppError("يجب إضافة سطر واحد على الأقل", 400, "NO_LINES");

  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  // Current system_key='input_vat' holder (may be UNCONFIRMED) — used ONLY to
  // prohibit it as a manual DIRECT allocation line.
  let vatId: string | null = null;
  try {
    vatId = await resolveSystemAccountId(dbh as any, SYS.INPUT_VAT);
  } catch {
    vatId = null;
  }

  const computedLines: ComputedLine[] = [];
  // Accumulate matched quantity per GRN line WITHIN this invoice so two matched
  // lines targeting the same GRN line cannot jointly over-invoice it.
  const priorInThisInvoice = new Map<string, number>();

  for (const l of input.lines) {
    const quantity = Number(l.quantity || 0);
    const unitPrice = Number(l.unitPrice || 0);
    const taxRate = Number(l.taxRate || 0);
    if (!(quantity > 0)) throw new AppError("الكمية يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");
    if (!(unitPrice > 0))
      throw new AppError("سعر الوحدة يجب أن يكون أكبر من صفر", 400, "PRICE_INVALID");
    if (taxRate < 0 || taxRate > 100)
      throw new AppError("نسبة الضريبة غير صالحة", 400, "TAX_RATE_INVALID");

    const lineSubtotal = r2(quantity * unitPrice);
    const taxAmount = r2((lineSubtotal * taxRate) / 100);
    const lineTotal = r2(lineSubtotal + taxAmount);
    const mode = l.accountingMode === INVOICE_LINE_MODE.GRN_MATCHED ? "grn_matched" : "direct";

    let effectiveAccountId: string;
    let allocation: LineAllocation | null = null;

    if (mode === "direct") {
      const accId = l.accountId;
      if (!accId) throw new AppError("حساب السطر مطلوب", 400, "DEBIT_ACCOUNT_REQUIRED");
      const acc = (await dbh.select().from(accounts).where(eq(accounts.id, accId)).limit(1))[0];
      if (!acc) throw new AppError("حساب السطر غير موجود", 400, "DEBIT_ACCOUNT_NOT_FOUND");
      if (acc.status !== AccountStatus.ACTIVE)
        throw new AppError(`الحساب ${acc.name} غير نشط`, 400, "DEBIT_ACCOUNT_INACTIVE");
      if (!acc.postable)
        throw new AppError(
          `الحساب ${acc.name} رئيسي/غير قابل للترحيل — اختر حساباً فرعياً`,
          400,
          "DEBIT_ACCOUNT_NOT_POSTABLE",
        );
      if (acc.id === apId)
        throw new AppError(
          "لا يمكن أن يكون سطر الفاتورة على حساب الذمم الدائنة (يُنشأ آلياً كطرف دائن)",
          400,
          "DEBIT_IS_AP",
        );
      if (vatId && acc.id === vatId)
        throw new AppError(
          "لا يمكن اختيار حساب ضريبة المدخلات كسطر — تُحتسب الضريبة آلياً من نسبة الضريبة",
          400,
          "DEBIT_IS_INPUT_VAT",
        );
      // A DIRECT allocation may debit ANY valid posting account (expense, asset, or
      // a normal liability). Only the control accounts above + cash/bank-mapped are
      // prohibited.
      if (await accountMappedToAnyCashBank(dbh, accId))
        throw new AppError(
          "لا يمكن أن يكون سطر الفاتورة حساباً مرتبطاً بصندوق/بنك",
          400,
          "DEBIT_IS_CASH_BANK",
        );
      effectiveAccountId = accId;
    } else {
      // GRN_MATCHED — clears a posted governed GRN line's GRNI.
      if (!l.goodsReceiptLineId)
        throw new AppError("سطر الاستلام مطلوب للمطابقة", 400, "GRN_LINE_REQUIRED");
      const grnLine = (
        await dbh
          .select()
          .from(goodsReceiptLines)
          .where(eq(goodsReceiptLines.id, l.goodsReceiptLineId))
          .limit(1)
      )[0];
      if (!grnLine) throw new AppError("سطر الاستلام غير موجود", 400, "GRN_LINE_NOT_FOUND");
      const grn = (
        await dbh
          .select()
          .from(goodsReceipts)
          .where(eq(goodsReceipts.id, grnLine.goodsReceiptId))
          .limit(1)
      )[0];
      if (!grn) throw new AppError("سند الاستلام غير موجود", 400, "GRN_NOT_FOUND");
      if (grn.status === GoodsReceiptStatus.REVERSED)
        throw new AppError("سند الاستلام معكوس — لا يمكن مطابقته", 409, "GRN_REVERSED");
      if (grn.status !== GoodsReceiptStatus.POSTED)
        throw new AppError(
          "لا يمكن المطابقة إلا مع سند استلام مُرحَّل (POSTED)",
          409,
          "GRN_NOT_POSTED",
        );
      if (grn.supplierId !== input.supplierId)
        throw new AppError(
          "لا يمكن مطابقة فاتورة مع سند استلام لمورد آخر",
          409,
          "SUPPLIER_MISMATCH",
        );

      // The receipt's ACTUAL posted GRNI account — never today's mapping if changed.
      const link = await receiptGrniLink(dbh, grn.id);
      if (!link) throw new AppError("لا يوجد ربط GRNI لسند الاستلام", 409, "GRNI_LINK_MISSING");
      const grniAccountId = link.accountId as string;

      // Remaining invoiceable = received − already matched (active posted, excl this
      // invoice) − other matched lines to the same GRN line in THIS invoice.
      const matched = await matchedQtyByGrnLine(dbh, [grnLine.id], {
        excludeInvoiceId: opts.invoiceId,
      });
      const already = (matched.get(grnLine.id) || 0) + (priorInThisInvoice.get(grnLine.id) || 0);
      const received = Number(grnLine.quantityReceived || 0);
      if (already + quantity > received + QTY_TOLERANCE)
        throw new AppError(
          `الكمية المطابَقة تتجاوز المتبقّي القابل للفوترة من الاستلام (المستلم ${received}، المفوتر ${already})`,
          409,
          "OVER_INVOICED_RECEIPT",
        );
      priorInThisInvoice.set(grnLine.id, (priorInThisInvoice.get(grnLine.id) || 0) + quantity);

      // Exact-match: the invoice net for the matched quantity must equal the GRNI
      // value being cleared (matched qty × receipt unit price). No price variance.
      const clearable = r2(quantity * Number(grnLine.unitPrice || 0));
      if (Math.abs(lineSubtotal - clearable) > AMOUNT_TOLERANCE)
        throw new AppError(
          `قيمة السطر (${lineSubtotal}) لا تساوي قيمة الاستلام المطابَقة (${clearable}) — فروق الأسعار غير مدعومة في هذه المرحلة`,
          409,
          "PURCHASE_PRICE_VARIANCE_UNSUPPORTED",
        );

      effectiveAccountId = grniAccountId;
      allocation = {
        goodsReceiptId: grn.id,
        goodsReceiptLineId: grnLine.id,
        purchaseOrderId: grn.purchaseOrderId ?? null,
        purchaseOrderLineId: grnLine.poLineId ?? null,
        matchedQuantity: quantity,
        grniAccountId,
      };
    }

    computedLines.push({
      accountingMode: mode,
      accountId: effectiveAccountId,
      description: l.description ?? "",
      quantity,
      unitPrice,
      taxRate,
      lineSubtotal,
      taxAmount,
      lineTotal,
      costCenterId: l.costCenterId ?? null,
      allocation,
    });
  }

  const subtotal = r2(computedLines.reduce((s, l) => s + l.lineSubtotal, 0));
  const taxAmount = r2(computedLines.reduce((s, l) => s + l.taxAmount, 0));
  const totalAmount = r2(subtotal + taxAmount);
  if (!(totalAmount > 0))
    throw new AppError("إجمالي الفاتورة يجب أن يكون أكبر من صفر", 400, "AMOUNT_INVALID");

  // Taxable invoices require an EXPLICITLY CONFIRMED, still-valid Input VAT account
  // (INPUT_VAT_ACCOUNT_MISSING / INPUT_VAT_MAPPING_UNCONFIRMED). VAT is NOT part of
  // GRNI receipt value — it always gets its own debit leg.
  if (taxAmount > AMOUNT_TOLERANCE) {
    await resolveConfirmedInputVatAccount(dbh);
  }

  return { lines: computedLines, subtotal, taxAmount, totalAmount };
}

async function loadInvoice(id: string) {
  const v = (
    await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).limit(1)
  )[0];
  return v ?? null;
}
async function loadLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(supplierInvoiceLines)
    .where(eq(supplierInvoiceLines.supplierInvoiceId, id))
    .orderBy(supplierInvoiceLines.lineNumber);
}
/** Persisted allocations for an invoice, keyed by supplier_invoice_line_id. */
async function loadAllocations(dbh: Db, id: string): Promise<Map<string, any>> {
  const rows = (await (dbh as any)
    .select()
    .from(supplierInvoiceGrnAllocations)
    .where(eq(supplierInvoiceGrnAllocations.supplierInvoiceId, id))) as any[];
  const map = new Map<string, any>();
  for (const r of rows) map.set(r.supplierInvoiceLineId, r);
  return map;
}

/**
 * Map persisted lines (+ their allocations) back to the input shape for
 * re-validation at submit/post. DIRECT lines carry their account; GRN_MATCHED
 * lines carry their goods_receipt_line_id (from the allocation) so the receipt is
 * re-resolved and re-checked under lock.
 */
function linesToInput(inv: any, lines: any[], allocs: Map<string, any>): SupplierInvoiceInput {
  return {
    supplierId: inv.supplierId,
    supplierInvoiceNumber: inv.supplierInvoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    lines: lines.map((l) => {
      const alloc = allocs.get(l.id);
      const matched = l.accountingMode === INVOICE_LINE_MODE.GRN_MATCHED;
      return {
        accountingMode: matched ? "grn_matched" : "direct",
        accountId: matched ? undefined : l.accountId,
        goodsReceiptLineId: matched ? (alloc?.goodsReceiptLineId ?? undefined) : undefined,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        costCenterId: l.costCenterId,
      } as SupplierInvoiceLineInput;
    }),
  };
}

/** Persist invoice lines + matching allocations (draft create/update). */
async function persistLinesAndAllocations(
  tx: any,
  ctx: Ctx,
  invoiceId: string,
  computed: Computed,
  ts: string,
) {
  let n = 0;
  for (const l of computed.lines) {
    const lineId = genId("SIL");
    await tx.insert(supplierInvoiceLines).values({
      id: lineId,
      supplierInvoiceId: invoiceId,
      lineNumber: ++n,
      description: l.description,
      accountingMode: l.accountingMode,
      accountId: l.accountId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineSubtotal: l.lineSubtotal,
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
      costCenterId: l.costCenterId,
      createdAt: ts,
    });
    if (l.allocation) {
      await tx.insert(supplierInvoiceGrnAllocations).values({
        id: genId("SIGA"),
        supplierInvoiceId: invoiceId,
        supplierInvoiceLineId: lineId,
        goodsReceiptId: l.allocation.goodsReceiptId,
        goodsReceiptLineId: l.allocation.goodsReceiptLineId,
        purchaseOrderId: l.allocation.purchaseOrderId,
        purchaseOrderLineId: l.allocation.purchaseOrderLineId,
        matchedQuantity: l.allocation.matchedQuantity,
        createdBy: ctx.user.id,
        createdAt: ts,
      });
    }
  }
}

// ------------------------------- Create --------------------------------

export async function createSupplierInvoice(ctx: Ctx, input: SupplierInvoiceInput) {
  const computed = await validateInvoice(db, input); // full validation up front
  const normDoc = normalizeDocNumber(input.supplierInvoiceNumber);

  // Friendly duplicate check (the DB unique index is the hard backstop).
  const dup = (
    await db
      .select({ id: supplierInvoices.id, number: supplierInvoices.invoiceNumber })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, input.supplierId),
          eq(supplierInvoices.supplierInvoiceNumberNormalized, normDoc),
        ),
      )
      .limit(1)
  )[0];
  if (dup)
    throw new AppError(
      `فاتورة بهذا الرقم مسجّلة لهذا المورد بالفعل (${dup.number})`,
      409,
      "DUPLICATE_SUPPLIER_INVOICE",
    );

  const id = genId("SINV");
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    const number = await nextCode(tx as any, {
      table: "supplier_invoices",
      column: "invoice_number",
      prefix: "SI-",
      year: true,
    });
    await tx.insert(supplierInvoices).values({
      id,
      invoiceNumber: number,
      supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
      supplierInvoiceNumberNormalized: normDoc,
      supplierId: input.supplierId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate ?? null,
      status: SupplierInvoiceStatus.DRAFT,
      currency: cur,
      subtotal: computed.subtotal,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      externalReference: input.externalReference ?? null,
      description: input.description ?? "",
      notes: input.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await persistLinesAndAllocations(tx, ctx, id, computed, ts);
    await recordWorkflowEvent(tx as any, {
      entityType: "supplier_invoice",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: SupplierInvoiceStatus.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadInvoice(id);
  await addAudit({
    action: "SUPPLIER_INVOICE_CREATED",
    entityType: "supplier_invoice",
    entityId: id,
    description: `إنشاء فاتورة مورد ${created?.invoiceNumber} — ${input.supplierInvoiceNumber} بمبلغ ${computed.totalAmount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updateSupplierInvoice(ctx: Ctx, id: string, input: SupplierInvoiceInput) {
  const v = await loadInvoice(id);
  if (!v) throw new AppError("فاتورة المورد غير موجودة", 404, "NOT_FOUND");
  if (v.status !== SupplierInvoiceStatus.DRAFT)
    throw new AppError("لا يمكن تعديل الفاتورة إلا في حالة المسودة", 409, "NOT_DRAFT");

  const computed = await validateInvoice(db, input);
  const normDoc = normalizeDocNumber(input.supplierInvoiceNumber);

  const dup = (
    await db
      .select({ id: supplierInvoices.id, number: supplierInvoices.invoiceNumber })
      .from(supplierInvoices)
      .where(
        and(
          eq(supplierInvoices.supplierId, input.supplierId),
          eq(supplierInvoices.supplierInvoiceNumberNormalized, normDoc),
        ),
      )
      .limit(1)
  )[0];
  if (dup && dup.id !== id)
    throw new AppError(
      `فاتورة بهذا الرقم مسجّلة لهذا المورد بالفعل (${dup.number})`,
      409,
      "DUPLICATE_SUPPLIER_INVOICE",
    );

  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(supplierInvoices)
      .set({
        supplierInvoiceNumber: input.supplierInvoiceNumber.trim(),
        supplierInvoiceNumberNormalized: normDoc,
        supplierId: input.supplierId,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        currency: cur,
        subtotal: computed.subtotal,
        taxAmount: computed.taxAmount,
        totalAmount: computed.totalAmount,
        externalReference: input.externalReference ?? null,
        description: input.description ?? "",
        notes: input.notes ?? "",
        updatedAt: ts,
      })
      .where(
        and(eq(supplierInvoices.id, id), eq(supplierInvoices.status, SupplierInvoiceStatus.DRAFT)),
      );
    // Allocations cascade-delete with their lines; delete lines then reinsert both.
    await tx
      .delete(supplierInvoiceGrnAllocations)
      .where(eq(supplierInvoiceGrnAllocations.supplierInvoiceId, id));
    await tx.delete(supplierInvoiceLines).where(eq(supplierInvoiceLines.supplierInvoiceId, id));
    await persistLinesAndAllocations(tx, ctx, id, computed, ts);
  });

  await addAudit({
    action: "SUPPLIER_INVOICE_UPDATED",
    entityType: "supplier_invoice",
    entityId: id,
    description: `تعديل مسودة فاتورة المورد ${v.invoiceNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ totalAmount: v.totalAmount }),
    ip: ctx.ip,
  });
  return loadInvoice(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "SUPPLIER_INVOICE_SUBMITTED",
  approve: "SUPPLIER_INVOICE_APPROVED",
  return: "SUPPLIER_INVOICE_RETURNED",
  reject: "SUPPLIER_INVOICE_REJECTED",
  post: "SUPPLIER_INVOICE_POSTED",
  reverse: "SUPPLIER_INVOICE_REVERSED",
  issue: "SUPPLIER_INVOICE_ISSUE",
  cancel: "SUPPLIER_INVOICE_CANCELLED",
};

export interface SupplierInvoiceTransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Single choke point for every supplier-invoice state change (except create and
 * draft edit). Governance via the shared engine + SUPPLIER_INVOICE_TRANSITIONS;
 * posting/reversal via the certified GL engine. Posting accrues
 * Dr expense/asset + Dr input VAT / Cr AP and attributes the AP credit to the
 * supplier subledger; reversal mirrors it and re-links the mirror AP debit so the
 * subledger nets — all atomic.
 */
export async function transitionSupplierInvoice(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<SupplierInvoiceTransitionResult> {
  const v = await loadInvoice(id);
  if (!v) throw new AppError("فاتورة المورد غير موجودة", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, SUPPLIER_INVOICE_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: SUPPLIER_INVOICE_TRANSITIONS,
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
      const lines = await loadLines(tx as any, id);
      const allocs = await loadAllocations(tx as any, id);
      await validateInvoice(tx as any, linesToInput(v, lines, allocs), { invoiceId: id });
      const changed = await tx
        .update(supplierInvoices)
        .set({ status: t.to, submittedBy: ctx.user.id, submittedAt: ts, updatedAt: ts })
        .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.status, t.from)))
        .returning({ id: supplierInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الإرسال — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    } else if (action === "post") {
      // Row lock + status guard (idempotent — no double posting).
      const locked = (
        await tx
          .select()
          .from(supplierInvoices)
          .where(eq(supplierInvoices.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== SupplierInvoiceStatus.APPROVED)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
      if (await existingSourceEntryId(tx as any, "supplier_invoice", id))
        throw new AppError("سبق ترحيل هذه الفاتورة", 409, "ALREADY_POSTED");

      const lines = await loadLines(tx as any, id);
      const allocs = await loadAllocations(tx as any, id);

      // Concurrency fence: lock every matched GRN line FOR UPDATE in a deterministic
      // order (by id) BEFORE recomputing invoiceable quantity, so two invoices can
      // never jointly over-invoice the same receipt line. Recompute + re-check +
      // exact-match + historical GRNI resolution all happen under these locks.
      const grnLineIds = [
        ...new Set(
          [...allocs.values()].map((a: any) => a.goodsReceiptLineId).filter(Boolean) as string[],
        ),
      ].sort();
      for (const glId of grnLineIds)
        await tx
          .select({ id: goodsReceiptLines.id })
          .from(goodsReceiptLines)
          .where(eq(goodsReceiptLines.id, glId))
          .for("update")
          .limit(1);

      const computed = await validateInvoice(tx as any, linesToInput(locked, lines, allocs), {
        invoiceId: id,
      });

      const apId = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_PAYABLE);
      const desc =
        `فاتورة مورد ${locked.invoiceNumber} — ${locked.supplierInvoiceNumber || ""}`.trim();

      // One debit leg per line, in computed order (so posted line N ↔ computed line
      // N). DIRECT → the chosen expense/asset. GRN_MATCHED → the receipt's ACTUAL
      // GRNI account (clears GRNI; NEVER re-debits inventory/expense).
      const jLines: any[] = computed.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.lineSubtotal,
        costCenterId: l.costCenterId ?? null,
        description: l.description || desc,
      }));
      // … Dr recoverable input VAT (single aggregated leg) — the CONFIRMED account.
      // VAT is NOT part of GRNI value; it always gets its own leg.
      if (computed.taxAmount > AMOUNT_TOLERANCE) {
        const vatId = await resolveConfirmedInputVatAccount(tx as any);
        jLines.push({
          accountId: vatId,
          debit: computed.taxAmount,
          description: `ضريبة مدخلات — ${desc}`,
        });
      }
      // … Cr accounts payable (gross) — the supplier-attributed leg.
      jLines.push({ accountId: apId, credit: computed.totalAmount, description: desc });

      const entryId = await postBalancedEntry(tx as any, {
        date: locked.invoiceDate,
        description: desc,
        currency: locked.currency,
        source: "supplier_invoice",
        sourceType: "supplier_invoice",
        sourceId: id,
        lines: jLines,
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });

      // Attribute the AP CREDIT line to the supplier subledger (payable rises).
      await linkEntryApLine(tx as any, {
        supplierId: locked.supplierId,
        entryId,
        sourceType: "supplier_invoice",
        userId: ctx.user.id,
      });

      // Link each matched line's GRNI DEBIT journal line back to its GRN (clears the
      // receipt's GRNI subledger). Posted line N ↔ computed line N (lineNumber N+1),
      // so each matched allocation attaches to its OWN distinct GRNI line — no
      // ambiguity (journal_line_id UNIQUE).
      const postedLines = (await tx
        .select()
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, entryId))
        .orderBy(asc(journalLines.lineNumber))) as any[];
      // Rebuild the same line→allocation order to pair posted lines to allocations.
      const orderedInvoiceLines = lines; // already ordered by lineNumber
      for (let i = 0; i < computed.lines.length; i++) {
        const cl = computed.lines[i];
        if (cl.accountingMode !== "grn_matched") continue;
        const invLine = orderedInvoiceLines[i];
        const alloc = allocs.get(invLine.id);
        if (!alloc) continue;
        await createGrniLink(tx as any, {
          goodsReceiptId: alloc.goodsReceiptId,
          goodsReceiptLineId: alloc.goodsReceiptLineId,
          journalLineId: postedLines[i].id, // the matched line's own GRNI debit
          linkType: "invoice",
          expectedAccountId: cl.accountId,
          userId: ctx.user.id,
        });
      }

      const changed = await tx
        .update(supplierInvoices)
        .set({
          status: SupplierInvoiceStatus.POSTED,
          journalEntryId: entryId,
          postedBy: ctx.user.id,
          postedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(
            eq(supplierInvoices.id, id),
            eq(supplierInvoices.status, SupplierInvoiceStatus.APPROVED),
          ),
        )
        .returning({ id: supplierInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    } else if (action === "reverse") {
      const locked = (
        await tx
          .select()
          .from(supplierInvoices)
          .where(eq(supplierInvoices.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== SupplierInvoiceStatus.POSTED)
        throw new AppError("تعذّر العكس — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
      if (!locked.journalEntryId)
        throw new AppError("لا يوجد قيد مُرحَّل لعكسه", 409, "NO_JOURNAL");
      reversalId = await reverseEntry(tx as any, locked.journalEntryId, ctx.user.id);
      // REV-C: attribute the reversal-mirror AP DEBIT line to the SAME supplier so
      // the subledger nets against the original AP credit (certified GL states
      // keep the reversed original counted).
      await linkEntryApLine(tx as any, {
        supplierId: locked.supplierId,
        entryId: reversalId,
        sourceType: "supplier_invoice_reversal",
        userId: ctx.user.id,
      });

      // Re-establish GRNI for every matched receipt: each original GRNI DEBIT line
      // this invoice posted becomes a GRNI CREDIT in the reversal (same account,
      // same line number — reverseEntry is order-preserving). Link that mirror to
      // the SAME GRN so the receipt's GRNI subledger nets back to its credited value.
      const origLinks = (await tx
        .select({
          goodsReceiptId: grniJournalLinks.goodsReceiptId,
          goodsReceiptLineId: grniJournalLinks.goodsReceiptLineId,
          accountId: journalLines.accountId,
          lineNumber: journalLines.lineNumber,
        })
        .from(grniJournalLinks)
        .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
        .where(
          and(
            eq(journalLines.journalEntryId, locked.journalEntryId),
            eq(grniJournalLinks.linkType, "invoice"),
          ),
        )) as any[];
      if (origLinks.length) {
        const revLines = (await tx
          .select()
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, reversalId))
          .orderBy(asc(journalLines.lineNumber))) as any[];
        const revByNumber = new Map<number, any>();
        for (const rl of revLines) revByNumber.set(Number(rl.lineNumber), rl);
        for (const link of origLinks) {
          const mirror = revByNumber.get(Number(link.lineNumber));
          if (!mirror) continue;
          await createGrniLink(tx as any, {
            goodsReceiptId: link.goodsReceiptId,
            goodsReceiptLineId: link.goodsReceiptLineId,
            journalLineId: mirror.id,
            linkType: "invoice_reversal",
            expectedAccountId: link.accountId,
            expectedReversedOf: locked.journalEntryId,
            userId: ctx.user.id,
          });
        }
      }

      const changed = await tx
        .update(supplierInvoices)
        .set({
          status: SupplierInvoiceStatus.REVERSED,
          reversedBy: ctx.user.id,
          reversedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(
            eq(supplierInvoices.id, id),
            eq(supplierInvoices.status, SupplierInvoiceStatus.POSTED),
          ),
        )
        .returning({ id: supplierInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر العكس — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    } else {
      // approve / return / reject — pure guarded status change.
      const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
      if (action === "approve") {
        cols.approvedBy = ctx.user.id;
        cols.approvedAt = ts;
      }
      const changed = await tx
        .update(supplierInvoices)
        .set(cols)
        .where(and(eq(supplierInvoices.id, id), eq(supplierInvoices.status, t.from)))
        .returning({ id: supplierInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "supplier_invoice",
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
    entityType: "supplier_invoice",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${v.invoiceNumber} (${v.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return { item: await loadInvoice(id), reversalId };
}

// ------------------------------- Reads ---------------------------------

export async function supplierInvoiceWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "supplier_invoice"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getSupplierInvoiceDetail(id: string) {
  const item = await loadInvoice(id);
  if (!item) return null;
  const lines = await loadLines(db, id);
  const history = await supplierInvoiceWorkflowHistory(id);
  const journal = item.journalEntryId
    ? (
        await db
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, item.journalEntryId))
          .limit(1)
      )[0]
    : null;
  const supplier = (
    await db.select().from(suppliers).where(eq(suppliers.id, item.supplierId)).limit(1)
  )[0];
  const allocations = await invoiceAllocations(db, id);
  return { item, lines, history, journal, supplier, allocations };
}

export interface SupplierInvoiceFilters {
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listSupplierInvoices(filters: SupplierInvoiceFilters = {}) {
  const rows = await db.select().from(supplierInvoices).orderBy(desc(supplierInvoices.createdAt));
  const q = (filters.search || "").trim().toLowerCase();
  const items = rows.filter((r: any) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.supplierId && r.supplierId !== filters.supplierId) return false;
    if (filters.dateFrom && r.invoiceDate < filters.dateFrom) return false;
    if (filters.dateTo && r.invoiceDate > filters.dateTo) return false;
    if (q) {
      const hay =
        `${r.invoiceNumber} ${r.supplierInvoiceNumber || ""} ${r.externalReference || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const summary = {
    total: items.length,
    draft: items.filter((r: any) => r.status === SupplierInvoiceStatus.DRAFT).length,
    submitted: items.filter((r: any) => r.status === SupplierInvoiceStatus.SUBMITTED).length,
    approved: items.filter((r: any) => r.status === SupplierInvoiceStatus.APPROVED).length,
    posted: items.filter((r: any) => r.status === SupplierInvoiceStatus.POSTED).length,
    rejected: items.filter((r: any) => r.status === SupplierInvoiceStatus.REJECTED).length,
    reversed: items.filter((r: any) => r.status === SupplierInvoiceStatus.REVERSED).length,
    outstanding: items
      .filter((r: any) => r.status === SupplierInvoiceStatus.POSTED)
      .reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0),
  };
  return { items, summary };
}
