import type { ReactNode } from "react";
import type { DocumentDefinition } from "@/lib/documents/types";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentTable } from "./DocumentTable";
import { DocumentTotals } from "./DocumentTotals";
import { DocumentFooter } from "./DocumentFooter";

/** Styles are inlined so the print window / preview are fully self-contained. */
export const DOC_STYLES = `
.thawab-doc{background:#fff;color:#111;font-family:'Tajawal','IBM Plex Sans Arabic',sans-serif;
  direction:rtl;box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:14mm 12mm 18mm;
  position:relative;font-size:12px;line-height:1.6}
.thawab-doc.landscape{width:297mm;min-height:210mm}
.thawab-doc *{box-sizing:border-box}
.doc-header{border-bottom:2px solid #1f2937;padding-bottom:8px;margin-bottom:10px}
.doc-org{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.doc-org-brand{display:flex;align-items:center;gap:10px}
.doc-logo{width:52px;height:52px;object-fit:contain;border-radius:8px}
.doc-logo-fallback{display:flex;align-items:center;justify-content:center;background:#1f2937;color:#fff;font-weight:800;font-size:16px}
.doc-org-name{font-size:16px;font-weight:800}
.doc-org-name-en{font-size:10px;color:#6b7280;direction:ltr;text-align:right}
.doc-org-meta{font-size:10px;color:#374151;text-align:left;direction:rtl}
.doc-title-row{text-align:center;margin:10px 0 6px}
.doc-title{font-size:18px;font-weight:800;margin:0}
.doc-subtitle{font-size:12px;color:#6b7280}
.doc-title-meta{display:flex;gap:16px;justify-content:center;font-size:11px;color:#374151;margin-top:4px}
.doc-entity{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin:8px 0}
.doc-entity-name{font-weight:700}
.doc-entity-line{font-size:10px;color:#6b7280}
.doc-meta-grid{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;margin:6px 0}
.doc-meta-label{color:#6b7280}
.doc-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
.doc-table th{background:#1f2937;color:#fff;padding:6px 8px;text-align:start;font-weight:600;border:1px solid #1f2937}
.doc-table td{padding:5px 8px;border:1px solid #e5e7eb}
.doc-table tbody tr:nth-child(even){background:#f9fafb}
.doc-num{font-variant-numeric:tabular-nums;font-family:'Tajawal',sans-serif}
.doc-empty{text-align:center;color:#9ca3af;padding:18px}
.doc-totals{margin-top:10px;margin-inline-start:auto;width:320px;max-width:100%}
.doc-total-row{display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #e5e7eb}
.doc-total-strong{background:#f3f4f6;font-weight:800;border-top:2px solid #1f2937;border-bottom:2px solid #1f2937}
.doc-footer{margin-top:14px}
.doc-notes{font-size:10px;color:#374151;border-top:1px dashed #d1d5db;padding-top:6px}
.doc-notes-label{color:#6b7280}
.doc-sign{display:flex;justify-content:space-around;gap:12px;margin-top:22px}
.doc-sign-box{border-top:1px solid #9ca3af;padding-top:4px;font-size:10px;color:#6b7280;min-width:120px;text-align:center}
.doc-footer-bar{display:flex;justify-content:space-between;font-size:9px;color:#9ca3af;border-top:1px solid #e5e7eb;margin-top:10px;padding-top:6px}
@media print{
  @page{size:A4 portrait;margin:12mm}
  @page landscape{size:A4 landscape}
  html,body{background:#fff !important}
  body *{visibility:hidden}
  .thawab-doc,.thawab-doc *{visibility:visible}
  .thawab-doc{position:absolute;inset:0;width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
  .doc-table thead{display:table-header-group}
  .doc-table tr{break-inside:avoid}
}
`;

export function DocumentLayout({ def, children }: { def: DocumentDefinition; children?: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DOC_STYLES }} />
      <div className={`thawab-doc ${def.orientation === "landscape" ? "landscape" : ""}`}>
        <DocumentHeader def={def} />
        <main className="doc-body">{children ?? <DocumentTable def={def} />}</main>
        <DocumentTotals def={def} />
        <DocumentFooter def={def} />
      </div>
    </>
  );
}
