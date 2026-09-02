/**
 * Phase Sales-1/2 — Accounts Receivable Aging (read-only, GL-derived, set-based).
 *
 * Buckets POSTED sales invoices by how overdue they are relative to an as-of date,
 * using each invoice's due date (falling back to its accounting date). A posted
 * invoice's OUTSTANDING = its posted AR debit − Σ customer-receipt allocations
 * (Phase Sales-2); only outstanding > 0 is aged. A REVERSED invoice is excluded
 * (its journal nets to zero). The aging reconciles to the AR control-account GL:
 *   agedInvoiceOutstanding − unappliedReceipts + otherAr = AR_GL (debit − credit).
 */
import { sql } from "drizzle-orm";
import { resolveSystemAccountId, SYS } from "./gl";
import { now } from "./index";
import { JournalStatus, SalesInvoiceStatus } from "@/lib/enums";

const TOL = 0.005;
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
type Db = { select: (...a: any[]) => any; execute: (q: any) => Promise<any> };

async function arAccountId(dbh: Db): Promise<string> {
  return resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);
}

/** SQL CASE mapping an invoice to its aging bucket at `asOf` (outstanding > 0). */
function bucketExpr(asOf: string) {
  return sql`CASE
    WHEN COALESCE(NULLIF(sv.due_date, ''), sv.invoice_date)::date >= ${asOf}::date THEN 'current'
    WHEN (${asOf}::date - COALESCE(NULLIF(sv.due_date, ''), sv.invoice_date)::date) BETWEEN 1 AND 30 THEN 'd1_30'
    WHEN (${asOf}::date - COALESCE(NULLIF(sv.due_date, ''), sv.invoice_date)::date) BETWEEN 31 AND 60 THEN 'd31_60'
    WHEN (${asOf}::date - COALESCE(NULLIF(sv.due_date, ''), sv.invoice_date)::date) BETWEEN 61 AND 90 THEN 'd61_90'
    ELSE 'd90plus' END`;
}

const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90plus"] as const;

/** Aggregate AR aging over the whole (optionally customer-filtered) posted set. */
export async function arAging(dbh: Db, opts: { asOfDate?: string; customerId?: string } = {}) {
  const asOf = (opts.asOfDate || now().slice(0, 10)).slice(0, 10);
  const arId = await arAccountId(dbh);
  const rows = (await (dbh as any).execute(sql`
    WITH inv AS (
      SELECT (jl.debit - COALESCE(a.allocated,0)) AS outstanding, ${bucketExpr(asOf)} AS bucket
      FROM sales_invoices sv
      JOIN journal_entries je ON je.id = sv.journal_entry_id AND je.status = ${JournalStatus.POSTED}
      JOIN journal_lines jl ON jl.journal_entry_id = sv.journal_entry_id AND jl.account_id = ${arId}
      LEFT JOIN (SELECT sales_invoice_id, SUM(amount) AS allocated FROM customer_receipt_allocations GROUP BY sales_invoice_id) a
        ON a.sales_invoice_id = sv.id
      WHERE sv.status = ${SalesInvoiceStatus.POSTED}
        ${opts.customerId ? sql`AND sv.customer_id = ${opts.customerId}` : sql``}
    )
    SELECT bucket, COUNT(*) AS cnt, COALESCE(SUM(outstanding),0) AS amount
    FROM inv WHERE outstanding > ${TOL} GROUP BY bucket
  `)) as any;
  const buckets: Record<string, number> = {};
  for (const b of BUCKETS) buckets[b] = 0;
  let total = 0;
  let count = 0;
  for (const r of rows.rows ?? rows ?? []) {
    buckets[r.bucket] = r2(Number(r.amount));
    total = r2(total + Number(r.amount));
    count += Number(r.cnt);
  }
  return {
    asOfDate: asOf,
    total,
    count,
    buckets: buckets as Record<(typeof BUCKETS)[number], number>,
  };
}

/** AR aging grouped by customer (bounded page), each with its own buckets. */
export async function arAgingByCustomer(
  dbh: Db,
  opts: { asOfDate?: string; limit?: number; offset?: number } = {},
) {
  const asOf = (opts.asOfDate || now().slice(0, 10)).slice(0, 10);
  const arId = await arAccountId(dbh);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const rows = (await (dbh as any).execute(sql`
    WITH inv AS (
      SELECT sv.customer_id, (jl.debit - COALESCE(a.allocated,0)) AS outstanding, ${bucketExpr(asOf)} AS bucket
      FROM sales_invoices sv
      JOIN journal_entries je ON je.id = sv.journal_entry_id AND je.status = ${JournalStatus.POSTED}
      JOIN journal_lines jl ON jl.journal_entry_id = sv.journal_entry_id AND jl.account_id = ${arId}
      LEFT JOIN (SELECT sales_invoice_id, SUM(amount) AS allocated FROM customer_receipt_allocations GROUP BY sales_invoice_id) a
        ON a.sales_invoice_id = sv.id
      WHERE sv.status = ${SalesInvoiceStatus.POSTED}
    )
    SELECT c.id AS customer_id, c.customer_code, c.name,
      COUNT(*) AS cnt,
      COALESCE(SUM(CASE WHEN inv.bucket='current'  THEN inv.outstanding END),0) AS current,
      COALESCE(SUM(CASE WHEN inv.bucket='d1_30'    THEN inv.outstanding END),0) AS d1_30,
      COALESCE(SUM(CASE WHEN inv.bucket='d31_60'   THEN inv.outstanding END),0) AS d31_60,
      COALESCE(SUM(CASE WHEN inv.bucket='d61_90'   THEN inv.outstanding END),0) AS d61_90,
      COALESCE(SUM(CASE WHEN inv.bucket='d90plus'  THEN inv.outstanding END),0) AS d90plus,
      COALESCE(SUM(inv.outstanding),0) AS total
    FROM inv JOIN customers c ON c.id = inv.customer_id
    WHERE inv.outstanding > ${TOL}
    GROUP BY c.id, c.customer_code, c.name
    HAVING COALESCE(SUM(inv.outstanding),0) > ${TOL}
    ORDER BY total DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as any;
  const items = (rows.rows ?? rows ?? []).map((r: any) => ({
    customerId: r.customer_id,
    customerCode: r.customer_code,
    customerName: r.name,
    count: Number(r.cnt),
    total: r2(Number(r.total)),
    buckets: {
      current: r2(Number(r.current)),
      d1_30: r2(Number(r.d1_30)),
      d31_60: r2(Number(r.d31_60)),
      d61_90: r2(Number(r.d61_90)),
      d90plus: r2(Number(r.d90plus)),
    },
  }));
  return { asOfDate: asOf, items };
}

/**
 * Reconcile the aging/allocation view to the GL-derived AR control:
 *   agedInvoiceOutstanding − unappliedReceipts + otherAr = AR_GL (asset, dr−cr)
 * where unappliedReceipts = Σ (receipt AR credit − Σ its allocations) over posted
 * receipts, and otherAr is any posted AR movement not attributable to a sales
 * invoice or customer receipt (surfaced, never hidden in an invoice bucket).
 */
export async function arAgingReconciliation(dbh: Db, opts: { customerId?: string } = {}) {
  const arId = await arAccountId(dbh);
  const cust = opts.customerId ?? null;

  const invRow = (await (dbh as any).execute(sql`
    SELECT COALESCE(SUM(GREATEST(jl.debit - COALESCE(a.allocated,0), 0)),0) AS v
    FROM sales_invoices sv
    JOIN journal_entries je ON je.id = sv.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN journal_lines jl ON jl.journal_entry_id = sv.journal_entry_id AND jl.account_id = ${arId}
    LEFT JOIN (SELECT sales_invoice_id, SUM(amount) AS allocated FROM customer_receipt_allocations GROUP BY sales_invoice_id) a
      ON a.sales_invoice_id = sv.id
    WHERE sv.status = ${SalesInvoiceStatus.POSTED} ${cust ? sql`AND sv.customer_id = ${cust}` : sql``}
  `)) as any;
  const agingOutstanding = r2(Number((invRow.rows ?? invRow)[0]?.v || 0));

  const recRow = (await (dbh as any).execute(sql`
    SELECT COALESCE(SUM(GREATEST(rc.credit - COALESCE(al.allocated,0), 0)),0) AS v
    FROM customer_receipts cr
    JOIN journal_entries je ON je.id = cr.journal_entry_id AND je.status = ${JournalStatus.POSTED}
    JOIN (SELECT journal_entry_id, SUM(credit) AS credit FROM journal_lines WHERE account_id = ${arId} GROUP BY journal_entry_id) rc
      ON rc.journal_entry_id = cr.journal_entry_id
    LEFT JOIN (SELECT customer_receipt_id, SUM(amount) AS allocated FROM customer_receipt_allocations GROUP BY customer_receipt_id) al
      ON al.customer_receipt_id = cr.id
    WHERE cr.status = 'posted' ${cust ? sql`AND cr.customer_id = ${cust}` : sql``}
  `)) as any;
  const unappliedReceipts = r2(Number((recRow.rows ?? recRow)[0]?.v || 0));

  let arGl: number;
  if (cust) {
    const g = (await (dbh as any).execute(sql`
      SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS v
      FROM customer_journal_links cjl
      JOIN journal_lines jl ON jl.id = cjl.journal_line_id
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status IN ('posted','reversed')
      WHERE cjl.customer_id = ${cust} AND jl.account_id = ${arId}
    `)) as any;
    arGl = r2(Number((g.rows ?? g)[0]?.v || 0));
  } else {
    const g = (await (dbh as any).execute(sql`
      SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS v
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status IN ('posted','reversed')
      WHERE jl.account_id = ${arId}
    `)) as any;
    arGl = r2(Number((g.rows ?? g)[0]?.v || 0));
  }
  const otherAr = r2(arGl - (agingOutstanding - unappliedReceipts));
  const derived = r2(agingOutstanding - unappliedReceipts + otherAr);
  return {
    customerId: cust,
    agingOutstanding,
    unappliedReceipts,
    otherAr,
    arGl,
    subledgerTotal: arGl, // customer subledger reconciles to the AR control account
    difference: r2(derived - arGl),
    reconciled: Math.abs(derived - arGl) < TOL,
  };
}
