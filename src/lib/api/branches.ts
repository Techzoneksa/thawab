import { BranchStatus as BranchStatusEnum } from "@/lib/enums";

const API_BASE = "/api/settings/branches";

export const BRANCH_STATUSES = Object.values(BranchStatusEnum);
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

/** Saudi National Address fields (العنوان الوطني). */
export interface BranchNationalAddress {
  buildingNo?: string;
  street?: string;
  district?: string;
  postalCode?: string;
  additionalNo?: string;
}

export interface Branch extends Required<BranchNationalAddress> {
  id: string;
  name: string;
  city: string;
  manager: string | null;
  phone: string | null;
  email: string | null;
  status: BranchStatus | string;
  createdAt: string;
}

export interface CreateBranchInput extends BranchNationalAddress {
  name: string;
  city?: string;
  manager?: string;
  phone?: string;
  email?: string;
  status?: string;
}

export interface UpdateBranchInput extends BranchNationalAddress {
  id: string;
  name?: string;
  city?: string;
  manager?: string;
  phone?: string;
  email?: string;
  status?: string;
}

export async function getBranches(): Promise<{ items: Branch[]; total: number }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب الفروع");
  return res.json();
}

export async function getBranch(id: string): Promise<{ item: Branch }> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الفرع");
  return res.json();
}

export async function createBranch(data: CreateBranchInput): Promise<Branch> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الفرع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateBranch(data: UpdateBranchInput): Promise<Branch> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الفرع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteBranch(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الفرع");
  }
}
