import { SupplierStatus as SupplierStatusEnum } from "@/lib/enums";

const API_BASE = "/api/procurement/suppliers";

export const SUPPLIER_STATUSES = Object.values(SupplierStatusEnum);
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export interface Supplier {
  id: string;
  name: string;
  activity: string;
  phone: string | null;
  email: string | null;
  taxNumber: string;
  contactPerson: string;
  address: string;
  rating: number;
  balance: number;
  notes: string;
  status: SupplierStatus | string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierFilters {
  search?: string;
  status?: string;
}

export interface CreateSupplierInput {
  name: string;
  activity?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  contactPerson?: string;
  address?: string;
  rating?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateSupplierInput {
  id: string;
  name?: string;
  activity?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  contactPerson?: string;
  address?: string;
  rating?: number;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}

export async function getSuppliers(
  filters: SupplierFilters = {},
): Promise<{ items: Supplier[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الموردين");
  return res.json();
}

export async function getSupplier(id: string): Promise<{
  item: Supplier;
  orderCount: number;
  assetCount: number;
  movementCount: number;
  hasTransactions: boolean;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المورد");
  return res.json();
}

export async function createSupplier(data: CreateSupplierInput): Promise<Supplier> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة المورد");
  }
  const d = await res.json();
  return d.item;
}

export async function updateSupplier(data: UpdateSupplierInput): Promise<Supplier> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث المورد");
  }
  const d = await res.json();
  return d.item;
}

export async function activateSupplier(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Supplier> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "activate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تفعيل المورد");
  }
  const d = await res.json();
  return d.item;
}

export async function deactivateSupplier(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Supplier> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تعطيل المورد");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteSupplier(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف المورد");
  }
}
