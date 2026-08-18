/**
 * Phase 3A — Suppliers & Accounts-Payable subledger, server-authoritative.
 *
 * A supplier's payable is NOT stored anywhere as accounting truth. It is derived
 * from the General Ledger: each supplier is linked (supplier_journal_links) to
 * the specific AP control-account journal line(s) that belong to it; the money
 * lives ONLY in journal_lines. Balance = credits − debits over the supplier's
 * linked AP lines whose entries are in the certified GL states (posted+reversed).
 *
 * This module adds NO accounting engine and never writes balances. The legacy
 * suppliers.balance column is deprecated/non-authoritative and never read here.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { suppliers, supplierJournalLinks, journalLines, journalEntries, accounts } from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { getAccountBalance } from "./balances";
import { nextCode } from "./numbering";
import { AppError } from "./errors";
import { JournalStatus, SupplierStatus, AccountClassification } from "@/lib/enums";
import { normalizeIban, isValidSaudiIban, maskIban } from "@/lib/iban";
import type { Ctx } from "./api-utils";

const GL_STATES = [JournalStatus.POSTED, JournalStatus.REVERSED];
type Db = { select: (...a: any[]) => any };

/** The AP control account row (systemKey accounts_payable). Throws if unseeded. */
export async function resolveApAccount(dbh: Db) {
  const id = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  const acc = (await dbh.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0] as any;
  return acc;
}

// ------------------------------- AP link primitive ----------------------

/**
 * Link ONE posted-eligible AP control-account journal line to a supplier. The
 * amount stays in journal_lines; this only records ownership. Validates: line
 * exists · line's account IS the AP control account · journal entry exists ·
 * supplier exists · the line is not already linked (UNIQUE journal_line_id).
 */
export async function createSupplierApLink(
  tx: any,
  input: {
    supplierId: string;
    journalLineId: string;
    sourceType?: string | null;
    userId?: string | null;
  },
) {
  const line = (
    await tx.select().from(journalLines).where(eq(journalLines.id, input.journalLineId)).limit(1)
  )[0];
  if (!line) throw new AppError("سطر القيد غير موجود", 400, "LINE_NOT_FOUND");

  const apId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_PAYABLE);
  if (line.accountId !== apId)
    throw new AppError("لا يمكن ربط سطر ليس على حساب الذمم الدائنة بالمورد", 400, "NOT_AP_LINE");

  const entry = (
    await tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, line.journalEntryId))
      .limit(1)
  )[0];
  if (!entry) throw new AppError("القيد غير موجود", 400, "ENTRY_NOT_FOUND");

  const sup = (
    await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1)
  )[0];
  if (!sup) throw new AppError("المورد غير موجود", 404, "SUPPLIER_NOT_FOUND");

  const existing = (
    await tx
      .select({ id: supplierJournalLinks.id })
      .from(supplierJournalLinks)
      .where(eq(supplierJournalLinks.journalLineId, input.journalLineId))
      .limit(1)
  )[0];
  if (existing) throw new AppError("سطر الذمم مرتبط بمورد آخر بالفعل", 409, "LINE_ALREADY_LINKED");

  const id = genId("SJL");
  await tx.insert(supplierJournalLinks).values({
    id,
    supplierId: input.supplierId,
    journalLineId: input.journalLineId,
    sourceType: input.sourceType ?? entry.sourceType ?? null,
    createdBy: input.userId ?? null,
    createdAt: now(),
  });
  return id;
}

/**
 * Attach the AP control-account line of an entry to a supplier. Finds the entry's
 * AP line (first by line number) and links it — no new journal, no money
 * duplication. Returns the link id (or null if the entry has no AP line). This is
 * the primitive the supplier-attributable flows reuse:
 *   - supplier payment (Dr AP)  → payable decreases
 *   - a reversal mirror of a linked AP line → payable nets per certified states,
 *     keeping the supplier subledger reconciled to the AP control account.
 */
export async function linkEntryApLine(
  tx: any,
  input: {
    supplierId: string;
    entryId: string;
    sourceType?: string | null;
    userId?: string | null;
  },
) {
  const apId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_PAYABLE);
  const apLine = (
    await tx
      .select()
      .from(journalLines)
      .where(and(eq(journalLines.journalEntryId, input.entryId), eq(journalLines.accountId, apId)))
      .orderBy(journalLines.lineNumber)
      .limit(1)
  )[0];
  if (!apLine) return null;
  return createSupplierApLink(tx, {
    supplierId: input.supplierId,
    journalLineId: apLine.id,
    sourceType: input.sourceType ?? null,
    userId: input.userId,
  });
}

/** Convenience for the legacy supplier-payment flow (Dr AP / Cr Cash|Bank). */
export async function linkSupplierPaymentApLine(
  tx: any,
  input: { supplierId: string; entryId: string; userId?: string | null },
) {
  return linkEntryApLine(tx, { ...input, sourceType: "supplier_payment" });
}

// ------------------------------- Balance / ledger -----------------------

async function sumSupplierAp(dbh: Db, supplierId: string, extra: any[]) {
  const r = (
    await (dbh as any)
      .select({
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
      })
      .from(supplierJournalLinks)
      .innerJoin(journalLines, eq(supplierJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(supplierJournalLinks.supplierId, supplierId),
          inArray(journalEntries.status, GL_STATES),
          ...extra,
        ),
      )
  )[0] as any;
  return { debit: Number(r?.debit || 0), credit: Number(r?.credit || 0) };
}

/**
 * Supplier payable (credit − debit) over its linked AP lines, posted+reversed
 * only. `dateFrom` splits opening vs period; `dateTo` bounds the closing. Payable
 * is credit-natured: a credit (invoice) increases it, a debit (payment) reduces it.
 */
export async function getSupplierBalance(
  dbh: Db,
  supplierId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const opening = opts.dateFrom
    ? await sumSupplierAp(dbh, supplierId, [sql`${journalEntries.date} < ${opts.dateFrom}`])
    : { debit: 0, credit: 0 };
  const periodExtra: any[] = [];
  if (opts.dateFrom) periodExtra.push(sql`${journalEntries.date} >= ${opts.dateFrom}`);
  if (opts.dateTo) periodExtra.push(sql`${journalEntries.date} <= ${opts.dateTo}`);
  const period = await sumSupplierAp(dbh, supplierId, periodExtra);
  const openingBalance = opening.credit - opening.debit;
  const closing = openingBalance + (period.credit - period.debit);
  return {
    supplierId,
    openingBalance,
    periodDebit: period.debit,
    periodCredit: period.credit,
    payableBalance: closing, // what we owe the supplier
    asOf: opts.dateTo ?? null,
  };
}

/** Supplier account statement — AP lines linked to the supplier, running payable. */
export async function supplierLedger(
  dbh: Db,
  supplierId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const opening = opts.dateFrom
    ? await sumSupplierAp(dbh, supplierId, [sql`${journalEntries.date} < ${opts.dateFrom}`])
    : { debit: 0, credit: 0 };
  const conds = [
    eq(supplierJournalLinks.supplierId, supplierId),
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
    .from(supplierJournalLinks)
    .innerJoin(journalLines, eq(supplierJournalLinks.journalLineId, journalLines.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .orderBy(journalEntries.date, journalEntries.number);

  let running = opening.credit - opening.debit;
  const movements = rows.map((r: any) => {
    running += Number(r.credit) - Number(r.debit);
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
      payableBalance: running,
    };
  });
  return { opening: opening.credit - opening.debit, movements, closing: running };
}

// ------------------------------- Reconciliation -------------------------

/**
 * AP control-account reconciliation. By construction every AP journal line is
 * either linked to a supplier or unallocated, so:
 *   AP GL balance = Supplier subledger total + Unallocated AP net
 * and `difference` is a 0 sanity check. Amounts are credit − debit (payable).
 * Certified GL states only (posted+reversed).
 */
export async function apReconciliation(dbh: Db) {
  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  const apGl = (await getAccountBalance(dbh, apId, {})).closing;

  // All posted/reversed AP lines.
  const total = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, apId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  // Linked (supplier-allocated) posted/reversed AP lines.
  const linked = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(supplierJournalLinks)
      .innerJoin(journalLines, eq(supplierJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, apId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  const tDebit = Number(total?.debit || 0),
    tCredit = Number(total?.credit || 0);
  const lDebit = Number(linked?.debit || 0),
    lCredit = Number(linked?.credit || 0);
  const subledgerTotal = lCredit - lDebit;
  const unallocated = {
    count: Number(total?.c || 0) - Number(linked?.c || 0),
    debit: tDebit - lDebit,
    credit: tCredit - lCredit,
    net: tCredit - lCredit - (tDebit - lDebit),
  };
  return {
    apAccountId: apId,
    apGl,
    subledgerTotal,
    unallocated,
    difference: apGl - (subledgerTotal + unallocated.net),
  };
}

/** Unallocated AP journal lines (posted/reversed, not linked to any supplier). */
export async function unallocatedApLines(dbh: Db) {
  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
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
        eq(journalLines.accountId, apId),
        inArray(journalEntries.status, GL_STATES),
        sql`NOT EXISTS (SELECT 1 FROM ${supplierJournalLinks} sjl WHERE sjl.journal_line_id = ${journalLines.id})`,
      ),
    )
    .orderBy(journalEntries.date, journalEntries.number);
  return rows;
}

/**
 * Read-only legacy/AP diagnostic preflight — supplier counts, legacy balance
 * exposure, subledger coverage and reconciliation. Never migrates anything.
 */
export async function apPreflight(dbh: Db) {
  const supRows = await (dbh as any)
    .select({ c: sql<number>`COUNT(*)`, bal: sql<number>`COALESCE(SUM(${suppliers.balance}),0)` })
    .from(suppliers);
  const nonZero = (
    await (dbh as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(suppliers)
      .where(sql`${suppliers.balance} <> 0`)
  )[0] as any;
  const linkedCount = (
    await (dbh as any).select({ c: sql<number>`COUNT(*)` }).from(supplierJournalLinks)
  )[0] as any;
  const rec = await apReconciliation(dbh);
  return {
    supplierCount: Number(supRows[0]?.c || 0),
    nonZeroLegacyBalanceCount: Number(nonZero?.c || 0),
    totalLegacyBalance: Number(supRows[0]?.bal || 0),
    supplierLinkedApLineCount: Number(linkedCount?.c || 0),
    unallocatedApLineCount: rec.unallocated.count,
    apGl: rec.apGl,
    supplierSubledgerBalance: rec.subledgerTotal,
    difference: rec.difference,
  };
}

// ------------------------------- Supplier master ------------------------

/** Strip sensitive banking from a supplier row for default responses. */
export function maskSupplier(s: any) {
  const { iban, ibanNormalized, balance, ...rest } = s;
  return {
    ...rest,
    ibanMasked: iban ? maskIban(ibanNormalized || iban) : null,
    // legacy, non-authoritative — never surfaced as accounting truth
  };
}

export interface SupplierInput {
  name: string;
  legalName?: string;
  commercialRegistration?: string | null;
  vatNumber?: string | null; // stored in tax_number
  phone?: string | null;
  email?: string | null;
  currency?: string;
  paymentTermsDays?: number | null;
  bankName?: string | null;
  iban?: string | null;
  activity?: string;
  contactPerson?: string;
  address?: string;
  notes?: string;
}

function ibanFields(iban?: string | null) {
  if (!iban || !iban.trim()) return { iban: null, ibanNormalized: null };
  const normalized = normalizeIban(iban);
  if (!isValidSaudiIban(normalized))
    throw new AppError("رقم الآيبان غير صالح (يجب أن يكون آيبان سعودي صحيح)", 400, "INVALID_IBAN");
  return { iban: normalized, ibanNormalized: normalized };
}

export async function createSupplier(ctx: Ctx, input: SupplierInput) {
  const id = genId("SUP");
  const ts = now();
  const bank = ibanFields(input.iban);
  let code = "";
  await db.transaction(async (tx) => {
    code = await nextCode(tx as any, {
      table: "suppliers",
      column: "supplier_code",
      prefix: "SUP-",
    });
    await tx.insert(suppliers).values({
      id,
      supplierCode: code,
      name: input.name,
      legalName: input.legalName ?? "",
      commercialRegistration: input.commercialRegistration ?? null,
      taxNumber: input.vatNumber ?? "",
      phone: input.phone ?? null,
      email: input.email ?? null,
      currency: (input.currency || "SAR").toUpperCase(),
      paymentTermsDays: input.paymentTermsDays ?? null,
      bankName: input.bankName ?? null,
      iban: bank.iban,
      ibanNormalized: bank.ibanNormalized,
      activity: input.activity ?? "",
      contactPerson: input.contactPerson ?? "",
      address: input.address ?? "",
      notes: input.notes ?? "",
      status: SupplierStatus.ACTIVE,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
  });
  await addAudit({
    action: "SUPPLIER_CREATED",
    entityType: "supplier",
    entityId: id,
    description: `إنشاء مورد ${code} — ${input.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
}

export async function updateSupplier(ctx: Ctx, id: string, input: Partial<SupplierInput>) {
  const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
  if (!existing) throw new AppError("المورد غير موجود", 404, "NOT_FOUND");
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
  if (input.bankName !== undefined) set.bankName = input.bankName;
  if (input.iban !== undefined) {
    const bank = ibanFields(input.iban);
    set.iban = bank.iban;
    set.ibanNormalized = bank.ibanNormalized;
  }
  if (input.activity !== undefined) set.activity = input.activity;
  if (input.contactPerson !== undefined) set.contactPerson = input.contactPerson;
  if (input.address !== undefined) set.address = input.address;
  if (input.notes !== undefined) set.notes = input.notes;

  await db.update(suppliers).set(set).where(eq(suppliers.id, id));
  await addAudit({
    action: "SUPPLIER_UPDATED",
    entityType: "supplier",
    entityId: id,
    description: `تعديل المورد ${existing.supplierCode || existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ name: existing.name, taxNumber: existing.taxNumber }),
    ip: ctx.ip,
  });
  return (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
}

export async function setSupplierStatus(ctx: Ctx, id: string, active: boolean) {
  const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
  if (!existing) throw new AppError("المورد غير موجود", 404, "NOT_FOUND");
  const status = active ? SupplierStatus.ACTIVE : SupplierStatus.INACTIVE;
  await db.update(suppliers).set({ status, updatedAt: now() }).where(eq(suppliers.id, id));
  await addAudit({
    action: active ? "SUPPLIER_REACTIVATED" : "SUPPLIER_DEACTIVATED",
    entityType: "supplier",
    entityId: id,
    description: `${active ? "تفعيل" : "تعطيل"} المورد ${existing.supplierCode || existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ status: existing.status }),
    ip: ctx.ip,
  });
  return (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
}

// ------------------------------- Reads (list/detail) --------------------

export async function listSuppliers(
  opts: { search?: string; status?: string; all?: boolean } = {},
) {
  const rows = await db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
  const q = (opts.search || "").trim().toLowerCase();
  const apId = await resolveSystemAccountId(db as any, SYS.ACCOUNTS_PAYABLE).catch(() => null);
  const filtered = rows.filter((s: any) => {
    if (opts.status && s.status !== opts.status) return false;
    if (!opts.all && !opts.status && s.status !== SupplierStatus.ACTIVE) {
      // default list shows active; keep inactive out unless explicitly requested
    }
    if (q) {
      const hay =
        `${s.supplierCode || ""} ${s.name} ${s.taxNumber || ""} ${s.phone || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Derive payable per supplier from the GL subledger (never legacy balance).
  const items = [];
  for (const s of filtered) {
    const bal = apId ? await getSupplierBalance(db, s.id) : { payableBalance: 0 };
    items.push({ ...maskSupplier(s), payableBalance: bal.payableBalance });
  }
  return { items };
}

export async function getSupplierDetail(id: string, opts: { full?: boolean } = {}) {
  const s = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0] as any;
  if (!s) return null;
  const balance = await getSupplierBalance(db, id);
  const ledger = await supplierLedger(db, id);
  const base = opts.full
    ? { ...s, balance: undefined, ibanMasked: s.iban ? maskIban(s.ibanNormalized || s.iban) : null }
    : maskSupplier(s);
  return { item: base, balance, ledger };
}
