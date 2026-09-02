/** Phase Sales-2 — Customer Receipt & AR settlement allocation client API. GL-derived. */

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

const RC = "/api/finance/customer-receipts";

export interface CustomerReceiptRow {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  receiptDate: string;
  reference: string | null;
  receiptMethod: string;
  arCredit: number;
  allocated: number;
  unapplied: number;
}

export async function createCustomerReceipt(body: {
  customerId: string;
  amount: number;
  method?: "cash" | "bank";
  reference?: string | null;
  date?: string | null;
  note?: string | null;
}): Promise<{ receipt: any; entryId: string; reused: boolean }> {
  return j(await post(RC, { action: "create", ...body }), "تعذّر تسجيل التحصيل");
}

export async function listCustomerReceipts(
  opts: {
    customerId?: string;
    search?: string;
    onlyUnapplied?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  items: CustomerReceiptRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const p = new URLSearchParams();
  if (opts.customerId) p.set("customerId", opts.customerId);
  if (opts.search) p.set("search", opts.search);
  if (opts.onlyUnapplied) p.set("onlyUnapplied", "1");
  p.set("page", String(opts.page ?? 1));
  p.set("pageSize", String(opts.pageSize ?? 25));
  return j(await fetch(`${RC}?${p.toString()}`), "تعذّر جلب سندات القبض");
}

export async function receiptSettlement(receiptId: string): Promise<any> {
  return j(
    await fetch(`${RC}?receipt=${encodeURIComponent(receiptId)}`),
    "تعذّر جلب تسوية التحصيل",
  );
}
export async function invoiceSettlement(invoiceId: string): Promise<any> {
  return j(
    await fetch(`${RC}?invoice=${encodeURIComponent(invoiceId)}`),
    "تعذّر جلب تسوية الفاتورة",
  );
}

export interface SalesInvoiceSettlementRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  originalReceivable: number;
  allocated: number;
  outstanding: number;
}
export async function listCustomerInvoicesForStatement(opts: {
  customerId: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SalesInvoiceSettlementRow[]; total: number }> {
  const p = new URLSearchParams({ invoices: opts.customerId });
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  return j(await fetch(`${RC}?${p.toString()}`), "تعذّر جلب فواتير العميل");
}

export async function allocationCandidates(
  receiptId: string,
  q?: string,
): Promise<{ items: any[] }> {
  const p = new URLSearchParams({ candidates: receiptId });
  if (q) p.set("q", q);
  return j(await fetch(`${RC}?${p.toString()}`), "تعذّر جلب الفواتير القابلة للتخصيص");
}
export async function allocate(receiptId: string, invoiceId: string, amount: number): Promise<any> {
  return j(await post(RC, { action: "allocate", receiptId, invoiceId, amount }), "تعذّر التخصيص");
}
export async function unallocate(receiptId: string, invoiceId: string): Promise<any> {
  return j(await post(RC, { action: "unallocate", receiptId, invoiceId }), "تعذّر إلغاء التخصيص");
}
