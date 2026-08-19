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
import {
  suppliers,
  supplierJournalLinks,
  supplierPayments,
  journalLines,
  journalEntries,
  accounts,
} from "./schema";
import {
  resolveSystemAccountId,
  cashOrBankAccountId,
  postBalancedEntry,
  existingSourceEntryId,
  SYS,
} from "./gl";
import { getAccountBalance } from "./balances";
import { resolvePage, paginatedResult, type PageParams } from "./pagination";
import { nextCode } from "./numbering";
import { AppError } from "./errors";
import { JournalStatus, JournalSource, SupplierStatus, AccountClassification } from "@/lib/enums";
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

// ------------------------------- Supplier payment (idempotent) ----------

export interface PaySupplierInput {
  supplierId: string;
  amount: number;
  method?: "cash" | "bank";
  /** Stable idempotency key for the payment EVENT; a retry with the same key
   *  reuses the existing journal (no second accounting effect). Omit to mint a
   *  fresh payment event (a legitimately new payment). */
  idempotencyKey?: string | null;
  reference?: string | null;
  date?: string | null;
  note?: string | null;
}
export interface PaySupplierResult {
  payment: any;
  entryId: string;
  reused: boolean;
}

/** Normalize a caller key / mint a fresh id — always prefixed SPY- so the source
 *  identity is distinct from the legacy source_id = supplierId rows. */
function paymentEventId(key?: string | null): string {
  const k = (key ?? "").trim();
  if (!k) return genId("SPY");
  return k.startsWith("SPY-") ? k : `SPY-${k}`;
}

/**
 * Post a supplier payment (Dr AP / Cr Cash|Bank) with a STABLE per-payment
 * identity, idempotent under retries and concurrency.
 *
 * BEGIN → upsert the payment event (ON CONFLICT DO NOTHING) → lock it FOR UPDATE
 * → if already journaled: reuse (no second journal) → else post through the
 * certified engine with source_type=supplier_payment, source_id=payment id
 * (existingSourceEntryId + the 0011 unique index are the DB backstops) → link the
 * AP debit line to the supplier (exactly one) → set journal_entry_id → (first
 * post only) decrement the legacy non-authoritative balance → COMMIT.
 *
 * One supplier → many payments (distinct ids); one payment → exactly one journal.
 */
export async function paySupplier(ctx: Ctx, input: PaySupplierInput): Promise<PaySupplierResult> {
  const amount = Number(input.amount);
  if (!(amount > 0))
    throw new AppError("قيمة السداد يجب أن تكون أكبر من صفر", 400, "AMOUNT_INVALID");
  const method = input.method === "cash" ? "cash" : "bank";
  const paymentId = paymentEventId(input.idempotencyKey);
  const date = (input.date || now().slice(0, 10)).slice(0, 10);
  const ts = now();

  const result = await db.transaction(async (tx) => {
    const sup = (
      await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1)
    )[0];
    if (!sup) throw new AppError("المورد غير موجود", 404, "SUPPLIER_NOT_FOUND");

    // Stable event anchor — created once; a retry hits the existing row.
    await tx
      .insert(supplierPayments)
      .values({
        id: paymentId,
        supplierId: input.supplierId,
        amount,
        paymentMethod: method,
        reference: input.reference ?? null,
        paymentDate: date,
        note: input.note ?? "",
        status: "pending",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoNothing();

    const pay = (
      await tx
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, paymentId))
        .for("update")
        .limit(1)
    )[0];

    // Idempotency-key integrity: the SAME key must represent the SAME business
    // intent. If the locked event's payload differs from this request, reject —
    // a reused key must not silently repurpose an existing payment (whether it is
    // already journaled or still pending). On the first call the row equals the
    // incoming values, so this never trips legitimately.
    const mismatch =
      pay.supplierId !== input.supplierId ||
      Math.abs(Number(pay.amount) - amount) > 0.005 ||
      pay.paymentMethod !== method ||
      (pay.paymentDate || "") !== date ||
      (pay.reference || "") !== (input.reference ?? "");
    if (mismatch)
      throw new AppError(
        "مفتاح الدفعة مستخدم بالفعل لدفعة أخرى مختلفة (مورد/مبلغ/طريقة/تاريخ/مرجع)",
        409,
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
      );

    // Already posted (a prior attempt / concurrent winner) → idempotent reuse.
    if (pay.journalEntryId) return { payment: pay, entryId: pay.journalEntryId, reused: true };
    const already = await existingSourceEntryId(tx as any, "supplier_payment", paymentId);
    if (already) {
      await tx
        .update(supplierPayments)
        .set({ journalEntryId: already, status: "posted", updatedAt: now() })
        .where(eq(supplierPayments.id, paymentId));
      return { payment: { ...pay, journalEntryId: already }, entryId: already, reused: true };
    }

    const payable = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_PAYABLE);
    const cashBank = await cashOrBankAccountId(tx as any, method);
    const entryId = await postBalancedEntry(tx as any, {
      date,
      description: `سداد للمورد ${sup.name}${input.note ? ` — ${input.note}` : ""}`,
      source: JournalSource.PURCHASE,
      sourceType: "supplier_payment",
      sourceId: paymentId, // ← the stable payment event id, NOT the supplier id
      lines: [
        { accountId: payable, debit: amount },
        { accountId: cashBank, credit: amount },
      ],
      userId: ctx.user.id,
      status: JournalStatus.POSTED,
    });
    await linkSupplierPaymentApLine(tx as any, {
      supplierId: input.supplierId,
      entryId,
      userId: ctx.user.id,
    });
    await tx
      .update(supplierPayments)
      .set({ journalEntryId: entryId, status: "posted", updatedAt: now() })
      .where(eq(supplierPayments.id, paymentId));
    // Legacy non-authoritative cache (pre-3A procurement) — first post only.
    await tx
      .update(suppliers)
      .set({ balance: sql`${suppliers.balance} - ${amount}`, updatedAt: now() })
      .where(eq(suppliers.id, input.supplierId));
    return {
      payment: { ...pay, journalEntryId: entryId, status: "posted" },
      entryId,
      reused: false,
    };
  });

  if (!result.reused) {
    await addAudit({
      action: "SUPPLIER_PAYMENT_POSTED",
      entityType: "supplier",
      entityId: input.supplierId,
      description: `سداد ${amount} للمورد (سند دفع ${paymentId})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
  }
  return result;
}

/**
 * Read-only diagnostic for the supplier_payment source identity: total journals,
 * distinct source ids, and how many follow the legacy (source_id = supplier id)
 * vs the new (SPY-…) pattern. Never rewrites history.
 */
export async function supplierPaymentPreflight(dbh: Db) {
  const agg = (
    await (dbh as any)
      .select({
        total: sql<number>`COUNT(*)`,
        distinctSource: sql<number>`COUNT(DISTINCT ${journalEntries.sourceId})`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceType, "supplier_payment"),
          inArray(journalEntries.status, GL_STATES),
        ),
      )
  )[0] as any;
  const legacy = (
    await (dbh as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceType, "supplier_payment"),
          inArray(journalEntries.status, GL_STATES),
          sql`EXISTS (SELECT 1 FROM ${suppliers} s WHERE s.id = ${journalEntries.sourceId})`,
        ),
      )
  )[0] as any;
  const newer = (
    await (dbh as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceType, "supplier_payment"),
          inArray(journalEntries.status, GL_STATES),
          sql`${journalEntries.sourceId} LIKE 'SPY-%'`,
        ),
      )
  )[0] as any;
  const total = Number(agg?.total || 0);
  const distinct = Number(agg?.distinctSource || 0);
  return {
    supplierPaymentJournalCount: total,
    distinctSourceIdCount: distinct,
    duplicateSourceIdentities: total - distinct, // 0 expected under the 0011 index
    legacySupplierIdPatternCount: Number(legacy?.c || 0),
    newPaymentEventPatternCount: Number(newer?.c || 0),
  };
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

/**
 * Batched supplier payable (credit − debit over each supplier's linked AP lines,
 * posted+reversed) in ONE set-based query — replaces the per-row getSupplierBalance
 * N+1. Pass `supplierIds` to bound it to a page. Returns Map(supplierId → payable).
 */
export async function supplierPayableMap(
  dbh: Db,
  supplierIds?: string[],
): Promise<Map<string, number>> {
  const conds: any[] = [inArray(journalEntries.status, GL_STATES)];
  if (supplierIds && supplierIds.length)
    conds.push(inArray(supplierJournalLinks.supplierId, supplierIds));
  const rows = (await (dbh as any)
    .select({
      sid: supplierJournalLinks.supplierId,
      payable: sql<number>`COALESCE(SUM(${journalLines.credit}),0) - COALESCE(SUM(${journalLines.debit}),0)`,
    })
    .from(supplierJournalLinks)
    .innerJoin(journalLines, eq(supplierJournalLinks.journalLineId, journalLines.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .groupBy(supplierJournalLinks.supplierId)) as any[];
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.sid, Number(r.payable || 0));
  return m;
}

/** WHERE shared by the supplier list page and the picker (`all`) path. */
function supplierListWhere(opts: { search?: string; status?: string }) {
  const conds: any[] = [];
  if (opts.status) conds.push(eq(suppliers.status, opts.status));
  const q = (opts.search || "").trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(
      sql`(${suppliers.supplierCode} ILIKE ${like} OR ${suppliers.name} ILIKE ${like} OR ${suppliers.taxNumber} ILIKE ${like} OR ${suppliers.phone} ILIKE ${like})`,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Phase 4A — supplier list.
 *
 * Two shapes, one N+1-free rule:
 *  - List page (default): bounded page (default 25, max 200). Filters + ORDER BY
 *    run in SQL; per-supplier payable is computed for the page's suppliers with a
 *    SINGLE batched GL aggregate (`supplierPayableMap`), never one query per row.
 *  - Picker (`all: true`): master-data dropdowns must be able to reach every
 *    active supplier, so this returns the full filtered set in ONE slim query
 *    WITHOUT any per-row balance (pickers never show payable). This removes the
 *    real cost — the previous per-row `getSupplierBalance` fan-out — while keeping
 *    the picker complete. See Remaining Risks (P3): a typeahead options endpoint
 *    would let even this path page.
 */
export async function listSuppliers(
  opts: { search?: string; status?: string; all?: boolean } & PageParams = {},
) {
  const where = supplierListWhere(opts);

  if (opts.all) {
    const rows = (await (db as any)
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(desc(suppliers.createdAt))) as any[];
    const items = rows.map((s) => ({ ...maskSupplier(s), payableBalance: 0 }));
    return { items, page: 1, pageSize: items.length, total: items.length, totalPages: 1 };
  }

  const pg = resolvePage(opts);
  const totalRow = (
    await (db as any)
      .select({ c: sql<number>`COUNT(*)` })
      .from(suppliers)
      .where(where)
  )[0] as any;
  const total = Number(totalRow?.c || 0);

  const rows = (await (db as any)
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(desc(suppliers.createdAt))
    .limit(pg.limit)
    .offset(pg.offset)) as any[];

  const balances = await supplierPayableMap(
    db,
    rows.map((s) => s.id),
  );
  const items = rows.map((s) => ({ ...maskSupplier(s), payableBalance: balances.get(s.id) || 0 }));
  return { ...paginatedResult(items, total, pg), items };
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
