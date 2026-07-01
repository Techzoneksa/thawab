const API_BASE = "/api/beneficiaries";

export const ELIGIBILITY_STATUSES = ["جديد", "قيد المراجعة", "مؤهل", "غير مؤهل", "موقوف"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

export const MARITAL_STATUSES = ["أعزب", "متزوج", "مطلق", "أرمل"] as const;

export interface Beneficiary {
  id: string;
  name: string;
  fileNumber: string;
  idNumber: string;
  phone: string | null;
  city: string;
  address: string;
  category: string;
  status: EligibilityStatus;
  familyMembers: number;
  monthlyIncome: number;
  maritalStatus: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed on single GET
  totalAid?: number;
  aidCount?: number;
  pendingAidCount?: number;
  lastAidDate?: string | null;
  linkedProjectsCount?: number;
  aidHistory?: AidHistoryItem[];
}

export interface AidHistoryItem {
  id: string;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  date?: string;
  projectId: string | null;
  projectName?: string;
  description?: string;
}

export interface LinkedProject {
  id: string;
  name: string;
  code?: string;
  status?: string;
}

export interface BeneficiaryFilters {
  search?: string;
  status?: string;
  category?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface CreateBeneficiaryInput {
  name: string;
  fileNumber?: string;
  idNumber?: string;
  phone?: string;
  city?: string;
  address?: string;
  category?: string;
  status?: EligibilityStatus;
  familyMembers?: number;
  monthlyIncome?: number;
  maritalStatus?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateBeneficiaryInput {
  id: string;
  name?: string;
  fileNumber?: string;
  idNumber?: string;
  phone?: string;
  city?: string;
  address?: string;
  category?: string;
  status?: EligibilityStatus;
  familyMembers?: number;
  monthlyIncome?: number;
  maritalStatus?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getBeneficiaries(filters: BeneficiaryFilters = {}): Promise<{
  items: Beneficiary[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.category && filters.category !== "الكل") params.set("category", filters.category);
  if (filters.city && filters.city !== "الكل") params.set("city", filters.city);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب المستفيدين");
  return res.json();
}

export async function getBeneficiary(
  id: string,
): Promise<{ item: Beneficiary; aidHistory: AidHistoryItem[]; linkedProjects: LinkedProject[] }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المستفيد");
  const data = await res.json();
  return {
    item: data.item,
    aidHistory: data.aidHistory || [],
    linkedProjects: data.linkedProjects || [],
  };
}

export async function getBeneficiarySummary(id: string): Promise<Beneficiary> {
  const res = await fetch(`${API_BASE}?id=${id}&summary=true`);
  if (!res.ok) throw new Error("فشل في جلب ملخص المستفيد");
  const data = await res.json();
  return data.item;
}

export async function createBeneficiary(data: CreateBeneficiaryInput): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة المستفيد");
  }
  const d = await res.json();
  return d.item;
}

export async function updateBeneficiary(data: UpdateBeneficiaryInput): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث المستفيد");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteBeneficiary(options: {
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
    throw new Error(err.error || "فشل في حذف المستفيد");
  }
}

export async function reviewBeneficiary(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "review" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إرسال المستفيد للمراجعة");
  }
  const d = await res.json();
  return d.item;
}

export async function qualifyBeneficiary(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "qualify" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تأهيل المستفيد");
  }
  const d = await res.json();
  return d.item;
}

export async function disqualifyBeneficiary(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "disqualify" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في عدم تأهيل المستفيد");
  }
  const d = await res.json();
  return d.item;
}

export async function suspendBeneficiary(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "suspend" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إيقاف المستفيد");
  }
  const d = await res.json();
  return d.item;
}

export async function reactivateBeneficiary(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Beneficiary> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "reactivate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إعادة تفعيل المستفيد");
  }
  const d = await res.json();
  return d.item;
}
