const API_BASE = "/api/inventory/items";

export const ITEM_STATUSES = ["نشط", "موقوف", "مغلق"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const MOVEMENT_TYPES = ["استلام", "صرف", "تحويل", "تسوية", "جرد"] as const;

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  warehouseId: string | null;
  quantity: number;
  minQuantity: number;
  price: number;
  status: ItemStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemFilters {
  search?: string;
  status?: string;
  category?: string;
  warehouseId?: string;
}

export interface CreateInventoryItemInput {
  name: string;
  sku?: string;
  unit: string;
  category?: string;
  warehouseId?: string;
  quantity?: number;
  minQuantity?: number;
  price?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateInventoryItemInput {
  id: string;
  name?: string;
  sku?: string;
  unit?: string;
  category?: string;
  warehouseId?: string;
  minQuantity?: number;
  price?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export async function getInventoryItems(
  filters: InventoryItemFilters = {},
): Promise<{ items: InventoryItem[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.category && filters.category !== "الكل") params.set("category", filters.category);
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الأصناف");
  return res.json();
}

export async function getInventoryItem(id: string): Promise<{
  item: InventoryItem;
  movementCount: number;
  poLineCount: number;
  hasMovements: boolean;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الصنف");
  return res.json();
}

export async function createInventoryItem(data: CreateInventoryItemInput): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function updateInventoryItem(data: UpdateInventoryItemInput): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function activateInventoryItem(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "activate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تفعيل الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function deactivateInventoryItem(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تعطيل الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function receiveInventoryItem(options: {
  id: string;
  quantity: number;
  warehouseId?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "receive" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في استلام الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function issueInventoryItem(options: {
  id: string;
  quantity: number;
  warehouseId?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "issue" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في صرف الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function adjustInventoryItem(options: {
  id: string;
  quantity: number;
  warehouseId?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "adjust" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تسوية الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function transferInventoryItem(options: {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<InventoryItem> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "transfer" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحويل الصنف");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteInventoryItem(options: {
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
    throw new Error(err.error || "فشل في حذف الصنف");
  }
}
