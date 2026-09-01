/**
 * Phase Sales-1 — Customers & Accounts-Receivable subledger, server-authoritative.
 *
 * A customer's receivable is NOT stored anywhere as accounting truth. It is
 * derived from the General Ledger: each customer is linked (customer_journal_links)
 * to the specific AR control-account journal line(s) that belong to it; the money
 * lives ONLY in journal_lines. Receivable = debits − credits over the customer's
 * linked AR lines whose entries are in the certified GL states (posted+reversed).
 * AR is a DEBIT-natured asset: a posted sales invoice (debit) increases it; a
 * customer receipt (credit) reduces it — the mirror of the supplier/AP side.
 *
 * This module adds NO accounting engine and never writes balances.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { customers, customerJournalLinks, journalLines, journalEntries, accounts } from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { getAccountBalance } from "./balances";
import { resolvePage, paginatedResult, type PageParams } from "./pagination";
import { nextCode } from "./numbering";
import { AppError } from "./errors";
import { JournalStatus, CustomerStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

const GL_STATES = [JournalStatus.POSTED, JournalStatus.REVERSED];
type Db = { select: (...a: any[]) => any };

/** The AR control account row (systemKey accounts_receivable). Throws if unseeded. */
export async function resolveArAccount(dbh: Db) {
  const id = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);
  const acc = (await dbh.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0] as any;
  return acc;
}

// ------------------------------- AR link primitive ----------------------

/**
 * Link ONE posted-eligible AR control-account journal line to a customer. The
 * amount stays in journal_lines; this only records ownership. Validates: line
 * exists · line's account IS the AR control account · journal entry exists ·
 * customer exists · the line is not already linked (UNIQUE journal_line_id).
 */
export async function createCustomerArLink(
  tx: any,
  input: {
    customerId: string;
    journalLineId: string;
    sourceType?: string | null;
    userId?: string | null;
  },
) {
  const line = (
    await tx.select().from(journalLines).where(eq(journalLines.id, input.journalLineId)).limit(1)
  )[0];
  if (!line) throw new AppError("سطر القيد غير موجود", 400, "LINE_NOT_FOUND");

  const arId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_RECEIVABLE);
  if (line.accountId !== arId)
    throw new AppError("لا يمكن ربط سطر ليس على حساب الذمم المدينة بالعميل", 400, "NOT_AR_LINE");

  const entry = (
    await tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, line.journalEntryId))
      .limit(1)
  )[0];
  if (!entry) throw new AppError("القيد غير موجود", 400, "ENTRY_NOT_FOUND");

  const cust = (
    await tx.select().from(customers).where(eq(customers.id, input.customerId)).limit(1)
  )[0];
  if (!cust) throw new AppError("العميل غير موجود", 404, "CUSTOMER_NOT_FOUND");

  const existing = (
    await tx
      .select({ id: customerJournalLinks.id })
      .from(customerJournalLinks)
      .where(eq(customerJournalLinks.journalLineId, input.journalLineId))
      .limit(1)
  )[0];
  if (existing) throw new AppError("سطر الذمم مرتبط بعميل آخر بالفعل", 409, "LINE_ALREADY_LINKED");

  const id = genId("CJL");
  await tx.insert(customerJournalLinks).values({
    id,
    customerId: input.customerId,
    journalLineId: input.journalLineId,
    sourceType: input.sourceType ?? entry.sourceType ?? null,
    createdBy: input.userId ?? null,
    createdAt: now(),
  });
  return id;
}

/**
 * Attach the AR control-account line of an entry to a customer. Finds the entry's
 * AR line (first by line number) and links it — no new journal, no money
 * duplication. Returns the link id (or null if the entry has no AR line). Reused
 * by the sales-invoice post (Dr AR) and its reversal mirror (Cr AR), keeping the
 * customer subledger reconciled to the AR control account under certified states.
 */
export async function linkEntryArLine(
  tx: any,
  input: {
    customerId: string;
    entryId: string;
    sourceType?: string | null;
    userId?: string | null;
  },
) {
  const arId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_RECEIVABLE);
  const arLine = (
    await tx
      .select()
      .from(journalLines)
      .where(and(eq(journalLines.journalEntryId, input.entryId), eq(journalLines.accountId, arId)))
      .orderBy(journalLines.lineNumber)
      .limit(1)
  )[0];
  if (!arLine) return null;
  return createCustomerArLink(tx, {
    customerId: input.customerId,
    journalLineId: arLine.id,
    sourceType: input.sourceType ?? null,
    userId: input.userId,
  });
}

// ------------------------------- Balance / ledger -----------------------

async function sumCustomerAr(dbh: Db, customerId: string, extra: any[]) {
  const r = (
    await (dbh as any)
      .select({
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
      })
      .from(customerJournalLinks)
      .innerJoin(journalLines, eq(customerJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(customerJournalLinks.customerId, customerId),
          inArray(journalEntries.status, GL_STATES),
          ...extra,
        ),
      )
  )[0] as any;
  return { debit: Number(r?.debit || 0), credit: Number(r?.credit || 0) };
}

/**
 * Customer receivable (debit − credit) over its linked AR lines, posted+reversed
 * only. `dateFrom` splits opening vs period; `dateTo` bounds the closing.
 * Receivable is debit-natured: a debit (invoice) increases it, a credit (receipt)
 * reduces it.
 */
export async function getCustomerBalance(
  dbh: Db,
  customerId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const opening = opts.dateFrom
    ? await sumCustomerAr(dbh, customerId, [sql`${journalEntries.date} < ${opts.dateFrom}`])
    : { debit: 0, credit: 0 };
  const periodExtra: any[] = [];
  if (opts.dateFrom) periodExtra.push(sql`${journalEntries.date} >= ${opts.dateFrom}`);
  if (opts.dateTo) periodExtra.push(sql`${journalEntries.date} <= ${opts.dateTo}`);
  const period = await sumCustomerAr(dbh, customerId, periodExtra);
  const openingBalance = opening.debit - opening.credit;
  const closing = openingBalance + (period.debit - period.credit);
  return {
    customerId,
    openingBalance,
    periodDebit: period.debit,
    periodCredit: period.credit,
    receivableBalance: closing, // what the customer owes us
    asOf: opts.dateTo ?? null,
  };
}

/** Customer account statement — AR lines linked to the customer, running receivable. */
export async function customerLedger(
  dbh: Db,
  customerId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const opening = opts.dateFrom
    ? await sumCustomerAr(dbh, customerId, [sql`${journalEntries.date} < ${opts.dateFrom}`])
    : { debit: 0, credit: 0 };
  const conds = [
    eq(customerJournalLinks.customerId, customerId),
    inArray(journalEntries.status, GL_STATES),
  ];
  if (opts.dateFrom) conds.push(sql`${journalEntries.date} >= ${opts.dateFrom}`);
  if (opts.dateTo) conds.push(sql`${journalEntries.date} <= ${opts.dateTo}`);
  const rows = await (dbh as any)
    .select({
      lineId: journalLines.id,
      entryId: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(customerJournalLinks)
    .innerJoin(journalLines, eq(customerJournalLinks.journalLineId, journalLines.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .orderBy(journalEntries.date, journalEntries.number);

  let running = opening.debit - opening.credit;
  const movements = rows.map((r: any) => {
    running += Number(r.debit) - Number(r.credit);
    return {
      lineId: r.lineId,
      entryId: r.entryId,
      number: r.number,
      date: r.date,
      description: r.description,
      source: r.sourceType || "manual",
      reference: r.sourceId || "",
      debit: Number(r.debit),
      credit: Number(r.credit),
      receivableBalance: running,
    };
  });
  return { opening: opening.debit - opening.credit, movements, closing: running };
}

// ------------------------------- Reconciliation -------------------------

/**
 * AR control-account reconciliation. By construction every AR journal line is
 * either linked to a customer or unallocated, so:
 *   AR GL balance = Customer subledger total + Unallocated AR net
 * and `difference` is a 0 sanity check. Amounts are debit − credit (receivable).
 * Certified GL states only (posted+reversed).
 */
export async function arReconciliation(dbh: Db) {
  const arId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);
  const arGl = (await getAccountBalance(dbh, arId, {})).closing;

  const total = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, arId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  const linked = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(customerJournalLinks)
      .innerJoin(journalLines, eq(customerJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, arId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  const tDebit = Number(total?.debit || 0),
    tCredit = Number(total?.credit || 0);
  const lDebit = Number(linked?.debit || 0),
    lCredit = Number(linked?.credit || 0);
  const subledgerTotal = lDebit - lCredit;
  const unallocated = {
    count: Number(total?.c || 0) - Number(linked?.c || 0),
    debit: tDebit - lDebit,
    credit: tCredit - lCredit,
    net: tDebit - lDebit - (tCredit - lCredit),
  };
  return {
    arAccountId: arId,
    arGl,
    subledgerTotal,
    unallocated,
    difference: arGl - (subledgerTotal + unallocated.net),
  };
}

/** Unallocated AR journal lines (posted/reversed, not linked to any customer). */
export async function unallocatedArLines(dbh: Db) {
  const arId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_RECEIVABLE);
  const rows = await (dbh as any)
    .select({
      lineId: journalLines.id,
      entryId: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.accountId, arId),
        inArray(journalEntries.status, GL_STATES),
        sql`NOT EXISTS (SELECT 1 FROM ${customerJournalLinks} cjl WHERE cjl.journal_line_id = ${journalLines.id})`,
      ),
    )
    .orderBy(journalEntries.date, journalEntries.number);
  return rows;
}

// ------------------------------- Customer master ------------------------

export interface CustomerInput {
  name: string;
  legalName?: string;
  commercialRegistration?: string | null;
  vatNumber?: string | null; // stored in tax_number
  phone?: string | null;
  email?: string | null;
  currency?: string;
  paymentTermsDays?: number | null;
  contactPerson?: string;
  address?: string;
  buildingNo?: string;
  street?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  additionalNo?: string;
  notes?: string;
}

export async function createCustomer(ctx: Ctx, input: CustomerInput) {
  if (!input.name || !input.name.trim())
    throw new AppError("اسم العميل مطلوب", 400, "CUSTOMER_NAME_REQUIRED");
  const id = genId("CUST");
  const ts = now();
  let code = "";
  await db.transaction(async (tx) => {
    code = await nextCode(tx as any, {
      table: "customers",
      column: "customer_code",
      prefix: "CUST-",
    });
    await tx.insert(customers).values({
      id,
      customerCode: code,
      name: input.name.trim(),
      legalName: input.legalName ?? "",
      commercialRegistration: input.commercialRegistration ?? null,
      taxNumber: input.vatNumber ?? "",
      phone: input.phone ?? null,
      email: input.email ?? null,
      currency: (input.currency || "SAR").toUpperCase(),
      paymentTermsDays: input.paymentTermsDays ?? null,
      contactPerson: input.contactPerson ?? "",
      address: input.address ?? "",
      buildingNo: input.buildingNo ?? "",
      street: input.street ?? "",
      district: input.district ?? "",
      city: input.city ?? "",
      postalCode: input.postalCode ?? "",
      additionalNo: input.additionalNo ?? "",
      notes: input.notes ?? "",
      status: CustomerStatus.ACTIVE,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
  });
  await addAudit({
    action: "CUSTOMER_CREATED",
    entityType: "customer",
    entityId: id,
    description: `إنشاء عميل ${code} — ${input.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
}

export async function updateCustomer(ctx: Ctx, id: string, input: Partial<CustomerInput>) {
  const existing = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
  if (!existing) throw new AppError("العميل غير موجود", 404, "NOT_FOUND");
  const set: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) set.name = input.name;
  if (input.legalName !== undefined) set.legalName = input.legalName;
  if (input.commercialRegistration !== undefined)
    set.commercialRegistration = input.commercialRegistration;
  if (input.vatNumber !== undefined) set.taxNumber = input.vatNumber ?? "";
  if (input.phone !== undefined) set.phone = input.phone;
  if (input.email !== undefined) set.email = input.email || null;
  if (input.currency !== undefined) set.currency = (input.currency || "SAR").toUpperCase();
  if (input.paymentTermsDays !== undefined) set.paymentTermsDays = input.paymentTermsDays;
  if (input.contactPerson !== undefined) set.contactPerson = input.contactPerson;
  if (input.address !== undefined) set.address = input.address;
  if (input.buildingNo !== undefined) set.buildingNo = input.buildingNo;
  if (input.street !== undefined) set.street = input.street;
  if (input.district !== undefined) set.district = input.district;
  if (input.city !== undefined) set.city = input.city;
  if (input.postalCode !== undefined) set.postalCode = input.postalCode;
  if (input.additionalNo !== undefined) set.additionalNo = input.additionalNo;
  if (input.notes !== undefined) set.notes = input.notes;

  await db.update(customers).set(set).where(eq(customers.id, id));
  await addAudit({
    action: "CUSTOMER_UPDATED",
    entityType: "customer",
    entityId: id,
    description: `تعديل العميل ${existing.customerCode || existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ name: existing.name, taxNumber: existing.taxNumber }),
    ip: ctx.ip,
  });
  return (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
}

export async function setCustomerStatus(ctx: Ctx, id: string, active: boolean) {
  const existing = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
  if (!existing) throw new AppError("العميل غير موجود", 404, "NOT_FOUND");
  const status = active ? CustomerStatus.ACTIVE : CustomerStatus.INACTIVE;
  await db.update(customers).set({ status, updatedAt: now() }).where(eq(customers.id, id));
  await addAudit({
    action: active ? "CUSTOMER_REACTIVATED" : "CUSTOMER_DEACTIVATED",
    entityType: "customer",
    entityId: id,
    description: `${active ? "تفعيل" : "تعطيل"} العميل ${existing.customerCode || existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ status: existing.status }),
    ip: ctx.ip,
  });
  return (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
}

// ------------------------------- Reads (list/detail) --------------------

/**
 * Batched customer receivable (debit − credit over each customer's linked AR
 * lines, posted+reversed) in ONE set-based query — replaces a per-row N+1. Pass
 * `customerIds` to bound it to a page. Returns Map(customerId → receivable).
 */
export async function customerReceivableMap(
  dbh: Db,
  customerIds?: string[],
): Promise<Map<string, number>> {
  const conds: any[] = [inArray(journalEntries.status, GL_STATES)];
  if (customerIds && customerIds.length)
    conds.push(inArray(customerJournalLinks.customerId, customerIds));
  const rows = (await (dbh as any)
    .select({
      cid: customerJournalLinks.customerId,
      receivable: sql<number>`COALESCE(SUM(${journalLines.debit}),0) - COALESCE(SUM(${journalLines.credit}),0)`,
    })
    .from(customerJournalLinks)
    .innerJoin(journalLines, eq(customerJournalLinks.journalLineId, journalLines.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .groupBy(customerJournalLinks.customerId)) as any[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.cid, Number(r.receivable || 0));
  return m;
}

/**
 * Bounded, server-side customer LOOKUP for form pickers. Returns a SLIM result
 * (id, code, name, currency, status) capped at a small maximum, searched in SQL
 * by code/name/VAT number. An empty query returns the most recent active customers.
 */
export async function customerLookup(opts: { search?: string; limit?: number } = {}) {
  const q = (opts.search || "").trim();
  const limit = Math.min(50, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  const conds: any[] = [eq(customers.status, CustomerStatus.ACTIVE)];
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(${customers.customerCode} ILIKE ${like} OR ${customers.name} ILIKE ${like} OR ${customers.taxNumber} ILIKE ${like})`,
    );
  }
  const rows = (await (db as any)
    .select({
      id: customers.id,
      customerCode: customers.customerCode,
      name: customers.name,
      currency: customers.currency,
      status: customers.status,
    })
    .from(customers)
    .where(and(...conds))
    .orderBy(q ? customers.name : desc(customers.createdAt))
    .limit(limit)) as any[];
  return { items: rows };
}

/** WHERE shared by the customer list page and the picker (`all`) path. */
function customerListWhere(opts: { search?: string; status?: string }) {
  const conds: any[] = [];
  if (opts.status) conds.push(eq(customers.status, opts.status));
  const q = (opts.search || "").trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(${customers.customerCode} ILIKE ${like} OR ${customers.name} ILIKE ${like} OR ${customers.taxNumber} ILIKE ${like} OR ${customers.phone} ILIKE ${like})`,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Customer list.
 *  - List page (default): bounded page; per-customer receivable computed for the
 *    page's customers with a SINGLE batched GL aggregate, never one query per row.
 *  - Picker (`all: true`): full filtered set in ONE slim query WITHOUT per-row
 *    balance (pickers never show receivable).
 */
export async function listCustomers(
  opts: { search?: string; status?: string; all?: boolean } & PageParams = {},
) {
  const where = customerListWhere(opts);

  if (opts.all) {
    const rows = (await (db as any)
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))) as any[];
    const items = rows.map((c) => ({ ...c, receivableBalance: 0 }));
    return { items, page: 1, pageSize: items.length, total: items.length, totalPages: 1 };
  }

  const pg = resolvePage(opts);
  const totalRow = (
    await (db as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(customers)
      .where(where)
  )[0] as any;
  const total = Number(totalRow?.c || 0);

  const rows = (await (db as any)
    .select()
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt))
    .limit(pg.limit)
    .offset(pg.offset)) as any[];

  const balances = await customerReceivableMap(
    db,
    rows.map((c) => c.id),
  );
  const items = rows.map((c) => ({ ...c, receivableBalance: balances.get(c.id) || 0 }));
  return { ...paginatedResult(items, total, pg), items };
}

export async function getCustomerDetail(id: string) {
  const c = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0] as any;
  if (!c) return null;
  const balance = await getCustomerBalance(db, id);
  const ledger = await customerLedger(db, id);
  return { item: c, balance, ledger };
}
