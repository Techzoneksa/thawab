/** Phase 2B — Receipt Voucher (سند قبض) client API. Balances stay GL-derived. */

export interface ReceiptVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  status: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  payerName: string;
  payerReferenceType: string | null;
  payerReferenceId: string | null;
  externalReference: string | null;
  description: string | null;
  notes: string | null;
  currency: string;
  totalAmount: number;
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

export interface ReceiptVoucherLine {
  id: string;
  receiptVoucherId: string;
  lineNumber: number;
  accountId: string;
  amount: number;
  description: string | null;
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

export interface ReceiptVoucherDetail {
  item: ReceiptVoucher;
  lines: ReceiptVoucherLine[];
  history: WorkflowEvent[];
  journal: { id: string; number: string; status: string; date: string } | null;
  destination: { id: string; code: string; currency: string; linkedAccountId: string } | null;
}

export type ReceiptAction = "submit" | "approve" | "return" | "reject" | "post" | "reverse";

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

export interface ReceiptVoucherFilters {
  status?: string;
  cashboxId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listReceiptVouchers(filters: ReceiptVoucherFilters = {}): Promise<{
  items: ReceiptVoucher[];
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
    await fetch(`/api/finance/receipt-vouchers${qs ? `?${qs}` : ""}`),
    "تعذّر جلب سندات القبض",
  );
}

export async function getReceiptVoucher(id: string): Promise<ReceiptVoucherDetail> {
  return j(await fetch(`/api/finance/receipt-vouchers?id=${id}`), "تعذّر جلب سند القبض");
}

export async function createReceiptVoucher(body: any): Promise<ReceiptVoucher> {
  return (await j(await post("/api/finance/receipt-vouchers", body), "تعذّر إنشاء سند القبض")).item;
}

export async function updateReceiptVoucher(body: any): Promise<ReceiptVoucher> {
  return (await j(await put("/api/finance/receipt-vouchers", body), "تعذّر تعديل سند القبض")).item;
}

export async function receiptVoucherAction(
  id: string,
  action: ReceiptAction,
  reason?: string,
): Promise<{ item: ReceiptVoucher; reversalId?: string }> {
  return j(
    await post("/api/finance/receipt-vouchers", { id, action, reason }),
    "تعذّر تنفيذ الإجراء",
  );
}
