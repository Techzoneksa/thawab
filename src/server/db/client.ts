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
  console.error("[db] FATAL: DATABASE_URL is not set. Set it to a PostgreSQL connection string.");
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
      // Pooler resilience: with a transaction pooler (e.g. Supabase pgBouncer)
      // the client can hold a connection that the pooler has already closed
      // (a "half-open" socket) — the next query on it then hangs until the OS
      // TCP timeout, which looks like an approve/post that spins forever. These
      // options make the client proactively recycle connections so it never
      // reuses a dead one, and fail fast instead of hanging:
      //  - idle_timeout : close an idle connection after 20s (well before the
      //    pooler's own idle cutoff) so stale sockets are never reused.
      //  - max_lifetime : recycle any connection after ~30 min regardless.
      //  - connect_timeout : give up connecting after 15s instead of hanging.
      idle_timeout: 20, // seconds
      max_lifetime: 60 * 30, // seconds
      connect_timeout: 15, // seconds
      // Also set the server-side timeouts per connection. The transaction pooler
      // may drop these startup GUCs (they are additionally enforced at the DB
      // level via `ALTER DATABASE ... SET`), but they apply on a direct
      // connection: a statement WAITING for a lock aborts after 15s, and a
      // transaction left idle for 60s is terminated so locks self-heal.
      connection: {
        lock_timeout: 15000, // ms
        idle_in_transaction_session_timeout: 60000, // ms
      },
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
