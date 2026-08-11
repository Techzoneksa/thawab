import { QuoteStatus as QuoteStatusEnum } from "@/lib/enums";

const API_BASE = "/api/procurement/quotes";

export const QUOTE_STATUSES = Object.values(QuoteStatusEnum);
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface Quote {
  id: string;
  requestId: string | null;
  supplierId: string | null;
  supplier: string;
  price: number;
  delivery: string;
  warranty: string;
  rating: number;
  winner: boolean;
  status: QuoteStatus | string;
  validUntil: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteFilters {
  search?: string;
  status?: string;
  requestId?: string;
}

export interface CreateQuoteInput {
  requestId?: string;
  supplierId?: string;
  supplier: string;
  price: number;
  delivery?: string;
  warranty?: string;
  rating?: number;
  validUntil?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateQuoteInput {
  id: string;
  supplier?: string;
  price?: number;
  delivery?: string;
  warranty?: string;
  rating?: number;
  validUntil?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getQuotes(
  filters: QuoteFilters = {},
): Promise<{ items: Quote[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.requestId) params.set("requestId", filters.requestId);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب عروض الأسعار");
  return res.json();
}

export async function getQuote(id: string): Promise<{ item: Quote }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات عرض السعر");
  return res.json();
}

export async function createQuote(data: CreateQuoteInput): Promise<Quote> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة عرض السعر");
  }
  const d = await res.json();
  return d.item;
}

export async function updateQuote(data: UpdateQuoteInput): Promise<Quote> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث عرض السعر");
  }
  const d = await res.json();
  return d.item;
}

export async function acceptQuote(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Quote> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "accept" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في قبول عرض السعر");
  }
  const d = await res.json();
  return d.item;
}

export async function rejectQuote(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Quote> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "reject" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في رفض عرض السعر");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteQuote(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف عرض السعر");
  }
}
