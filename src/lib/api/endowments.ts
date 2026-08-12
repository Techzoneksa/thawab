import {
  EndowmentType as EndowmentTypeEnum,
  EndowmentStatus as EndowmentStatusEnum,
} from "@/lib/enums";

const API_BASE = "/api/endowments";

export const ENDOWMENT_TYPES = Object.values(EndowmentTypeEnum);
export const ENDOWMENT_STATUSES = Object.values(EndowmentStatusEnum);
export type EndowmentType = (typeof ENDOWMENT_TYPES)[number];
export type EndowmentStatus = (typeof ENDOWMENT_STATUSES)[number];

export interface Endowment {
  id: string;
  name: string;
  type: EndowmentType | string;
  value: number;
  returns: number;
  status: EndowmentStatus | string;
  notes: string;
  createdAt: string;
}

export interface EndowmentFilters {
  search?: string;
  type?: string;
  status?: string;
}

export interface CreateEndowmentInput {
  name: string;
  type?: string;
  value?: number;
  returns?: number;
  status?: string;
  notes?: string;
}

export interface UpdateEndowmentInput {
  id: string;
  name?: string;
  type?: string;
  value?: number;
  returns?: number;
  status?: string;
  notes?: string;
}

export async function getEndowments(
  filters: EndowmentFilters = {},
): Promise<{ items: Endowment[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الأوقاف");
  return res.json();
}

export async function getEndowment(id: string): Promise<{ item: Endowment }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الوقف");
  return res.json();
}

export async function createEndowment(data: CreateEndowmentInput): Promise<Endowment> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الوقف");
  }
  const d = await res.json();
  return d.item;
}

export async function updateEndowment(data: UpdateEndowmentInput): Promise<Endowment> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الوقف");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteEndowment(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الوقف");
  }
}
