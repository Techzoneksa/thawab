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
import { AccountClassification, AccountStatus, JournalStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

export type CashBankKind = "cashbox" | "bank";

// Advisory-lock namespace for cash/bank GL-mapping decisions (arbitrary, stable).
const CASH_BANK_LOCK_NS = 42;

/**
 * Serialize all mapping decisions for one GL account across BOTH tables. Held
 * for the current transaction, so two concurrent create/update flows targeting
 * the same linked_account_id run one-after-another — closing the cross-table
 * race that per-table unique indexes alone cannot (a cashbox and a bank on the
 * same account live in different tables). Must be called INSIDE a db.transaction
 * before the availability check + insert/update.
 */
export async function acquireMappingLock(tx: any, accountId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CASH_BANK_LOCK_NS}, hashtext(${accountId}))`);
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
