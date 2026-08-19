import { PurchaseOrderStatus } from "@/lib/enums";

const API_BASE = "/api/procurement/orders";

export const ORDER_STATUSES = Object.values(PurchaseOrderStatus);
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface PurchaseOrder {
  id: string;
  supplierId: string | null;
  requestId: string | null;
  subject: string;
  date: string;
  deliveryDate: string;
  status: OrderStatus | string;
  total: number;
  receivedAmount: number;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  orderId: string;
  lineNumber: number;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
  unit: string;
  notes: string;
  createdAt: string;
}

export interface PurchaseOrderFilters {
  search?: string;
  status?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreatePurchaseOrderLineInput {
  itemId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId?: string;
  requestId?: string;
  subject: string;
  date?: string;
  deliveryDate?: string;
  notes?: string;
  lines: CreatePurchaseOrderLineInput[];
  userId?: string;
  userName?: string;
}

export interface UpdatePurchaseOrderInput {
  id: string;
  subject?: string;
  date?: string;
  deliveryDate?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface ReceiptLineInput {
  lineId: string;
  receivedQty: number;
}

export async function getPurchaseOrders(
  filters: PurchaseOrderFilters = {},
): Promise<{
  items: PurchaseOrder[];
  total: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
  summary?: any;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  // Server hard-caps at 200; request the max so the list isn't clipped to 25.
  params.set("pageSize", String(filters.pageSize ?? 200));
  if (filters.page) params.set("page", String(filters.page));
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب أوامر الشراء");
  return res.json();
}

export async function getPurchaseOrder(
  id: string,
): Promise<{ item: PurchaseOrder; lines: PurchaseOrderLine[] }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات أمر الشراء");
  return res.json();
}

export async function createPurchaseOrder(data: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function updatePurchaseOrder(data: UpdatePurchaseOrderInput): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function approvePurchaseOrder(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "approve" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في اعتماد أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function cancelPurchaseOrder(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "cancel" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إلغاء أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function receivePurchaseOrder(options: {
  id: string;
  receipts: ReceiptLineInput[];
  userId?: string;
  userName?: string;
}): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "receive" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في استلام أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function closePurchaseOrder(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<PurchaseOrder> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "close" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إغلاق أمر الشراء");
  }
  const d = await res.json();
  return d.item;
}

export async function deletePurchaseOrder(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف أمر الشراء");
  }
}
