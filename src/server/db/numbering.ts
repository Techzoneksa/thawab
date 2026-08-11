/**
 * Centralized, atomic document/entity numbering.
 *
 * Generates sequential human codes (PRJ-000001, CC-000001, INV-2026-000001, …).
 * Uses a Postgres advisory lock so concurrent creates never collide, then scans
 * the max existing code with the same prefix. Reusable for any table/column.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: any) => Promise<any> };

function keyFor(prefix: string): number {
  let h = 0;
  for (let i = 0; i < prefix.length; i++) h = (h * 31 + prefix.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
}

/**
 * Returns the next code for `table.column` with the given prefix.
 * MUST run inside the caller's transaction (advisory lock is transaction-scoped).
 * @example await nextCode(tx, { table: "projects", column: "code", prefix: "PRJ-" })
 */
export async function nextCode(
  tx: Db,
  opts: { table: string; column: string; prefix: string; pad?: number; year?: boolean },
): Promise<string> {
  const pad = opts.pad ?? 6;
  const year = opts.year ? `${new Date().getFullYear()}-` : "";
  const prefix = `${opts.prefix}${year}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${keyFor(prefix)})`);
  const col = sql.identifier(opts.column);
  const tbl = sql.identifier(opts.table);
  const like = `${prefix}%`;
  const res: any = await tx.execute(
    sql`SELECT ${col} AS code FROM ${tbl} WHERE ${col} LIKE ${like} ORDER BY ${col} DESC LIMIT 1`,
  );
  const rows = res?.rows ?? res ?? [];
  const last: string | undefined = rows[0]?.code;
  const seq = last ? (parseInt(String(last).slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(pad, "0")}`;
}
