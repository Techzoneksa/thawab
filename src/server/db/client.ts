/**
 * PostgreSQL database client (Postgres-only).
 *
 * A single lazily-initialized drizzle instance backed by postgres-js.
 * No dual-dialect, no proxy chain — query builders are awaited directly
 * (drizzle postgres-js has no .all()/.run()/.get()).
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail loud and early — there is no SQLite fallback anymore.
  console.error(
    "[db] FATAL: DATABASE_URL is not set. Set it to a PostgreSQL connection string.",
  );
}

let _sql: ReturnType<typeof postgres> | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function client() {
  if (!_sql) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    _sql = postgres(DATABASE_URL, {
      max: 10,
      prepare: false,
      onnotice: () => {},
    });
  }
  return _sql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(client(), { schema });
  }
  return _db;
}

/** The drizzle db handle. Import this and await query builders directly. */
export const db = getDb();

/** Raw SQL escape hatch — TRUSTED (migration) input only, never user data. */
export async function runRawSql(sql: string) {
  await client().unsafe(sql);
}

export async function diagnose() {
  // Intentionally does NOT return DATABASE_URL or any secret.
  const info: Record<string, unknown> = { dialect: "postgres", configured: !!DATABASE_URL };
  try {
    const rows = await client()<{ c: string }[]>`
      SELECT count(*)::text AS c FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    info.tableCount = Number(rows[0]?.c ?? 0);
    info.ok = true;
  } catch (e) {
    info.ok = false;
    info.error = e instanceof Error ? e.message : String(e);
  }
  return info;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}
