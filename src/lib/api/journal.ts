const API_BASE = "/api/finance/journal";

export const JOURNAL_STATUSES = ["مسودة", "بانتظار الاعتماد", "مرحّل", "ملغى", "معكوس"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const JOURNAL_FUNDS = ["مقيد", "غير مقيد", "أوقاف"] as const;
export type JournalFund = (typeof JOURNAL_FUNDS)[number];

export interface JournalLine {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName?: string;
  projectId: string | null;
  projectName?: string;
  notes: string;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  fund: JournalFund | string;
  currency: string;
  projectId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  status: JournalStatus | string;
  postedBy: string | null;
  postedAt: string | null;
  reversedBy: string | null;
  reversedAt: string | null;
  reversedOf: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed on list/get:
  lineCount?: number;
  totalDebit?: number;
  totalCredit?: number;
  lines?: JournalLine[];
}

export interface JournalFilters {
  search?: string;
  status?: string;
  fund?: string;
  projectId?: string;
  page?: number;
  limit?: number;
}

export interface CreateJournalInput {
  number?: string;
  date?: string;
  description: string;
  fund?: JournalFund;
  projectId?: string | null;
  currency?: string;
  notes?: string;
  lines: Array<{
    accountId: string;
    description?: string;
    debit?: number;
    credit?: number;
    costCenterId?: string | null;
    projectId?: string | null;
    notes?: string;
  }>;
  userId?: string;
  userName?: string;
}

export interface UpdateJournalInput {
  id: string;
  date?: string;
  description?: string;
  fund?: JournalFund;
  projectId?: string | null;
  notes?: string;
  lines?: Array<{
    accountId: string;
    description?: string;
    debit?: number;
    credit?: number;
    costCenterId?: string | null;
    projectId?: string | null;
    notes?: string;
  }>;
  userId?: string;
  userName?: string;
}

export async function getJournalEntries(filters: JournalFilters = {}): Promise<{
  items: JournalEntry[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.fund && filters.fund !== "الكل") params.set("fund", filters.fund);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب قيود اليومية");
  return res.json();
}

export async function getJournalEntry(id: string): Promise<{
  item: JournalEntry;
  lines: JournalLine[];
  totals: { debit: number; credit: number; balanced: boolean };
  reversedOf: JournalEntry | null;
  reversalEntries: JournalEntry[];
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات القيد");
  return res.json();
}

export async function createJournalEntry(data: CreateJournalInput): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة القيد");
  }
  const d = await res.json();
  return d.item;
}

export async function updateJournalEntry(data: UpdateJournalInput): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث القيد");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteJournalEntry(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<void> {
  const params = new URLSearchParams({ id: options.id });
  if (options.userId) params.set("userId", options.userId);
  if (options.userName) params.set("userName", options.userName);
  const res = await fetch(`${API_BASE}?${params.toString()}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في حذف القيد");
  }
}

export async function postJournalEntry(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "post" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في ترحيل القيد");
  }
  const d = await res.json();
  return d.item;
}

export async function reverseJournalEntry(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "reverse" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في عكس القيد");
  }
  const d = await res.json();
  return d.item;
}

export async function cancelJournalEntry(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "cancel" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إلغاء القيد");
  }
  const d = await res.json();
  return d.item;
}
