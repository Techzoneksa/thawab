/** Phase 5A — Supplier Payment Allocation & AP Aging client API. GL-derived. */

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

const ALLOC = "/api/finance/ap-allocation";
const AGING = "/api/finance/ap-aging";

export interface SupplierPaymentRow {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  paymentDate: string;
  reference: string | null;
  paymentMethod: string;
  apDebit: number;
  allocated: number;
  unapplied: number;
}
export async function listSupplierPaymentsForAlloc(
  opts: {
    supplierId?: string;
    search?: string;
    onlyUnapplied?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  items: SupplierPaymentRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const p = new URLSearchParams();
  if (opts.supplierId) p.set("supplierId", opts.supplierId);
  if (opts.search) p.set("search", opts.search);
  if (opts.onlyUnapplied) p.set("onlyUnapplied", "1");
  p.set("page", String(opts.page ?? 1));
  p.set("pageSize", String(opts.pageSize ?? 25));
  return j(await fetch(`${ALLOC}?${p.toString()}`), "تعذّر جلب دفعات الموردين");
}

export async function paymentSettlement(paymentId: string): Promise<any> {
  return j(
    await fetch(`${ALLOC}?payment=${encodeURIComponent(paymentId)}`),
    "تعذّر جلب تسوية الدفعة",
  );
}
export async function invoiceSettlement(invoiceId: string): Promise<any> {
  return j(
    await fetch(`${ALLOC}?invoice=${encodeURIComponent(invoiceId)}`),
    "تعذّر جلب تسوية الفاتورة",
  );
}
export interface SupplierInvoiceSettlementRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  originalPayable: number;
  allocated: number;
  outstanding: number;
  bucket: string;
}
export async function listSupplierInvoicesForStatement(opts: {
  supplierId: string;
  asOfDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ asOf: string; items: SupplierInvoiceSettlementRow[]; total: number }> {
  const p = new URLSearchParams({ invoices: opts.supplierId });
  if (opts.asOfDate) p.set("asOfDate", opts.asOfDate);
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  return j(await fetch(`${ALLOC}?${p.toString()}`), "تعذّر جلب فواتير المورد");
}
export async function allocationCandidates(
  paymentId: string,
  q?: string,
): Promise<{ items: any[] }> {
  const p = new URLSearchParams({ candidates: paymentId });
  if (q) p.set("q", q);
  return j(await fetch(`${ALLOC}?${p.toString()}`), "تعذّر جلب الفواتير القابلة للتخصيص");
}
export async function allocate(paymentId: string, invoiceId: string, amount: number): Promise<any> {
  return j(
    await post(ALLOC, { action: "allocate", paymentId, invoiceId, amount }),
    "تعذّر التخصيص",
  );
}
export async function unallocate(paymentId: string, invoiceId: string): Promise<any> {
  return j(
    await post(ALLOC, { action: "unallocate", paymentId, invoiceId }),
    "تعذّر إلغاء التخصيص",
  );
}

export async function apAging(opts: { asOfDate?: string; supplierId?: string } = {}): Promise<any> {
  const p = new URLSearchParams();
  if (opts.asOfDate) p.set("asOfDate", opts.asOfDate);
  if (opts.supplierId) p.set("supplierId", opts.supplierId);
  const qs = p.toString();
  return j(await fetch(`${AGING}${qs ? `?${qs}` : ""}`), "تعذّر جلب أعمار الذمم");
}
export async function apAgingBySupplier(
  opts: { asOfDate?: string; limit?: number; offset?: number } = {},
): Promise<{
  asOf: string;
  items: any[];
}> {
  const p = new URLSearchParams({ view: "by-supplier" });
  if (opts.asOfDate) p.set("asOfDate", opts.asOfDate);
  p.set("limit", String(opts.limit ?? 50));
  if (opts.offset) p.set("offset", String(opts.offset));
  return j(await fetch(`${AGING}?${p.toString()}`), "تعذّر جلب أعمار الذمم حسب المورد");
}
