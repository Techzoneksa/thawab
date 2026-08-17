import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db/index";
import { accounts, journalLines, journalEntries, budgetLines, budgets } from "@/server/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { authHandler, err, type Ctx } from "@/server/db/api-utils";
import { AccountClassification, BudgetStatus } from "@/lib/enums";
import {
  trialBalance,
  incomeExpense,
  financialPosition,
  glFilter,
} from "@/server/db/statements-core";

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
    const tb = await trialBalance(db, { startDate, endDate, costCenterId, projectId });
    return Response.json({
      type: "trial-balance",
      rows: tb.rows,
      totals: {
        totalDebit: tb.totals.totalDebit,
        totalCredit: tb.totals.totalCredit,
        balanced: tb.totals.balanced,
        variance: tb.totals.difference,
      },
    });
  }
  if (type === "income-expense") {
    const ie = await incomeExpense(db, { startDate, endDate, costCenterId, projectId });
    return Response.json({ type: "income-expense", ...ie });
  }
  if (type === "financial-position") {
    const fp = await financialPosition(db, { asOf, costCenterId, projectId });
    return Response.json({ type: "financial-position", ...fp });
  }
  if (type === "budget-vs-actual") {
    return getBudgetVsActual({ budgetId, startDate, endDate });
  }

  return err("نوع التقرير غير معروف", 400, "UNKNOWN_REPORT");
}

// ============ BUDGET vs ACTUAL ============ (Actual from posted GL lines)
async function getBudgetVsActual(filters: {
  budgetId: string;
  startDate: string;
  endDate: string;
}) {
  let targetBudgets;
  if (filters.budgetId) {
    targetBudgets = await db.select().from(budgets).where(eq(budgets.id, filters.budgetId));
    if (targetBudgets.length === 0) return err("الموازنة غير موجودة", 404, "NOT_FOUND");
  } else {
    targetBudgets = await db
      .select()
      .from(budgets)
      .where(inArray(budgets.status, [BudgetStatus.APPROVED, BudgetStatus.LOCKED]));
  }

  const enriched = await Promise.all(
    targetBudgets.map(async (budget) => {
      const lines = await db.select().from(budgetLines).where(eq(budgetLines.budgetId, budget.id));
      const enrichedLines = await Promise.all(
        lines.map(async (line) => {
          const conditions = [
            ...glFilter(),
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
          const acc = line.accountId
            ? (
                await db
                  .select({ classification: accounts.classification })
                  .from(accounts)
                  .where(eq(accounts.id, line.accountId))
                  .limit(1)
              )[0]
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

  return Response.json({ type: "budget-vs-actual", budgets: enriched });
}

export const Route = createFileRoute("/api/finance/statements")({
  server: { handlers: { GET: authHandler("finance.view", GET) } },
});
