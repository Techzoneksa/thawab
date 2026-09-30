/**
 * Organization / branding profile used on every printed document, PDF and Excel.
 *
 * Source of truth: Settings ▸ المنظمة (org_settings). Nothing is hard-coded, so
 * every association (tenant) prints its own name.
 */
import type { OrgSettings } from "@/lib/api/org-settings";

export interface OrgProfile {
  nameAr: string;
  nameEn: string;
  vatNumber: string; // الرقم الضريبي
  crNumber: string; // السجل التجاري
  unifiedNo: string; // الرقم الوطني الموحد للمنشأة
  licenseNumber: string; // رقم ترخيص الجمعية
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  /** Optional data: URI logo (embedded so print/PDF are self-contained). */
  logoDataUrl?: string;
}

/** Empty profile — documents never print an invented name. Real data comes
 *  from Settings ▸ المنظمة (org_settings) via ensureOrg(). */
export const ORG: OrgProfile = {
  nameAr: "",
  nameEn: "",
  vatNumber: "",
  crNumber: "",
  unifiedNo: "",
  licenseNumber: "",
  address: "",
  city: "",
  country: "المملكة العربية السعودية",
  phone: "",
  email: "",
  website: "",
  logoDataUrl: undefined,
};

let current: OrgProfile = ORG;
let loading: Promise<OrgProfile> | null = null;

/** Map the Settings ▸ المنظمة record onto the printable profile. */
export function orgFromSettings(s: Partial<OrgSettings>): OrgProfile {
  return {
    ...ORG,
    nameAr: s.name?.trim() || "",
    vatNumber: s.taxNo?.trim() || "",
    licenseNumber: s.regNo?.trim() || "",
    unifiedNo: s.unifiedNo?.trim() || "",
    phone: s.phone?.trim() || "",
    email: s.email?.trim() || "",
    address: [s.buildingNo, s.street, s.district, s.postalCode].map((v) => v?.trim()).filter(Boolean).join(" "),
    city: s.city?.trim() || "",
  };
}

export function setOrgFromSettings(s: Partial<OrgSettings>) {
  current = orgFromSettings(s);
  loading = Promise.resolve(current);
}

/** Load the org profile once per page (call before building a document). */
export function ensureOrg(): Promise<OrgProfile> {
  if (typeof window === "undefined") return Promise.resolve(current);
  if (!loading) {
    loading = fetch("/api/settings/org")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.item) current = orgFromSettings(d.item);
        return current;
      })
      .catch(() => {
        loading = null; // retry next time
        return current;
      });
  }
  return loading;
}

/** Forget the cached profile (after Settings ▸ المنظمة is saved). */
export function invalidateOrg() {
  loading = null;
}

export function getOrg(): OrgProfile {
  return current;
}
