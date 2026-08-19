/**
 * Phase 4A — bounded server-side pagination helper for operational list endpoints.
 *
 * No normal list may fetch tens of thousands of rows and paginate in React. Every
 * list clamps to a sane page size (default 25, hard max 200) so a caller can never
 * request `limit=1000000`. Exports are a separate concern (streaming/chunking) and
 * do NOT go through this helper.
 */
export const PAGE_DEFAULT = 25;
export const PAGE_MAX = 200;

export interface PageParams {
  page?: number | string | null;
  pageSize?: number | string | null;
  limit?: number | string | null; // alias for pageSize
  offset?: number | string | null;
}
export interface Page {
  page: number; // 1-based
  pageSize: number; // clamped [1, PAGE_MAX]
  limit: number; // = pageSize (for SQL)
  offset: number; // = (page-1)*pageSize
}

function toInt(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve + clamp page params. Accepts page/pageSize, limit/offset, or none. */
export function resolvePage(p: PageParams = {}): Page {
  const rawSize = p.pageSize ?? p.limit ?? PAGE_DEFAULT;
  const pageSize = Math.min(PAGE_MAX, Math.max(1, toInt(rawSize, PAGE_DEFAULT)));
  let page = Math.max(1, toInt(p.page ?? 1, 1));
  // Explicit offset wins when provided (keyset/deep-page callers).
  const offset =
    p.offset != null && p.offset !== "" ? Math.max(0, toInt(p.offset, 0)) : (page - 1) * pageSize;
  if (p.offset != null && p.offset !== "") page = Math.floor(offset / pageSize) + 1;
  return { page, pageSize, limit: pageSize, offset };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export function paginatedResult<T>(items: T[], total: number, pg: Page): Paginated<T> {
  return {
    items,
    page: pg.page,
    pageSize: pg.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pg.pageSize)),
  };
}
