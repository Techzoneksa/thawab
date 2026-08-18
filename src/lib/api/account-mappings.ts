/** Phase 3B.1 — Finance system-account mappings (Input VAT) client API. */

export interface InputVatPreflight {
  purpose: string;
  configured: {
    accountId: string;
    code: string;
    name: string;
    active: boolean;
    postable: boolean;
    classification: string;
  } | null;
  duplicateMappingCount: number;
  code110306Exists: boolean;
  code110306AccountId: string | null;
  code110306SystemKey: string | null;
  taxableInvoiceCount: number;
  postedTaxableInvoiceCount: number;
  taxableInvoicesBlockedByMissingMapping: number;
}

export interface AccountMappingsState {
  inputVat: { preflight: InputVatPreflight; mapping: any | null };
}

async function j(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}

export async function getAccountMappings(): Promise<AccountMappingsState> {
  return j(await fetch("/api/finance/account-mappings"), "تعذّر جلب ربط الحسابات النظامية");
}

export async function setInputVatAccount(accountId: string): Promise<any> {
  const res = await fetch("/api/finance/account-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "input_vat", accountId }),
  });
  return (await j(res, "تعذّر تعيين حساب ضريبة المدخلات")).item;
}
