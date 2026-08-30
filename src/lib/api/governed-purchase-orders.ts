/** Phase 3C — governed Purchase Order (أمر شراء) client API. A PO has NO accounting effect. */

export interface PurchaseOrder {
  id: string;
  poNumber: string | null;
  governanceMode: string;
  supplierId: string | null;
  subject: string;
  date: string;
  deliveryDate: string | null;
  status: string;
  currency: string;
  supplierReference: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  issuedBy?: string | null;
  issuedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  orderId: string;
  lineNumber: number;
  description: string;
  itemId: string | null;
  accountId: string | null;
  lineType: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  lineSubtotal: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
}

export interface WorkflowEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  userName: string;
  reason: string;
  createdAt: string;
}

export interface PurchaseOrderDetail {
  item: PurchaseOrder;
  lines: PurchaseOrderLine[];
  history: WorkflowEvent[];
  supplier: {
    id: string;
    name: string;
    supplierCode: string | null;
    taxNumber: string | null;
    address: string | null;
    currency: string;
  } | null;
}

export type PurchaseOrderAction = "submit" | "approve" | "return" | "reject" | "issue" | "cancel";

async function j(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}
function post(url: string, body: any) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function put(url: string, body: any) {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface PurchaseOrderFilters {
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listPurchaseOrders(filters: PurchaseOrderFilters = {}): Promise<{
  items: PurchaseOrder[];
  summary: any;
  total?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
}> {
  const q = new URLSearchParams();
  const withPage = { pageSize: 200, ...filters };
  for (const [k, v] of Object.entries(withPage)) if (v != null && v !== "") q.set(k, String(v));
  const qs = q.toString();
  return j(
    await fetch(`/api/procurement/purchase-orders${qs ? `?${qs}` : ""}`),
    "تعذّر جلب أوامر الشراء",
  );
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail> {
  return j(await fetch(`/api/procurement/purchase-orders?id=${id}`), "تعذّر جلب أمر الشراء");
}

export interface PurchaseOrderLookupItem {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierCode: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  totalAmount: number;
  currency: string;
  status: string;
}
/** Bounded, server-searchable governed ISSUED-PO lookup for the GRN form. */
export async function purchaseOrderLookup(
  q: string,
  limit = 20,
): Promise<{ items: PurchaseOrderLookupItem[] }> {
  const p = new URLSearchParams({ lookup: "1", limit: String(limit) });
  if (q) p.set("q", q);
  return j(
    await fetch(`/api/procurement/purchase-orders?${p.toString()}`),
    "تعذّر البحث عن أوامر الشراء",
  );
}

export async function createPurchaseOrder(body: any): Promise<PurchaseOrder> {
  return (await j(await post("/api/procurement/purchase-orders", body), "تعذّر إنشاء أمر الشراء"))
    .item;
}

export async function updatePurchaseOrder(body: any): Promise<PurchaseOrder> {
  return (await j(await put("/api/procurement/purchase-orders", body), "تعذّر تعديل أمر الشراء"))
    .item;
}

export async function purchaseOrderAction(
  id: string,
  action: PurchaseOrderAction,
  reason?: string,
): Promise<{ item: PurchaseOrder }> {
  return j(
    await post("/api/procurement/purchase-orders", { id, action, reason }),
    "تعذّر تنفيذ الإجراء",
  );
}
