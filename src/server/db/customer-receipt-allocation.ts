/**
 * Phase Sales-2 — Customer Receipt ↔ Sales-Invoice ALLOCATION.
 *
 * Allocation is SETTLEMENT METADATA, never accounting. The GL is unchanged and
 * remains the source of truth:
 *   - a Sales Invoice's ORIGINAL receivable is the AR DEBIT journal line of its
 *     POSTED entry;
 *   - a Customer Receipt's value is the AR CREDIT journal line of its POSTED entry;
 *   - invoice OUTSTANDING  = originalReceivable − Σ active allocations;
 *   - receipt UNAPPLIED    = arCredit           − Σ active allocations.
 * No mutable parallel balance is stored. Creating, editing or removing an
 * allocation writes NO journal, NO journal line, NO customer_journal_link, NO
 * cash/bank movement. Mirror of the supplier payment↔invoice allocation on AR.
 *
 * Concurrency: allocate/unallocate serialize on TWO advisory locks — the receipt
 * resource AND the invoice resource — taken in deterministic (sorted) order so two
 * allocations sharing either resource cannot both pass the over-allocation check.
 * Everything is recomputed from posted AR evidence inside that transaction.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  customerReceipts,
  salesInvoices,
  customerReceiptAllocations,
  journalLines,
} from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { LOCK_NS } from "./lock-namespaces";
import { AppError } from "./errors";
import { JournalStatus, SalesInvoiceStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

const TOL = 0.005;
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
/** Float-noise epsilon for capacity comparisons — absorbs binary residue only. */
const EPS = 1e-6;

/** 2dp money guard — sub-cent input is REJECTED, never silently rounded. */
function assertMoney2dp(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v))
    throw new AppError("قيمة نقدية غير صالحة (غير محدَّدة)", 400, "INVALID_MONEY_PRECISION");
  if (Math.abs(r2(v) - v) > EPS)
    throw new AppError(
      "قيمة التخصيص يجب أن تكون بدقة خانتين عشريتين (لا تُقبل أجزاء الهللة)",
      400,
      "INVALID_MONEY_PRECISION",
    );
  return r2(v);
}
type Db = { select: (...a: any[]) => any; execute: (q: any) => Promise<any> };

/** The AR control account id (system_key accounts_receivable). */
async function arAccountId(dbh: Db): Promise<string> {
  return resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);
}

/** ORIGINAL receivable of a POSTED invoice = the AR DEBIT line of its entry. */
async function invoiceArDebit(dbh: Db, invoice: any, arId: string): Promise<number> {
  if (!invoice?.journalEntryId) return 0;
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.debit}),0)` })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, invoice.journalEntryId),
          eq(journalLines.accountId, arId),
        ),
      )
  )[0] as any;
  return r2(Number(row?.v || 0));
}

/** Value of a POSTED receipt = the AR CREDIT line of its entry. */
async function receiptArCredit(dbh: Db, receipt: any, arId: string): Promise<number> {
  if (!receipt?.journalEntryId) return 0;
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.credit}),0)` })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, receipt.journalEntryId),
          eq(journalLines.accountId, arId),
        ),
      )
  )[0] as any;
  return r2(Number(row?.v || 0));
}

async function sumAllocForInvoice(dbh: Db, invoiceId: string, excludeReceiptId?: string) {
  const conds: any[] = [eq(customerReceiptAllocations.salesInvoiceId, invoiceId)];
  if (excludeReceiptId)
    conds.push(ne(customerReceiptAllocations.customerReceiptId, excludeReceiptId));
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${customerReceiptAllocations.amount}),0)` })
      .from(customerReceiptAllocations)
      .where(and(...conds))
  )[0] as any;
  return r2(Number(row?.v || 0));
}
async function sumAllocForReceipt(dbh: Db, receiptId: string, excludeInvoiceId?: string) {
  const conds: any[] = [eq(customerReceiptAllocations.customerReceiptId, receiptId)];
  if (excludeInvoiceId) conds.push(ne(customerReceiptAllocations.salesInvoiceId, excludeInvoiceId));
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${customerReceiptAllocations.amount}),0)` })
      .from(customerReceiptAllocations)
      .where(and(...conds))
  )[0] as any;
  return r2(Number(row?.v || 0));
}

/** Take the two allocation resource locks in deterministic order (no deadlock). */
async function lockPair(tx: Db, receiptId: string, invoiceId: string) {
  for (const key of [receiptId, invoiceId].sort())
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${LOCK_NS.RECEIVABLE_ALLOCATION}, hashtext(${key}))`,
    );
}

/**
 * Acquire ONLY the invoice-side allocation resource lock — the identical scheme
 * lockPair uses. Callers OUTSIDE the allocation service (Sales Invoice reversal)
 * take this so their allocation check serializes with allocate/unallocate on the
 * same invoice: a reversal can never interleave between an allocation's
 * over-allocation check and its commit.
 */
export async function lockInvoiceAllocationResource(tx: Db, invoiceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.RECEIVABLE_ALLOCATION}, hashtext(${invoiceId}))`,
  );
}

// ------------------------------- read-only settlement views ------------------

/** Invoice settlement: original AR receivable, allocated, outstanding + allocations. */
export async function invoiceSettlement(dbh: Db, invoiceId: string) {
  const invoice = (
    await (dbh as any).select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).limit(1)
  )[0] as any;
  if (!invoice) throw new AppError("الفاتورة غير موجودة", 404, "INVOICE_NOT_FOUND");
  const arId = await arAccountId(dbh);
  const originalReceivable = await invoiceArDebit(dbh, invoice, arId);
  const allocated = await sumAllocForInvoice(dbh, invoiceId);
  const allocations = (await (dbh as any)
    .select({
      id: customerReceiptAllocations.id,
      customerReceiptId: customerReceiptAllocations.customerReceiptId,
      amount: customerReceiptAllocations.amount,
      receiptDate: customerReceipts.receiptDate,
      receiptReference: customerReceipts.reference,
    })
    .from(customerReceiptAllocations)
    .innerJoin(
      customerReceipts,
      eq(customerReceiptAllocations.customerReceiptId, customerReceipts.id),
    )
    .where(eq(customerReceiptAllocations.salesInvoiceId, invoiceId))) as any[];
  return {
    invoiceId,
    status: invoice.status,
    originalReceivable,
    allocated,
    outstanding: r2(originalReceivable - allocated),
    allocations,
  };
}

/** Receipt settlement: AR credit value, allocated, unapplied + allocations. */
export async function receiptSettlement(dbh: Db, receiptId: string) {
  const receipt = (
    await (dbh as any)
      .select()
      .from(customerReceipts)
      .where(eq(customerReceipts.id, receiptId))
      .limit(1)
  )[0] as any;
  if (!receipt) throw new AppError("سند القبض غير موجود", 404, "RECEIPT_NOT_FOUND");
  const arId = await arAccountId(dbh);
  const arCredit = await receiptArCredit(dbh, receipt, arId);
  const allocated = await sumAllocForReceipt(dbh, receiptId);
  const allocations = (await (dbh as any)
    .select({
      id: customerReceiptAllocations.id,
      salesInvoiceId: customerReceiptAllocations.salesInvoiceId,
      amount: customerReceiptAllocations.amount,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      dueDate: salesInvoices.dueDate,
    })
    .from(customerReceiptAllocations)
    .innerJoin(salesInvoices, eq(customerReceiptAllocations.salesInvoiceId, salesInvoices.id))
    .where(eq(customerReceiptAllocations.customerReceiptId, receiptId))) as any[];
  return {
    receiptId,
    status: receipt.status,
    arCredit,
    allocated,
    unapplied: r2(arCredit - allocated),
    allocations,
  };
}

/** True iff the invoice has any allocation row (used by the reversal guard). */
export async function invoiceHasAllocations(dbh: Db, invoiceId: string): Promise<boolean> {
  const row = (
    await (dbh as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(customerReceiptAllocations)
      .where(eq(customerReceiptAllocations.salesInvoiceId, invoiceId))
  )[0] as any;
  return Number(row?.c || 0) > 0;
}

// ------------------------------- allocate / unallocate -----------------------

export interface AllocateInput {
  receiptId: string;
  invoiceId: string;
  amount: number;
}

/**
 * Set the (receipt, invoice) allocation to `amount` (absolute). Idempotent; the
 * UNIQUE(receipt, invoice) index is the final DB safety net. Creates NO accounting.
 */
export async function allocate(ctx: Ctx, input: AllocateInput) {
  const amount = assertMoney2dp(input.amount);
  if (!(amount > 0))
    throw new AppError("قيمة التخصيص يجب أن تكون أكبر من صفر", 400, "AMOUNT_INVALID");

  const result = await db.transaction(async (tx) => {
    await lockPair(tx as any, input.receiptId, input.invoiceId);
    const arId = await arAccountId(tx as any);

    const receipt = (
      await (tx as any)
        .select()
        .from(customerReceipts)
        .where(eq(customerReceipts.id, input.receiptId))
        .limit(1)
    )[0] as any;
    if (!receipt) throw new AppError("سند القبض غير موجود", 404, "RECEIPT_NOT_FOUND");
    if (receipt.status !== "posted" || !receipt.journalEntryId)
      throw new AppError("لا يمكن التخصيص إلا من سند قبض مُرحَّل", 409, "RECEIPT_NOT_POSTED");

    const invoice = (
      await (tx as any)
        .select()
        .from(salesInvoices)
        .where(eq(salesInvoices.id, input.invoiceId))
        .limit(1)
    )[0] as any;
    if (!invoice) throw new AppError("الفاتورة غير موجودة", 404, "INVOICE_NOT_FOUND");
    if (invoice.status !== SalesInvoiceStatus.POSTED)
      throw new AppError("لا يمكن التخصيص إلا على فاتورة مُرحَّلة", 409, "INVOICE_NOT_POSTED");

    if (receipt.customerId !== invoice.customerId)
      throw new AppError(
        "لا يمكن تخصيص تحصيل عميل على فاتورة عميل آخر",
        409,
        "CROSS_CUSTOMER_ALLOCATION",
      );

    const arCredit = await receiptArCredit(tx as any, receipt, arId);
    const origReceivable = await invoiceArDebit(tx as any, invoice, arId);
    const allocOtherReceipt = await sumAllocForReceipt(tx as any, input.receiptId, input.invoiceId);
    const allocOtherInvoice = await sumAllocForInvoice(tx as any, input.invoiceId, input.receiptId);
    const remainingUnappliedExcl = r2(arCredit - allocOtherReceipt);
    const invoiceOutstandingExcl = r2(origReceivable - allocOtherInvoice);

    if (amount > invoiceOutstandingExcl + EPS)
      throw new AppError(
        `التخصيص يتجاوز المتبقي على الفاتورة (${invoiceOutstandingExcl})`,
        409,
        "INVOICE_OVER_ALLOCATED",
      );
    if (amount > remainingUnappliedExcl + EPS)
      throw new AppError(
        `التخصيص يتجاوز المتبقي غير المُخصَّص من التحصيل (${remainingUnappliedExcl})`,
        409,
        "RECEIPT_OVER_ALLOCATED",
      );

    const existing = (
      await (tx as any)
        .select()
        .from(customerReceiptAllocations)
        .where(
          and(
            eq(customerReceiptAllocations.customerReceiptId, input.receiptId),
            eq(customerReceiptAllocations.salesInvoiceId, input.invoiceId),
          ),
        )
        .limit(1)
    )[0] as any;

    const ts = now();
    let action: "CREATED" | "UPDATED";
    let oldAmount: number | null = null;
    if (existing) {
      oldAmount = r2(Number(existing.amount));
      await (tx as any)
        .update(customerReceiptAllocations)
        .set({ amount, updatedBy: ctx.user.id, updatedAt: ts })
        .where(eq(customerReceiptAllocations.id, existing.id));
      action = "UPDATED";
    } else {
      await (tx as any).insert(customerReceiptAllocations).values({
        id: genId("CRA"),
        customerReceiptId: input.receiptId,
        salesInvoiceId: input.invoiceId,
        amount,
        createdBy: ctx.user.id,
        createdAt: ts,
      });
      action = "CREATED";
    }
    return {
      action,
      oldAmount,
      amount,
      invoiceOutstanding: r2(origReceivable - allocOtherInvoice - amount),
      receiptUnapplied: r2(arCredit - allocOtherReceipt - amount),
    };
  });

  await addAudit({
    action:
      result.action === "CREATED"
        ? "CUSTOMER_RECEIPT_ALLOCATION_CREATED"
        : "CUSTOMER_RECEIPT_ALLOCATION_UPDATED",
    entityType: "customer_receipt_allocation",
    entityId: `${input.receiptId}:${input.invoiceId}`,
    description: `تخصيص تحصيل ${input.receiptId} على فاتورة ${input.invoiceId} بمبلغ ${result.amount}${
      result.oldAmount != null ? ` (كان ${result.oldAmount})` : ""
    }`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return result;
}

/** Remove the (receipt, invoice) allocation. NO accounting reversal; audited. */
export async function unallocate(ctx: Ctx, input: { receiptId: string; invoiceId: string }) {
  const removed = await db.transaction(async (tx) => {
    await lockPair(tx as any, input.receiptId, input.invoiceId);
    const existing = (
      await (tx as any)
        .select()
        .from(customerReceiptAllocations)
        .where(
          and(
            eq(customerReceiptAllocations.customerReceiptId, input.receiptId),
            eq(customerReceiptAllocations.salesInvoiceId, input.invoiceId),
          ),
        )
        .limit(1)
    )[0] as any;
    if (!existing) throw new AppError("التخصيص غير موجود", 404, "ALLOCATION_NOT_FOUND");
    await (tx as any)
      .delete(customerReceiptAllocations)
      .where(eq(customerReceiptAllocations.id, existing.id));
    return { amount: r2(Number(existing.amount)) };
  });
  await addAudit({
    action: "CUSTOMER_RECEIPT_ALLOCATION_REMOVED",
    entityType: "customer_receipt_allocation",
    entityId: `${input.receiptId}:${input.invoiceId}`,
    description: `إلغاء تخصيص تحصيل ${input.receiptId} عن فاتورة ${input.invoiceId} (كان ${removed.amount})`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return removed;
}

// ------------------------------- allocation candidates (bounded) -------------

/**
 * POSTED invoices for the receipt's customer with outstanding > 0 — the bounded,
 * searchable candidate list for the allocation UI. Search by invoice number /
 * customer reference. Bounded (default 20, max 50).
 */
export async function allocationCandidates(
  dbh: Db,
  receiptId: string,
  opts: { q?: string; limit?: number } = {},
) {
  const receipt = (
    await (dbh as any)
      .select()
      .from(customerReceipts)
      .where(eq(customerReceipts.id, receiptId))
      .limit(1)
  )[0] as any;
  if (!receipt) throw new AppError("سند القبض غير موجود", 404, "RECEIPT_NOT_FOUND");
  const arId = await arAccountId(dbh);
  const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  const q = (opts.q || "").trim();
  const like = `%${q}%`;
  const rows = (await (dbh as any).execute(sql`
    SELECT sv.id, sv.invoice_number, sv.customer_reference, sv.invoice_date, sv.due_date,
           jl.debit AS original_receivable,
           COALESCE(a.allocated,0) AS allocated,
           (jl.debit - COALESCE(a.allocated,0)) AS outstanding
    FROM sales_invoices sv
    JOIN journal_entries je ON je.id = sv.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = sv.journal_entry_id AND jl.account_id = ${arId}
    LEFT JOIN (
      SELECT sales_invoice_id, SUM(amount) AS allocated
      FROM customer_receipt_allocations GROUP BY sales_invoice_id
    ) a ON a.sales_invoice_id = sv.id
    WHERE sv.customer_id = ${receipt.customerId}
      AND sv.status = ${SalesInvoiceStatus.POSTED}
      AND (jl.debit - COALESCE(a.allocated,0)) > ${TOL}
      ${q ? sql`AND (sv.invoice_number ILIKE ${like} OR sv.customer_reference ILIKE ${like})` : sql``}
    ORDER BY sv.due_date ASC NULLS LAST, sv.invoice_date ASC, sv.id ASC
    LIMIT ${limit}
  `)) as any;
  const items = (rows.rows ?? rows ?? []).map((r: any) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    customerReference: r.customer_reference,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    originalReceivable: r2(Number(r.original_receivable)),
    allocated: r2(Number(r.allocated)),
    outstanding: r2(Number(r.outstanding)),
  }));
  return { items };
}

/**
 * Bounded, set-based list of POSTED customer receipts with GL-derived arCredit,
 * allocated and unapplied. Search by receipt id / reference / customer name/code.
 */
export async function listCustomerReceipts(
  dbh: Db,
  opts: {
    customerId?: string;
    search?: string;
    onlyUnapplied?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const arId = await arAccountId(dbh);
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(opts.pageSize) || 25)));
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const offset = (page - 1) * pageSize;
  const q = (opts.search || "").trim();
  const like = `%${q}%`;
  const rows = (await (dbh as any).execute(sql`
    SELECT cr.id, cr.customer_id, cr.receipt_date, cr.reference, cr.receipt_method,
           c.name AS customer_name, c.customer_code,
           COALESCE(rc.credit,0) AS ar_credit,
           COALESCE(al.allocated,0) AS allocated,
           (COALESCE(rc.credit,0) - COALESCE(al.allocated,0)) AS unapplied,
           COUNT(*) OVER() AS total
    FROM customer_receipts cr
    JOIN customers c ON c.id = cr.customer_id
    JOIN (SELECT journal_entry_id, SUM(credit) AS credit FROM journal_lines WHERE account_id = ${arId} GROUP BY journal_entry_id) rc
      ON rc.journal_entry_id = cr.journal_entry_id
    LEFT JOIN (SELECT customer_receipt_id, SUM(amount) AS allocated FROM customer_receipt_allocations GROUP BY customer_receipt_id) al
      ON al.customer_receipt_id = cr.id
    WHERE cr.status = 'posted'
      ${opts.customerId ? sql`AND cr.customer_id = ${opts.customerId}` : sql``}
      ${q ? sql`AND (cr.id ILIKE ${like} OR cr.reference ILIKE ${like} OR c.name ILIKE ${like} OR c.customer_code ILIKE ${like})` : sql``}
      ${opts.onlyUnapplied ? sql`AND (COALESCE(rc.credit,0) - COALESCE(al.allocated,0)) > ${TOL}` : sql``}
    ORDER BY cr.receipt_date DESC, cr.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `)) as any;
  const list = (rows.rows ?? rows ?? []) as any[];
  const total = list.length ? Number(list[0].total) : 0;
  const items = list.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerCode: r.customer_code,
    receiptDate: r.receipt_date,
    reference: r.reference,
    receiptMethod: r.receipt_method,
    arCredit: r2(Number(r.ar_credit)),
    allocated: r2(Number(r.allocated)),
    unapplied: r2(Number(r.unapplied)),
  }));
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Posted sales invoices for one customer with settlement columns for the customer
 * statement: original AR receivable (posted AR debit), allocated, outstanding, due
 * date. Set-based, bounded.
 */
export async function listCustomerSalesInvoices(
  dbh: Db,
  opts: { customerId: string; limit?: number; offset?: number },
) {
  const arId = await arAccountId(dbh);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const rows = (await (dbh as any).execute(sql`
    SELECT sv.id, sv.invoice_number, sv.invoice_date, sv.due_date,
           jl.debit AS original_receivable,
           COALESCE(a.allocated,0) AS allocated,
           (jl.debit - COALESCE(a.allocated,0)) AS outstanding,
           COUNT(*) OVER() AS total
    FROM sales_invoices sv
    JOIN journal_entries je ON je.id = sv.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = sv.journal_entry_id AND jl.account_id = ${arId}
    LEFT JOIN (
      SELECT sales_invoice_id, SUM(amount) AS allocated
      FROM customer_receipt_allocations GROUP BY sales_invoice_id
    ) a ON a.sales_invoice_id = sv.id
    WHERE sv.status = ${SalesInvoiceStatus.POSTED} AND sv.customer_id = ${opts.customerId}
    ORDER BY sv.invoice_date DESC, sv.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;
  const list = (rows.rows ?? rows ?? []) as any[];
  const total = list.length ? Number(list[0].total) : 0;
  const items = list.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date || null,
    originalReceivable: r2(Number(r.original_receivable)),
    allocated: r2(Number(r.allocated)),
    outstanding: r2(Number(r.outstanding)),
  }));
  return { items, total };
}
