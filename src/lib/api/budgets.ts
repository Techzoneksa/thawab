const API_BASE = "/api/finance/budgets";

export const BUDGET_STATUSES = ["مسودة", "معتمد", "مقفل", "ملغى"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export interface BudgetLine {
  id: string;
  budgetId: string;
  lineNumber: number;
  accountId: string | null;
  accountCode?: string;
  accountName?: string;
  costCenterId: string | null;
  costCenterName?: string;
  projectId: string | null;
  projectName?: string;
  plannedAmount: number;
  actualAmount: number;
  variance?: number;
  utilization?: number;
  notes: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  name: string;
  year: string;
  amount: number;
  spent: number;
  department: string;
  status: BudgetStatus | string;
  currency: string;
  description: string;
  notes: string;
  approvedBy: string | null;
  approvedAt: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetFilters {
  search?: string;
  status?: string;
  year?: string;
}

export interface CreateBudgetInput {
  name: string;
  year: string;
  amount?: number;
  department?: string;
  status?: BudgetStatus;
  currency?: string;
  description?: string;
  notes?: string;
  lines?: Array<{
    accountId?: string | null;
    costCenterId?: string | null;
    projectId?: string | null;
    plannedAmount?: number;
    notes?: string;
  }>;
  userId?: string;
  userName?: string;
}

export interface UpdateBudgetInput {
  id: string;
  name?: string;
  year?: string;
  amount?: number;
  department?: string;
  description?: string;
  notes?: string;
  lines?: Array<{
    accountId?: string | null;
    costCenterId?: string | null;
    projectId?: string | null;
    plannedAmount?: number;
    notes?: string;
  }>;
  userId?: string;
  userName?: string;
}

export async function getBudgets(filters: BudgetFilters = {}): Promise<{
  items: Budget[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.year && filters.year !== "الكل") params.set("year", filters.year);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الموازنات");
  return res.json();
}

export async function getBudget(id: string): Promise<{
  item: Budget;
  lines: BudgetLine[];
  totals: { planned: number; actual: number; variance: number; utilization: number };
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الموازنة");
  return res.json();
}

export async function createBudget(data: CreateBudgetInput): Promise<Budget> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة الموازنة");
  }
  const d = await res.json();
  return d.item;
}

export async function updateBudget(data: UpdateBudgetInput): Promise<Budget> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث الموازنة");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteBudget(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<void> {
  const params = new URLSearchParams({ id: options.id });
  if (options.userId) params.set("userId", options.userId);
  if (options.userName) params.set("userName", options.userName);
  const res = await fetch(`${API_BASE}?${params.toString()}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في حذف الموازنة");
  }
}

export async function approveBudget(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Budget> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "approve" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في اعتماد الموازنة");
  }
  const d = await res.json();
  return d.item;
}

export async function lockBudget(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Budget> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "lock" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في قفل الموازنة");
  }
  const d = await res.json();
  return d.item;
}

export async function unlockBudget(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Budget> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "unlock" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في فتح قفل الموازنة");
  }
  const d = await res.json();
  return d.item;
}
