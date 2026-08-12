import {
  ReportType as TypeEnum,
  ReportPeriod as PeriodEnum,
  ReportFormat as FormatEnum,
} from "@/lib/enums";

const API_BASE = "/api/reports/saved";

export const REPORT_TYPES = Object.values(TypeEnum);
export const REPORT_PERIODS = Object.values(PeriodEnum);
export const REPORT_FORMATS = Object.values(FormatEnum);
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface SavedReport {
  id: string;
  name: string;
  type: ReportType | string;
  period: ReportPeriod | string;
  format: ReportFormat | string;
  scheduled: boolean;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedReportInput {
  name: string;
  type?: ReportType;
  period?: ReportPeriod;
  format?: ReportFormat;
  scheduled?: boolean;
  notes?: string;
}

export type UpdateSavedReportInput = Partial<CreateSavedReportInput> & { id: string };

export async function getSavedReports(): Promise<{ items: SavedReport[]; total: number }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب التقارير المحفوظة");
  return res.json();
}

export async function getSavedReport(id: string): Promise<{ item: SavedReport }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات التقرير");
  return res.json();
}

export async function createSavedReport(data: CreateSavedReportInput): Promise<SavedReport> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حفظ التقرير");
  }
  return (await res.json()).item;
}

export async function updateSavedReport(data: UpdateSavedReportInput): Promise<SavedReport> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في تحديث التقرير");
  }
  return (await res.json()).item;
}

export async function deleteSavedReport(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف التقرير");
  }
}
