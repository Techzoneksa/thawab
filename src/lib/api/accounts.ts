import { AccountClassification, AccountStatus as AccountStatusEnum } from "@/lib/enums";

const API_BASE = "/api/finance/accounts";

export const ACCOUNT_TYPES = Object.values(AccountClassification);
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = Object.values(AccountStatusEnum);
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType | string;
  level: number;
  parentId: string | null;
  currency: string;
  balance: number;
  postable: boolean;
  status: AccountStatus | string;
  description: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountFilters {
  search?: string;
  type?: string;
  status?: string;
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type?: AccountType;
  parentId?: string | null;
  currency?: string;
  balance?: number;
  postable?: boolean;
  status?: AccountStatus;
  description?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateAccountInput {
  id: string;
  name?: string;
  type?: AccountType;
  parentId?: string | null;
  currency?: string;
  balance?: number;
  postable?: boolean;
  status?: AccountStatus;
  description?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getAccounts(filters: AccountFilters = {}): Promise<{
  items: Account[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الحسابات");
  return res.json();
}

export async function getAccount(id: string): Promise<{
  item: Account;
  lineCount: number;
  childCount: number;
  hasTransactions: boolean;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الحساب");
  return res.json();
}

export async function createAccount(data: CreateAccountInput): Promise<Account> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الحساب");
  }
  const d = await res.json();
  return d.item;
}

export async function updateAccount(data: UpdateAccountInput): Promise<Account> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الحساب");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteAccount(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف الحساب");
  }
}

export async function deactivateAccount(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Account> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "deactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إيقاف الحساب");
  }
  const d = await res.json();
  return d.item;
}

export async function activateAccount(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Account> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "activate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تفعيل الحساب");
  }
  const d = await res.json();
  return d.item;
}
