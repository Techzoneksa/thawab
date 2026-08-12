import { MeetingStatus as MeetingStatusEnum } from "@/lib/enums";

const API_BASE = "/api/meetings";

export const MEETING_STATUSES = Object.values(MeetingStatusEnum);
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface Meeting {
  id: string;
  title: string;
  date: string;
  location: string;
  /** JSON-encoded string array of attendee names. */
  attendees: string;
  status: MeetingStatus | string;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface MeetingFilters {
  search?: string;
  status?: string;
}

export interface CreateMeetingInput {
  title: string;
  date?: string;
  location?: string;
  attendees?: string[];
  status?: string;
  notes?: string;
}

export interface UpdateMeetingInput {
  id: string;
  title?: string;
  date?: string;
  location?: string;
  attendees?: string[];
  status?: string;
  notes?: string;
}

/** Safely count attendees from the JSON-encoded column. */
export function attendeesCount(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export async function getMeetings(
  filters: MeetingFilters = {},
): Promise<{ items: Meeting[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الاجتماعات");
  return res.json();
}

export async function getMeeting(id: string): Promise<{ item: Meeting }> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الاجتماع");
  return res.json();
}

export async function createMeeting(data: CreateMeetingInput): Promise<Meeting> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في إضافة الاجتماع");
  }
  const d = await res.json();
  return d.item;
}

export async function updateMeeting(data: UpdateMeetingInput): Promise<Meeting> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في تحديث الاجتماع");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteMeeting(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حذف الاجتماع");
  }
}
