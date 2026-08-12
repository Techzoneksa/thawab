import { CampaignStatus as CampaignStatusEnum } from "@/lib/enums";

const API_BASE = "/api/campaigns";

export const CAMPAIGN_STATUSES = Object.values(CampaignStatusEnum);
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface Campaign {
  id: string;
  name: string;
  goal: number;
  raised: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus | string;
  description: string;
  donorCount?: number;
  createdBy: string | null;
  createdAt: string;
}

export interface CampaignFilters {
  search?: string;
  status?: string;
}

export interface CreateCampaignInput {
  name: string;
  goal?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  description?: string;
}

export interface UpdateCampaignInput {
  id: string;
  name?: string;
  goal?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  description?: string;
}

export async function getCampaigns(
  filters: CampaignFilters = {},
): Promise<{ items: Campaign[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الحملات");
  return res.json();
}

export async function getCampaign(id: string): Promise<{ item: Campaign; donationCount: number }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الحملة");
  return res.json();
}

export async function createCampaign(data: CreateCampaignInput): Promise<Campaign> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الحملة");
  }
  const d = await res.json();
  return d.item;
}

export async function updateCampaign(data: UpdateCampaignInput): Promise<Campaign> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الحملة");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteCampaign(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الحملة");
  }
}
