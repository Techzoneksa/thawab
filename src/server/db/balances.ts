/**
 * Account balance service — the ONE authoritative way to obtain an account
 * balance. Balances are always derived from POSTED, non-reversed journal lines
 * (the General Ledger). `accounts.balance` is never read here and must not be
 * used as an accounting source of truth anywhere.
 *
 * Signing respects the account's accounting nature (classification); no account
 * ids are hardcoded.
 */
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { accounts, journalEntries, journalLines } from "./schema";
import { JournalStatus, AccountClassification } from "@/lib/enums";

// The General Ledger includes every entry that was actually posted. A reversal
// keeps the original in the ledger (status 'reversed') and offsets it with a
// mirror entry (status 'posted'); counting both nets to zero — the correct
// result. Draft/pending/cancelled entries never hit the GL.
const GL_STATES = [JournalStatus.POSTED, JournalStatus.REVERSED];

// Structural handle so this works with either the module `db` or a test tx.
type Db = { select: (...a: any[]) => any };

/** Debit-natured accounts (assets, expenses) vs credit-natured (liab/equity/revenue). */
function naturalBalance(
  classification: string | null | undefined,
  debitMinusCredit: number,
): number {
  if (
    classification === AccountClassification.ASSET ||
    classification === AccountClassification.EXPENSE
  ) {
    return debitMinusCredit;
  }
  return -debitMinusCredit;
}

const postedConds = () => [inArray(journalEntries.status, GL_STATES)];

export interface AccountBalanceRow {
  debit: number;
  credit: number;
  /** Natural (signed by classification) balance. */
  balance: number;
}

/**
 * Bulk balances for every account that has posted activity, as of an optional
 * date. One grouped query — used by the Chart of Accounts list/detail so the UI
 * shows the real GL balance, not the stored `accounts.balance` field.
 */
export async function getAllAccountBalances(
  dbh: Db,
  opts: { asOf?: string } = {},
): Promise<Map<string, AccountBalanceRow>> {
  const conds = postedConds();
  if (opts.asOf) conds.push(lte(journalEntries.date, opts.asOf));

  const rows = await dbh
    .select({
      accountId: journalLines.accountId,
      classification: accounts.classification,
      debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conds))
    .groupBy(journalLines.accountId, accounts.classification);

  const map = new Map<string, AccountBalanceRow>();
  for (const r of rows as any[]) {
    const debit = Number(r.debit || 0);
    const credit = Number(r.credit || 0);
    map.set(r.accountId, {
      debit,
      credit,
      balance: naturalBalance(r.classification, debit - credit),
    });
  }
  return map;
}

export interface AccountLedgerBalance {
  accountId: string;
  classification: string;
  openingDebit: number;
  openingCredit: number;
  opening: number; // natural
  periodDebit: number;
  periodCredit: number;
  closing: number; // natural
}

/**
 * Opening / period / closing balance for a single account over a date range,
 * from posted non-reversed lines. Opening = activity strictly before dateFrom.
 */
export async function getAccountBalance(
  dbh: Db,
  accountId: string,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<AccountLedgerBalance> {
  const acc = (
    await dbh.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
  )[0] as any;
  const classification: string = acc?.classification ?? AccountClassification.ASSET;

  const sumWhere = async (extra: any[]) => {
    const r = (
      await dbh
        .select({
          debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
          credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .where(and(eq(journalLines.accountId, accountId), ...postedConds(), ...extra))
    )[0] as any;
    return { debit: Number(r?.debit || 0), credit: Number(r?.credit || 0) };
  };

  const opening = opts.dateFrom
    ? await sumWhere([sql`${journalEntries.date} < ${opts.dateFrom}`])
    : { debit: 0, credit: 0 };

  const periodExtra: any[] = [];
  if (opts.dateFrom) periodExtra.push(sql`${journalEntries.date} >= ${opts.dateFrom}`);
  if (opts.dateTo) periodExtra.push(sql`${journalEntries.date} <= ${opts.dateTo}`);
  const period = await sumWhere(periodExtra);

  const openingNatural = naturalBalance(classification, opening.debit - opening.credit);
  const closingRawDebit = opening.debit + period.debit;
  const closingRawCredit = opening.credit + period.credit;
  const closingNatural = naturalBalance(classification, closingRawDebit - closingRawCredit);

  return {
    accountId,
    classification,
    openingDebit: opening.debit,
    openingCredit: opening.credit,
    opening: openingNatural,
    periodDebit: period.debit,
    periodCredit: period.credit,
    closing: closingNatural,
  };
}
