import { BackupFrequency as FreqEnum } from "@/lib/enums";

const API_BASE = "/api/settings/backup";

export const BACKUP_FREQUENCIES = Object.values(FreqEnum);
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export interface BackupConfig {
  id: string;
  frequency: BackupFrequency | string;
  time: string;
  retention: number;
  location: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface BackupRecord {
  id: string;
  type: string;
  status: string;
  note: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export interface UpdateBackupConfigInput {
  frequency?: BackupFrequency;
  time?: string;
  retention?: number;
  location?: string;
}

export async function getBackup(): Promise<{ config: BackupConfig; records: BackupRecord[] }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب بيانات النسخ الاحتياطي");
  return res.json();
}

export async function runBackup(): Promise<BackupRecord> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run" }),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إنشاء النسخة الاحتياطية");
  }
  return (await res.json()).item;
}

export async function updateBackupConfig(data: UpdateBackupConfigInput): Promise<BackupConfig> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حفظ الإعدادات");
  }
  return (await res.json()).config;
}

export async function deleteBackupRecord(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف السجل");
  }
}
