const API_BASE = "/api/finance/opening-balance";

export interface OpeningBalanceLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface OpeningBalanceEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  sourceId: string | null;
  createdAt: string;
}

export async function getOpeningBalances(): Promise<{ items: OpeningBalanceEntry[] }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب الأرصدة الافتتاحية");
  return res.json();
}

export async function postOpeningBalance(data: {
  date: string;
  lines: OpeningBalanceLineInput[];
  notes?: string;
}): Promise<{ item: OpeningBalanceEntry }> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || "فشل ترحيل الأرصدة الافتتاحية");
  }
  return res.json();
}
