const API_BASE = "/api/finance/statements";

export type StatementType =
  "trial-balance" | "income-expense" | "financial-position" | "budget-vs-actual";

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  netDebit: number;
  balance: number;
  isDebit: boolean;
}

export interface IncomeExpenseRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

export interface FinancialPositionRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountLevel: number;
  parentId: string | null;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface BudgetActualLine {
  id: string;
  budgetId: string;
  lineNumber: number;
  accountId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  utilization: number;
  notes: string;
}

export interface StatementFilters {
  type: StatementType;
  startDate?: string;
  endDate?: string;
  asOf?: string;
  costCenterId?: string;
  projectId?: string;
  budgetId?: string;
}

export type StatementResult =
  | {
      type: "trial-balance";
      rows: TrialBalanceRow[];
      totals: { totalDebit: number; totalCredit: number; balanced: boolean; variance: number };
    }
  | {
      type: "income-expense";
      revenues: IncomeExpenseRow[];
      expenses: IncomeExpenseRow[];
      totals: { totalRevenue: number; totalExpense: number; surplus: number; deficit: boolean };
    }
  | {
      type: "financial-position";
      assets: FinancialPositionRow[];
      liabilities: FinancialPositionRow[];
      equity: FinancialPositionRow[];
      periodSurplus: number;
      totals: {
        totalAssets: number;
        totalLiabilities: number;
        totalEquity: number;
        totalEquityWithSurplus: number;
        totalLiabilitiesAndEquity: number;
        balanced: boolean;
      };
    }
  | {
      type: "budget-vs-actual";
      budgets: Array<{
        budget: { id: string; name: string; year: string; status: string; currency: string };
        lines: BudgetActualLine[];
        totals: {
          planned: number;
          actual: number;
          variance: number;
          utilization: number;
        };
      }>;
    };

export async function getStatement(filters: StatementFilters): Promise<StatementResult> {
  const params = new URLSearchParams();
  params.set("type", filters.type);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.asOf) params.set("asOf", filters.asOf);
  if (filters.costCenterId) params.set("costCenterId", filters.costCenterId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.budgetId) params.set("budgetId", filters.budgetId);

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في جلب القائمة المالية");
  }
  return res.json();
}

export async function getTrialBalance(filters: {
  startDate?: string;
  endDate?: string;
  costCenterId?: string;
  projectId?: string;
}) {
  return getStatement({ type: "trial-balance", ...filters });
}

export async function getIncomeExpense(filters: {
  startDate?: string;
  endDate?: string;
  costCenterId?: string;
  projectId?: string;
}) {
  return getStatement({ type: "income-expense", ...filters });
}

export async function getFinancialPosition(filters: {
  asOf?: string;
  costCenterId?: string;
  projectId?: string;
}) {
  return getStatement({ type: "financial-position", ...filters });
}

export async function getBudgetVsActual(filters: {
  budgetId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return getStatement({ type: "budget-vs-actual", ...filters });
}
