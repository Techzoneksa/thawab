import { PayrollStatus as StatusEnum, PayrollPayMethod as MethodEnum } from "@/lib/enums";

const API_BASE = "/api/hr/payroll";

export const PAYROLL_STATUSES = Object.values(StatusEnum);
export const PAYROLL_PAY_METHODS = Object.values(MethodEnum);
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
export type PayrollPayMethod = (typeof PAYROLL_PAY_METHODS)[number];

export interface PayrollRun {
  id: string;
  period: string;
  status: PayrollStatus | string;
  payMethod: PayrollPayMethod | string;
  totalAmount: number;
  journalEntryId: string | null;
  notes: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLine {
  id: string;
  runId: string;
  employeeId: string | null;
  employeeName: string;
  department: string;
  salary: number;
  allowances: number;
  deductions: number;
  net: number;
  notes: string;
}

export interface CreatePayrollInput {
  period: string;
  payMethod?: PayrollPayMethod;
  notes?: string;
}

export interface UpdatePayrollInput {
  id: string;
  payMethod?: PayrollPayMethod;
  notes?: string;
  lines?: { id: string; allowances?: number; deductions?: number }[];
}

export async function getPayrollRuns(): Promise<{ items: PayrollRun[]; total: number }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب مسيرات الرواتب");
  return res.json();
}

export async function getPayrollRun(
  id: string,
): Promise<{ item: PayrollRun; lines: PayrollLine[] }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات المسير");
  return res.json();
}

export async function createPayrollRun(data: CreatePayrollInput): Promise<PayrollRun> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إنشاء المسير");
  }
  return (await res.json()).item;
}

export async function updatePayrollRun(data: UpdatePayrollInput): Promise<PayrollRun> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث المسير");
  }
  return (await res.json()).item;
}

export async function approvePayrollRun(id: string): Promise<PayrollRun> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", id }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في اعتماد المسير");
  }
  return (await res.json()).item;
}

export async function deletePayrollRun(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف المسير");
  }
}
