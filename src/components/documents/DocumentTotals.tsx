import { currency, type DocumentDefinition } from "@/lib/documents/types";

export function DocumentTotals({ def }: { def: DocumentDefinition }) {
  if (!def.totals?.length) return null;
  return (
    <div className="doc-totals">
      {def.totals.map((t, i) => (
        <div key={i} className={`doc-total-row ${t.strong ? "doc-total-strong" : ""}`}>
          <span className="doc-total-label">{t.label}</span>
          <span className="doc-total-value doc-num">
            {t.type === "number"
              ? new Intl.NumberFormat("ar-SA-u-nu-latn").format(Number(t.value || 0))
              : currency(Number(t.value || 0))}
          </span>
        </div>
      ))}
    </div>
  );
}
