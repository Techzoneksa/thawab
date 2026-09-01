/** Phase Sales-1 — Customers & AR (Finance) client API. Receivable is GL-derived. */

export interface FinanceCustomer {
  id: string;
  customerCode: string | null;
  name: string;
  legalName: string | null;
  commercialRegistration: string | null;
  taxNumber: string | null; // VAT number
  phone: string | null;
  email: string | null;
  currency: string;
  paymentTermsDays: number | null;
  contactPerson: string | null;
  address: string | null;
  buildingNo: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  additionalNo: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  receivableBalance?: number;
}

export interface CustomerBalance {
  customerId: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  receivableBalance: number;
  asOf: string | null;
}

export interface CustomerLedgerMovement {
  lineId: string;
  entryId: string;
  number: string;
  date: string;
  description: string;
  source: string;
  reference: string;
  debit: number;
  credit: number;
  receivableBalance: number;
}

export interface ArReconciliation {
  arAccountId: string;
  arGl: number;
  subledgerTotal: number;
  unallocated: { count: number; debit: number; credit: number; net: number };
  difference: number;
  unallocatedLines: CustomerLedgerMovement[];
}

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

export async function listFinanceCustomers(
  opts: { search?: string; status?: string; all?: boolean; page?: number; pageSize?: number } = {},
): Promise<{
  items: FinanceCustomer[];
  total?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
}> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.status) q.set("status", opts.status);
  if (opts.all) q.set("all", "1");
  else {
    q.set("pageSize", String(opts.pageSize ?? 200));
    if (opts.page) q.set("page", String(opts.page));
  }
  const qs = q.toString();
  return j(await fetch(`/api/finance/customers${qs ? `?${qs}` : ""}`), "تعذّر جلب العملاء");
}

export interface CustomerLookupItem {
  id: string;
  customerCode: string | null;
  name: string;
  currency: string;
  status: string;
}
/** Bounded server-side customer search for pickers (no balances). */
export async function customerLookup(
  q: string,
  limit = 20,
): Promise<{ items: CustomerLookupItem[] }> {
  const p = new URLSearchParams({ lookup: "1", limit: String(limit) });
  if (q) p.set("q", q);
  return j(await fetch(`/api/finance/customers?${p.toString()}`), "تعذّر البحث عن العملاء");
}

export async function getFinanceCustomer(
  id: string,
): Promise<{ item: FinanceCustomer; balance: CustomerBalance; ledger: any }> {
  return j(await fetch(`/api/finance/customers?id=${id}`), "تعذّر جلب العميل");
}

export async function getCustomerLedger(id: string): Promise<{
  item: FinanceCustomer;
  opening: number;
  movements: CustomerLedgerMovement[];
  closing: number;
}> {
  return j(await fetch(`/api/finance/customers?id=${id}&ledger=1`), "تعذّر جلب كشف الحساب");
}

export async function createFinanceCustomer(body: any): Promise<FinanceCustomer> {
  return (await j(await post("/api/finance/customers", body), "تعذّر إنشاء العميل")).item;
}
export async function updateFinanceCustomer(body: any): Promise<FinanceCustomer> {
  return (await j(await put("/api/finance/customers", body), "تعذّر تعديل العميل")).item;
}
export async function setCustomerActive(id: string, active: boolean) {
  return j(
    await post("/api/finance/customers", { id, action: active ? "reactivate" : "deactivate" }),
    "تعذّر تغيير حالة العميل",
  );
}

export async function getArReconciliation(): Promise<ArReconciliation> {
  return j(await fetch(`/api/finance/customers?reconciliation=1`), "تعذّر جلب المطابقة");
}
