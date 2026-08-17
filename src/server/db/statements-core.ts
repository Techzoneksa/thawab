/**
 * Financial statement computations — the SINGLE source for Trial Balance,
 * Statement of Financial Position, and Income/Expense. Both the public
 * statements API (`api/finance/statements.ts`) and the internal finance
 * preflight import these; there is no second/parallel accounting formula.
 *
 * All figures derive from the General Ledger: posted + reversed journal lines
 * (a reversed original is offset by its posted mirror → nets to zero).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { accounts, journalEntries, journalLines } from "./schema";
import { AccountClassification, JournalStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

/** General Ledger states. */
export const GL_STATES = [JournalStatus.POSTED, JournalStatus.REVERSED];
export const glFilter = () => [inArray(journalEntries.status, GL_STATES)];

export interface StmtFilters {
  startDate?: string;
  endDate?: string;
  asOf?: string;
  costCenterId?: string;
  projectId?: string;
}

export async function trialBalance(dbh: Db, f: StmtFilters = {}) {
  const conditions = glFilter();
  if (f.startDate) conditions.push(sql`${journalEntries.date} >= ${f.startDate}`);
  if (f.endDate) conditions.push(sql`${journalEntries.date} <= ${f.endDate}`);
  if (f.costCenterId) conditions.push(eq(journalLines.costCenterId, f.costCenterId));
  if (f.projectId) conditions.push(eq(journalLines.projectId, f.projectId));

  const rows = await dbh
    .select({
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      accountType: accounts.classification,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conditions))
    .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.classification);

  rows.sort((a: any, b: any) => String(a.accountCode).localeCompare(String(b.accountCode), "ar"));

  const enriched = rows.map((r: any) => ({
    ...r,
    totalDebit: Number(r.totalDebit),
    totalCredit: Number(r.totalCredit),
    netDebit: Number(r.totalDebit) - Number(r.totalCredit),
    balance: Math.abs(Number(r.totalDebit) - Number(r.totalCredit)),
    isDebit: Number(r.totalDebit) >= Number(r.totalCredit),
  }));

  const totalDebit = enriched.reduce((s: number, r: any) => s + r.totalDebit, 0);
  const totalCredit = enriched.reduce((s: number, r: any) => s + r.totalCredit, 0);
  return {
    rows: enriched,
    totals: {
      accountCount: enriched.length,
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
  };
}

export async function incomeExpense(dbh: Db, f: StmtFilters = {}) {
  const conditions = [
    ...glFilter(),
    inArray(accounts.classification, [
      AccountClassification.REVENUE,
      AccountClassification.EXPENSE,
    ]),
  ];
  if (f.startDate) conditions.push(sql`${journalEntries.date} >= ${f.startDate}`);
  if (f.endDate) conditions.push(sql`${journalEntries.date} <= ${f.endDate}`);
  if (f.costCenterId) conditions.push(eq(journalLines.costCenterId, f.costCenterId));
  if (f.projectId) conditions.push(eq(journalLines.projectId, f.projectId));

  const rows = await dbh
    .select({
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      accountType: accounts.classification,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conditions))
    .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.classification);

  const enriched = rows.map((r: any) => ({
    ...r,
    netAmount:
      r.accountType === AccountClassification.REVENUE
        ? Number(r.totalCredit) - Number(r.totalDebit)
        : Number(r.totalDebit) - Number(r.totalCredit),
  }));
  const revenues = enriched.filter((r: any) => r.accountType === AccountClassification.REVENUE);
  const expenses = enriched.filter((r: any) => r.accountType === AccountClassification.EXPENSE);
  const totalRevenue = revenues.reduce((s: number, r: any) => s + Math.max(0, r.netAmount), 0);
  const totalExpense = expenses.reduce((s: number, r: any) => s + Math.max(0, r.netAmount), 0);
  const surplus = totalRevenue - totalExpense;
  return {
    revenues,
    expenses,
    totals: { totalRevenue, totalExpense, surplus, deficit: surplus < 0 },
  };
}

export async function financialPosition(dbh: Db, f: StmtFilters = {}) {
  const conditions = glFilter();
  if (f.asOf) conditions.push(sql`${journalEntries.date} <= ${f.asOf}`);
  if (f.costCenterId) conditions.push(eq(journalLines.costCenterId, f.costCenterId));
  if (f.projectId) conditions.push(eq(journalLines.projectId, f.projectId));

  const rows = await dbh
    .select({
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      accountType: accounts.classification,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conditions))
    .groupBy(journalLines.accountId, accounts.code, accounts.name, accounts.classification);

  const enriched = rows.map((r: any) => {
    let balance: number;
    if (r.accountType === AccountClassification.ASSET)
      balance = Number(r.totalDebit) - Number(r.totalCredit);
    else if (
      r.accountType === AccountClassification.LIABILITY ||
      r.accountType === AccountClassification.EQUITY
    )
      balance = Number(r.totalCredit) - Number(r.totalDebit);
    else balance = Number(r.totalDebit) - Number(r.totalCredit);
    return { ...r, balance };
  });

  const assetsRows = enriched.filter((r: any) => r.accountType === AccountClassification.ASSET);
  const liabilityRows = enriched.filter(
    (r: any) => r.accountType === AccountClassification.LIABILITY,
  );
  const equityRows = enriched.filter((r: any) => r.accountType === AccountClassification.EQUITY);
  const totalAssets = assetsRows.reduce((s: number, r: any) => s + r.balance, 0);
  const totalLiabilities = liabilityRows.reduce((s: number, r: any) => s + r.balance, 0);
  const totalEquity = equityRows.reduce((s: number, r: any) => s + r.balance, 0);

  // Non-profit: current-period surplus (revenue − expense) folds into equity.
  const ie = await incomeExpense(dbh, {
    endDate: f.asOf,
    costCenterId: f.costCenterId,
    projectId: f.projectId,
  });
  const periodSurplus = ie.totals.surplus;
  const totalEquityWithSurplus = totalEquity + periodSurplus;

  return {
    assets: assetsRows,
    liabilities: liabilityRows,
    equity: equityRows,
    periodSurplus,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalEquityWithSurplus,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquityWithSurplus,
      equationDifference: totalAssets - (totalLiabilities + totalEquityWithSurplus),
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquityWithSurplus)) < 0.01,
    },
  };
}
