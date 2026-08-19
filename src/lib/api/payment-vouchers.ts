/** Phase 2C — Payment Voucher (سند صرف) client API. Balances stay GL-derived. */

export interface PaymentVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  status: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  payeeName: string;
  payeeReferenceType: string | null;
  payeeReferenceId: string | null;
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

export interface PaymentVoucherLine {
  id: string;
  paymentVoucherId: string;
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

export interface PaymentVoucherDetail {
  item: PaymentVoucher;
  lines: PaymentVoucherLine[];
  history: WorkflowEvent[];
  journal: { id: string; number: string; status: string; date: string } | null;
  source: { id: string; code: string; currency: string; linkedAccountId: string } | null;
}

export type PaymentAction = "submit" | "approve" | "return" | "reject" | "post" | "reverse";

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

export interface PaymentVoucherFilters {
  status?: string;
  cashboxId?: string;
  bankAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listPaymentVouchers(filters: PaymentVoucherFilters = {}): Promise<{
  items: PaymentVoucher[];
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
    await fetch(`/api/finance/payment-vouchers${qs ? `?${qs}` : ""}`),
    "تعذّر جلب سندات الصرف",
  );
}

export async function getPaymentVoucher(id: string): Promise<PaymentVoucherDetail> {
  return j(await fetch(`/api/finance/payment-vouchers?id=${id}`), "تعذّر جلب سند الصرف");
}

export async function createPaymentVoucher(body: any): Promise<PaymentVoucher> {
  return (await j(await post("/api/finance/payment-vouchers", body), "تعذّر إنشاء سند الصرف")).item;
}

export async function updatePaymentVoucher(body: any): Promise<PaymentVoucher> {
  return (await j(await put("/api/finance/payment-vouchers", body), "تعذّر تعديل سند الصرف")).item;
}

export async function paymentVoucherAction(
  id: string,
  action: PaymentAction,
  reason?: string,
): Promise<{ item: PaymentVoucher; reversalId?: string }> {
  return j(
    await post("/api/finance/payment-vouchers", { id, action, reason }),
    "تعذّر تنفيذ الإجراء",
  );
}
