import { getOrg } from "@/lib/documents/org";
import type { DocumentDefinition } from "@/lib/documents/types";

/** Branded header: logo + legal name + VAT/CR, then document title/number/date,
 *  the counterparty block, and the applied filters/meta. */
export function DocumentHeader({ def }: { def: DocumentDefinition }) {
  const org = getOrg();
  const fmtDate = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  return (
    <header className="doc-header">
      <div className="doc-org">
        <div className="doc-org-brand">
          {org.logoDataUrl ? (
            <img src={org.logoDataUrl} alt="" className="doc-logo" />
          ) : (
            <div className="doc-logo doc-logo-fallback">{org.nameAr.slice(0, 2)}</div>
          )}
          <div>
            <div className="doc-org-name">{org.nameAr}</div>
            {org.nameEn && <div className="doc-org-name-en">{org.nameEn}</div>}
          </div>
        </div>
        <div className="doc-org-meta">
          {org.vatNumber && <div>الرقم الضريبي: {org.vatNumber}</div>}
          {org.crNumber && <div>السجل التجاري: {org.crNumber}</div>}
          {org.licenseNumber && <div>رقم الترخيص: {org.licenseNumber}</div>}
          {org.phone && <div>هاتف: {org.phone}</div>}
          {org.email && <div>{org.email}</div>}
          {(org.address || org.city) && <div>{[org.address, org.city, org.country].filter(Boolean).join("، ")}</div>}
        </div>
      </div>

      <div className="doc-title-row">
        <h1 className="doc-title">{def.title}</h1>
        {def.subtitle && <div className="doc-subtitle">{def.subtitle}</div>}
        <div className="doc-title-meta">
          {def.number && <span>المستند: {def.number}</span>}
          <span>التاريخ: {fmtDate(def.date) || new Date().toISOString().slice(0, 10)}</span>
        </div>
      </div>

      {def.entity && (
        <div className="doc-entity">
          <div className="doc-entity-name">{def.entity.name}</div>
          {def.entity.lines?.filter(Boolean).map((l, i) => (
            <div key={i} className="doc-entity-line">
              {l}
            </div>
          ))}
        </div>
      )}

      {(def.filters?.length || def.meta?.length) && (
        <div className="doc-meta-grid">
          {[...(def.meta ?? []), ...(def.filters ?? [])].map((m, i) => (
            <div key={i} className="doc-meta-item">
              <span className="doc-meta-label">{m.label}:</span> <span>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
