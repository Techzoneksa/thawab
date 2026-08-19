/**
 * Phase 4A.1 — server-search combobox for form pickers that must not download
 * their whole option set (suppliers, accounts, …).
 *
 * Behaviour:
 *  - Debounced (250 ms) server search via the injected `search(q)` fetcher.
 *  - Bounded: it only ever shows what the server returns (server caps at ≤50).
 *  - The current selection's label stays visible even after it scrolls out of a
 *    later search (kept in `selectedLabel`), so editing an existing record shows
 *    the right value without loading every option.
 *  - Keyboard/adaptive-free minimal footprint; matches the app's `inp` styling.
 */
import { useEffect, useRef, useState } from "react";

type Props<T> = {
  value: string;
  displayValue?: string; // label of the currently-selected value (edit mode)
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minChars?: number; // default 0 → empty query returns a default set
  search: (q: string) => Promise<{ items: T[] }>;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T | null) => void;
};

export function Combobox<T>({
  value,
  displayValue,
  placeholder = "ابحث…",
  disabled,
  className,
  minChars = 0,
  search,
  getId,
  getLabel,
  onSelect,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(displayValue || "");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  // Keep the shown label in sync when the parent supplies/refreshes it.
  useEffect(() => {
    if (displayValue !== undefined) setSelectedLabel(displayValue);
  }, [displayValue]);

  // Clear the shown label if the value is cleared externally.
  useEffect(() => {
    if (!value) setSelectedLabel("");
  }, [value]);

  // Debounced server search while open.
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < minChars) {
      setItems([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const my = ++reqId.current;
      setLoading(true);
      try {
        const res = await search(q.trim());
        if (my === reqId.current) setItems(res.items || []);
      } catch {
        if (my === reqId.current) setItems([]);
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, open, minChars, search]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(item: T) {
    setSelectedLabel(getLabel(item));
    onSelect(item);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      <input
        className="inp w-full"
        disabled={disabled}
        value={open ? q : selectedLabel}
        placeholder={selectedLabel || placeholder}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => {
          setOpen(true);
          setQ(e.target.value);
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-card shadow-lg">
          {value && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-right text-xs text-muted-foreground hover:bg-muted"
              onClick={() => {
                setSelectedLabel("");
                onSelect(null);
                setOpen(false);
                setQ("");
              }}
            >
              — مسح الاختيار —
            </button>
          )}
          {loading && <div className="px-3 py-2 text-sm text-muted-foreground">جارٍ البحث…</div>}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">لا نتائج</div>
          )}
          {!loading &&
            items.map((item) => (
              <button
                type="button"
                key={getId(item)}
                className="block w-full px-3 py-2 text-right text-sm hover:bg-muted"
                onClick={() => pick(item)}
              >
                {getLabel(item)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
