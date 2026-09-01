/** Phase Sales-1 — Sales Invoice (فاتورة مبيعات) client API. Balances stay GL-derived. */

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  fund: string;
  projectId: string | null;
  customerReference: string | null;
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

export interface SalesInvoiceLine {
  id: string;
  salesInvoiceId: string;
  lineNumber: number;
  description: string | null;
  accountId: string;
  quantity: number;
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

export interface SalesInvoiceDetail {
  item: SalesInvoice;
  lines: SalesInvoiceLine[];
  history: WorkflowEvent[];
  journal: { id: string; number: string; status: string; date: string } | null;
  customer: { id: string; name: string; customerCode: string | null; currency: string } | null;
}

export type SalesInvoiceAction = "submit" | "approve" | "return" | "reject" | "post" | "reverse";

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

export interface SalesInvoiceFilters {
  status?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listSalesInvoices(filters: SalesInvoiceFilters = {}): Promise<{
  items: SalesInvoice[];
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
    await fetch(`/api/finance/sales-invoices${qs ? `?${qs}` : ""}`),
    "تعذّر جلب فواتير المبيعات",
  );
}

export async function getSalesInvoice(id: string): Promise<SalesInvoiceDetail> {
  return j(await fetch(`/api/finance/sales-invoices?id=${id}`), "تعذّر جلب فاتورة المبيعات");
}

export async function createSalesInvoice(body: any): Promise<SalesInvoice> {
  return (await j(await post("/api/finance/sales-invoices", body), "تعذّر إنشاء فاتورة المبيعات"))
    .item;
}

export async function updateSalesInvoice(body: any): Promise<SalesInvoice> {
  return (await j(await put("/api/finance/sales-invoices", body), "تعذّر تعديل فاتورة المبيعات"))
    .item;
}

export async function salesInvoiceAction(
  id: string,
  action: SalesInvoiceAction,
  reason?: string,
): Promise<{ item: SalesInvoice; reversalId?: string }> {
  return j(
    await post("/api/finance/sales-invoices", { id, action, reason }),
    "تعذّر تنفيذ الإجراء",
  );
}

// ---- AR aging ----
export interface ArAgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
}
export interface ArAgingSummary {
  asOfDate: string;
  total: number;
  count: number;
  buckets: ArAgingBuckets;
}
export interface ArAgingCustomerRow {
  customerId: string;
  customerName: string;
  customerCode: string | null;
  total: number;
  count: number;
  buckets: ArAgingBuckets;
}

export async function getArAging(opts: { asOfDate?: string; customerId?: string } = {}): Promise<{
  summary: ArAgingSummary;
  reconciliation: {
    agingOutstanding: number;
    arGl: number;
    subledgerTotal: number;
    unallocatedNet: number;
    difference: number;
  };
}> {
  const p = new URLSearchParams();
  if (opts.asOfDate) p.set("asOfDate", opts.asOfDate);
  if (opts.customerId) p.set("customerId", opts.customerId);
  const qs = p.toString();
  return j(await fetch(`/api/finance/ar-aging${qs ? `?${qs}` : ""}`), "تعذّر جلب أعمار الذمم");
}

export async function getArAgingByCustomer(
  opts: { asOfDate?: string; limit?: number; offset?: number } = {},
): Promise<{ asOfDate: string; items: ArAgingCustomerRow[] }> {
  const p = new URLSearchParams({ view: "by-customer" });
  if (opts.asOfDate) p.set("asOfDate", opts.asOfDate);
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  return j(await fetch(`/api/finance/ar-aging?${p.toString()}`), "تعذّر جلب أعمار الذمم");
}
