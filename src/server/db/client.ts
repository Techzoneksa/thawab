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
import { getCurrentTenant } from "./tenant-context";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail loud and early — there is no SQLite fallback anymore.
  console.error("[db] FATAL: DATABASE_URL is not set. Set it to a PostgreSQL connection string.");
}

/**
 * Shared postgres-js pool options — applied identically to the default pool and
 * to every per-tenant pool. Pooler resilience: with a transaction pooler (e.g.
 * Supabase/Neon pgBouncer) the client can hold a connection the pooler already
 * closed (a "half-open" socket) — the next query then hangs until the OS TCP
 * timeout, which looks like an approve/post spinning forever. These options make
 * the client proactively recycle connections so it never reuses a dead one, and
 * fail fast instead of hanging:
 *  - idle_timeout    : close an idle connection after 20s (before the pooler's
 *    own idle cutoff) so stale sockets are never reused.
 *  - max_lifetime    : recycle any connection after ~30 min regardless.
 *  - connect_timeout : give up connecting after 15s instead of hanging.
 * The per-connection GUCs (lock_timeout, idle_in_transaction_session_timeout)
 * make a statement waiting for a lock abort after 15s and a transaction left
 * idle for 60s be terminated, so locks self-heal.
 */
function poolOptions(max: number): Parameters<typeof postgres>[1] {
  return {
    max,
    prepare: false,
    onnotice: () => {},
    idle_timeout: 20, // seconds
    max_lifetime: 60 * 30, // seconds
    connect_timeout: 15, // seconds
    connection: {
      lock_timeout: 15000, // ms
      idle_in_transaction_session_timeout: 60000, // ms
    },
  };
}

let _sql: ReturnType<typeof postgres> | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function client() {
  if (!_sql) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    _sql = postgres(DATABASE_URL, poolOptions(10));
  }
  return _sql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(client(), { schema });
  }
  return _db;
}

/**
 * Per-tenant connection pools, cached by connection string. Each tenant keeps a
 * small pool (idle connections auto-close via idle_timeout, so an idle tenant on
 * Neon costs ~nothing). Created lazily on first use.
 */
const _tenantPools = new Map<string, PostgresJsDatabase<typeof schema>>();

function tenantDbFor(databaseUrl: string): PostgresJsDatabase<typeof schema> {
  let d = _tenantPools.get(databaseUrl);
  if (!d) {
    d = drizzle(postgres(databaseUrl, poolOptions(5)), { schema });
    _tenantPools.set(databaseUrl, d);
  }
  return d;
}

/**
 * The drizzle handle for the CURRENT request: the bound tenant's database when a
 * tenant is in scope (multi-tenant), otherwise the default DATABASE_URL.
 */
function activeDb(): PostgresJsDatabase<typeof schema> {
  const tenant = getCurrentTenant();
  return tenant?.databaseUrl ? tenantDbFor(tenant.databaseUrl) : getDb();
}

/**
 * The drizzle db handle. Import this and await query builders directly.
 *
 * It is a Proxy that transparently forwards to `activeDb()` on every access, so
 * the ~80 modules that `import { db }` need no change: in single-tenant mode it
 * is the default database; inside a tenant-bound request it is that tenant's
 * database. Being a Proxy also makes it lazy — importing this module no longer
 * opens a connection, so a multi-tenant deployment need not set a default
 * DATABASE_URL at all.
 */
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop) {
      const real = activeDb() as unknown as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === "function" ? value.bind(real) : value;
    },
  },
);

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
  // Tenant pools: drizzle wraps the postgres client on `.$client`; end each.
  for (const d of _tenantPools.values()) {
    const raw = (d as unknown as { $client?: { end?: (o?: unknown) => Promise<void> } }).$client;
    if (raw?.end) await raw.end({ timeout: 5 });
  }
  _tenantPools.clear();
}
