/** Phase 2A — Cash & Bank client API. Balances are always GL-derived server-side. */

export interface Cashbox {
  id: string;
  code: string;
  name: string;
  linkedAccountId: string;
  currency: string;
  status: string;
  branchId: string | null;
  isDefault: boolean;
  notes: string;
  createdAt: string;
  glBalance?: number;
}

export interface BankAccount {
  id: string;
  code: string;
  bankName: string;
  accountName: string;
  ibanMasked: string;
  accountNumberMasked: string | null;
  currency: string;
  linkedAccountId: string;
  status: string;
  branchId: string | null;
  isDefault: boolean;
  notes: string;
  createdAt: string;
  glBalance?: number;
  iban?: string; // only on ?full=1 detail for bank-view holders
}

export interface CashBankBalance {
  accountId: string;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  asOf: string | null;
}

async function j(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}

// -------- Cashboxes --------
export async function listCashboxes(all = false): Promise<{ items: Cashbox[]; summary: any }> {
  return j(await fetch(`/api/finance/cashboxes${all ? "?all=1" : ""}`), "تعذّر جلب الصناديق");
}
export async function getCashbox(id: string, asOf?: string) {
  const q = new URLSearchParams({ id });
  if (asOf) q.set("asOf", asOf);
  return j(await fetch(`/api/finance/cashboxes?${q}`), "تعذّر جلب الصندوق");
}
export async function createCashbox(body: any): Promise<Cashbox> {
  return (await j(await post("/api/finance/cashboxes", body), "تعذّر إنشاء الصندوق")).item;
}
export async function updateCashbox(body: any): Promise<Cashbox> {
  return (await j(await put("/api/finance/cashboxes", body), "تعذّر تعديل الصندوق")).item;
}
export async function setCashboxActive(id: string, active: boolean) {
  return j(
    await post("/api/finance/cashboxes", { id, action: active ? "reactivate" : "deactivate" }),
    "تعذّر تغيير حالة الصندوق",
  );
}

// -------- Bank accounts --------
export async function listBankAccounts(
  all = false,
): Promise<{ items: BankAccount[]; summary: any }> {
  return j(
    await fetch(`/api/finance/bank-accounts${all ? "?all=1" : ""}`),
    "تعذّر جلب الحسابات البنكية",
  );
}
export async function getBankAccount(id: string, opts: { asOf?: string; full?: boolean } = {}) {
  const q = new URLSearchParams({ id });
  if (opts.asOf) q.set("asOf", opts.asOf);
  if (opts.full) q.set("full", "1");
  return j(await fetch(`/api/finance/bank-accounts?${q}`), "تعذّر جلب الحساب البنكي");
}
export async function createBankAccount(body: any): Promise<BankAccount> {
  return (await j(await post("/api/finance/bank-accounts", body), "تعذّر إنشاء الحساب البنكي"))
    .item;
}
export async function updateBankAccount(body: any): Promise<BankAccount> {
  return (await j(await put("/api/finance/bank-accounts", body), "تعذّر تعديل الحساب البنكي")).item;
}
export async function setBankActive(id: string, active: boolean) {
  return j(
    await post("/api/finance/bank-accounts", { id, action: active ? "reactivate" : "deactivate" }),
    "تعذّر تغيير حالة الحساب البنكي",
  );
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
