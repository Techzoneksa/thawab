import { RecurringFrequency as FreqEnum, RecurringStatus as StatusEnum } from "@/lib/enums";

const API_BASE = "/api/recurring";

export const RECURRING_FREQUENCIES = Object.values(FreqEnum);
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export const RECURRING_STATUSES = Object.values(StatusEnum);
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

export interface RecurringDonation {
  id: string;
  code: string;
  donorName: string;
  donorId: string | null;
  amount: number;
  frequency: RecurringFrequency | string;
  projectId: string | null;
  projectName: string;
  nextRunDate: string;
  startDate: string;
  status: RecurringStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringFilters {
  search?: string;
  status?: string;
  frequency?: string;
}

export interface CreateRecurringInput {
  donorName: string;
  amount: number;
  frequency?: RecurringFrequency;
  projectId?: string;
  projectName?: string;
  nextRunDate?: string;
  startDate?: string;
  status?: RecurringStatus;
  notes?: string;
}

export type UpdateRecurringInput = Partial<CreateRecurringInput> & { id: string };

export async function getRecurring(
  filters: RecurringFilters = {},
): Promise<{ items: RecurringDonation[]; total: number; activeMonthly: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.frequency) params.set("frequency", filters.frequency);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب التبرعات المتكررة");
  return res.json();
}

export async function getRecurringOne(id: string): Promise<{ item: RecurringDonation }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات التبرع المتكرر");
  return res.json();
}

export async function createRecurring(data: CreateRecurringInput): Promise<RecurringDonation> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إضافة التبرع المتكرر");
  }
  return (await res.json()).item;
}

export async function updateRecurring(data: UpdateRecurringInput): Promise<RecurringDonation> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث التبرع المتكرر");
  }
  return (await res.json()).item;
}

export async function setRecurringStatus(options: {
  id: string;
  action: "activate" | "pause";
}): Promise<RecurringDonation> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تغيير حالة التبرع المتكرر");
  }
  return (await res.json()).item;
}

export async function deleteRecurring(options: { id: string }): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${options.id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف التبرع المتكرر");
  }
}
