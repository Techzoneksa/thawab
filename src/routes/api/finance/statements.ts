import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db/index";
import { accounts, journalLines, journalEntries, budgetLines, budgets } from "@/server/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { authHandler, err, type Ctx } from "@/server/db/api-utils";
import { AccountClassification, JournalStatus, BudgetStatus } from "@/lib/enums";

// GET /api/finance/statements?type=...&startDate=...&endDate=...&costCenterId=...&projectId=...&budgetId=...
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "trial-balance";
  const startDate = url.searchParams.get("startDate") || "";
  const endDate = url.searchParams.get("endDate") || "";
  const asOf = url.searchParams.get("asOf") || endDate;
  const costCenterId = url.searchParams.get("costCenterId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const budgetId = url.searchParams.get("budgetId") || "";

  if (type === "trial-balance") {
    return getTrialBalance({ startDate, endDate, costCenterId, projectId });
  }
  if (type === "income-expense") {
    return getIncomeExpense({ startDate, endDate, costCenterId, projectId });
  }
  if (type === "financial-position") {
    return getFinancialPosition({ asOf, costCenterId, projectId });
  }
  if (type === "budget-vs-actual") {
    return getBudgetVsActual({ budgetId, startDate, endDate });
  }

  return err("نوع التقرير غير معروف", 400, "UNKNOWN_REPORT");
}

// Posted, non-reversed entries only.
const postedFilter = () => [
  eq(journalEntries.status, JournalStatus.POSTED),
  sql`${journalEntries.reversedAt} IS NULL`,
];

// ============ TRIAL BALANCE ============
async function getTrialBalance(filters: {
  startDate: string;
  endDate: string;
  costCenterId: string;
  projectId: string;
}) {
  const conditions = postedFilter();
  if (filters.startDate) conditions.push(sql`${journalEntries.date} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${journalEntries.date} <= ${filters.endDate}`);
  if (filters.costCenterId) conditions.push(eq(journalLines.costCenterId, filters.costCenterId));
  if (filters.projectId) conditions.push(eq(journalLines.projectId, filters.projectId));

  const rows = await db
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

  // Order by account code for trial balance
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode, "ar"));

  const enriched = rows.map((r) => ({
    ...r,
    netDebit: r.totalDebit - r.totalCredit,
    balance:
      r.totalDebit > r.totalCredit ? r.totalDebit - r.totalCredit : r.totalCredit - r.totalDebit,
    isDebit: r.totalDebit >= r.totalCredit,
  }));

  const totalDebit = enriched.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = enriched.reduce((s, r) => s + r.totalCredit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return Response.json({
    type: "trial-balance",
    rows: enriched,
    totals: { totalDebit, totalCredit, balanced, variance: totalDebit - totalCredit },
  });
}

// ============ INCOME / EXPENSE (قائمة الأنشطة) ============
async function getIncomeExpense(filters: {
  startDate: string;
  endDate: string;
  costCenterId: string;
  projectId: string;
}) {
  const conditions = [
    ...postedFilter(),
    inArray(accounts.classification, [
      AccountClassification.REVENUE,
      AccountClassification.EXPENSE,
    ]),
  ];
  if (filters.startDate) conditions.push(sql`${journalEntries.date} >= ${filters.startDate}`);
  if (filters.endDate) conditions.push(sql`${journalEntries.date} <= ${filters.endDate}`);
  if (filters.costCenterId) conditions.push(eq(journalLines.costCenterId, filters.costCenterId));
  if (filters.projectId) conditions.push(eq(journalLines.projectId, filters.projectId));

  const rows = await db
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

  // For revenue: credit - debit (positive = revenue)
  // For expense: debit - credit (positive = expense)
  const enriched = rows.map((r) => {
    const net =
      r.accountType === AccountClassification.REVENUE
        ? r.totalCredit - r.totalDebit
        : r.totalDebit - r.totalCredit;
    return { ...r, netAmount: net };
  });

  enriched.sort((a, b) => a.accountCode.localeCompare(b.accountCode, "ar"));

  const revenues = enriched.filter((r) => r.accountType === AccountClassification.REVENUE);
  const expenses = enriched.filter((r) => r.accountType === AccountClassification.EXPENSE);
  const totalRevenue = revenues.reduce((s, r) => s + Math.max(0, r.netAmount), 0);
  const totalExpense = expenses.reduce((s, r) => s + Math.max(0, r.netAmount), 0);
  const surplus = totalRevenue - totalExpense;

  return Response.json({
    type: "income-expense",
    revenues,
    expenses,
    totals: { totalRevenue, totalExpense, surplus, deficit: surplus < 0 },
  });
}

// ============ FINANCIAL POSITION (المركز المالي / BALANCE SHEET) ============
async function getFinancialPosition(filters: {
  asOf: string;
  costCenterId: string;
  projectId: string;
}) {
  const conditions = postedFilter();
  if (filters.asOf) conditions.push(sql`${journalEntries.date} <= ${filters.asOf}`);
  if (filters.costCenterId) conditions.push(eq(journalLines.costCenterId, filters.costCenterId));
  if (filters.projectId) conditions.push(eq(journalLines.projectId, filters.projectId));

  const rows = await db
    .select({
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      accountType: accounts.classification,
      accountLevel: accounts.level,
      parentId: accounts.parentId,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conditions))
    .groupBy(
      journalLines.accountId,
      accounts.code,
      accounts.name,
      accounts.classification,
      accounts.level,
      accounts.parentId,
    );

  // Compute balance per account: debit - credit for assets, credit - debit for liabilities/equity
  const enriched = rows.map((r) => {
    let balance: number;
    if (r.accountType === AccountClassification.ASSET) balance = r.totalDebit - r.totalCredit;
    else if (
      r.accountType === AccountClassification.LIABILITY ||
      r.accountType === AccountClassification.EQUITY
    )
      balance = r.totalCredit - r.totalDebit;
    else balance = r.totalDebit - r.totalCredit;
    return { ...r, balance };
  });

  // Group by classification
  const assets = enriched.filter((r) => r.accountType === AccountClassification.ASSET);
  const liabilities = enriched.filter((r) => r.accountType === AccountClassification.LIABILITY);
  const equity = enriched.filter((r) => r.accountType === AccountClassification.EQUITY);

  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);

  // For non-profit, equity includes current period surplus (revenue - expense).
  // Compute net surplus as of date.
  const surplusConditions = [
    ...postedFilter(),
    inArray(accounts.classification, [
      AccountClassification.REVENUE,
      AccountClassification.EXPENSE,
    ]),
  ];
  if (filters.asOf) surplusConditions.push(sql`${journalEntries.date} <= ${filters.asOf}`);
  if (filters.costCenterId)
    surplusConditions.push(eq(journalLines.costCenterId, filters.costCenterId));
  if (filters.projectId) surplusConditions.push(eq(journalLines.projectId, filters.projectId));

  const surplusRows = await db
    .select({
      accountType: accounts.classification,
      totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...surplusConditions))
    .groupBy(accounts.classification);

  const revenueTotal = surplusRows.find((r) => r.accountType === AccountClassification.REVENUE);
  const expenseTotal = surplusRows.find((r) => r.accountType === AccountClassification.EXPENSE);
  const revenueBalance = (revenueTotal?.totalCredit || 0) - (revenueTotal?.totalDebit || 0);
  const expenseBalance = (expenseTotal?.totalDebit || 0) - (expenseTotal?.totalCredit || 0);
  const periodSurplus = revenueBalance - expenseBalance;

  const totalEquityWithSurplus = totalEquity + periodSurplus;

  return Response.json({
    type: "financial-position",
    assets,
    liabilities,
    equity,
    periodSurplus,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalEquityWithSurplus,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquityWithSurplus,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquityWithSurplus)) < 0.01,
    },
  });
}

// ============ BUDGET vs ACTUAL ============
async function getBudgetVsActual(filters: {
  budgetId: string;
  startDate: string;
  endDate: string;
}) {
  // 1. Get target budgets (single by id, else all approved/locked).
  let targetBudgets;
  if (filters.budgetId) {
    targetBudgets = await db.select().from(budgets).where(eq(budgets.id, filters.budgetId));
    if (targetBudgets.length === 0) {
      return err("الموازنة غير موجودة", 404, "NOT_FOUND");
    }
  } else {
    targetBudgets = await db
      .select()
      .from(budgets)
      .where(inArray(budgets.status, [BudgetStatus.APPROVED, BudgetStatus.LOCKED]));
  }

  // 2. For each budget, compute planned vs actual. Every async map MUST be awaited
  //    (an un-awaited .map(async …) serializes to {} and reduces to NaN).
  const enriched = await Promise.all(
    targetBudgets.map(async (budget) => {
      const lines = await db
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id));

      const enrichedLines = await Promise.all(
        lines.map(async (line) => {
          // Compute actual from posted journal lines matching this line's account/cost-center/project.
          const conditions = [
            ...postedFilter(),
            inArray(accounts.classification, [
              AccountClassification.REVENUE,
              AccountClassification.EXPENSE,
            ]),
          ];
          if (line.accountId) conditions.push(eq(journalLines.accountId, line.accountId));
          if (line.costCenterId) conditions.push(eq(journalLines.costCenterId, line.costCenterId));
          if (line.projectId) conditions.push(eq(journalLines.projectId, line.projectId));
          if (filters.startDate)
            conditions.push(sql`${journalEntries.date} >= ${filters.startDate}`);
          if (filters.endDate) conditions.push(sql`${journalEntries.date} <= ${filters.endDate}`);

          const actuals = await db
            .select({
              accountType: accounts.classification,
              totalDebit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
              totalCredit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
            .where(and(...conditions))
            .groupBy(accounts.classification);

          const revenueActual =
            (actuals.find((a) => a.accountType === AccountClassification.REVENUE)?.totalCredit ||
              0) -
            (actuals.find((a) => a.accountType === AccountClassification.REVENUE)?.totalDebit || 0);
          const expenseActual =
            (actuals.find((a) => a.accountType === AccountClassification.EXPENSE)?.totalDebit ||
              0) -
            (actuals.find((a) => a.accountType === AccountClassification.EXPENSE)?.totalCredit ||
              0);

          // Choose revenue vs expense actual based on the line's account classification.
          const acc = line.accountId
            ? (await db
                .select({ classification: accounts.classification })
                .from(accounts)
                .where(eq(accounts.id, line.accountId))
                .limit(1))[0]
            : null;
          const actualAmount =
            acc?.classification === AccountClassification.REVENUE ? revenueActual : expenseActual;

          return {
            ...line,
            actualAmount,
            variance: line.plannedAmount - actualAmount,
            utilization:
              line.plannedAmount > 0 ? Math.round((actualAmount / line.plannedAmount) * 100) : 0,
          };
        }),
      );

      const totalPlanned = lines.reduce((s, l) => s + l.plannedAmount, 0);
      const totalActual = enrichedLines.reduce((s, l) => s + l.actualAmount, 0);

      return {
        budget: {
          id: budget.id,
          name: budget.name,
          year: budget.year,
          status: budget.status,
          currency: budget.currency,
        },
        lines: enrichedLines,
        totals: {
          planned: totalPlanned,
          actual: totalActual,
          variance: totalPlanned - totalActual,
          utilization: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
        },
      };
    }),
  );

  return Response.json({
    type: "budget-vs-actual",
    budgets: enriched,
  });
}

export const Route = createFileRoute("/api/finance/statements")({
  server: {
    handlers: {
      GET: authHandler("finance.view", GET),
    },
  },
});
