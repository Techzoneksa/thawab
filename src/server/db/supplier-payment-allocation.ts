/**
 * Phase 5A — Supplier Payment ↔ Invoice ALLOCATION & AP AGING.
 *
 * Allocation is SETTLEMENT METADATA, never accounting. The GL is unchanged and
 * remains the source of truth:
 *   - a Supplier Invoice's ORIGINAL payable is the AP CREDIT journal line of its
 *     POSTED entry;
 *   - a Supplier Payment's value is the AP DEBIT journal line of its POSTED entry;
 *   - invoice OUTSTANDING  = originalPayable − Σ active allocations;
 *   - payment UNAPPLIED    = apDebit       − Σ active allocations.
 * No mutable parallel balance is stored (no invoice.balance / supplier.balance /
 * payment.remaining). Creating, editing or removing an allocation writes NO
 * journal, NO journal line, NO supplier_journal_link, NO cash/bank movement.
 *
 * Concurrency: allocate/unallocate serialize on TWO advisory locks — the payment
 * resource AND the invoice resource — taken in a deterministic (sorted) order so
 * two allocations that share either resource cannot both pass the over-allocation
 * check. Everything is recomputed from posted AP evidence inside that transaction.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import {
  supplierPayments,
  supplierInvoices,
  supplierPaymentAllocations,
  journalLines,
  journalEntries,
} from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { LOCK_NS } from "./lock-namespaces";
import { AppError } from "./errors";
import { JournalStatus, SupplierInvoiceStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

const TOL = 0.005;
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Float-noise epsilon for CAPACITY comparisons between two canonical 2dp values
 * (over-allocation guards). It absorbs binary residue ONLY (~1e-13) and is far
 * smaller than one halala, so a tolerance can NEVER authorize an over-allocation
 * by a fraction of a cent. Distinct from TOL (a half-cent display threshold that
 * hides sub-cent noise in aging/unapplied filters).
 */
const EPS = 1e-6;

/**
 * Allocation money policy — the accounting currency is 2 decimal places.
 * A persisted allocation amount MUST be finite, > 0 and exactly a 2dp value
 * (no fraction smaller than 0.01). Sub-cent input is REJECTED, never silently
 * rounded, so a hidden fraction of a halala can never enter settlement or slip
 * past an over-allocation guard. Returns the canonical 2dp number.
 */
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

/** The AP control account id (system_key accounts_payable). */
async function apAccountId(dbh: Db): Promise<string> {
  return resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
}

/** ORIGINAL payable of a POSTED invoice = the AP CREDIT line of its entry. */
async function invoiceApCredit(dbh: Db, invoice: any, apId: string): Promise<number> {
  if (!invoice?.journalEntryId) return 0;
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.credit}),0)` })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, invoice.journalEntryId),
          eq(journalLines.accountId, apId),
        ),
      )
  )[0] as any;
  return r2(Number(row?.v || 0));
}

/** Value of a POSTED payment = the AP DEBIT line of its entry. */
async function paymentApDebit(dbh: Db, payment: any, apId: string): Promise<number> {
  if (!payment?.journalEntryId) return 0;
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${journalLines.debit}),0)` })
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, payment.journalEntryId),
          eq(journalLines.accountId, apId),
        ),
      )
  )[0] as any;
  return r2(Number(row?.v || 0));
}

async function sumAllocForInvoice(dbh: Db, invoiceId: string, excludePaymentId?: string) {
  const conds: any[] = [eq(supplierPaymentAllocations.supplierInvoiceId, invoiceId)];
  if (excludePaymentId)
    conds.push(ne(supplierPaymentAllocations.supplierPaymentId, excludePaymentId));
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}),0)` })
      .from(supplierPaymentAllocations)
      .where(and(...conds))
  )[0] as any;
  return r2(Number(row?.v || 0));
}
async function sumAllocForPayment(dbh: Db, paymentId: string, excludeInvoiceId?: string) {
  const conds: any[] = [eq(supplierPaymentAllocations.supplierPaymentId, paymentId)];
  if (excludeInvoiceId)
    conds.push(ne(supplierPaymentAllocations.supplierInvoiceId, excludeInvoiceId));
  const row = (
    await (dbh as any)
      .select({ v: sql<number>`COALESCE(SUM(${supplierPaymentAllocations.amount}),0)` })
      .from(supplierPaymentAllocations)
      .where(and(...conds))
  )[0] as any;
  return r2(Number(row?.v || 0));
}

/** Take the two allocation resource locks in deterministic order (no deadlock). */
async function lockPair(tx: Db, paymentId: string, invoiceId: string) {
  for (const key of [paymentId, invoiceId].sort())
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${LOCK_NS.PAYMENT_ALLOCATION}, hashtext(${key}))`,
    );
}

/**
 * Acquire ONLY the invoice-side allocation resource lock — the identical scheme
 * lockPair uses for its invoice key. Callers OUTSIDE the allocation service
 * (Supplier Invoice reversal) take this so their allocation check serializes
 * with allocate/unallocate on the same invoice: a reversal can never interleave
 * between an allocation's over-allocation check and its commit. A single shared
 * resource cannot form a lock-order cycle with lockPair.
 */
export async function lockInvoiceAllocationResource(tx: Db, invoiceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.PAYMENT_ALLOCATION}, hashtext(${invoiceId}))`,
  );
}

// ------------------------------- read-only settlement views ------------------

/** Invoice settlement: original AP payable, allocated, outstanding + allocations. */
export async function invoiceSettlement(dbh: Db, invoiceId: string) {
  const invoice = (
    await (dbh as any)
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, invoiceId))
      .limit(1)
  )[0] as any;
  if (!invoice) throw new AppError("الفاتورة غير موجودة", 404, "INVOICE_NOT_FOUND");
  const apId = await apAccountId(dbh);
  const originalPayable = await invoiceApCredit(dbh, invoice, apId);
  const allocated = await sumAllocForInvoice(dbh, invoiceId);
  const allocations = (await (dbh as any)
    .select({
      id: supplierPaymentAllocations.id,
      supplierPaymentId: supplierPaymentAllocations.supplierPaymentId,
      amount: supplierPaymentAllocations.amount,
      paymentDate: supplierPayments.paymentDate,
      paymentReference: supplierPayments.reference,
    })
    .from(supplierPaymentAllocations)
    .innerJoin(
      supplierPayments,
      eq(supplierPaymentAllocations.supplierPaymentId, supplierPayments.id),
    )
    .where(eq(supplierPaymentAllocations.supplierInvoiceId, invoiceId))) as any[];
  return {
    invoiceId,
    status: invoice.status,
    originalPayable,
    allocated,
    outstanding: r2(originalPayable - allocated),
    allocations,
  };
}

/** Payment settlement: AP debit value, allocated, unapplied + allocations. */
export async function paymentSettlement(dbh: Db, paymentId: string) {
  const payment = (
    await (dbh as any)
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.id, paymentId))
      .limit(1)
  )[0] as any;
  if (!payment) throw new AppError("الدفعة غير موجودة", 404, "PAYMENT_NOT_FOUND");
  const apId = await apAccountId(dbh);
  const apDebit = await paymentApDebit(dbh, payment, apId);
  const allocated = await sumAllocForPayment(dbh, paymentId);
  const allocations = (await (dbh as any)
    .select({
      id: supplierPaymentAllocations.id,
      supplierInvoiceId: supplierPaymentAllocations.supplierInvoiceId,
      amount: supplierPaymentAllocations.amount,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      dueDate: supplierInvoices.dueDate,
    })
    .from(supplierPaymentAllocations)
    .innerJoin(
      supplierInvoices,
      eq(supplierPaymentAllocations.supplierInvoiceId, supplierInvoices.id),
    )
    .where(eq(supplierPaymentAllocations.supplierPaymentId, paymentId))) as any[];
  return {
    paymentId,
    status: payment.status,
    apDebit,
    allocated,
    unapplied: r2(apDebit - allocated),
    allocations,
  };
}

/** True iff the invoice has any allocation row (used by the reversal guard). */
export async function invoiceHasAllocations(dbh: Db, invoiceId: string): Promise<boolean> {
  const row = (
    await (dbh as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(supplierPaymentAllocations)
      .where(eq(supplierPaymentAllocations.supplierInvoiceId, invoiceId))
  )[0] as any;
  return Number(row?.c || 0) > 0;
}

// ------------------------------- allocate / unallocate -----------------------

export interface AllocateInput {
  paymentId: string;
  invoiceId: string;
  amount: number;
}

/**
 * Set the (payment, invoice) allocation to `amount` (absolute). Idempotent: a
 * retry with the same amount is a no-op update; the UNIQUE(payment, invoice)
 * index is the final DB safety net. Creates NO accounting.
 */
export async function allocate(ctx: Ctx, input: AllocateInput) {
  // Reject sub-cent / non-finite input BEFORE any capacity math — a hidden
  // fraction must never be persisted or absorbed by a tolerance.
  const amount = assertMoney2dp(input.amount);
  if (!(amount > 0))
    throw new AppError("قيمة التخصيص يجب أن تكون أكبر من صفر", 400, "AMOUNT_INVALID");

  const result = await db.transaction(async (tx) => {
    await lockPair(tx as any, input.paymentId, input.invoiceId);
    const apId = await apAccountId(tx as any);

    const payment = (
      await (tx as any)
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, input.paymentId))
        .limit(1)
    )[0] as any;
    if (!payment) throw new AppError("الدفعة غير موجودة", 404, "PAYMENT_NOT_FOUND");
    if (payment.status !== "posted" || !payment.journalEntryId)
      throw new AppError("لا يمكن التخصيص إلا من دفعة مُرحَّلة", 409, "PAYMENT_NOT_POSTED");

    const invoice = (
      await (tx as any)
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, input.invoiceId))
        .limit(1)
    )[0] as any;
    if (!invoice) throw new AppError("الفاتورة غير موجودة", 404, "INVOICE_NOT_FOUND");
    if (invoice.status !== SupplierInvoiceStatus.POSTED)
      throw new AppError("لا يمكن التخصيص إلا على فاتورة مُرحَّلة", 409, "INVOICE_NOT_POSTED");

    if (payment.supplierId !== invoice.supplierId)
      throw new AppError(
        "لا يمكن تخصيص دفعة مورد على فاتورة مورد آخر",
        409,
        "CROSS_SUPPLIER_ALLOCATION",
      );

    const apDebit = await paymentApDebit(tx as any, payment, apId);
    const origPayable = await invoiceApCredit(tx as any, invoice, apId);
    // Existing allocations EXCLUDING this pair (this pair may be a re-set).
    const allocOtherPayment = await sumAllocForPayment(tx as any, input.paymentId, input.invoiceId);
    const allocOtherInvoice = await sumAllocForInvoice(tx as any, input.invoiceId, input.paymentId);
    const remainingUnappliedExcl = r2(apDebit - allocOtherPayment);
    const invoiceOutstandingExcl = r2(origPayable - allocOtherInvoice);

    // Capacity guards compare two canonical 2dp values; EPS absorbs binary
    // residue only — it can never authorize even one halala of over-allocation.
    if (amount > invoiceOutstandingExcl + EPS)
      throw new AppError(
        `التخصيص يتجاوز المتبقي على الفاتورة (${invoiceOutstandingExcl})`,
        409,
        "INVOICE_OVER_ALLOCATED",
      );
    if (amount > remainingUnappliedExcl + EPS)
      throw new AppError(
        `التخصيص يتجاوز المتبقي غير المُخصَّص من الدفعة (${remainingUnappliedExcl})`,
        409,
        "PAYMENT_OVER_ALLOCATED",
      );

    const existing = (
      await (tx as any)
        .select()
        .from(supplierPaymentAllocations)
        .where(
          and(
            eq(supplierPaymentAllocations.supplierPaymentId, input.paymentId),
            eq(supplierPaymentAllocations.supplierInvoiceId, input.invoiceId),
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
        .update(supplierPaymentAllocations)
        .set({ amount, updatedBy: ctx.user.id, updatedAt: ts })
        .where(eq(supplierPaymentAllocations.id, existing.id));
      action = "UPDATED";
    } else {
      await (tx as any).insert(supplierPaymentAllocations).values({
        id: genId("SPA"),
        supplierPaymentId: input.paymentId,
        supplierInvoiceId: input.invoiceId,
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
      invoiceOutstanding: r2(origPayable - allocOtherInvoice - amount),
      paymentUnapplied: r2(apDebit - allocOtherPayment - amount),
    };
  });

  await addAudit({
    action:
      result.action === "CREATED"
        ? "SUPPLIER_PAYMENT_ALLOCATION_CREATED"
        : "SUPPLIER_PAYMENT_ALLOCATION_UPDATED",
    entityType: "supplier_payment_allocation",
    entityId: `${input.paymentId}:${input.invoiceId}`,
    description: `تخصيص دفعة ${input.paymentId} على فاتورة ${input.invoiceId} بمبلغ ${result.amount}${
      result.oldAmount != null ? ` (كان ${result.oldAmount})` : ""
    }`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return result;
}

/** Remove the (payment, invoice) allocation. NO accounting reversal; audited. */
export async function unallocate(ctx: Ctx, input: { paymentId: string; invoiceId: string }) {
  const removed = await db.transaction(async (tx) => {
    await lockPair(tx as any, input.paymentId, input.invoiceId);
    const existing = (
      await (tx as any)
        .select()
        .from(supplierPaymentAllocations)
        .where(
          and(
            eq(supplierPaymentAllocations.supplierPaymentId, input.paymentId),
            eq(supplierPaymentAllocations.supplierInvoiceId, input.invoiceId),
          ),
        )
        .limit(1)
    )[0] as any;
    if (!existing) throw new AppError("التخصيص غير موجود", 404, "ALLOCATION_NOT_FOUND");
    await (tx as any)
      .delete(supplierPaymentAllocations)
      .where(eq(supplierPaymentAllocations.id, existing.id));
    return { amount: r2(Number(existing.amount)) };
  });
  await addAudit({
    action: "SUPPLIER_PAYMENT_ALLOCATION_REMOVED",
    entityType: "supplier_payment_allocation",
    entityId: `${input.paymentId}:${input.invoiceId}`,
    description: `إلغاء تخصيص دفعة ${input.paymentId} عن فاتورة ${input.invoiceId} (كان ${removed.amount})`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return removed;
}

// ------------------------------- allocation candidates (bounded) -------------

/**
 * POSTED invoices for the payment's supplier with outstanding > 0 — the bounded,
 * searchable candidate list for the allocation UI. Search by invoice number /
 * external supplier invoice number. Bounded (default 20, max 50).
 */
export async function allocationCandidates(
  dbh: Db,
  paymentId: string,
  opts: { q?: string; limit?: number } = {},
) {
  const payment = (
    await (dbh as any)
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.id, paymentId))
      .limit(1)
  )[0] as any;
  if (!payment) throw new AppError("الدفعة غير موجودة", 404, "PAYMENT_NOT_FOUND");
  const apId = await apAccountId(dbh);
  const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  const q = (opts.q || "").trim();
  const like = `%${q}%`;
  const rows = (await (dbh as any).execute(sql`
    SELECT si.id, si.invoice_number, si.supplier_invoice_number, si.invoice_date, si.due_date,
           jl.credit AS original_payable,
           COALESCE(a.allocated,0) AS allocated,
           (jl.credit - COALESCE(a.allocated,0)) AS outstanding
    FROM supplier_invoices si
    JOIN journal_entries je ON je.id = si.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = si.journal_entry_id AND jl.account_id = ${apId}
    LEFT JOIN (
      SELECT supplier_invoice_id, SUM(amount) AS allocated
      FROM supplier_payment_allocations GROUP BY supplier_invoice_id
    ) a ON a.supplier_invoice_id = si.id
    WHERE si.supplier_id = ${payment.supplierId}
      AND si.status = ${SupplierInvoiceStatus.POSTED}
      AND (jl.credit - COALESCE(a.allocated,0)) > ${TOL}
      ${q ? sql`AND (si.invoice_number ILIKE ${like} OR si.supplier_invoice_number ILIKE ${like})` : sql``}
    ORDER BY si.due_date ASC NULLS LAST, si.invoice_date ASC, si.id ASC
    LIMIT ${limit}
  `)) as any;
  const items = (rows.rows ?? rows ?? []).map((r: any) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    supplierInvoiceNumber: r.supplier_invoice_number,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    originalPayable: r2(Number(r.original_payable)),
    allocated: r2(Number(r.allocated)),
    outstanding: r2(Number(r.outstanding)),
  }));
  return { items };
}

/**
 * Bounded, set-based list of POSTED supplier payments with GL-derived apDebit,
 * allocated and unapplied (no per-row round-trip). Search by payment id /
 * reference / supplier name/code. For the allocation workspace + supplier statement.
 */
export async function listSupplierPayments(
  dbh: Db,
  opts: {
    supplierId?: string;
    search?: string;
    onlyUnapplied?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const apId = await apAccountId(dbh);
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(opts.pageSize) || 25)));
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const offset = (page - 1) * pageSize;
  const q = (opts.search || "").trim();
  const like = `%${q}%`;
  const rows = (await (dbh as any).execute(sql`
    SELECT sp.id, sp.supplier_id, sp.payment_date, sp.reference, sp.payment_method,
           s.name AS supplier_name, s.supplier_code,
           COALESCE(pd.debit,0) AS ap_debit,
           COALESCE(al.allocated,0) AS allocated,
           (COALESCE(pd.debit,0) - COALESCE(al.allocated,0)) AS unapplied,
           COUNT(*) OVER() AS total
    FROM supplier_payments sp
    JOIN suppliers s ON s.id = sp.supplier_id
    JOIN (SELECT journal_entry_id, SUM(debit) AS debit FROM journal_lines WHERE account_id = ${apId} GROUP BY journal_entry_id) pd
      ON pd.journal_entry_id = sp.journal_entry_id
    LEFT JOIN (SELECT supplier_payment_id, SUM(amount) AS allocated FROM supplier_payment_allocations GROUP BY supplier_payment_id) al
      ON al.supplier_payment_id = sp.id
    WHERE sp.status = 'posted'
      ${opts.supplierId ? sql`AND sp.supplier_id = ${opts.supplierId}` : sql``}
      ${q ? sql`AND (sp.id ILIKE ${like} OR sp.reference ILIKE ${like} OR s.name ILIKE ${like} OR s.supplier_code ILIKE ${like})` : sql``}
      ${opts.onlyUnapplied ? sql`AND (COALESCE(pd.debit,0) - COALESCE(al.allocated,0)) > ${TOL}` : sql``}
    ORDER BY sp.payment_date DESC, sp.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `)) as any;
  const list = (rows.rows ?? rows ?? []) as any[];
  const total = list.length ? Number(list[0].total) : 0;
  const items = list.map((r) => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    supplierCode: r.supplier_code,
    paymentDate: r.payment_date,
    reference: r.reference,
    paymentMethod: r.payment_method,
    apDebit: r2(Number(r.ap_debit)),
    allocated: r2(Number(r.allocated)),
    unapplied: r2(Number(r.unapplied)),
  }));
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Posted supplier invoices for one supplier with settlement columns for the
 * supplier statement: original AP payable (posted AP credit), allocated,
 * outstanding, due date and aging bucket at `asOfDate`. Set-based, bounded.
 */
export async function listSupplierInvoices(
  dbh: Db,
  opts: { supplierId: string; asOfDate?: string; limit?: number; offset?: number },
) {
  const asOf = (opts.asOfDate || now().slice(0, 10)).slice(0, 10);
  const apId = await apAccountId(dbh);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const rows = (await (dbh as any).execute(sql`
    SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
           jl.credit AS original_payable,
           COALESCE(a.allocated,0) AS allocated,
           (jl.credit - COALESCE(a.allocated,0)) AS outstanding,
           ${bucketExpr(asOf)} AS bucket,
           COUNT(*) OVER() AS total
    FROM supplier_invoices si
    JOIN journal_entries je ON je.id = si.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = si.journal_entry_id AND jl.account_id = ${apId}
    LEFT JOIN (
      SELECT supplier_invoice_id, SUM(amount) AS allocated
      FROM supplier_payment_allocations GROUP BY supplier_invoice_id
    ) a ON a.supplier_invoice_id = si.id
    WHERE si.status = ${SupplierInvoiceStatus.POSTED} AND si.supplier_id = ${opts.supplierId}
    ORDER BY si.invoice_date DESC, si.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;
  const list = (rows.rows ?? rows ?? []) as any[];
  const total = list.length ? Number(list[0].total) : 0;
  const items = list.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date || null,
    originalPayable: r2(Number(r.original_payable)),
    allocated: r2(Number(r.allocated)),
    outstanding: r2(Number(r.outstanding)),
    bucket: r.bucket as string,
  }));
  return { asOf, items, total };
}

// ------------------------------- AP AGING (set-based) ------------------------

const BUCKETS = ["NOT_DUE", "D1_30", "D31_60", "D61_90", "D91_PLUS", "NO_DUE_DATE"] as const;
export type AgingBucket = (typeof BUCKETS)[number];

/** SQL CASE mapping an invoice to its aging bucket at `asOf` (outstanding > 0). */
function bucketExpr(asOf: string) {
  return sql`CASE
    WHEN si.due_date IS NULL OR si.due_date = '' THEN 'NO_DUE_DATE'
    WHEN si.due_date::date >= ${asOf}::date THEN 'NOT_DUE'
    WHEN (${asOf}::date - si.due_date::date) BETWEEN 1 AND 30 THEN 'D1_30'
    WHEN (${asOf}::date - si.due_date::date) BETWEEN 31 AND 60 THEN 'D31_60'
    WHEN (${asOf}::date - si.due_date::date) BETWEEN 61 AND 90 THEN 'D61_90'
    ELSE 'D91_PLUS' END`;
}

/**
 * AP aging by outstanding (NOT gross). Set-based — one grouped query over all
 * posted invoices, no per-invoice round-trip. `supplierId` narrows to one
 * supplier; `asOfDate` (YYYY-MM-DD, default today) drives the buckets.
 */
export async function apAging(dbh: Db, opts: { asOfDate?: string; supplierId?: string } = {}) {
  const asOf = (opts.asOfDate || now().slice(0, 10)).slice(0, 10);
  const apId = await apAccountId(dbh);
  const rows = (await (dbh as any).execute(sql`
    WITH inv AS (
      SELECT si.supplier_id, si.due_date,
             (jl.credit - COALESCE(a.allocated,0)) AS outstanding,
             ${bucketExpr(asOf)} AS bucket
      FROM supplier_invoices si
      JOIN journal_entries je ON je.id = si.journal_entry_id AND je.status = ${JournalStatus.POSTED}
      JOIN journal_lines jl ON jl.journal_entry_id = si.journal_entry_id AND jl.account_id = ${apId}
      LEFT JOIN (
        SELECT supplier_invoice_id, SUM(amount) AS allocated
        FROM supplier_payment_allocations GROUP BY supplier_invoice_id
      ) a ON a.supplier_invoice_id = si.id
      WHERE si.status = ${SupplierInvoiceStatus.POSTED}
        ${opts.supplierId ? sql`AND si.supplier_id = ${opts.supplierId}` : sql``}
    )
    SELECT bucket, COUNT(*) AS cnt, COALESCE(SUM(outstanding),0) AS amount
    FROM inv WHERE outstanding > ${TOL}
    GROUP BY bucket
  `)) as any;
  const byBucket: Record<string, { count: number; amount: number }> = {};
  for (const b of BUCKETS) byBucket[b] = { count: 0, amount: 0 };
  let total = 0;
  for (const r of rows.rows ?? rows ?? []) {
    byBucket[r.bucket] = { count: Number(r.cnt), amount: r2(Number(r.amount)) };
    total = r2(total + Number(r.amount));
  }
  return { asOf, supplierId: opts.supplierId ?? null, buckets: byBucket, totalOutstanding: total };
}

/** Per-supplier aging pivot (one row per supplier, bucket columns). Bounded. */
export async function apAgingBySupplier(
  dbh: Db,
  opts: { asOfDate?: string; limit?: number; offset?: number } = {},
) {
  const asOf = (opts.asOfDate || now().slice(0, 10)).slice(0, 10);
  const apId = await apAccountId(dbh);
  const limit = Math.min(200, Math.max(1, Math.floor(Number(opts.limit) || 50)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const rows = (await (dbh as any).execute(sql`
    WITH inv AS (
      SELECT si.supplier_id,
             (jl.credit - COALESCE(a.allocated,0)) AS outstanding,
             ${bucketExpr(asOf)} AS bucket
      FROM supplier_invoices si
      JOIN journal_entries je ON je.id = si.journal_entry_id AND je.status = ${JournalStatus.POSTED}
      JOIN journal_lines jl ON jl.journal_entry_id = si.journal_entry_id AND jl.account_id = ${apId}
      LEFT JOIN (
        SELECT supplier_invoice_id, SUM(amount) AS allocated
        FROM supplier_payment_allocations GROUP BY supplier_invoice_id
      ) a ON a.supplier_invoice_id = si.id
      WHERE si.status = ${SupplierInvoiceStatus.POSTED}
    )
    SELECT s.id AS supplier_id, s.supplier_code, s.name,
      COALESCE(SUM(CASE WHEN inv.bucket='NOT_DUE'    THEN inv.outstanding END),0) AS not_due,
      COALESCE(SUM(CASE WHEN inv.bucket='D1_30'      THEN inv.outstanding END),0) AS d1_30,
      COALESCE(SUM(CASE WHEN inv.bucket='D31_60'     THEN inv.outstanding END),0) AS d31_60,
      COALESCE(SUM(CASE WHEN inv.bucket='D61_90'     THEN inv.outstanding END),0) AS d61_90,
      COALESCE(SUM(CASE WHEN inv.bucket='D91_PLUS'   THEN inv.outstanding END),0) AS d91_plus,
      COALESCE(SUM(CASE WHEN inv.bucket='NO_DUE_DATE'THEN inv.outstanding END),0) AS no_due_date,
      COALESCE(SUM(inv.outstanding),0) AS total
    FROM inv JOIN suppliers s ON s.id = inv.supplier_id
    WHERE inv.outstanding > ${TOL}
    GROUP BY s.id, s.supplier_code, s.name
    HAVING COALESCE(SUM(inv.outstanding),0) > ${TOL}
    ORDER BY total DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;
  const items = (rows.rows ?? rows ?? []).map((r: any) => ({
    supplierId: r.supplier_id,
    supplierCode: r.supplier_code,
    name: r.name,
    notDue: r2(Number(r.not_due)),
    d1_30: r2(Number(r.d1_30)),
    d31_60: r2(Number(r.d31_60)),
    d61_90: r2(Number(r.d61_90)),
    d91Plus: r2(Number(r.d91_plus)),
    noDueDate: r2(Number(r.no_due_date)),
    total: r2(Number(r.total)),
  }));
  return { asOf, items };
}

// ------------------------------- AP AGING RECONCILIATION ---------------------

/**
 * Reconcile the aging/allocation view to the GL-derived AP control:
 *   agedInvoiceOutstanding − unappliedPayments + otherAp = AP_GL (liability, cr−dr)
 * where unappliedPayments = Σ (payment AP debit − Σ its allocations) over posted
 * payments, and otherAp is any posted AP line not attributable to a supplier
 * invoice or supplier payment (surfaced, never hidden in an invoice bucket).
 */
export async function apAgingReconciliation(dbh: Db, opts: { supplierId?: string } = {}) {
  const apId = await apAccountId(dbh);
  const sup = opts.supplierId ?? null;

  // Aged invoice outstanding (Σ (AP credit − allocations) over posted invoices > 0).
  const invRow = (await (dbh as any).execute(sql`
    SELECT COALESCE(SUM(GREATEST(jl.credit - COALESCE(a.allocated,0), 0)),0) AS v
    FROM supplier_invoices si
    JOIN journal_entries je ON je.id = si.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = si.journal_entry_id AND jl.account_id = ${apId}
    LEFT JOIN (SELECT supplier_invoice_id, SUM(amount) AS allocated FROM supplier_payment_allocations GROUP BY supplier_invoice_id) a
      ON a.supplier_invoice_id = si.id
    WHERE si.status = ${SupplierInvoiceStatus.POSTED} ${sup ? sql`AND si.supplier_id = ${sup}` : sql``}
  `)) as any;
  const agedInvoiceOutstanding = r2(Number((invRow.rows ?? invRow)[0]?.v || 0));

  // Unapplied posted-payment AP debit (Σ (AP debit − allocations)).
  const payRow = (await (dbh as any).execute(sql`
    SELECT COALESCE(SUM(GREATEST(pd.debit - COALESCE(al.allocated,0), 0)),0) AS v
    FROM supplier_payments sp
    JOIN journal_entries je ON je.id = sp.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN (SELECT journal_entry_id, SUM(debit) AS debit FROM journal_lines WHERE account_id = ${apId} GROUP BY journal_entry_id) pd
      ON pd.journal_entry_id = sp.journal_entry_id
    LEFT JOIN (SELECT supplier_payment_id, SUM(amount) AS allocated FROM supplier_payment_allocations GROUP BY supplier_payment_id) al
      ON al.supplier_payment_id = sp.id
    WHERE sp.status = 'posted' ${sup ? sql`AND sp.supplier_id = ${sup}` : sql``}
  `)) as any;
  const unappliedPayments = r2(Number((payRow.rows ?? payRow)[0]?.v || 0));

  // AP GL (liability = credit − debit) for the scope. Whole control when global;
  // supplier-linked lines only when a single supplier is requested.
  let apGl: number;
  let otherAp = 0;
  if (sup) {
    const g = (await (dbh as any).execute(sql`
      SELECT COALESCE(SUM(jl.credit - jl.debit),0) AS v
      FROM supplier_journal_links sjl
      JOIN journal_lines jl ON jl.id = sjl.journal_line_id
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status IN ('posted','reversed')
      WHERE sjl.supplier_id = ${sup} AND jl.account_id = ${apId}
    `)) as any;
    apGl = r2(Number((g.rows ?? g)[0]?.v || 0));
    otherAp = r2(apGl - (agedInvoiceOutstanding - unappliedPayments));
  } else {
    const g = (await (dbh as any).execute(sql`
      SELECT COALESCE(SUM(jl.credit - jl.debit),0) AS v
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status IN ('posted','reversed')
      WHERE jl.account_id = ${apId}
    `)) as any;
    apGl = r2(Number((g.rows ?? g)[0]?.v || 0));
    otherAp = r2(apGl - (agedInvoiceOutstanding - unappliedPayments));
  }
  const derived = r2(agedInvoiceOutstanding - unappliedPayments + otherAp);
  return {
    supplierId: sup,
    agedInvoiceOutstanding,
    unappliedPayments,
    otherAp,
    apGl,
    derivedApGl: derived,
    reconciled: Math.abs(derived - apGl) < TOL,
  };
}
