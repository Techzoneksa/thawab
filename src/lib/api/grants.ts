import { GrantStatus as GrantStatusEnum } from "@/lib/enums";

const API_BASE = "/api/grants";

export const GRANT_STATUSES = Object.values(GrantStatusEnum);
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export interface Grant {
  id: string;
  name: string;
  donor: string;
  amount: number;
  status: GrantStatus | string;
  startDate: string;
  endDate: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface GrantFilters {
  search?: string;
  status?: string;
}

export interface CreateGrantInput {
  name: string;
  donor: string;
  amount?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface UpdateGrantInput {
  id: string;
  name?: string;
  donor?: string;
  amount?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export async function getGrants(
  filters: GrantFilters = {},
): Promise<{ items: Grant[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب المنح");
  return res.json();
}

export async function getGrant(id: string): Promise<{ item: Grant }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المنحة");
  return res.json();
}

export async function createGrant(data: CreateGrantInput): Promise<Grant> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة المنحة");
  }
  const d = await res.json();
  return d.item;
}

export async function updateGrant(data: UpdateGrantInput): Promise<Grant> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث المنحة");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteGrant(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف المنحة");
  }
}
