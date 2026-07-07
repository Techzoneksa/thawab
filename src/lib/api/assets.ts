const API_BASE = "/api/assets";

export const ASSET_STATUSES = ["نشط", "تحت الصيانة", "منقول", "مستبعد", "مباع", "ملغي"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_CONDITIONS = ["جيد", "متوسط", "يحتاج صيانة", "تالف"] as const;

export const ASSET_DEPRECIATION_METHODS = ["قسط ثابت", "قسط متناقص"] as const;

export interface FixedAsset {
  id: string;
  name: string;
  code: string;
  category: string;
  location: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  depreciationMethod: string;
  status: AssetStatus | string;
  condition: string;
  purchaseDate: string;
  supplierId: string | null;
  serialNumber: string;
  responsiblePerson: string;
  sourceType: string | null;
  sourceId: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetFilters {
  search?: string;
  status?: string;
  category?: string;
}

export interface CreateFixedAssetInput {
  name: string;
  code?: string;
  category?: string;
  location?: string;
  cost?: number;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: string;
  condition?: string;
  purchaseDate?: string;
  supplierId?: string;
  serialNumber?: string;
  responsiblePerson?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export interface UpdateFixedAssetInput {
  id: string;
  name?: string;
  code?: string;
  category?: string;
  location?: string;
  cost?: number;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: string;
  condition?: string;
  purchaseDate?: string;
  supplierId?: string;
  serialNumber?: string;
  responsiblePerson?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}

export async function getFixedAssets(
  filters: FixedAssetFilters = {},
): Promise<{ items: FixedAsset[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "الكل") params.set("status", filters.status);
  if (filters.category && filters.category !== "الكل") params.set("category", filters.category);
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error("فشل في جلب الأصول الثابتة");
  return res.json();
}

export async function getFixedAsset(id: string): Promise<{
  item: FixedAsset;
  depreciationCount: number;
  movementCount: number;
  hasHistory: boolean;
  bookValue: number;
}> {
  const res = await fetch(`${API_BASE}?id=${id}`);
  if (!res.ok) throw new Error("فشل في جلب بيانات الأصل");
  return res.json();
}

export async function createFixedAsset(data: CreateFixedAssetInput): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إضافة الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function updateFixedAsset(data: UpdateFixedAssetInput): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تحديث الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function transferFixedAsset(options: {
  id: string;
  toLocation?: string;
  toResponsible?: string;
  date?: string;
  reason?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "transfer" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في نقل الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function maintainFixedAsset(options: {
  id: string;
  cost?: number;
  date?: string;
  reason?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "maintain" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تسجيل صيانة الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function returnFromMaintenance(options: {
  id: string;
  condition?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "returnFromMaintenance" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في إنهاء الصيانة");
  }
  const d = await res.json();
  return d.item;
}

export async function depreciateFixedAsset(options: {
  id: string;
  amount: number;
  date?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "depreciate" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في تسجيل الإهلاك");
  }
  const d = await res.json();
  return d.item;
}

export async function disposeFixedAsset(options: {
  id: string;
  date?: string;
  reason?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "dispose" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في استبعاد الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function sellFixedAsset(options: {
  id: string;
  salePrice?: number;
  date?: string;
  buyer?: string;
  notes?: string;
  userId?: string;
  userName?: string;
}): Promise<FixedAsset> {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...options, action: "sell" }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "فشل في بيع الأصل");
  }
  const d = await res.json();
  return d.item;
}

export async function deleteFixedAsset(options: {
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
    throw new Error(err.error || "فشل في حذف الأصل");
  }
}
