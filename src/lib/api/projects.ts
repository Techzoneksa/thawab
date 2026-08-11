const API_BASE = "/api/projects";

export interface Project {
  id: string;
  name: string;
  code: string;
  type: string;
  category: string;
  branch: string;
  manager: string;
  budget: number;
  spent: number;
  donations: number;
  beneficiaryCount: number;
  progress: number;
  status: string;
  startDate: string;
  endDate: string;
  description: string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalDonations?: number;
  totalAid?: number;
  aidCount?: number;
  remainingBudget?: number;
}

export interface ProjectFilters {
  search?: string;
  status?: string;
  category?: string;
  branch?: string;
  page?: number;
  limit?: number;
}

export interface ProjectSummary extends Project {
  totalDonations: number;
  totalAid: number;
  aidCount: number;
  remainingBudget: number;
  beneficiaryCount: number;
  progressPercentage: number;
  utilizationPercent: number;
  donationsPercent: number;
}

export async function getProjects(
  filters: ProjectFilters = {},
): Promise<{ items: Project[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب المشاريع");
  return res.json();
}

export async function getProject(
  id: string,
): Promise<{ item: Project; donations?: any[]; aid?: any[]; beneficiaries?: any[] }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المشروع");
  return res.json();
}

export async function getProjectSummary(id: string): Promise<ProjectSummary> {
  const res = await fetch(`${API_BASE}?id=${id}&summary=true`);
  if (!res.ok) throw new Error("فشل في جلب ملخص المشروع");
  const data = await res.json();
  return data.item;
}

export async function createProject(data: {
  name: string;
  code?: string;
  type?: string;
  category?: string;
  branch?: string;
  manager?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  notes?: string;
  status?: string;
  progress?: number;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة المشروع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateProject(data: {
  id: string;
  name?: string;
  code?: string;
  type?: string;
  category?: string;
  branch?: string;
  manager?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  notes?: string;
  status?: string;
  progress?: number;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث المشروع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteProject(options: {
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
    throw new Error(err.message || err.error || "فشل في حذف المشروع");
  }
}

export async function activateProject(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  return workflowAction(options.id, "activate", options.userId, options.userName);
}

export async function pauseProject(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  return workflowAction(options.id, "pause", options.userId, options.userName);
}

export async function completeProject(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  return workflowAction(options.id, "complete", options.userId, options.userName);
}

export async function cancelProject(options: {
  id: string;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  return workflowAction(options.id, "cancel", options.userId, options.userName);
}

async function workflowAction(
  id: string,
  action: string,
  userId?: string,
  userName?: string,
): Promise<Project> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, userId, userName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || `فشل في تنفيذ العملية: ${action}`);
  }
  const d = await res.json();
  return d.item;
}

export async function changeProjectStatus(options: {
  id: string;
  status: string;
  userId?: string;
  userName?: string;
}): Promise<Project> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "status" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تغيير حالة المشروع");
  }
  const d = await res.json();
  return d.item;
}
