/** Phase 3B — Supplier Invoice (فاتورة مورد) client API. Balances stay GL-derived. */

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  supplierId: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  externalReference: string | null;
  description: string | null;
  notes: string | null;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  postedBy?: string | null;
  postedAt?: string | null;
  reversedBy?: string | null;
  reversedAt?: string | null;
}

export interface SupplierInvoiceLine {
  id: string;
  supplierInvoiceId: string;
  lineNumber: number;
  description: string | null;
  accountingMode: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
}

export interface MatchableGrnLine {
  goodsReceiptId: string;
  grnNumber: string;
  goodsReceiptLineId: string;
  purchaseOrderId: string;
  poNumber: string | null;
  receiptDate: string;
  lineType: string;
  description: string;
  itemId: string | null;
  unitPrice: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  remainingQuantity: number;
  remainingGrniValue: number;
}

export interface InvoiceAllocation {
  id: string;
  supplierInvoiceLineId: string;
  goodsReceiptId: string;
  goodsReceiptLineId: string;
  purchaseOrderId: string | null;
  matchedQuantity: number;
  grnNumber: string | null;
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

export interface SupplierInvoiceDetail {
  item: SupplierInvoice;
  lines: SupplierInvoiceLine[];
  history: WorkflowEvent[];
  journal: { id: string; number: string; status: string; date: string } | null;
  supplier: { id: string; name: string; supplierCode: string | null; currency: string } | null;
  allocations?: InvoiceAllocation[];
}

export type SupplierInvoiceAction = "submit" | "approve" | "return" | "reject" | "post" | "reverse";

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

export interface SupplierInvoiceFilters {
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listSupplierInvoices(filters: SupplierInvoiceFilters = {}): Promise<{
  items: SupplierInvoice[];
  summary: any;
  total?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
}> {
  const q = new URLSearchParams();
  // Server hard-caps page size at 200; request the max so a filtered view is
  // never silently clipped to the default 25. (Full pager UI is a Round-2 item.)
  const withPage = { pageSize: 200, ...filters };
  for (const [k, v] of Object.entries(withPage)) if (v != null && v !== "") q.set(k, String(v));
  const qs = q.toString();
  return j(
    await fetch(`/api/finance/supplier-invoices${qs ? `?${qs}` : ""}`),
    "تعذّر جلب فواتير الموردين",
  );
}

export async function getSupplierInvoice(id: string): Promise<SupplierInvoiceDetail> {
  return j(await fetch(`/api/finance/supplier-invoices?id=${id}`), "تعذّر جلب فاتورة المورد");
}

/** Posted governed GRN lines for a supplier with remaining invoiceable quantity.
 *  Bounded + server-searchable: `q` matches GRN number / PO number / receipt date
 *  / line description so any still-invoiceable line is reachable (not just recent). */
export async function getMatchableGrnLines(
  supplierId: string,
  q?: string,
): Promise<{ lines: MatchableGrnLine[] }> {
  const p = new URLSearchParams({ matchable: supplierId });
  if (q) p.set("q", q);
  return j(
    await fetch(`/api/finance/supplier-invoices?${p.toString()}`),
    "تعذّر جلب الاستلامات القابلة للمطابقة",
  );
}

export async function createSupplierInvoice(body: any): Promise<SupplierInvoice> {
  return (await j(await post("/api/finance/supplier-invoices", body), "تعذّر إنشاء فاتورة المورد"))
    .item;
}

export async function updateSupplierInvoice(body: any): Promise<SupplierInvoice> {
  return (await j(await put("/api/finance/supplier-invoices", body), "تعذّر تعديل فاتورة المورد"))
    .item;
}

export async function supplierInvoiceAction(
  id: string,
  action: SupplierInvoiceAction,
  reason?: string,
): Promise<{ item: SupplierInvoice; reversalId?: string }> {
  return j(
    await post("/api/finance/supplier-invoices", { id, action, reason }),
    "تعذّر تنفيذ الإجراء",
  );
}
