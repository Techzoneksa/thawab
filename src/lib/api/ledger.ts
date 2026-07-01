const API_BASE = "/api/finance/ledger";

export interface LedgerMovement {
  lineId: string;
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  costCenterId: string;
  costCenterName: string;
  projectId: string;
  projectName: string;
  debit: number;
  credit: number;
  notes: string;
  runningBalance: number;
}

export interface LedgerFilters {
  accountId?: string;
  costCenterId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface LedgerOptions {
  accounts: { id: string; code: string; name: string }[];
  costCenters: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}

export interface LedgerResponse {
  movements: LedgerMovement[];
  totals: { debit: number; credit: number; net: number };
  balances: { opening: number; closing: number };
  count: number;
  options: LedgerOptions;
}

export async function getLedgerMovements(filters: LedgerFilters = {}): Promise<LedgerResponse> {
  const params = new URLSearchParams();
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.costCenterId) params.set("costCenterId", filters.costCenterId);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.search) params.set("search", filters.search);

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب حركة دفتر الأستاذ");
  return res.json();
}
