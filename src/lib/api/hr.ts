import { EmployeeStatus as EmployeeStatusEnum } from "@/lib/enums";

const API_BASE = "/api/hr";

export const EMPLOYEE_STATUSES = Object.values(EmployeeStatusEnum);
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface Employee {
  id: string;
  name: string;
  department: string;
  title: string;
  salary: number;
  phone: string;
  email: string;
  joinedAt: string;
  status: EmployeeStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface EmployeeFilters {
  search?: string;
  status?: string;
  department?: string;
}

export interface CreateEmployeeInput {
  name: string;
  department?: string;
  title?: string;
  salary?: number;
  phone?: string;
  email?: string;
  joinedAt?: string;
  status?: string;
  notes?: string;
}

export interface UpdateEmployeeInput {
  id: string;
  name?: string;
  department?: string;
  title?: string;
  salary?: number;
  phone?: string;
  email?: string;
  joinedAt?: string;
  status?: string;
  notes?: string;
}

export async function getEmployees(
  filters: EmployeeFilters = {},
): Promise<{ items: Employee[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.department) params.set("department", filters.department);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الموظفين");
  return res.json();
}

export async function getEmployee(id: string): Promise<{ item: Employee }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الموظف");
  return res.json();
}

export async function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الموظف");
  }
  const d = await res.json();
  return d.item;
}

export async function updateEmployee(data: UpdateEmployeeInput): Promise<Employee> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الموظف");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteEmployee(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الموظف");
  }
}
