/**
 * Phase 2C — Payment Voucher (سند صرف) service, server-authoritative.
 *
 * A Payment Voucher is an operational money-out document: money is paid FROM one
 * selected Cashbox or Bank Account, allocated across one or more debit accounts.
 * It is the source document; the General Ledger stays the accounting source of
 * truth. Nothing here stores an accounting balance.
 *
 * Reuse (never duplicated):
 *   - governance decisions  → evaluateTransition + PAYMENT_TRANSITIONS
 *   - workflow history      → recordWorkflowEvent (finance_workflow_events)
 *   - posting / reversal    → the certified Phase 1A engine (gl.ts)
 *   - period guard          → free via postBalancedEntry → resolvePostingPeriod
 *   - numbering             → nextCode (advisory-locked, concurrency-safe)
 *   - cash sufficiency      → assertCashPaymentSafe (min daily balance over the
 *                             window [voucher_date, end]) under an advisory
 *                             posting lock (acquireCashPostingLock)
 *
 * Money source is resolved server-side from the selected master
 * (cashbox_id / bank_account_id → linked_account_id → GL credit). The legacy
 * method-based cash/bank default resolver and system_key fallbacks are
 * deliberately NOT used for new vouchers.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  paymentVouchers,
  paymentVoucherLines,
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
import {
  validateLinkedAccount,
  accountMappedToAnyCashBank,
  acquireCashPostingLock,
  assertCashPaymentSafe,
} from "./cash-bank";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  PAYMENT_TRANSITIONS,
  type JournalAction,
} from "@/lib/finance-permissions";
import { PaymentVoucherStatus, AccountStatus, JournalStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

const AMOUNT_TOLERANCE = 0.005;

export interface PaymentLineInput {
  accountId: string;
  amount: number;
  description?: string;
  costCenterId?: string | null;
}
export interface PaymentVoucherInput {
  voucherDate: string;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  payeeName?: string;
  payeeReferenceType?: string | null;
  payeeReferenceId?: string | null;
  externalReference?: string | null;
  description?: string;
  notes?: string;
  currency?: string;
  totalAmount: number;
  lines: PaymentLineInput[];
}

type Db = { select: (...a: any[]) => any };

interface Normalized {
  cashboxId?: string | null;
  bankAccountId?: string | null;
  currency?: string | null;
  totalAmount: number;
  lines: { accountId: string; amount: number }[];
}

export interface SourceInfo {
  kind: "cashbox" | "bank";
  masterId: string;
  linkedAccountId: string;
  currency: string;
}

/**
 * Resolve + validate the single money source. Exactly one of cashbox_id /
 * bank_account_id, the master must exist and be ACTIVE, and its linked GL
 * account must be a valid postable Asset (Phase 2A mapping).
 */
export async function resolveSource(
  dbh: Db,
  cashboxId?: string | null,
  bankAccountId?: string | null,
): Promise<SourceInfo> {
  const hasCb = !!cashboxId;
  const hasBa = !!bankAccountId;
  if (hasCb && hasBa)
    throw new AppError(
      "اختر صندوقاً أو حساباً بنكياً واحداً فقط للصرف — لا يمكن اختيار الاثنين",
      400,
      "SOURCE_BOTH",
    );
  if (!hasCb && !hasBa)
    throw new AppError("يجب اختيار صندوق أو حساب بنكي للصرف منه", 400, "SOURCE_REQUIRED");

  if (hasCb) {
    const cb = (await dbh.select().from(cashboxes).where(eq(cashboxes.id, cashboxId!)).limit(1))[0];
    if (!cb) throw new AppError("الصندوق غير موجود", 404, "CASHBOX_NOT_FOUND");
    if (cb.status !== AccountStatus.ACTIVE)
      throw new AppError("الصندوق غير نشط — لا يمكن الصرف منه", 400, "CASHBOX_INACTIVE");
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
    throw new AppError("الحساب البنكي غير نشط — لا يمكن الصرف منه", 400, "BANK_INACTIVE");
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
 * trusts the client total. Returns the resolved source for journal construction.
 */
export async function validateVoucher(dbh: Db, v: Normalized): Promise<SourceInfo> {
  const src = await resolveSource(dbh, v.cashboxId, v.bankAccountId);

  const cur = (v.currency || "SAR").toUpperCase();
  if (cur !== (src.currency || "SAR").toUpperCase())
    throw new AppError(
      "عملة السند يجب أن تطابق عملة الصندوق/الحساب البنكي المصروف منه",
      400,
      "CURRENCY_MISMATCH",
    );

  if (!v.lines || v.lines.length < 1)
    throw new AppError("يجب إضافة سطر مدين واحد على الأقل", 400, "NO_LINES");

  let sum = 0;
  for (const l of v.lines) {
    const amt = Number(l.amount || 0);
    if (!(amt > 0))
      throw new AppError("قيمة السطر يجب أن تكون أكبر من صفر", 400, "LINE_AMOUNT_INVALID");
    sum += amt;

    const acc = (await dbh.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1))[0];
    if (!acc) throw new AppError("حساب السطر غير موجود", 400, "DEBIT_ACCOUNT_NOT_FOUND");
    if (acc.status !== AccountStatus.ACTIVE)
      throw new AppError(`الحساب ${acc.name} غير نشط`, 400, "DEBIT_ACCOUNT_INACTIVE");
    if (!acc.postable)
      throw new AppError(
        `الحساب ${acc.name} رئيسي/غير قابل للترحيل — اختر حساباً فرعياً`,
        400,
        "DEBIT_ACCOUNT_NOT_POSTABLE",
      );
    // Internal-transfer protection: a debit account mapped to ANY cashbox/bank
    // (active OR inactive) would turn this payment into a disguised Cash/Bank
    // transfer — its operational identity is still Cash/Bank.
    const mapped = await accountMappedToAnyCashBank(dbh, l.accountId);
    if (mapped)
      throw new AppError(
        "لا يمكن أن يكون الطرف المدين حساباً مرتبطاً بصندوق/بنك — استخدم تحويلاً داخلياً بدلاً من سند الصرف",
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

  return src;
}

function normalizeInput(input: PaymentVoucherInput): Normalized {
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
  const v = (await db.select().from(paymentVouchers).where(eq(paymentVouchers.id, id)).limit(1))[0];
  return v ?? null;
}
async function loadLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(paymentVoucherLines)
    .where(eq(paymentVoucherLines.paymentVoucherId, id))
    .orderBy(paymentVoucherLines.lineNumber);
}

// ------------------------------- Create --------------------------------

export async function createPaymentVoucher(ctx: Ctx, input: PaymentVoucherInput) {
  const norm = normalizeInput(input);
  await validateVoucher(db, norm); // full validation up front (PV-B..H)

  const id = genId("PV");
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    const number = await nextCode(tx as any, {
      table: "payment_vouchers",
      column: "voucher_number",
      prefix: "PV-",
      year: true,
    });
    await tx.insert(paymentVouchers).values({
      id,
      voucherNumber: number,
      voucherDate: input.voucherDate,
      status: PaymentVoucherStatus.DRAFT,
      cashboxId: input.cashboxId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      payeeName: input.payeeName ?? "",
      payeeReferenceType: input.payeeReferenceType ?? null,
      payeeReferenceId: input.payeeReferenceId ?? null,
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
      await tx.insert(paymentVoucherLines).values({
        id: genId("PVL"),
        paymentVoucherId: id,
        lineNumber: ++n,
        accountId: l.accountId,
        amount: Number(l.amount || 0),
        description: l.description ?? "",
        costCenterId: l.costCenterId ?? null,
        createdAt: ts,
      });
    }
    await recordWorkflowEvent(tx as any, {
      entityType: "payment_voucher",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: PaymentVoucherStatus.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadVoucher(id);
  await addAudit({
    action: "PAYMENT_VOUCHER_CREATED",
    entityType: "payment_voucher",
    entityId: id,
    description: `إنشاء سند صرف ${created?.voucherNumber} — ${input.payeeName ?? ""} بمبلغ ${norm.totalAmount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updatePaymentVoucher(ctx: Ctx, id: string, input: PaymentVoucherInput) {
  const v = await loadVoucher(id);
  if (!v) throw new AppError("سند الصرف غير موجود", 404, "NOT_FOUND");
  if (v.status !== PaymentVoucherStatus.DRAFT)
    throw new AppError("لا يمكن تعديل السند إلا في حالة المسودة", 409, "NOT_DRAFT");

  const norm = normalizeInput(input);
  await validateVoucher(db, norm);
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(paymentVouchers)
      .set({
        voucherDate: input.voucherDate,
        cashboxId: input.cashboxId ?? null,
        bankAccountId: input.bankAccountId ?? null,
        payeeName: input.payeeName ?? "",
        payeeReferenceType: input.payeeReferenceType ?? null,
        payeeReferenceId: input.payeeReferenceId ?? null,
        externalReference: input.externalReference ?? null,
        description: input.description ?? "",
        notes: input.notes ?? "",
        currency: cur,
        totalAmount: norm.totalAmount,
        updatedAt: ts,
      })
      .where(
        and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, PaymentVoucherStatus.DRAFT)),
      );
    await tx.delete(paymentVoucherLines).where(eq(paymentVoucherLines.paymentVoucherId, id));
    let n = 0;
    for (const l of input.lines) {
      await tx.insert(paymentVoucherLines).values({
        id: genId("PVL"),
        paymentVoucherId: id,
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
    action: "PAYMENT_VOUCHER_UPDATED",
    entityType: "payment_voucher",
    entityId: id,
    description: `تعديل مسودة سند الصرف ${v.voucherNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ totalAmount: v.totalAmount }),
    ip: ctx.ip,
  });
  return loadVoucher(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "PAYMENT_VOUCHER_SUBMITTED",
  approve: "PAYMENT_VOUCHER_APPROVED",
  return: "PAYMENT_VOUCHER_RETURNED",
  reject: "PAYMENT_VOUCHER_REJECTED",
  post: "PAYMENT_VOUCHER_POSTED",
  reverse: "PAYMENT_VOUCHER_REVERSED",
  cancel: "PAYMENT_VOUCHER_CANCELLED",
};

export interface PaymentTransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Single choke point for every payment-voucher state change (except create and
 * draft edit). Governance via the shared engine + PAYMENT_TRANSITIONS; posting/
 * reversal via the certified GL engine. Cashbox posting additionally serializes
 * on an advisory lock and enforces as-of cash sufficiency — all atomic.
 */
export async function transitionPaymentVoucher(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<PaymentTransitionResult> {
  const v = await loadVoucher(id);
  if (!v) throw new AppError("سند الصرف غير موجود", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, PAYMENT_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: PAYMENT_TRANSITIONS,
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
      await validateVoucher(tx as any, {
        cashboxId: v.cashboxId,
        bankAccountId: v.bankAccountId,
        currency: v.currency,
        totalAmount: v.totalAmount,
        lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
      });
      const changed = await tx
        .update(paymentVouchers)
        .set({ status: t.to, submittedBy: ctx.user.id, submittedAt: ts, updatedAt: ts })
        .where(and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, t.from)))
        .returning({ id: paymentVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الإرسال — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else if (action === "post") {
      // Row lock + status guard (idempotent — no double posting).
      const locked = (
        await tx
          .select()
          .from(paymentVouchers)
          .where(eq(paymentVouchers.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== PaymentVoucherStatus.APPROVED)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
      if (await existingSourceEntryId(tx as any, "payment_voucher", id))
        throw new AppError("سبق ترحيل هذا السند", 409, "ALREADY_POSTED");

      const lines = await loadLines(tx as any, id);
      const src = await validateVoucher(tx as any, {
        cashboxId: locked.cashboxId,
        bankAccountId: locked.bankAccountId,
        currency: locked.currency,
        totalAmount: locked.totalAmount,
        lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
      });

      // Cashbox: serialize on the linked account, then enforce backdated cash
      // safety — the payment must not drive ANY daily book-cash balance from the
      // voucher date through the end of the ledger negative (not merely the
      // as-of-voucher-date balance). Runs under the advisory lock so concurrent
      // same-cashbox payments each see the prior committed effect.
      if (src.kind === "cashbox") {
        await acquireCashPostingLock(tx as any, src.linkedAccountId);
        await assertCashPaymentSafe(
          tx as any,
          src.linkedAccountId,
          locked.voucherDate,
          Number(locked.totalAmount),
        );
      }
      // Bank: no generic negative-balance block (overdraft/credit facilities).

      const desc = `سند صرف ${locked.voucherNumber} — ${locked.payeeName || ""}`.trim();
      const jLines = [
        ...lines.map((l: any) => ({
          accountId: l.accountId,
          debit: Number(l.amount),
          costCenterId: l.costCenterId ?? null,
          description: l.description || desc,
        })),
        { accountId: src.linkedAccountId, credit: Number(locked.totalAmount), description: desc },
      ];
      const entryId = await postBalancedEntry(tx as any, {
        date: locked.voucherDate,
        description: desc,
        currency: locked.currency,
        source: "payment_voucher",
        sourceType: "payment_voucher",
        sourceId: id,
        lines: jLines,
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });
      const changed = await tx
        .update(paymentVouchers)
        .set({
          status: PaymentVoucherStatus.POSTED,
          journalEntryId: entryId,
          postedBy: ctx.user.id,
          postedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(
            eq(paymentVouchers.id, id),
            eq(paymentVouchers.status, PaymentVoucherStatus.APPROVED),
          ),
        )
        .returning({ id: paymentVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    } else if (action === "reverse") {
      const locked = (
        await tx
          .select()
          .from(paymentVouchers)
          .where(eq(paymentVouchers.id, id))
          .for("update")
          .limit(1)
      )[0];
      if (!locked || locked.status !== PaymentVoucherStatus.POSTED)
        throw new AppError("تعذّر العكس — تغيّرت حالة السند", 409, "STATE_CONFLICT");
      if (!locked.journalEntryId)
        throw new AppError("لا يوجد قيد مُرحَّل لعكسه", 409, "NO_JOURNAL");
      reversalId = await reverseEntry(tx as any, locked.journalEntryId, ctx.user.id);
      const changed = await tx
        .update(paymentVouchers)
        .set({
          status: PaymentVoucherStatus.REVERSED,
          reversedBy: ctx.user.id,
          reversedAt: ts,
          updatedAt: ts,
        })
        .where(
          and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, PaymentVoucherStatus.POSTED)),
        )
        .returning({ id: paymentVouchers.id });
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
        .update(paymentVouchers)
        .set(cols)
        .where(and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, t.from)))
        .returning({ id: paymentVouchers.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة السند", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "payment_voucher",
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
    entityType: "payment_voucher",
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

export async function paymentVoucherWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "payment_voucher"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getPaymentVoucherDetail(id: string) {
  const item = await loadVoucher(id);
  if (!item) return null;
  const lines = await loadLines(db, id);
  const history = await paymentVoucherWorkflowHistory(id);
  const journal = item.journalEntryId
    ? (
        await db
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, item.journalEntryId))
          .limit(1)
      )[0]
    : null;
  const source = item.cashboxId
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
  return { item, lines, history, journal, source };
}

export interface PaymentVoucherFilters {
  status?: string;
  cashboxId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listPaymentVouchers(filters: PaymentVoucherFilters = {}) {
  const rows = await db.select().from(paymentVouchers).orderBy(desc(paymentVouchers.createdAt));
  const q = (filters.search || "").trim().toLowerCase();
  const items = rows.filter((r: any) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.cashboxId && r.cashboxId !== filters.cashboxId) return false;
    if (filters.bankAccountId && r.bankAccountId !== filters.bankAccountId) return false;
    if (filters.dateFrom && r.voucherDate < filters.dateFrom) return false;
    if (filters.dateTo && r.voucherDate > filters.dateTo) return false;
    if (q) {
      const hay = `${r.voucherNumber} ${r.payeeName} ${r.externalReference || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const summary = {
    total: items.length,
    draft: items.filter((r: any) => r.status === PaymentVoucherStatus.DRAFT).length,
    submitted: items.filter((r: any) => r.status === PaymentVoucherStatus.SUBMITTED).length,
    approved: items.filter((r: any) => r.status === PaymentVoucherStatus.APPROVED).length,
    posted: items.filter((r: any) => r.status === PaymentVoucherStatus.POSTED).length,
    rejected: items.filter((r: any) => r.status === PaymentVoucherStatus.REJECTED).length,
    reversed: items.filter((r: any) => r.status === PaymentVoucherStatus.REVERSED).length,
  };
  return { items, summary };
}
