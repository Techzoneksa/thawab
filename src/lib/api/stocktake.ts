const API_BASE = "/api/inventory/stocktake";

export const STOCKTAKE_STATUSES = ["مسودة", "بانتظار الاعتماد", "معتمد", "مغلق"] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export interface Stocktake {
  id: string;
  name: string;
  warehouseId: string | null;
  date: string;
  status: StocktakeStatus | string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StocktakeLine {
  id: string;
  stocktakeId: string;
  itemId: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  notes: string;
  createdAt: string;
}

export interface StocktakeFilters {
  status?: string;
}

export interface CreateStocktakeLineInput {
  itemId: string;
  countedQuantity: number;
  notes?: string;
}

export interface CreateStocktakeInput {
  name: string;
  warehouseId?: string;
  date: string;
  notes?: string;
  lines: CreateStocktakeLineInput[];
  userId?: string;
  userName?: string;
}

export interface UpdateStocktakeInput {
  id: string;
  name?: string;
  warehouseId?: string;
  date?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getStocktakes(
  filters: StocktakeFilters = {},
): Promise<{ items: Stocktake[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب عمليات الجرد");
  return res.json();
}

export async function getStocktake(
  id: string,
): Promise<{ item: Stocktake; lines: StocktakeLine[] }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الجرد");
  return res.json();
}

export async function createStocktake(data: CreateStocktakeInput): Promise<Stocktake> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة الجرد");
  }
  const d = await res.json();
  return d.item;
}

export async function updateStocktake(data: UpdateStocktakeInput): Promise<Stocktake> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث الجرد");
  }
  const d = await res.json();
  return d.item;
}

export async function submitStocktake(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Stocktake> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "submit" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إرسال الجرد للاعتماد");
  }
  const d = await res.json();
  return d.item;
}

export async function approveStocktake(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Stocktake> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "approve" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في اعتماد الجرد");
  }
  const d = await res.json();
  return d.item;
}

export async function closeStocktake(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Stocktake> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "close" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إغلاق الجرد");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteStocktake(options: {
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
    throw new Error(err.error || "فشل في حذف الجرد");
  }
}
