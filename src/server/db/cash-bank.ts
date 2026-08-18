/**
 * Phase 2A — Cash & Bank master-data service.
 *
 * Operational Cashboxes and Bank Accounts map to exactly one GL posting account
 * (`linked_account_id`). There is NO stored balance here — every balance derives
 * from the certified Phase 1A ledger (`getAccountBalance`, posted+reversed only).
 * This module holds the reusable, testable validation + balance helpers; the
 * routes add permission checks and audit.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { accounts, cashboxes, bankAccounts, journalEntries, journalLines } from "./schema";
import { getAccountBalance } from "./balances";
import { AppError } from "./errors";
import { LOCK_NS } from "./lock-namespaces";
import { AccountClassification, AccountStatus, JournalStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

export type CashBankKind = "cashbox" | "bank";

/**
 * Serialize all mapping decisions for one GL account across BOTH tables. Held
 * for the current transaction, so two concurrent create/update flows targeting
 * the same linked_account_id run one-after-another — closing the cross-table
 * race that per-table unique indexes alone cannot (a cashbox and a bank on the
 * same account live in different tables). Must be called INSIDE a db.transaction
 * before the availability check + insert/update.
 */
export async function acquireMappingLock(tx: any, accountId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.CASH_BANK_MAPPING}, hashtext(${accountId}))`,
  );
}

/**
 * Serialize cash-payment posting for one Cashbox linked GL account (Phase 2C).
 * Held for the current transaction, so two concurrent cash payments on the same
 * cashbox run one-after-another: each reads the committed balance of the prior
 * one, making a negative-cash race impossible. Distinct namespace from mapping
 * so it never blocks (or is blocked by) a mapping change. Must be called INSIDE
 * the posting db.transaction, before the sufficiency check + journal.
 */
export async function acquireCashPostingLock(tx: any, accountId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.CASH_PAYMENT_POSTING}, hashtext(${accountId}))`,
  );
}

/** Money precision tolerance shared with the GL engine (half a fils). */
const CASH_TOLERANCE = 0.005;

/**
 * Phase 2C.1 — Backdated cash-payment safety for a Cashbox linked GL account.
 *
 * The as-of-voucher-date balance is necessary but NOT sufficient: a payment
 * dated D lowers the cash balance at EVERY accounting point from D through the
 * end of the ledger, so it can drive a later (already lower) balance negative.
 *
 * Correct invariant: amount ≤ the MINIMUM daily book-cash balance over the
 * window [voucher_date, latest posted date]. That minimum is evaluated over the
 * carried balance as-of D (covering the gap before the first later movement)
 * PLUS the closing balance at every posted date after D. Derived purely from
 * posted/reversed GL journal lines (Asset nature: debit − credit); no stored
 * balance, no snapshot, no change to balances.ts / the accounting engine.
 *
 * Must run INSIDE the posting transaction, AFTER acquireCashPostingLock, so
 * concurrent same-cashbox payments each see the prior committed effect.
 * Returns the minimum window balance (for diagnostics).
 */
export async function assertCashPaymentSafe(
  tx: { execute: (q: any) => Promise<any> },
  accountId: string,
  voucherDate: string,
  amount: number,
): Promise<number> {
  const day = voucherDate.slice(0, 10);
  // daily = per-date net (debit − credit) for the account over the GL states.
  // points = { voucher_date } ∪ { posted dates ≥ voucher_date }.
  // For each point p, closing(p) = Σ net over dates ≤ p. Take the minimum.
  const res: any = await tx.execute(sql`
    WITH daily AS (
      SELECT ${journalEntries.date} AS d,
             SUM(${journalLines.debit} - ${journalLines.credit}) AS net
      FROM ${journalLines}
      JOIN ${journalEntries} ON ${journalLines.journalEntryId} = ${journalEntries.id}
      WHERE ${journalLines.accountId} = ${accountId}
        AND ${journalEntries.status} IN (${JournalStatus.POSTED}, ${JournalStatus.REVERSED})
      GROUP BY ${journalEntries.date}
    ),
    points AS (
      SELECT d FROM daily WHERE d >= ${day}
      UNION
      SELECT ${day} AS d
    )
    SELECT COALESCE(MIN(
      (SELECT COALESCE(SUM(net), 0) FROM daily WHERE daily.d <= points.d)
    ), 0) AS min_closing
    FROM points
  `);
  const rows = res?.rows ?? res ?? [];
  const minClosing = Number(rows[0]?.min_closing ?? 0);
  if (minClosing + CASH_TOLERANCE < Number(amount))
    throw new AppError(
      `رصيد الصندوق غير كافٍ للصرف — أدنى رصيد نقدي متاح من تاريخ السند حتى نهاية الحركة ${minClosing} والمطلوب ${Number(amount)}`,
      400,
      "INSUFFICIENT_CASH",
    );
  return minClosing;
}

/**
 * Validate a GL account is eligible to back a Cashbox/Bank Account:
 * exists · active · postable (leaf) · Asset classification. Never identified by
 * code prefixes — only by the account's own classification/flags.
 */
export async function validateLinkedAccount(dbh: Db, accountId: string) {
  const acc = (
    await dbh.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
  )[0] as any;
  if (!acc) throw new AppError("الحساب المحاسبي غير موجود", 400, "ACCOUNT_NOT_FOUND");
  if (acc.status !== AccountStatus.ACTIVE)
    throw new AppError("الحساب المحاسبي غير نشط", 400, "ACCOUNT_INACTIVE");
  if (!acc.postable)
    throw new AppError(
      "لا يمكن الربط بحساب رئيسي/غير قابل للترحيل — اختر حساباً فرعياً قابلاً للترحيل",
      400,
      "ACCOUNT_NOT_POSTABLE",
    );
  if (acc.classification !== AccountClassification.ASSET)
    throw new AppError(
      "يجب ربط الصندوق/الحساب البنكي بحساب أصول (Asset) فقط — غير مسموح بالإيرادات أو المصروفات أو الالتزامات أو حقوق الملكية",
      400,
      "ACCOUNT_NOT_ASSET",
    );
  return acc;
}

/**
 * Enforce deterministic operational identity: a GL account backs at most ONE
 * operational entity across BOTH tables (no two cashboxes, no two banks, no
 * cashbox+bank on the same account). Excludes the entity being updated.
 */
export async function assertMappingAvailable(
  dbh: Db,
  accountId: string,
  exclude: { cashboxId?: string; bankId?: string } = {},
) {
  const cbWhere = exclude.cashboxId
    ? and(eq(cashboxes.linkedAccountId, accountId), ne(cashboxes.id, exclude.cashboxId))
    : eq(cashboxes.linkedAccountId, accountId);
  const cb = (await dbh.select({ id: cashboxes.id }).from(cashboxes).where(cbWhere).limit(1))[0];
  if (cb) throw new AppError("هذا الحساب مرتبط بصندوق آخر بالفعل", 409, "ACCOUNT_ALREADY_MAPPED");

  const baWhere = exclude.bankId
    ? and(eq(bankAccounts.linkedAccountId, accountId), ne(bankAccounts.id, exclude.bankId))
    : eq(bankAccounts.linkedAccountId, accountId);
  const ba = (
    await dbh.select({ id: bankAccounts.id }).from(bankAccounts).where(baWhere).limit(1)
  )[0];
  if (ba)
    throw new AppError("هذا الحساب مرتبط بحساب بنكي آخر بالفعل", 409, "ACCOUNT_ALREADY_MAPPED");
}

/**
 * Returns the kind ("cashbox"|"bank") if a GL account is the linked account of
 * an ACTIVE cashbox or bank, else null. Used by Receipt Vouchers (Phase 2B) to
 * reject a credit line that would disguise an internal Cash/Bank transfer — a
 * live money destination must never also be a receipt counterparty. Inactive
 * masters (history only) do not block.
 */
export async function accountMappedToActiveCashBank(
  dbh: Db,
  accountId: string,
): Promise<CashBankKind | null> {
  const cb = (
    await dbh
      .select({ id: cashboxes.id })
      .from(cashboxes)
      .where(
        and(eq(cashboxes.linkedAccountId, accountId), eq(cashboxes.status, AccountStatus.ACTIVE)),
      )
      .limit(1)
  )[0];
  if (cb) return "cashbox";
  const ba = (
    await dbh
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.linkedAccountId, accountId),
          eq(bankAccounts.status, AccountStatus.ACTIVE),
        ),
      )
      .limit(1)
  )[0];
  if (ba) return "bank";
  return null;
}

/**
 * Returns the kind ("cashbox"|"bank") if a GL account is the linked account of
 * ANY cashbox or bank — active OR inactive. Payment Vouchers (Phase 2C) reject a
 * debit line mapped to a cash/bank master regardless of status: its operational
 * identity is still Cash/Bank, so a payment against it would be a disguised
 * internal transfer (handled by a dedicated workflow later), not a payment.
 */
export async function accountMappedToAnyCashBank(
  dbh: Db,
  accountId: string,
): Promise<CashBankKind | null> {
  const cb = (
    await dbh
      .select({ id: cashboxes.id })
      .from(cashboxes)
      .where(eq(cashboxes.linkedAccountId, accountId))
      .limit(1)
  )[0];
  if (cb) return "cashbox";
  const ba = (
    await dbh
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.linkedAccountId, accountId))
      .limit(1)
  )[0];
  if (ba) return "bank";
  return null;
}

/** True if the account has any posted/reversed journal history (immutability gate). */
export async function accountHasPostedHistory(dbh: any, accountId: string): Promise<boolean> {
  const r = (
    await dbh
      .select({ c: sql<number>`count(*)` })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.accountId, accountId),
          sql`${journalEntries.status} IN (${JournalStatus.POSTED}, ${JournalStatus.REVERSED})`,
        ),
      )
  )[0];
  return Number(r?.c ?? 0) > 0;
}

/**
 * Guard a linked-account mapping change: if the CURRENT account already carries
 * posted history, the mapping is immutable (deactivate + create a new entity).
 */
export async function assertMappingChangeAllowed(dbh: any, currentAccountId: string) {
  if (await accountHasPostedHistory(dbh, currentAccountId))
    throw new AppError(
      "لا يمكن تغيير الحساب المرتبط بعد وجود حركة مُرحّلة — عطّل الكيان الحالي وأنشئ كياناً جديداً بالحساب الصحيح",
      409,
      "MAPPING_LOCKED",
    );
}

/**
 * GL-derived balance for a linked account. `asOf` → closing balance up to that
 * date; a date range → opening/period/closing. Posted+reversed only.
 */
export async function linkedAccountBalance(
  dbh: Db,
  linkedAccountId: string,
  opts: { dateFrom?: string; dateTo?: string; asOf?: string } = {},
) {
  const b = await getAccountBalance(dbh, linkedAccountId, {
    dateFrom: opts.dateFrom,
    dateTo: opts.asOf ?? opts.dateTo,
  });
  return {
    accountId: linkedAccountId,
    openingBalance: b.opening,
    periodDebit: b.periodDebit,
    periodCredit: b.periodCredit,
    closingBalance: b.closing,
    asOf: opts.asOf ?? opts.dateTo ?? null,
  };
}

/**
 * GL ledger movements for the linked account — the Cash/Bank drill-down. Reuses
 * the certified GL states (posted+reversed) and preserves source_type/source_id
 * traceability + journal navigation. Running balance is computed over the
 * (optional) opening balance before dateFrom.
 */
export async function accountLedger(
  dbh: Db,
  accountId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
) {
  const opening = opts.dateFrom
    ? (await getAccountBalance(dbh, accountId, { dateTo: undefined, dateFrom: opts.dateFrom }))
        .opening
    : 0;
  const conds = [
    eq(journalLines.accountId, accountId),
    sql`${journalEntries.status} IN (${JournalStatus.POSTED}, ${JournalStatus.REVERSED})`,
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
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .orderBy(journalEntries.date, journalEntries.number, journalLines.lineNumber);

  let running = Number(opening);
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
      runningBalance: running,
    };
  });
  return { opening: Number(opening), movements, closing: running };
}
