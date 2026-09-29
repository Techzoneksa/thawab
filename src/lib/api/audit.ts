const API_BASE = "/api/audit";

export interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  before: string | null;
  after: string | null;
  ip: string;
  timestamp: string;
}

export interface AuditFilters {
  search?: string;
  userName?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Only delete/cancel/unpost/reverse/reject/reopen/edit operations. */
  sensitive?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditOptions {
  users: string[];
  actions: string[];
  entities: string[];
}

export async function getAuditEntries(filters: AuditFilters = {}): Promise<{
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  options: AuditOptions;
}> {
  const params = new URLSearchParams();
  // The page's dropdowns use "الكل" (all) as their unfiltered value — never send it.
  const pick = (v?: string) => (v && v !== "الكل" ? v : "");
  if (filters.search) params.set("search", filters.search);
  if (pick(filters.userName)) params.set("userName", pick(filters.userName));
  if (pick(filters.action)) params.set("action", pick(filters.action));
  if (pick(filters.entityType)) params.set("entityType", pick(filters.entityType));
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.sensitive) params.set("sensitive", "1");
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب سجل التدقيق");
  return res.json();
}

export async function getAuditEntry(id: string): Promise<{
  item: AuditEntry;
  before: unknown;
  after: unknown;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات السجل");
  return res.json();
}
