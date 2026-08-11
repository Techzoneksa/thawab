const API_BASE = "/api/aid";

export interface AidRecord {
  id: string;
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryStatus: string;
  projectId: string | null;
  projectName: string;
  type: string;
  amount: number;
  status: string;
  date: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  deliveredBy: string | null;
  deliveryMethod: string;
  deliveryNotes: string;
}

export interface AidFilters {
  search?: string;
  status?: string;
  type?: string;
  beneficiaryId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
}

export async function getAidRecords(filters: AidFilters = {}): Promise<{
  items: AidRecord[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.beneficiaryId) params.set("beneficiaryId", filters.beneficiaryId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب سجلات المساعدة");
  return res.json();
}

export async function getAidRecord(id: string): Promise<AidRecord> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المساعدة");
  const data = await res.json();
  return data.item;
}

export async function createAidRecord(data: {
  beneficiaryId: string;
  projectId?: string;
  type: string;
  amount?: number;
  date?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة المساعدة");
  }
  const d = await res.json();
  return d.item;
}

export async function updateAidRecord(data: {
  id: string;
  beneficiaryId?: string;
  projectId?: string;
  type?: string;
  amount?: number;
  date?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث المساعدة");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteAidRecord(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف المساعدة");
  }
}

export async function approveAidRecord(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "approve" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في اعتماد المساعدة");
  }
  const d = await res.json();
  return d.item;
}

export async function rejectAidRecord(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "reject" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في رفض المساعدة");
  }
  const d = await res.json();
  return d.item;
}

export async function deliverAidRecord(options: {
  id: string;
  userId?: string;
  userName?: string;
  deliveryMethod?: string;
  deliveryNotes?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deliver" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تسليم المساعدة");
  }
  const d = await res.json();
  return d.item;
}

export async function returnAidRecord(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<AidRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "return" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إرجاع المساعدة");
  }
  const d = await res.json();
  return d.item;
}
