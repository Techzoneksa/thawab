import { getOrg } from "@/lib/documents/org";
import type { DocumentDefinition } from "@/lib/documents/types";

export function DocumentFooter({ def }: { def: DocumentDefinition }) {
  const org = getOrg();
  return (
    <footer className="doc-footer">
      {def.notes && (
        <div className="doc-notes">
          <span className="doc-notes-label">ملاحظات:</span> {def.notes}
        </div>
      )}
      {def.signature && (
        <div className="doc-sign">
          <div className="doc-sign-box">المعِد</div>
          <div className="doc-sign-box">المراجع</div>
          <div className="doc-sign-box">المدير المالي</div>
        </div>
      )}
      <div className="doc-footer-bar">
        <span>{[org.nameAr, org.phone, org.email, org.website].filter(Boolean).join(" · ")}</span>
        <span className="doc-generated">
          صدر في {new Date().toLocaleString("ar-SA", { hour12: false })}
        </span>
      </div>
    </footer>
  );
}
