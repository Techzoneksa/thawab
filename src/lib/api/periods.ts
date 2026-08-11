import { FiscalPeriodStatus } from "@/lib/enums";

const API_BASE = "/api/finance/periods";

export const PERIOD_STATUSES = Object.values(FiscalPeriodStatus);
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export interface FiscalPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus | string;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedById: string | null;
  reopenedByName: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodFilters {
  search?: string;
  status?: string;
}

export interface CreatePeriodInput {
  name: string;
  startDate: string;
  endDate: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdatePeriodInput {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getPeriods(
  filters: PeriodFilters = {},
): Promise<{ items: FiscalPeriod[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الفترات المالية");
  return res.json();
}

export async function getPeriod(id: string): Promise<{
  item: FiscalPeriod;
  stats: { totalEntries: number; postedEntries: number; draftEntries: number };
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الفترة المالية");
  return res.json();
}

export async function createPeriod(data: CreatePeriodInput): Promise<FiscalPeriod> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الفترة المالية");
  }
  const d = await res.json();
  return d.item;
}

export async function updatePeriod(data: UpdatePeriodInput): Promise<FiscalPeriod> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الفترة المالية");
  }
  const d = await res.json();
  return d.item;
}

export async function closePeriod(options: {
  id: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FiscalPeriod> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "close" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إقفال الفترة المالية");
  }
  const d = await res.json();
  return d.item;
}

export async function reopenPeriod(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<FiscalPeriod> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "reopen" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إعادة فتح الفترة المالية");
  }
  const d = await res.json();
  return d.item;
}

export async function deletePeriod(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف الفترة المالية");
  }
}
