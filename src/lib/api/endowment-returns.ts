import { EndowmentReturnStatus as StatusEnum } from "@/lib/enums";

const API_BASE = "/api/endowment-returns";

export const ENDOWMENT_RETURN_STATUSES = Object.values(StatusEnum);
export type EndowmentReturnStatus = (typeof ENDOWMENT_RETURN_STATUSES)[number];

export interface EndowmentReturn {
  id: string;
  endowmentId: string | null;
  endowmentName: string;
  period: string;
  amount: number;
  date: string;
  status: EndowmentReturnStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EndowmentReturnFilters {
  search?: string;
  status?: string;
  endowmentId?: string;
}

export interface CreateEndowmentReturnInput {
  endowmentId?: string;
  endowmentName?: string;
  period: string;
  amount: number;
  date?: string;
  status?: EndowmentReturnStatus;
  notes?: string;
}

export type UpdateEndowmentReturnInput = Partial<CreateEndowmentReturnInput> & { id: string };

export async function getEndowmentReturns(
  filters: EndowmentReturnFilters = {},
): Promise<{ items: EndowmentReturn[]; total: number; realizedTotal: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.endowmentId) params.set("endowmentId", filters.endowmentId);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب عوائد الأوقاف");
  return res.json();
}

export async function getEndowmentReturn(id: string): Promise<{ item: EndowmentReturn }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات عائد الوقف");
  return res.json();
}

export async function createEndowmentReturn(
  data: CreateEndowmentReturnInput,
): Promise<EndowmentReturn> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إضافة عائد الوقف");
  }
  return (await res.json()).item;
}

export async function updateEndowmentReturn(
  data: UpdateEndowmentReturnInput,
): Promise<EndowmentReturn> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث عائد الوقف");
  }
  return (await res.json()).item;
}

export async function deleteEndowmentReturn(options: { id: string }): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${options.id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف عائد الوقف");
  }
}
