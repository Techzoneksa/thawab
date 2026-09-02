/**
 * Phase Sales-1 — Sales Invoice (فاتورة مبيعات) service, server-authoritative.
 *
 * A Sales Invoice is a controlled financial DOCUMENT recording what a customer
 * owes us for goods/services sold. Its header and lines are NOT accounting truth:
 * only POSTING creates the certified revenue journal
 *
 *     Dr  accounts receivable   (gross total)
 *         Cr  revenue           (each line's net)
 *
 * and links the AR DEBIT line to the customer subledger (customer_journal_links)
 * so the customer receivable rises automatically. The General Ledger stays the
 * only accounting source of truth. Phase Sales-1 is revenue-only: NO VAT, NO
 * inventory/COGS. Settlement (customer receipts allocated to invoices) is a later
 * phase.
 *
 * Reuse (never duplicated):
 *   - governance decisions  → evaluateTransition + SALES_INVOICE_TRANSITIONS
 *   - workflow history      → recordWorkflowEvent (finance_workflow_events)
 *   - posting / reversal    → the certified Phase 1A engine (gl.ts)
 *   - period guard          → free via postBalancedEntry → resolvePostingPeriod
 *   - numbering             → nextCode (advisory-locked, concurrency-safe)
 *   - AR subledger link     → linkEntryArLine (customer.ts) — for both the invoice
 *                             AR debit and the reversal-mirror AR credit
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { resolvePage, paginatedResult, type PageParams } from "./pagination";
import {
  salesInvoices,
  salesInvoiceLines,
  customers,
  accounts,
  projects,
  journalEntries,
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
import { linkEntryArLine } from "./customer";
import {
  invoiceHasAllocations,
  lockInvoiceAllocationResource,
} from "./customer-receipt-allocation";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  SALES_INVOICE_TRANSITIONS,
  type JournalAction,
} from "@/lib/finance-permissions";
import {
  SalesInvoiceStatus,
  AccountStatus,
  CustomerStatus,
  JournalStatus,
  Fund,
} from "@/lib/enums";
import type { Ctx } from "./api-utils";

const AMOUNT_TOLERANCE = 0.005;
/** Round to 2 decimals (halala precision) so line arithmetic stays exact. */
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type Db = { select: (...a: any[]) => any };

export interface SalesInvoiceLineInput {
  /** The revenue (or other non-protected) account credited when posted. */
  accountId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  costCenterId?: string | null;
}

export interface SalesInvoiceInput {
  customerId: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency?: string;
  fund?: string;
  projectId?: string | null;
  customerReference?: string | null;
  description?: string;
  notes?: string;
  lines: SalesInvoiceLineInput[];
}

interface ComputedLine {
  accountId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  lineTotal: number;
  costCenterId: string | null;
}
interface Computed {
  lines: ComputedLine[];
  subtotal: number;
  totalAmount: number;
}

const FUNDS = new Set<string>(Object.values(Fund));

/**
 * Full server-side validation + resolution shared by create, update, submit and
 * post. Never trusts client numbers. Each line's net is recomputed from
 * quantity·unit_price; the header sum is recomputed.
 *
 * Each line's credit account must exist/active/postable/non-parent and NOT be the
 * AR control account or a cashbox/bank-mapped account. Revenue accounts are the
 * normal case, but any other valid posting account (e.g. an asset account for a
 * simple asset-sale proceeds credit) is allowed — matching the supplier-invoice
 * DIRECT-line philosophy (only the doc's own control account + cash/bank are
 * prohibited). Phase Sales-1 has no VAT: line total == line net.
 */
export async function validateInvoice(dbh: Db, input: SalesInvoiceInput): Promise<Computed> {
  const cust = (
    await dbh.select().from(customers).where(eq(customers.id, input.customerId)).limit(1)
  )[0];
  if (!cust) throw new AppError("العميل غير موجود", 404, "CUSTOMER_NOT_FOUND");
  if (cust.status !== CustomerStatus.ACTIVE)
    throw new AppError("العميل غير نشط — لا يمكن إصدار فاتورة له", 400, "CUSTOMER_INACTIVE");

  if (!input.invoiceDate) throw new AppError("تاريخ الفاتورة مطلوب", 400, "INVOICE_DATE_REQUIRED");
  if (input.dueDate && input.dueDate < input.invoiceDate)
    throw new AppError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة", 400, "DUE_BEFORE_INVOICE");

  if (input.fund && !FUNDS.has(input.fund))
    throw new AppError("نوع الصندوق غير صالح", 400, "FUND_INVALID");

  if (input.projectId) {
    const proj = (
      await dbh.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
    )[0];
    if (!proj) throw new AppError("المشروع غير موجود", 400, "PROJECT_NOT_FOUND");
  }

  if (!input.lines || input.lines.length < 1)
    throw new AppError("يجب إضافة سطر واحد على الأقل", 400, "NO_LINES");

  const arId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);

  const computedLines: ComputedLine[] = [];
  for (const l of input.lines) {
    const quantity = Number(l.quantity || 0);
    const unitPrice = Number(l.unitPrice || 0);
    if (!(quantity > 0)) throw new AppError("الكمية يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");
    if (!(unitPrice > 0))
      throw new AppError("سعر الوحدة يجب أن يكون أكبر من صفر", 400, "PRICE_INVALID");

    const accId = l.accountId;
    if (!accId) throw new AppError("حساب السطر (الإيراد) مطلوب", 400, "REVENUE_ACCOUNT_REQUIRED");
    const acc = (await dbh.select().from(accounts).where(eq(accounts.id, accId)).limit(1))[0];
    if (!acc) throw new AppError("حساب السطر غير موجود", 400, "REVENUE_ACCOUNT_NOT_FOUND");
    if (acc.status !== AccountStatus.ACTIVE)
      throw new AppError(`الحساب ${acc.name} غير نشط`, 400, "REVENUE_ACCOUNT_INACTIVE");
    if (!acc.postable)
      throw new AppError(
        `الحساب ${acc.name} رئيسي/غير قابل للترحيل — اختر حساباً فرعياً`,
        400,
        "REVENUE_ACCOUNT_NOT_POSTABLE",
      );
    if (acc.id === arId)
      throw new AppError(
        "لا يمكن أن يكون سطر الفاتورة على حساب الذمم المدينة (يُنشأ آلياً كطرف مدين)",
        400,
        "LINE_IS_AR",
      );
    if (await accountMappedToAnyCashBank(dbh, accId))
      throw new AppError(
        "لا يمكن أن يكون سطر الفاتورة حساباً مرتبطاً بصندوق/بنك — استخدم سند قبض للتحصيل",
        400,
        "LINE_IS_CASH_BANK",
      );

    const lineSubtotal = r2(quantity * unitPrice);
    computedLines.push({
      accountId: accId,
      description: l.description ?? "",
      quantity,
      unitPrice,
      lineSubtotal,
      lineTotal: lineSubtotal,
      costCenterId: l.costCenterId ?? null,
    });
  }

  const subtotal = r2(computedLines.reduce((s, l) => s + l.lineSubtotal, 0));
  const totalAmount = subtotal;
  if (!(totalAmount > 0))
    throw new AppError("إجمالي الفاتورة يجب أن يكون أكبر من صفر", 400, "AMOUNT_INVALID");

  return { lines: computedLines, subtotal, totalAmount };
}

async function loadInvoice(id: string) {
  const v = (await db.select().from(salesInvoices).where(eq(salesInvoices.id, id)).limit(1))[0];
  return v ?? null;
}
async function loadLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(salesInvoiceLines)
    .where(eq(salesInvoiceLines.salesInvoiceId, id))
    .orderBy(salesInvoiceLines.lineNumber);
}

/** Map persisted lines back to the input shape for re-validation at submit/post. */
function linesToInput(inv: any, lines: any[]): SalesInvoiceInput {
  return {
    customerId: inv.customerId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    fund: inv.fund,
    projectId: inv.projectId,
    lines: lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      costCenterId: l.costCenterId,
    })),
  };
}

/** Persist invoice lines (draft create/update). */
async function persistLines(tx: any, invoiceId: string, computed: Computed, ts: string) {
  let n = 0;
  for (const l of computed.lines) {
    await tx.insert(salesInvoiceLines).values({
      id: genId("SVL"),
      salesInvoiceId: invoiceId,
      lineNumber: ++n,
      description: l.description,
      accountId: l.accountId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineSubtotal: l.lineSubtotal,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: l.lineTotal,
      costCenterId: l.costCenterId,
      createdAt: ts,
    });
  }
}

// ------------------------------- Create --------------------------------

export async function createSalesInvoice(ctx: Ctx, input: SalesInvoiceInput) {
  const computed = await validateInvoice(db, input); // full validation up front

  const id = genId("SINVC");
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();
  const fund = input.fund && FUNDS.has(input.fund) ? input.fund : Fund.UNRESTRICTED;

  await db.transaction(async (tx) => {
    const number = await nextCode(tx as any, {
      table: "sales_invoices",
      column: "invoice_number",
      prefix: "SV-",
      year: true,
    });
    await tx.insert(salesInvoices).values({
      id,
      invoiceNumber: number,
      customerId: input.customerId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate ?? null,
      status: SalesInvoiceStatus.DRAFT,
      currency: cur,
      subtotal: computed.subtotal,
      taxAmount: 0,
      totalAmount: computed.totalAmount,
      fund,
      projectId: input.projectId ?? null,
      customerReference: input.customerReference ?? null,
      description: input.description ?? "",
      notes: input.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await persistLines(tx, id, computed, ts);
    await recordWorkflowEvent(tx as any, {
      entityType: "sales_invoice",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: SalesInvoiceStatus.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadInvoice(id);
  await addAudit({
    action: "SALES_INVOICE_CREATED",
    entityType: "sales_invoice",
    entityId: id,
    description: `إنشاء فاتورة مبيعات ${created?.invoiceNumber} بمبلغ ${computed.totalAmount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updateSalesInvoice(ctx: Ctx, id: string, input: SalesInvoiceInput) {
  const v = await loadInvoice(id);
  if (!v) throw new AppError("فاتورة المبيعات غير موجودة", 404, "NOT_FOUND");
  if (v.status !== SalesInvoiceStatus.DRAFT)
    throw new AppError("لا يمكن تعديل الفاتورة إلا في حالة المسودة", 409, "NOT_DRAFT");

  const computed = await validateInvoice(db, input);
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();
  const fund = input.fund && FUNDS.has(input.fund) ? input.fund : Fund.UNRESTRICTED;

  await db.transaction(async (tx) => {
    await tx
      .update(salesInvoices)
      .set({
        customerId: input.customerId,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        currency: cur,
        subtotal: computed.subtotal,
        taxAmount: 0,
        totalAmount: computed.totalAmount,
        fund,
        projectId: input.projectId ?? null,
        customerReference: input.customerReference ?? null,
        description: input.description ?? "",
        notes: input.notes ?? "",
        updatedAt: ts,
      })
      .where(and(eq(salesInvoices.id, id), eq(salesInvoices.status, SalesInvoiceStatus.DRAFT)));
    await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.salesInvoiceId, id));
    await persistLines(tx, id, computed, ts);
  });

  await addAudit({
    action: "SALES_INVOICE_UPDATED",
    entityType: "sales_invoice",
    entityId: id,
    description: `تعديل مسودة فاتورة المبيعات ${v.invoiceNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ totalAmount: v.totalAmount }),
    ip: ctx.ip,
  });
  return loadInvoice(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "SALES_INVOICE_SUBMITTED",
  approve: "SALES_INVOICE_APPROVED",
  return: "SALES_INVOICE_RETURNED",
  reject: "SALES_INVOICE_REJECTED",
  post: "SALES_INVOICE_POSTED",
  reverse: "SALES_INVOICE_REVERSED",
  issue: "SALES_INVOICE_ISSUE",
  cancel: "SALES_INVOICE_CANCELLED",
};

export interface SalesInvoiceTransitionResult {
  item: any;
  reversalId?: string;
}

/**
 * Single choke point for every sales-invoice state change (except create and
 * draft edit). Governance via the shared engine + SALES_INVOICE_TRANSITIONS;
 * posting/reversal via the certified GL engine. Posting recognizes revenue
 * (Dr AR / Cr revenue) and attributes the AR debit to the customer subledger;
 * reversal mirrors it and re-links the mirror AR credit so the subledger nets —
 * all atomic.
 */
export async function transitionSalesInvoice(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
): Promise<SalesInvoiceTransitionResult> {
  const v = await loadInvoice(id);
  if (!v) throw new AppError("فاتورة المبيعات غير موجودة", 404, "NOT_FOUND");

  const t = findTransition(v.status, action, SALES_INVOICE_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: v.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: v.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: SALES_INVOICE_TRANSITIONS,
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
      await validateInvoice(tx as any, linesToInput(v, lines));
      const changed = await tx
        .update(salesInvoices)
        .set({ status: t.to, submittedBy: ctx.user.id, submittedAt: ts, updatedAt: ts })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.status, t.from)))
        .returning({ id: salesInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الإرسال — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    } else if (action === "post") {
      // Row lock + status guard (idempotent — no double posting).
      const locked = (
        await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id)).for("update").limit(1)
      )[0];
      if (!locked || locked.status !== SalesInvoiceStatus.APPROVED)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
      if (await existingSourceEntryId(tx as any, "sales_invoice", id))
        throw new AppError("سبق ترحيل هذه الفاتورة", 409, "ALREADY_POSTED");

      const lines = await loadLines(tx as any, id);
      const computed = await validateInvoice(tx as any, linesToInput(locked, lines));

      const arId = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_RECEIVABLE);
      const cust = (
        await tx.select().from(customers).where(eq(customers.id, locked.customerId)).limit(1)
      )[0];
      const desc = `فاتورة مبيعات ${locked.invoiceNumber} — ${cust?.name || ""}`.trim();

      // One revenue CREDIT leg per line (computed order), then the AR DEBIT control
      // leg (gross). No VAT leg in Sales-1.
      const jLines: any[] = computed.lines.map((l) => ({
        accountId: l.accountId,
        credit: l.lineSubtotal,
        costCenterId: l.costCenterId ?? null,
        description: l.description || desc,
      }));
      jLines.push({ accountId: arId, debit: computed.totalAmount, description: desc });

      const entryId = await postBalancedEntry(tx as any, {
        date: locked.invoiceDate,
        description: desc,
        currency: locked.currency,
        fund: locked.fund,
        projectId: locked.projectId ?? null,
        source: "sales_invoice",
        sourceType: "sales_invoice",
        sourceId: id,
        lines: jLines,
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });

      // Attribute the AR DEBIT line to the customer subledger (receivable rises).
      await linkEntryArLine(tx as any, {
        customerId: locked.customerId,
        entryId,
        sourceType: "sales_invoice",
        userId: ctx.user.id,
      });

      const changed = await tx
        .update(salesInvoices)
        .set({
          status: SalesInvoiceStatus.POSTED,
          journalEntryId: entryId,
          postedBy: ctx.user.id,
          postedAt: ts,
          updatedAt: ts,
        })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.status, SalesInvoiceStatus.APPROVED)))
        .returning({ id: salesInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر الترحيل — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    } else if (action === "reverse") {
      // Phase Sales-2 — serialize with allocate/unallocate on the SAME invoice
      // allocation resource so a reversal can never interleave between an
      // allocation's over-allocation check and its commit (which would leave a
      // REVERSED invoice carrying an active allocation). The advisory lock is
      // taken BEFORE the FOR UPDATE row lock (the 5A.1 deadlock lesson): an
      // allocate INSERT takes FOR KEY SHARE on this invoice row, which would
      // deadlock against a FOR UPDATE held while waiting on the advisory lock.
      await lockInvoiceAllocationResource(tx as any, id);
      const locked = (
        await tx.select().from(salesInvoices).where(eq(salesInvoices.id, id)).for("update").limit(1)
      )[0];
      if (!locked || locked.status !== SalesInvoiceStatus.POSTED)
        throw new AppError("تعذّر العكس — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
      if (!locked.journalEntryId)
        throw new AppError("لا يوجد قيد مُرحَّل لعكسه", 409, "NO_JOURNAL");
      // An invoice with active receipt allocations must not be reversed silently;
      // that would detach settlement history from AR. Unallocate first.
      if (await invoiceHasAllocations(tx as any, id))
        throw new AppError(
          "لا يمكن عكس فاتورة لها تخصيصات تحصيل نشطة — ألغِ التخصيص أولاً",
          409,
          "SALES_INVOICE_HAS_RECEIPT_ALLOCATIONS",
        );
      reversalId = await reverseEntry(tx as any, locked.journalEntryId, ctx.user.id);
      // Attribute the reversal-mirror AR CREDIT line to the SAME customer so the
      // subledger nets against the original AR debit.
      await linkEntryArLine(tx as any, {
        customerId: locked.customerId,
        entryId: reversalId,
        sourceType: "sales_invoice_reversal",
        userId: ctx.user.id,
      });

      const changed = await tx
        .update(salesInvoices)
        .set({
          status: SalesInvoiceStatus.REVERSED,
          reversedBy: ctx.user.id,
          reversedAt: ts,
          updatedAt: ts,
        })
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.status, SalesInvoiceStatus.POSTED)))
        .returning({ id: salesInvoices.id });
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
        .update(salesInvoices)
        .set(cols)
        .where(and(eq(salesInvoices.id, id), eq(salesInvoices.status, t.from)))
        .returning({ id: salesInvoices.id });
      if (changed.length === 0)
        throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة الفاتورة", 409, "STATE_CONFLICT");
    }

    await recordWorkflowEvent(tx as any, {
      entityType: "sales_invoice",
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
    entityType: "sales_invoice",
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

export async function salesInvoiceWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "sales_invoice"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getSalesInvoiceDetail(id: string) {
  const item = await loadInvoice(id);
  if (!item) return null;
  const lines = await loadLines(db, id);
  const history = await salesInvoiceWorkflowHistory(id);
  const journal = item.journalEntryId
    ? (
        await db
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.id, item.journalEntryId))
          .limit(1)
      )[0]
    : null;
  const customer = (
    await db.select().from(customers).where(eq(customers.id, item.customerId)).limit(1)
  )[0];
  return { item, lines, history, journal, customer };
}

export interface SalesInvoiceFilters {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/** Shared WHERE for the invoice list + its summary — filters run in SQL, not JS. */
function salesInvoiceWhere(filters: SalesInvoiceFilters) {
  const conds: any[] = [];
  if (filters.status) conds.push(eq(salesInvoices.status, filters.status));
  if (filters.customerId) conds.push(eq(salesInvoices.customerId, filters.customerId));
  if (filters.dateFrom) conds.push(gte(salesInvoices.invoiceDate, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(salesInvoices.invoiceDate, filters.dateTo));
  const q = (filters.search || "").trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(${salesInvoices.invoiceNumber} ILIKE ${like} OR ${salesInvoices.customerReference} ILIKE ${like})`,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Bounded, SQL-filtered invoice list. Filters + status counts + outstanding total
 * are computed in a single aggregate over the WHOLE filtered set (SQL FILTER),
 * independent of the returned page. Only the page's rows are materialized.
 */
export async function listSalesInvoices(filters: SalesInvoiceFilters & PageParams = {}) {
  const pg = resolvePage(filters);
  const where = salesInvoiceWhere(filters);
  const S = SalesInvoiceStatus;
  const agg = (
    await (db as any)
      .select({
        total: sql<number>`COUNT(*)`,
        draft: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.DRAFT})`,
        submitted: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.SUBMITTED})`,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.APPROVED})`,
        posted: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.POSTED})`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.REJECTED})`,
        reversed: sql<number>`COUNT(*) FILTER (WHERE ${salesInvoices.status} = ${S.REVERSED})`,
        outstanding: sql<number>`COALESCE(SUM(${salesInvoices.totalAmount}) FILTER (WHERE ${salesInvoices.status} = ${S.POSTED}), 0)`,
      })
      .from(salesInvoices)
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
    outstanding: Number(agg?.outstanding || 0),
  };
  const items = (await (db as any)
    .select()
    .from(salesInvoices)
    .where(where)
    .orderBy(desc(salesInvoices.createdAt))
    .limit(pg.limit)
    .offset(pg.offset)) as any[];
  return { ...paginatedResult(items, summary.total, pg), items, summary };
}
