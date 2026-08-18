/** Phase 3A — Suppliers & AP (Finance) client API. Payable is GL-derived. */

export interface FinanceSupplier {
  id: string;
  supplierCode: string | null;
  name: string;
  legalName: string | null;
  commercialRegistration: string | null;
  taxNumber: string | null; // VAT number
  phone: string | null;
  email: string | null;
  currency: string;
  paymentTermsDays: number | null;
  bankName: string | null;
  ibanMasked: string | null;
  iban?: string | null; // only on ?full=1 for sensitive-view holders
  status: string;
  notes: string | null;
  createdAt: string;
  payableBalance?: number;
}

export interface SupplierBalance {
  supplierId: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  payableBalance: number;
  asOf: string | null;
}

export interface SupplierLedgerMovement {
  lineId: string;
  entryId: string;
  number: string;
  date: string;
  description: string;
  source: string;
  reference: string;
  debit: number;
  credit: number;
  payableBalance: number;
}

export interface ApReconciliation {
  apAccountId: string;
  apGl: number;
  subledgerTotal: number;
  unallocated: { count: number; debit: number; credit: number; net: number };
  difference: number;
  unallocatedLines: SupplierLedgerMovement[];
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

export async function listFinanceSuppliers(
  opts: { search?: string; status?: string; all?: boolean } = {},
): Promise<{ items: FinanceSupplier[] }> {
  const q = new URLSearchParams();
  if (opts.search) q.set("search", opts.search);
  if (opts.status) q.set("status", opts.status);
  if (opts.all) q.set("all", "1");
  const qs = q.toString();
  return j(await fetch(`/api/finance/suppliers${qs ? `?${qs}` : ""}`), "تعذّر جلب الموردين");
}

export async function getFinanceSupplier(
  id: string,
): Promise<{ item: FinanceSupplier; balance: SupplierBalance; ledger: any }> {
  return j(await fetch(`/api/finance/suppliers?id=${id}`), "تعذّر جلب المورد");
}

export async function getSupplierLedger(
  id: string,
): Promise<{
  item: FinanceSupplier;
  opening: number;
  movements: SupplierLedgerMovement[];
  closing: number;
}> {
  return j(await fetch(`/api/finance/suppliers?id=${id}&ledger=1`), "تعذّر جلب كشف الحساب");
}

export async function createFinanceSupplier(body: any): Promise<FinanceSupplier> {
  return (await j(await post("/api/finance/suppliers", body), "تعذّر إنشاء المورد")).item;
}
export async function updateFinanceSupplier(body: any): Promise<FinanceSupplier> {
  return (await j(await put("/api/finance/suppliers", body), "تعذّر تعديل المورد")).item;
}
export async function setSupplierActive(id: string, active: boolean) {
  return j(
    await post("/api/finance/suppliers", { id, action: active ? "reactivate" : "deactivate" }),
    "تعذّر تغيير حالة المورد",
  );
}

export async function getApReconciliation(): Promise<ApReconciliation> {
  return j(await fetch(`/api/finance/suppliers?reconciliation=1`), "تعذّر جلب المطابقة");
}
export async function getApPreflight(): Promise<any> {
  return j(await fetch(`/api/finance/suppliers?preflight=1`), "تعذّر جلب التشخيص");
}
