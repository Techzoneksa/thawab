import {
  MembershipRole as MembershipRoleEnum,
  MembershipType as MembershipTypeEnum,
  MembershipStatus as MembershipStatusEnum,
} from "@/lib/enums";

const API_BASE = "/api/memberships";

export const MEMBERSHIP_ROLES = Object.values(MembershipRoleEnum);
export const MEMBERSHIP_TYPES = Object.values(MembershipTypeEnum);
export const MEMBERSHIP_STATUSES = Object.values(MembershipStatusEnum);
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface Membership {
  id: string;
  name: string;
  role: MembershipRole | string;
  type: MembershipType | string;
  phone: string | null;
  email: string | null;
  status: MembershipStatus | string;
  joinedAt: string;
  createdAt: string;
}

export interface MembershipFilters {
  search?: string;
  type?: string;
  status?: string;
}

export interface CreateMembershipInput {
  name: string;
  role?: string;
  type?: string;
  phone?: string;
  email?: string;
  status?: string;
  joinedAt?: string;
}

export interface UpdateMembershipInput {
  id: string;
  name?: string;
  role?: string;
  type?: string;
  phone?: string;
  email?: string;
  status?: string;
  joinedAt?: string;
}

export async function getMemberships(
  filters: MembershipFilters = {},
): Promise<{ items: Membership[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الأعضاء");
  return res.json();
}

export async function getMembership(id: string): Promise<{ item: Membership }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات العضو");
  return res.json();
}

export async function createMembership(data: CreateMembershipInput): Promise<Membership> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة العضو");
  }
  const d = await res.json();
  return d.item;
}

export async function updateMembership(data: UpdateMembershipInput): Promise<Membership> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث العضو");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteMembership(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف العضو");
  }
}
