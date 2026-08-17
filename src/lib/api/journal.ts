import { JournalStatus as JournalStatusEnum, Fund } from "@/lib/enums";

const API_BASE = "/api/finance/journal";

export const JOURNAL_STATUSES = Object.values(JournalStatusEnum);
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export const JOURNAL_FUNDS = Object.values(Fund);
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
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
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
  if (filters.status) params.set("status", filters.status);
  if (filters.fund) params.set("fund", filters.fund);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب قيود اليومية");
  return res.json();
}

export interface WorkflowEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  userId: string | null;
  userName: string;
  reason: string;
  createdAt: string;
}

export async function getJournalEntry(id: string): Promise<{
  item: JournalEntry;
  lines: JournalLine[];
  totals: { debit: number; credit: number; balanced: boolean };
  reversedOf: JournalEntry | null;
  reversalEntries: JournalEntry[];
  workflowHistory?: WorkflowEvent[];
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
    throw new Error(err.message || err.error || "فشل في إضافة القيد");
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
    throw new Error(err.message || err.error || "فشل في تحديث القيد");
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
    throw new Error(err.message || err.error || "فشل في حذف القيد");
  }
}

export type JournalWorkflowAction =
  "submit" | "approve" | "return" | "reject" | "post" | "reverse" | "cancel";

const ACTION_ERR: Record<JournalWorkflowAction, string> = {
  submit: "فشل إرسال القيد للاعتماد",
  approve: "فشل اعتماد القيد",
  return: "فشل إعادة القيد للتعديل",
  reject: "فشل رفض القيد",
  post: "فشل ترحيل القيد",
  reverse: "فشل عكس القيد",
  cancel: "فشل إلغاء القيد",
};

/** Drive one governance transition. Server enforces permission + state + reason. */
export async function journalAction(options: {
  id: string;
  action: JournalWorkflowAction;
  reason?: string;
}): Promise<JournalEntry> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || ACTION_ERR[options.action]);
  }
  const d = await res.json();
  return d.item;
}

export const postJournalEntry = (o: { id: string }) => journalAction({ id: o.id, action: "post" });
export const reverseJournalEntry = (o: { id: string; reason?: string }) =>
  journalAction({ id: o.id, action: "reverse", reason: o.reason });
export const cancelJournalEntry = (o: { id: string }) =>
  journalAction({ id: o.id, action: "cancel" });
