/**
 * Phase 2B — Receipt Voucher (سند قبض) service, server-authoritative.
 *
 * A Receipt Voucher is an operational money-in document: money is received into
 * ONE selected Cashbox or Bank Account and allocated to one or more credit
 * accounts. It is the source document; the General Ledger stays the accounting
 * source of truth. Nothing here stores an accounting balance.
 *
 * Reuse (never duplicated):
 *   - governance decisions  → evaluateTransition + RECEIPT_TRANSITIONS
 *   - workflow history      → recordWorkflowEvent (finance_workflow_events)
 *   - posting / reversal    → the certified Phase 1A engine (gl.ts)
 *   - period guard          → free via postBalancedEntry → resolvePostingPeriod
 *   - numbering             → nextCode (advisory-locked, concurrency-safe)
 *   - cash/bank validation  → validateLinkedAccount / accountMappedToActiveCashBank
 *
 * Money destination is resolved server-side from the selected master
 * (cashbox_id / bank_account_id → linked_account_id → GL). The legacy
 * method-based cash/bank default resolver and system_key fallbacks are
 * deliberately NOT used for new vouchers.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  receiptVouchers,
  receiptVoucherLines,
  cashboxes,
  bankAccounts,
  accounts,
  journalEntries,
  financeWorkflowEvents,
} from "./schema";
import { hasPermission } from "./auth";
import { AppError } from "./errors";
import { nextCode } from "./numbering";
import { postBalancedEntry, reverseEntry, existingSourceEntryId } from "./gl";
import { validateLinkedAccount, accountMappedToActiveCashBank } from "./cash-bank";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  RECEIPT_TRANSITIONS,
  FINANCE_PERMISSIONS as P,
  type JournalAction,
} from "@/lib/finance-permissions";
import { ReceiptVoucherStatus, AccountStatus, JournalStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

const AMOUNT_TOLERANCE = 0.005;

export interface ReceiptLineInput {
  accountId: string;
  amount: number;
  description?: string;
  costCenterId?: string | null;
}
export interface ReceiptVoucherInput {
  voucherDate: string;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  payerName?: string;
  payerReferenceType?: string | null;
  payerReferenceId?: string | null;
  externalReference?: string | null;
  description?: string;
  notes?: string;
  currency?: string;
  totalAmount: number;
  lines: ReceiptLineInput[];
}

type Db = { select: (...a: any[]) => any };

/** Normalized shape the validator accepts from either fresh input or DB rows. */
interface Normalized {
  cashboxId?: string | null;
  bankAccountId?: string | null;
  currency?: string | null;
  totalAmount: number;
  lines: { accountId: string; amount: number }[];
}

export interface DestinationInfo {
  kind: "cashbox" | "bank";
  masterId: string;
  linkedAccountId: string;
  currency: string;
}

/**
 * Resolve + validate the single money destination. Exactly one of
 * cashbox_id / bank_account_id, the master must exist and be ACTIVE, and its
 * linked GL account must be a valid postable Asset (Phase 2A mapping).
 */
export async function resolveDestination(
  dbh: Db,
  cashboxId?: string | null,
  bankAccountId?: string | null,
): Promise<DestinationInfo> {
  const hasCb = !!cashboxId;
  const hasBa = !!bankAccountId;
  if (hasCb && hasBa)
    throw new AppError(
      "اختر صندوقاً أو حساباً بنكياً واحداً فقط — لا يمكن اختيار الاثنين",
      400,
      "DESTINATION_BOTH",
    );
  if (!hasCb && !hasBa)
    throw new AppError("يجب اختيار صندوق أو حساب بنكي للاستلام", 400, "DESTINATION_REQUIRED");

  if (hasCb) {
    const cb = (await dbh.select().from(cashboxes).where(eq(cashboxes.id, cashboxId!)).limit(1))[0];
    if (!cb) throw new AppError("الصندوق غير موجود", 404, "CASHBOX_NOT_FOUND");
    if (cb.status !== AccountStatus.ACTIVE)
      throw new AppError("الصندوق غير نشط — لا يمكن الاستلام فيه", 400, "CASHBOX_INACTIVE");
    await validateLinkedAccount(dbh, cb.linkedAccountId);
    return {
      kind: "cashbox",
      masterId: cb.id,
      linkedAccountId: cb.linkedAccountId,
      currency: cb.currency,
    };
  }
  const ba = (
    await dbh.select().from(bankAccounts).where(eq(bankAccounts.id, bankAccountId!)).limit(1)
  )[0];
  if (!ba) throw new AppError("الحساب البنكي غير موجود", 404, "BANK_NOT_FOUND");
  if (ba.status !== AccountStatus.ACTIVE)
    throw new AppError("الحساب البنكي غير نشط — لا يمكن الاستلام فيه", 400, "BANK_INACTIVE");
  await validateLinkedAccount(dbh, ba.linkedAccountId);
  return {
    kind: "bank",
    masterId: ba.id,
    linkedAccountId: ba.linkedAccountId,
    currency: ba.currency,
  };
}

/**
 * Full server-side validation shared by create, update, submit and post. Never
 * trusts the client total. Returns the resolved destination for journal
 * construction.
 */
export async function validateVoucher(dbh: Db, v: Normalized): Promise<DestinationInfo> {
  const dest = await resolveDestination(dbh, v.cashboxId, v.bankAccountId);

  // Currency: voucher = destination master (Phase 2A single-currency policy).
  const cur = (v.currency || "SAR").toUpperCase();
  if (cur !== (dest.currency || "SAR").toUpperCase())
    throw new AppError(
      "عملة السند يجب أن تطابق عملة الصندوق/الحساب البنكي المستلِم",
      400,
      "CURRENCY_MISMATCH",
    );

  if (!v.lines || v.lines.length < 1)
    throw new AppError("يجب إضافة سطر دائن واحد على الأقل", 400, "NO_LINES");

  let sum = 0;
  for (const l of v.lines) {
    const amt = Number(l.amount || 0);
    if (!(amt > 0))
      throw new AppError("قيمة السطر يجب أن تكون أكبر من صفر", 400, "LINE_AMOUNT_INVALID");
    sum += amt;

    const acc = (await dbh.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1))[0];
    if (!acc) throw new AppError("حساب السطر غير موجود", 400, "CREDIT_ACCOUNT_NOT_FOUND");
    if (acc.status !== AccountStatus.ACTIVE)
      throw new AppError(`الحساب ${acc.name} غير نشط`, 400, "CREDIT_ACCOUNT_INACTIVE");
    if (!acc.postable)
      throw new AppError(
        `الحساب ${acc.name} رئيسي/غير قابل للترحيل — اختر حساباً فرعياً`,
        400,
        "CREDIT_ACCOUNT_NOT_POSTABLE",
      );
    // Internal-transfer protection: a credit account mapped to an ACTIVE
    // cashbox/bank would turn this receipt into a hidden Cash/Bank transfer.
    const mapped = await accountMappedToActiveCashBank(dbh, l.accountId);
    if (mapped)
      throw new AppError(
        "لا يمكن أن يكون الطرف الدائن حساباً مرتبطاً بصندوق/بنك نشط — استخدم تحويلاً داخلياً بدلاً من سند القبض",
        400,
        "INTERNAL_TRANSFER_BLOCKED",
      );
  }

  const total = Number(v.totalAmount || 0);
  if (!(total > 0))
    throw new AppError("إجمالي السند يجب أن يكون أكبر من صفر", 400, "AMOUNT_INVALID");
  if (Math.abs(sum - total) > AMOUNT_TOLERANCE)
    throw new AppError(
      `مجموع السطور (${sum}) لا يساوي إجمالي السند (${total})`,
      400,
      "TOTAL_MISMATCH",
    );

  return dest;
}

function normalizeInput(input: ReceiptVoucherInput): Normalized {
  return {
    cashboxId: input.cashboxId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    currency: input.currency ?? "SAR",
    totalAmount: Number(input.totalAmount || 0),
    lines: (input.lines || []).map((l) => ({
      accountId: l.accountId,
      amount: Number(l.amount || 0),
    })),
  };
}

async function loadVoucher(id: string) {
  const v = (await db.select().from(receiptVouchers).where(eq(receiptVouchers.id, id)).limit(1))[0];
  return v ?? null;
}
async function loadLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(receiptVoucherLines)
    .where(eq(receiptVoucherLines.receiptVoucherId, id))
    .orderBy(receiptVoucherLines.lineNumber);
}

// ------------------------------- Create --------------------------------

export async function createReceiptVoucher(ctx: Ctx, input: ReceiptVoucherInput) {
  const norm = normalizeInput(input);
  await validateVoucher(db, norm); // full validation up front (RV-B..H)

  const id = genId("RV");
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    const number = await nextCode(tx as any, {
      table: "receipt_vouchers",
      column: "voucher_number",
      prefix: "RV-",
      year: true,
    });
    await tx.insert(receiptVouchers).values({
      id,
      voucherNumber: number,
      voucherDate: input.voucherDate,
      status: ReceiptVoucherStatus.DRAFT,
      cashboxId: input.cashboxId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      payerName: input.payerName ?? "",
      payerReferenceType: input.payerReferenceType ?? null,
      payerReferenceId: input.payerReferenceId ?? null,
      externalReference: input.externalReference ?? null,
      description: input.description ?? "",
      notes: input.notes ?? "",
      currency: cur,
      totalAmount: norm.totalAmount,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    let n = 0;
    for (const l of input.lines) {
      await tx.insert(receiptVoucherLines).values({
        id: genId("RVL"),
        receiptVoucherId: id,
        lineNumber: ++n,
        accountId: l.accountId,
        amount: Number(l.amount || 0),
        description: l.description ?? "",
        costCenterId: l.costCenterId ?? null,
        createdAt: ts,
      });
    }
    await recordWorkflowEvent(tx as any, {
      entityType: "receipt_voucher",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: ReceiptVoucherStatus.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadVoucher(id);
  await addAudit({
    action: "RECEIPT_VOUCHER_CREATED",
    entityType: "receipt_voucher",
    entityId: id,
    description: `إنشاء سند قبض ${created?.voucherNumber} — ${input.payerName ?? ""} بمبلغ ${norm.totalAmount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updateReceiptVoucher(ctx: Ctx, id: string, input: ReceiptVoucherInput) {
  const v = await loadVoucher(id);
  if (!v) throw new AppError("سند القبض غير موجود", 404, "NOT_FOUND");
  if (v.status !== ReceiptVoucherStatus.DRAFT)
    throw new AppError("لا يمكن تعديل السند إلا في حالة المسودة", 409, "NOT_DRAFT");

  const norm = normalizeInput(input);
  await validateVoucher(db, norm);
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(receiptVouchers)
      .set({
        voucherDate: input.voucherDate,
        cashboxId: input.cashboxId ?? null,
        bankAccountId: input.bankAccountId ?? null,
        payerName: input.payerName ?? "",
        payerReferenceType: input.payerReferenceType ?? null,
        payerReferenceId: input.payerReferenceId ?? null,
        externalReference: input.externalReference ?? null,
        description: input.description ?? "",
        notes: input.notes ?? "",
        currency: cur,
        totalAmount: norm.totalAmount,
        updatedAt: ts,
      })
      .where(
        and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, ReceiptVoucherStatus.DRAFT)),
      );
    // Replace lines wholesale (draft edit).
    await tx.delete(receiptVoucherLines).where(eq(receiptVoucherLines.receiptVoucherId, id));
    let n = 0;
    for (const l of input.lines) {
      await tx.insert(receiptVoucherLines).values({
        id: genId("RVL"),
        receiptVoucherId: id,
        lineNumber: ++n,
        accountId: l.accountId,
        amount: Number(l.amount || 0),
        description: l.description ?? "",
        costCenterId: l.costCenterId ?? null,
        createdAt: ts,
      });
    }
  });

  await addAudit({
    action: "RECEIPT_VOUCHER_UPDATED",
    entityType: "receipt_voucher",
    entityId: id,
    description: `تعديل مسودة سند القبض ${v.voucherNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ totalAmount: v.totalAmount }),
    ip: ctx.ip,
  });
  return loadVoucher(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "RECEIPT_VOUCHER_SUBMITTED",
  approve: "RECEIPT_VOUCHER_APPROVED",
  return: "RECEIPT_VOUCHER_RETURNED",
  reject: "RECEIPT_VOUCHER_REJECTED",
  post: "RECEIPT_VOUCHER_POSTED",
  reverse: "RECEIPT_VOUCHER_REVERSED",
  issue: "RECEIPT_VOUCHER_ISSUE",
  cancel: "RECEIPT_VOUCHER_CANCELLED",
};

export interface ReceiptTransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Single choke point for every receipt-voucher state change (except create and
 * draft edit). Governance decision via the shared engine + RECEIPT_TRANSITIONS;
 * posting/reversal via the certified GL engine — all atomic.
 */
export async function transitionReceiptVoucher(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<ReceiptTransitionResult> {
  const v = await loadVoucher(id);
  if (!v) throw new AppError("سند القبض غير موجود", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, RECEIPT_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: RECEIPT_TRANSITIONS,
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
      // Re-validate completely at submit (destination active, lines, totals…).
      const lines = await loadLines(tx as any, id);
      await validateVoucher(tx as any, {
        cashboxId: v.cashboxId,
        bankAccountId: v.bankAccountId,
        currency: v.currency,
        totalAmount: v.totalAmount,
        lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
      });
      const changed = await tx
        .update(receiptVouchers)
        .set({ status: t.to, submittedBy: ctx.user.id, submittedAt: ts, updatedAt: ts })
        .where(and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, t.from)))
        .returning({ id: receiptVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الإرسال — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else if (action === "post") {
      // Lock + re-check under the row lock (idempotent, no double posting).
      const locked = (
        await tx
          .select()
          .from(receiptVouchers)
          .where(eq(receiptVouchers.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== ReceiptVoucherStatus.APPROVED)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
      if (await existingSourceEntryId(tx as any, "receipt_voucher", id))
        throw new AppError("سبق ترحيل هذا السند", 409, "ALREADY_POSTED");

      const lines = await loadLines(tx as any, id);
      const dest = await validateVoucher(tx as any, {
        cashboxId: locked.cashboxId,
        bankAccountId: locked.bankAccountId,
        currency: locked.currency,
        totalAmount: locked.totalAmount,
        lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
      });

      const desc = `سند قبض ${locked.voucherNumber} — ${locked.payerName || ""}`.trim();
      const jLines = [
        { accountId: dest.linkedAccountId, debit: Number(locked.totalAmount), description: desc },
        ...lines.map((l: any) => ({
          accountId: l.accountId,
          credit: Number(l.amount),
          costCenterId: l.costCenterId ?? null,
          description: l.description || desc,
        })),
      ];
      const entryId = await postBalancedEntry(tx as any, {
        date: locked.voucherDate,
        description: desc,
        currency: locked.currency,
        source: "receipt_voucher",
        sourceType: "receipt_voucher",
        sourceId: id,
        lines: jLines,
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });
      const changed = await tx
        .update(receiptVouchers)
        .set({
          status: ReceiptVoucherStatus.POSTED,
          journalEntryId: entryId,
          postedBy: ctx.user.id,
          postedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(
            eq(receiptVouchers.id, id),
            eq(receiptVouchers.status, ReceiptVoucherStatus.APPROVED),
          ),
        )
        .returning({ id: receiptVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else if (action === "reverse") {
      const locked = (
        await tx
          .select()
          .from(receiptVouchers)
          .where(eq(receiptVouchers.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== ReceiptVoucherStatus.POSTED)
        throw new AppError("تعذّر العكس — تغيّرت حالة السند", 409, "STATE_CONFLICT");
      if (!locked.journalEntryId)
        throw new AppError("لا يوجد قيد مُرحَّل لعكسه", 409, "NO_JOURNAL");
      reversalId = await reverseEntry(tx as any, locked.journalEntryId, ctx.user.id);
      const changed = await tx
        .update(receiptVouchers)
        .set({
          status: ReceiptVoucherStatus.REVERSED,
          reversedBy: ctx.user.id,
          reversedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, ReceiptVoucherStatus.POSTED)),
        )
        .returning({ id: receiptVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر العكس — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else {
      // approve / return / reject — pure guarded status change.
      const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
      if (action === "approve") {
        cols.approvedBy = ctx.user.id;
        cols.approvedAt = ts;
      }
      const changed = await tx
        .update(receiptVouchers)
        .set(cols)
        .where(and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, t.from)))
        .returning({ id: receiptVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "receipt_voucher",
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
    entityType: "receipt_voucher",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${v.voucherNumber} (${v.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return { item: await loadVoucher(id), reversalId };
}

// ------------------------------- Reads ---------------------------------

export async function receiptVoucherWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "receipt_voucher"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getReceiptVoucherDetail(id: string) {
  const item = await loadVoucher(id);
  if (!item) return null;
  const lines = await loadLines(db, id);
  const history = await receiptVoucherWorkflowHistory(id);
  const journal = item.journalEntryId
    ? (
        await db
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, item.journalEntryId))
          .limit(1)
      )[0]
    : null;
  const destination = item.cashboxId
    ? (await db.select().from(cashboxes).where(eq(cashboxes.id, item.cashboxId)).limit(1))[0]
    : item.bankAccountId
      ? (
          await db
            .select()
            .from(bankAccounts)
            .where(eq(bankAccounts.id, item.bankAccountId))
            .limit(1)
        )[0]
      : null;
  return { item, lines, history, journal, destination };
}

export interface ReceiptVoucherFilters {
  status?: string;
  cashboxId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listReceiptVouchers(filters: ReceiptVoucherFilters = {}) {
  const rows = await db.select().from(receiptVouchers).orderBy(desc(receiptVouchers.createdAt));
  const q = (filters.search || "").trim().toLowerCase();
  const items = rows.filter((r: any) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.cashboxId && r.cashboxId !== filters.cashboxId) return false;
    if (filters.bankAccountId && r.bankAccountId !== filters.bankAccountId) return false;
    if (filters.dateFrom && r.voucherDate < filters.dateFrom) return false;
    if (filters.dateTo && r.voucherDate > filters.dateTo) return false;
    if (q) {
      const hay = `${r.voucherNumber} ${r.payerName} ${r.externalReference || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const summary = {
    total: items.length,
    draft: items.filter((r: any) => r.status === ReceiptVoucherStatus.DRAFT).length,
    submitted: items.filter((r: any) => r.status === ReceiptVoucherStatus.SUBMITTED).length,
    approved: items.filter((r: any) => r.status === ReceiptVoucherStatus.APPROVED).length,
    posted: items.filter((r: any) => r.status === ReceiptVoucherStatus.POSTED).length,
    rejected: items.filter((r: any) => r.status === ReceiptVoucherStatus.REJECTED).length,
    reversed: items.filter((r: any) => r.status === ReceiptVoucherStatus.REVERSED).length,
  };
  return { items, summary };
}
