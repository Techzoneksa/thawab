import { useQuery } from "@tanstack/react-query";
const API_BASE = "/api/settings/org";

export interface OrgSettings {
  id: string;
  name: string;
  regNo: string;
  /** الرقم الوطني الموحد للمنشأة (7xxxxxxxxx) — not a phone number. */
  unifiedNo: string;
  taxNo: string;
  email: string;
  phone: string;
  ceo: string;
  fiscalYear: string;
  currency: string;
  buildingNo: string;
  street: string;
  district: string;
  city: string;
  postalCode: string;
  additionalNo: string;
  updatedAt: string;
}

export type OrgSettingsInput = Partial<Omit<OrgSettings, "id" | "updatedAt">>;

export async function getOrgSettings(): Promise<{ item: OrgSettings }> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("فشل في جلب إعدادات الجمعية");
  return res.json();
}

export async function saveOrgSettings(data: OrgSettingsInput): Promise<OrgSettings> {
  const res = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.error || "فشل في حفظ الإعدادات");
  }
  const d = await res.json();
  return d.item;
}

/** The association's display name (public, per site). "" until set. */
export async function getOrgBrand(): Promise<{ name: string }> {
  try {
    const res = await fetch("/api/settings/brand");
    if (!res.ok) return { name: "" };
    return res.json();
  } catch {
    return { name: "" };
  }
}

/** Display name of THIS association — replaces any product name in the UI. */
export function useOrgName(): string {
  const { data } = useQuery({ queryKey: ["org-brand"], queryFn: getOrgBrand, staleTime: 300_000 });
  return data?.name?.trim() || "";
}

/** One-letter badge for the association logo (skips a leading "جمعية"). */
export function orgInitial(name: string): string {
  const core = name.replace(/^جمعية\s+/, "").replace(/^ال/, "").trim();
  return (core || name).charAt(0) || "ج";
}
