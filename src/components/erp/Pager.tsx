/**
 * Phase 4A.1 — shared, reachable pagination control for bounded server lists.
 *
 * The server clamps every list to ≤200 rows; this makes rows beyond the first
 * page actually reachable (Prev/Next + First/Last + "page X of Y • N records").
 * It renders nothing when there is a single page. Label is unit-aware (Arabic).
 */
type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  unit?: string; // e.g. "قيد", "فاتورة" — defaults to "سجل"
  onPage: (page: number) => void;
  className?: string;
};

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  unit = "سجل",
  onPage,
  className,
}: Props) {
  if (totalPages <= 1) return null;
  const btn =
    "px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 min-h-[36px]";
  const from = pageSize ? (page - 1) * pageSize + 1 : undefined;
  const to = pageSize ? Math.min(total, page * pageSize) : undefined;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 mt-3 px-1 ${className || ""}`}
    >
      <span className="text-xs text-muted-foreground">
        صفحة {fmt(page)} من {fmt(totalPages)} • {fmt(total)} {unit}
        {from && to ? ` • عرض ${fmt(from)}–${fmt(to)}` : ""}
      </span>
      <div className="flex gap-1">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(1)} title="الأولى">
          «
        </button>
        <button className={btn} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
          السابق
        </button>
        <button
          className={btn}
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          التالي
        </button>
        <button
          className={btn}
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          title="الأخيرة"
        >
          »
        </button>
      </div>
    </div>
  );
}
