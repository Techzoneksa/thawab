/**
 * Organization / branding profile used on every printed document, PDF and Excel.
 *
 * TODO(config): back this with an `org_settings` table + the Settings ▸ المنظمة
 * page so admins can edit it and upload a logo. For now these are safe editable
 * defaults; update them to the charity's real registration data.
 */
export interface OrgProfile {
  nameAr: string;
  nameEn: string;
  vatNumber: string; // الرقم الضريبي
  crNumber: string; // السجل التجاري / رقم الترخيص
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

export const ORG: OrgProfile = {
  nameAr: "جمعية ثواب الخيرية",
  nameEn: "Thawab Charity",
  vatNumber: "",
  crNumber: "",
  licenseNumber: "",
  address: "",
  city: "",
  country: "المملكة العربية السعودية",
  phone: "",
  email: "",
  website: "",
  logoDataUrl: undefined,
};

export function getOrg(): OrgProfile {
  // Client-side override (until a settings table exists).
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("org_profile");
      if (raw) return { ...ORG, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }
  return ORG;
}
