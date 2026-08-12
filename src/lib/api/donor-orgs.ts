import { DonorOrgCategory as CategoryEnum, DonorOrgStatus as StatusEnum } from "@/lib/enums";

const API_BASE = "/api/donor-orgs";

export const DONOR_ORG_CATEGORIES = Object.values(CategoryEnum);
export type DonorOrgCategory = (typeof DONOR_ORG_CATEGORIES)[number];
export const DONOR_ORG_STATUSES = Object.values(StatusEnum);
export type DonorOrgStatus = (typeof DONOR_ORG_STATUSES)[number];

export interface DonorOrg {
  id: string;
  name: string;
  category: DonorOrgCategory | string;
  contactPerson: string;
  phone: string;
  email: string;
  grantsCount: number;
  totalAmount: number;
  status: DonorOrgStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonorOrgFilters {
  search?: string;
  status?: string;
  category?: string;
}

export interface CreateDonorOrgInput {
  name: string;
  category?: DonorOrgCategory;
  contactPerson?: string;
  phone?: string;
  email?: string;
  grantsCount?: number;
  totalAmount?: number;
  status?: DonorOrgStatus;
  notes?: string;
}

export type UpdateDonorOrgInput = Partial<CreateDonorOrgInput> & { id: string };

export async function getDonorOrgs(
  filters: DonorOrgFilters = {},
): Promise<{ items: DonorOrg[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الجهات المانحة");
  return res.json();
}

export async function getDonorOrg(id: string): Promise<{ item: DonorOrg }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الجهة المانحة");
  return res.json();
}

export async function createDonorOrg(data: CreateDonorOrgInput): Promise<DonorOrg> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إضافة الجهة المانحة");
  }
  return (await res.json()).item;
}

export async function updateDonorOrg(data: UpdateDonorOrgInput): Promise<DonorOrg> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث الجهة المانحة");
  }
  return (await res.json()).item;
}

export async function setDonorOrgStatus(options: {
  id: string;
  action: "activate" | "deactivate";
}): Promise<DonorOrg> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تغيير حالة الجهة المانحة");
  }
  return (await res.json()).item;
}

export async function deleteDonorOrg(options: { id: string }): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${options.id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف الجهة المانحة");
  }
}
