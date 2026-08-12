import { NotificationTone as ToneEnum } from "@/lib/enums";

const API_BASE = "/api/notifications";

export const NOTIFICATION_TONES = Object.values(ToneEnum);
export type NotificationTone = (typeof NOTIFICATION_TONES)[number];

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  tone: NotificationTone | string;
  link: string;
  read: boolean;
  createdBy: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface CreateNotificationInput {
  title: string;
  body?: string;
  tone?: NotificationTone;
  link?: string;
}

export async function getNotifications(
  opts: { unread?: boolean } = {},
): Promise<{ items: AppNotification[]; total: number; unread: number }> {
  const params = new URLSearchParams();
  if (opts.unread) params.set("unread", "1");
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب التنبيهات");
  return res.json();
}

export async function createNotification(data: CreateNotificationInput): Promise<AppNotification> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في إنشاء التنبيه");
  }
  return (await res.json()).item;
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: read ? "mark_read" : "mark_unread", id }),
  });
  if (!res.ok) throw new Error("فشل في تحديث التنبيه");
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_all_read" }),
  });
  if (!res.ok) throw new Error("فشل في تحديث التنبيهات");
}

export async function deleteNotification(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.message || e.error || "فشل في حذف التنبيه");
  }
}
