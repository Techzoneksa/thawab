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
