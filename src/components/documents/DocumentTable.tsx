import { currency, type DocumentDefinition } from "@/lib/documents/types";

function cell(value: unknown, type?: string) {
  if (value == null || value === "") return "";
  if (type === "money") return currency(Number(value));
  if (type === "number") return new Intl.NumberFormat("ar-SA").format(Number(value));
  if (type === "date") return String(value).slice(0, 10);
  return String(value);
}

/** Print-safe data table. `<thead>` repeats on every printed page. */
export function DocumentTable({ def }: { def: DocumentDefinition }) {
  return (
    <table className="doc-table">
      <thead>
        <tr>
          {def.columns.map((c) => (
            <th key={c.key} style={{ width: c.width, textAlign: c.align ?? "start" }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {def.rows.length === 0 ? (
          <tr>
            <td colSpan={def.columns.length} className="doc-empty">
              لا توجد بيانات
            </td>
          </tr>
        ) : (
          def.rows.map((r, i) => (
            <tr key={i}>
              {def.columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? (c.type === "money" || c.type === "number" ? "end" : "start") }}
                  className={c.type === "money" || c.type === "number" ? "doc-num" : ""}
                >
                  {cell(r[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
