import { WarehouseStatus as WarehouseStatusEnum } from "@/lib/enums";

const API_BASE = "/api/inventory/warehouses";

export const WAREHOUSE_STATUSES = Object.values(WarehouseStatusEnum);
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number];

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  manager: string;
  capacity: number;
  occupancy: number;
  status: WarehouseStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseFilters {
  search?: string;
  status?: string;
}

export interface CreateWarehouseInput {
  name: string;
  location?: string;
  manager?: string;
  capacity?: number;
  occupancy?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateWarehouseInput {
  id: string;
  name?: string;
  location?: string;
  manager?: string;
  capacity?: number;
  occupancy?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export async function getWarehouses(
  filters: WarehouseFilters = {},
): Promise<{ items: Warehouse[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب المستودعات");
  return res.json();
}

export async function getWarehouse(id: string): Promise<{
  item: Warehouse;
  itemCount: number;
  movementCount: number;
  totalQty: number;
  hasMovements: boolean;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المستودع");
  return res.json();
}

export async function createWarehouse(data: CreateWarehouseInput): Promise<Warehouse> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة المستودع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateWarehouse(data: UpdateWarehouseInput): Promise<Warehouse> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث المستودع");
  }
  const d = await res.json();
  return d.item;
}

export async function activateWarehouse(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Warehouse> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "activate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تفعيل المستودع");
  }
  const d = await res.json();
  return d.item;
}

export async function deactivateWarehouse(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Warehouse> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تعطيل المستودع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteWarehouse(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف المستودع");
  }
}
