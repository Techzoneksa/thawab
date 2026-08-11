const API_BASE = "/api/receipts";

export interface Receipt {
  id: string;
  donationId: string | null;
  donorName: string;
  number: string;
  amount: number;
  date: string;
  type: string;
  status: string;
  printed: boolean;
  createdBy: string | null;
  createdAt: string;
  donationAmount: number;
  projectName: string;
  donationStatus: string;
}

export interface ReceiptFilters {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export async function getReceipts(filters: ReceiptFilters = {}): Promise<{
  items: Receipt[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الإيصالات");
  return res.json();
}

export async function getReceipt(id: string): Promise<Receipt> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الإيصال");
  const data = await res.json();
  return data.item;
}

export async function printReceipt(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<void> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "print" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في طباعة الإيصال");
  }
}

export async function voidReceipt(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Receipt> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "void" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إلغاء الإيصال");
  }
  const d = await res.json();
  return d.item;
}

export async function updateReceipt(data: {
  id: string;
  status?: string;
  userId?: string;
  userName?: string;
}): Promise<Receipt> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الإيصال");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteReceipt(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف الإيصال");
  }
}
