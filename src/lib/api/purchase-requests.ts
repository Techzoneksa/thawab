const API_BASE = "/api/procurement/requests";

export const REQUEST_STATUSES = [
  "مسودة",
  "بانتظار الموافقة",
  "معتمد",
  "مرفوض",
  "محول إلى أمر شراء",
  "ملغي",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["عاجل", "متوسطة", "منخفضة"] as const;

export interface PurchaseRequest {
  id: string;
  subject: string;
  department: string;
  priority: string;
  status: RequestStatus | string;
  requester: string;
  amount: number;
  deliveryDate: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestFilters {
  search?: string;
  status?: string;
  department?: string;
}

export interface CreatePurchaseRequestInput {
  subject: string;
  department: string;
  priority?: string;
  requester?: string;
  amount?: number;
  deliveryDate?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdatePurchaseRequestInput {
  id: string;
  subject?: string;
  department?: string;
  priority?: string;
  requester?: string;
  amount?: number;
  deliveryDate?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getPurchaseRequests(
  filters: PurchaseRequestFilters = {},
): Promise<{ items: PurchaseRequest[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.department && filters.department !== "الكل")
    params.set("department", filters.department);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب طلبات الشراء");
  return res.json();
}

export async function getPurchaseRequest(
  id: string,
): Promise<{ item: PurchaseRequest; orderCount: number }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات طلب الشراء");
  return res.json();
}

export async function createPurchaseRequest(
  data: CreatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة طلب الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function updatePurchaseRequest(
  data: UpdatePurchaseRequestInput,
): Promise<PurchaseRequest> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث طلب الشراء");
  }
  const d = await res.json();
  return d.item;
}

async function workflowAction(
  action: string,
  options: { id: string; reason?: string; userId?: string; userName?: string },
): Promise<PurchaseRequest> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `فشل في تنفيذ الإجراء`);
  }
  const d = await res.json();
  return d.item;
}

export const submitPurchaseRequest = (o: { id: string; userId?: string; userName?: string }) =>
  workflowAction("submit", o);

export const approvePurchaseRequest = (o: { id: string; userId?: string; userName?: string }) =>
  workflowAction("approve", o);

export const rejectPurchaseRequest = (o: {
  id: string;
  reason?: string;
  userId?: string;
  userName?: string;
}) => workflowAction("reject", o);

export const returnPurchaseRequestToDraft = (o: {
  id: string;
  userId?: string;
  userName?: string;
}) => workflowAction("returnToDraft", o);

export const cancelPurchaseRequest = (o: { id: string; userId?: string; userName?: string }) =>
  workflowAction("cancel", o);

export async function deletePurchaseRequest(options: {
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
    throw new Error(err.error || "فشل في حذف طلب الشراء");
  }
}
