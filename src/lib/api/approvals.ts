import { ApprovalStatus as ApprovalStatusEnum, Priority as PriorityEnum } from "@/lib/enums";

const API_BASE = "/api/approvals";

export const APPROVAL_STATUSES = Object.values(ApprovalStatusEnum);
export const PRIORITIES = Object.values(PriorityEnum);
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Approval {
  id: string;
  type: string;
  subject: string;
  requester: string;
  amount: number;
  status: ApprovalStatus | string;
  priority: Priority | string;
  level: number;
  projectId: string | null;
  notes: string;
  createdAt: string;
}

export interface ApprovalFilters {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
}

export interface CreateApprovalInput {
  type: string;
  subject: string;
  requester?: string;
  amount?: number;
  priority?: string;
  level?: number;
  notes?: string;
}

export type ApprovalAction = "approve" | "reject" | "return";

export async function getApprovals(
  filters: ApprovalFilters = {},
): Promise<{ items: Approval[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.priority) params.set("priority", filters.priority);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الموافقات");
  return res.json();
}

export async function createApproval(data: CreateApprovalInput): Promise<Approval> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إنشاء الطلب");
  }
  const d = await res.json();
  return d.item;
}

export async function actOnApproval(
  id: string,
  action: ApprovalAction,
  note?: string,
): Promise<Approval> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, note }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تنفيذ الإجراء");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteApproval(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الطلب");
  }
}
