const API_BASE = "/api/finance/cost-centers";

export const COST_CENTER_STATUSES = ["نشط", "موقوف", "مغلق"] as const;
export type CostCenterStatus = (typeof COST_CENTER_STATUSES)[number];

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  manager: string;
  budget: number;
  spent: number;
  status: CostCenterStatus | string;
  description: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CostCenterFilters {
  search?: string;
  status?: string;
}

export interface CreateCostCenterInput {
  code: string;
  name: string;
  manager?: string;
  budget?: number;
  spent?: number;
  status?: CostCenterStatus;
  description?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateCostCenterInput {
  id: string;
  name?: string;
  manager?: string;
  budget?: number;
  spent?: number;
  status?: CostCenterStatus;
  description?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getCostCenters(filters: CostCenterFilters = {}): Promise<{
  items: CostCenter[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب مراكز التكلفة");
  return res.json();
}

export async function getCostCenter(id: string): Promise<{
  item: CostCenter;
  journalUsage: number;
  budgetUsage: number;
  hasUsage: boolean;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات مركز التكلفة");
  return res.json();
}

export async function createCostCenter(data: CreateCostCenterInput): Promise<CostCenter> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة مركز التكلفة");
  }
  const d = await res.json();
  return d.item;
}

export async function updateCostCenter(data: UpdateCostCenterInput): Promise<CostCenter> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث مركز التكلفة");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteCostCenter(options: {
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
    throw new Error(err.error || "فشل في حذف مركز التكلفة");
  }
}

export async function deactivateCostCenter(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<CostCenter> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إيقاف مركز التكلفة");
  }
  const d = await res.json();
  return d.item;
}

export async function activateCostCenter(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<CostCenter> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "activate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تفعيل مركز التكلفة");
  }
  const d = await res.json();
  return d.item;
}
