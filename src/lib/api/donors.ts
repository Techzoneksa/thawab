const API_BASE = "/api/donors";

export interface Donor {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  city: string;
  address: string;
  tag: string;
  totalDonations: number;
  donationCount: number;
  lastDonation: string | null;
  recurring: boolean;
  notes: string;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonorFilters {
  search?: string;
  type?: string;
  tag?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export async function getDonors(filters: DonorFilters = {}): Promise<{
  items: Donor[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type && filters.type !== "الكل") params.set("type", filters.type);
  if (filters.tag && filters.tag !== "الكل") params.set("tag", filters.tag);
  if (filters.city && filters.city !== "الكل") params.set("city", filters.city);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب المتبرعين");
  return res.json();
}

export async function getDonor(id: string): Promise<Donor> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المتبرع");
  const data = await res.json();
  return data.item;
}

export async function createDonor(data: Partial<Donor>): Promise<Donor> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة المتبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateDonor(data: Partial<Donor> & { id: string }): Promise<Donor> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث المتبرع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteDonor(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<void> {
  const params = new URLSearchParams({ id: options.id });
  if (options.userId) params.set("userId", options.userId);
  if (options.userName) params.set("userName", options.userName);
  const res = await fetch(`${API_BASE}?${params.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error("فشل في حذف المتبرع");
}
