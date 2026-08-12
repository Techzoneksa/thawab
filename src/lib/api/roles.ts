const API_BASE = "/api/roles";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
  userCount?: number;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleInput {
  id: string;
  name?: string;
  description?: string;
  permissions?: string[];
}

export async function getRoles(): Promise<{ items: Role[]; total: number }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب الأدوار");
  return res.json();
}

export async function getRole(id: string): Promise<{ item: Role; userCount: number }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الدور");
  return res.json();
}

export async function createRole(data: CreateRoleInput): Promise<Role> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إضافة الدور");
  }
  return (await res.json()).item;
}

export async function updateRole(data: UpdateRoleInput): Promise<Role> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث الدور");
  }
  return (await res.json()).item;
}

export async function deleteRole(options: { id: string }): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${options.id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف الدور");
  }
}
