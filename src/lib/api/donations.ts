const API_BASE = "/api/donations";

export interface Donation {
  id: string;
  donorId: string;
  donorName: string;
  projectId: string | null;
  projectName: string;
  campaignId: string | null;
  amount: number;
  method: string;
  channel: string;
  status: string;
  receiptId: string | null;
  notes: string;
  date: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonationFilters {
  search?: string;
  status?: string;
  method?: string;
  channel?: string;
  donorId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
}

export async function getDonations(filters: DonationFilters = {}): Promise<{
  items: Donation[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.method) params.set("method", filters.method);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.donorId) params.set("donorId", filters.donorId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب التبرعات");
  return res.json();
}

export async function getDonation(id: string): Promise<Donation> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات التبرع");
  const data = await res.json();
  return data.item;
}

export async function createDonation(data: {
  donorId: string;
  projectId?: string;
  campaignId?: string;
  amount: number;
  method: string;
  channel?: string;
  date?: string;
  notes?: string;
  status?: string;
  userId?: string;
  userName?: string;
}): Promise<Donation> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة التبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateDonation(data: {
  id: string;
  donorId?: string;
  projectId?: string;
  campaignId?: string;
  amount?: number;
  method?: string;
  channel?: string;
  date?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<Donation> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث التبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteDonation(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف التبرع");
  }
}

export async function confirmDonation(options: {
  id: string;
  amount: number;
  userId?: string;
  userName?: string;
}): Promise<Donation> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "confirm" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تأكيد التبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function cancelDonation(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Donation> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "cancel" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إلغاء التبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function issueReceipt(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<{ donation: Donation; receiptId: string }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "issueReceipt" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إصدار إيصال");
  }
  const d = await res.json();
  return { donation: d.item, receiptId: d.receiptId };
}
