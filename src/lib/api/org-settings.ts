const API_BASE = "/api/settings/org";

export interface OrgSettings {
  id: string;
  name: string;
  regNo: string;
  taxNo: string;
  email: string;
  phone: string;
  ceo: string;
  fiscalYear: string;
  currency: string;
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
