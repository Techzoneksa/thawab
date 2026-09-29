/**
 * Business-date normalization.
 *
 * Every stored business date (journal date, fiscal-period bounds…) is ISO
 * `YYYY-MM-DD`, and posting/period checks compare those strings directly. Input
 * from users and Excel arrives in other shapes, so normalize at the boundary and
 * REJECT anything that is not a real calendar date — never store a raw string
 * (a stored "10/02/2024" matches no period and yields a number like
 * "JV-10/0-00001").
 *
 * Accepted:
 *   2024-02-10 · 2024/02/10 · 2024-02-10T08:00:00Z      (year first)
 *   10/02/2024 · 10-02-2024 · 10.02.2024 · 1/2/2024     (DAY first — the
 *                                                        Saudi/Arabic convention;
 *                                                        never read month-first)
 *   45332                                                (Excel serial day number)
 *   Arabic-Indic digits (١٠/٠٢/٢٠٢٤) in any of the above.
 */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects impossible dates such as 31/02 (which Date would roll over).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeBusinessDate(input: unknown): string | null {
  if (input == null) return null;
  if (input instanceof Date) return isNaN(+input) ? null : input.toISOString().slice(0, 10);
  const s = toAsciiDigits(String(input)).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial (1900 date system; day 0 = 1899-12-30).
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}
