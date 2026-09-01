/**
 * Phase Sales-1 — Accounts Receivable Aging (read-only, GL-derived, set-based).
 *
 * Buckets POSTED sales invoices by how overdue they are relative to an as-of
 * date, using the invoice's due date (falling back to its accounting date). In
 * Sales-1 there is no settlement yet, so a posted invoice's outstanding equals
 * its full total; a REVERSED invoice is excluded (its journal nets to zero in the
 * GL). The aging total therefore reconciles to the AR control-account balance.
 */
import { and, eq, sql } from "drizzle-orm";
import { salesInvoices, customers } from "./schema";
import { arReconciliation } from "./customer";
import { SalesInvoiceStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

/** effective due date = due_date if present, else invoice_date (both text dates). */
const dueExpr = sql`COALESCE(NULLIF(${salesInvoices.dueDate}, ''), ${salesInvoices.invoiceDate})`;

function bucketSelect(asOf: string) {
  // Postgres date subtraction yields an integer number of days overdue.
  const overdue = sql`(${asOf}::date - ${dueExpr}::date)`;
  const amt = salesInvoices.totalAmount;
  return {
    total: sql<number>`COALESCE(SUM(${amt}), 0)`,
    count: sql<number>`COUNT(*)`,
    current: sql<number>`COALESCE(SUM(${amt}) FILTER (WHERE ${overdue} <= 0), 0)`,
    d1_30: sql<number>`COALESCE(SUM(${amt}) FILTER (WHERE ${overdue} BETWEEN 1 AND 30), 0)`,
    d31_60: sql<number>`COALESCE(SUM(${amt}) FILTER (WHERE ${overdue} BETWEEN 31 AND 60), 0)`,
    d61_90: sql<number>`COALESCE(SUM(${amt}) FILTER (WHERE ${overdue} BETWEEN 61 AND 90), 0)`,
    d90plus: sql<number>`COALESCE(SUM(${amt}) FILTER (WHERE ${overdue} > 90), 0)`,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Aggregate AR aging over the whole (optionally customer-filtered) posted set. */
export async function arAging(dbh: Db, opts: { asOfDate?: string; customerId?: string } = {}) {
  const asOf = (opts.asOfDate || todayISO()).slice(0, 10);
  const conds: any[] = [eq(salesInvoices.status, SalesInvoiceStatus.POSTED)];
  if (opts.customerId) conds.push(eq(salesInvoices.customerId, opts.customerId));
  const row = (
    await (dbh as any)
      .select(bucketSelect(asOf))
      .from(salesInvoices)
      .where(and(...conds))
  )[0] as any;
  return {
    asOfDate: asOf,
    total: Number(row?.total || 0),
    count: Number(row?.count || 0),
    buckets: {
      current: Number(row?.current || 0),
      d1_30: Number(row?.d1_30 || 0),
      d31_60: Number(row?.d31_60 || 0),
      d61_90: Number(row?.d61_90 || 0),
      d90plus: Number(row?.d90plus || 0),
    },
  };
}

/** AR aging grouped by customer (bounded page), each with its own buckets. */
export async function arAgingByCustomer(
  dbh: Db,
  opts: { asOfDate?: string; limit?: number; offset?: number } = {},
) {
  const asOf = (opts.asOfDate || todayISO()).slice(0, 10);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(opts.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));
  const b = bucketSelect(asOf);
  const rows = (await (dbh as any)
    .select({
      customerId: salesInvoices.customerId,
      customerName: customers.name,
      customerCode: customers.customerCode,
      ...b,
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(eq(salesInvoices.status, SalesInvoiceStatus.POSTED))
    .groupBy(salesInvoices.customerId, customers.name, customers.customerCode)
    .orderBy(sql`COALESCE(SUM(${salesInvoices.totalAmount}), 0) DESC`)
    .limit(limit)
    .offset(offset)) as any[];
  return {
    asOfDate: asOf,
    items: rows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      customerCode: r.customerCode,
      total: Number(r.total || 0),
      count: Number(r.count || 0),
      buckets: {
        current: Number(r.current || 0),
        d1_30: Number(r.d1_30 || 0),
        d31_60: Number(r.d31_60 || 0),
        d61_90: Number(r.d61_90 || 0),
        d90plus: Number(r.d90plus || 0),
      },
    })),
  };
}

/**
 * Reconcile the aging total (posted sales-invoice outstanding) to the AR control
 * account GL balance and the customer subledger. `difference` is a 0 sanity
 * check; any nonzero surfaces unallocated AR movement rather than hiding it.
 */
export async function arAgingReconciliation(dbh: Db, opts: { customerId?: string } = {}) {
  const aging = await arAging(dbh, opts);
  const rec = await arReconciliation(dbh);
  return {
    agingOutstanding: aging.total,
    arGl: rec.arGl,
    subledgerTotal: rec.subledgerTotal,
    unallocatedNet: rec.unallocated.net,
    difference: rec.arGl - aging.total,
  };
}
