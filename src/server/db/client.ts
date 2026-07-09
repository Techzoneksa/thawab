// Database client adapter
// Detects DATABASE_URL and routes to either:
//   - PostgreSQL via synckit worker bridge (production)
//   - SQLite via @libsql/client worker bridge (local dev, when DATABASE_URL is missing or starts with `file:`)
// Both backends are async at the driver level, so we run each one in a separate
// thread (synckit) and expose a sync API to the rest of the app via Drizzle's
// SQL compilation. This keeps the 21+ route files unchanged.
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import postgres from "postgres";
import { createSyncFn } from "synckit";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as sqliteSchema from "./schema.sqlite";
import * as pgSchema from "./schema.pg";

const DB_PATH = "./data/thawab.db";
const DATABASE_URL = process.env.DATABASE_URL;
const SYNCKIT_TIMEOUT = 15_000;

type PgExec = (text: string, params?: any[]) => Promise<any[]>;
type LibSqlExec = (text: string, params?: any[]) => Promise<any[]>;

function isPgUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function isMysqlUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("mysql://") || url.startsWith("mysql2://");
}

function isFileUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("file:");
}

let _dialect: "postgres" | "sqlite";
let _db: any;
let _pgExecSync: ((text: string, params?: any[]) => any[]) | null = null;
let _libsqlExecSync: ((text: string, params?: any[]) => any[]) | null = null;
let _initialized = false;

function createPgSyncDb() {
  _pgExecSync = createSyncFn<PgExec>(
    new URL("./pg-worker.mjs", import.meta.url),
    SYNCKIT_TIMEOUT,
  );
  const realDb = drizzlePg(
    postgres(DATABASE_URL!, { max: 1, prepare: false }),
    { schema: pgSchema },
  );
  return wrapSync(realDb);
}

function createSqliteDb() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  _libsqlExecSync = createSyncFn<LibSqlExec>(
    new URL("./libsql-worker.mjs", import.meta.url),
    SYNCKIT_TIMEOUT,
  );
  // libsql drizzle is async — we only use it for SQL compilation via toSQL().
  const realDb = drizzleLibsql(createClient({ url: `file:${DB_PATH}` }), {
    schema: sqliteSchema,
  });
  return wrapSync(realDb);
}

function wrapSync(realDb: any) {
  // Map of underlying target -> proxy. Drizzle's builder methods (e.g.
  // `.limit()`, `.offset()`, `.where()`) return `this` from inside the
  // target, so we must remember the proxy for a target and hand the same
  // proxy back to the caller — otherwise the chain leaks out of the
  // wrapper and `.all()` returns a Promise instead of a sync array.
  const proxyCache = new WeakMap<object, any>();

  const wrap = (qb: any): any => {
    if (qb == null || (typeof qb !== "object" && typeof qb !== "function")) {
      return qb;
    }
    if (qb.__thawabProxy) return qb.__thawabProxy;
    const existing = proxyCache.get(qb);
    if (existing) return existing;

    const proxy = new Proxy(qb, {
      get(target, prop) {
        if (prop === "all") {
          return () => {
            try {
              if (typeof target.toSQL !== "function") {
                console.error("[db] query has no toSQL()");
                return [];
              }
              const compiled = target.toSQL();
              const execSync = _pgExecSync ?? _libsqlExecSync;
              if (!execSync) {
                console.error("[db] synckit not initialized");
                return [];
              }
              const result = execSync(compiled.sql, compiled.params ?? []);
              return Array.isArray(result) ? result : [];
            } catch (e) {
              console.error("[db] all() error:", e instanceof Error ? e.message : e);
              return [];
            }
          };
        }
        if (prop === "run") {
          return () => {
            try {
              if (typeof target.toSQL !== "function") return undefined;
              const compiled = target.toSQL();
              const execSync = _pgExecSync ?? _libsqlExecSync;
              if (!execSync) return undefined;
              execSync(compiled.sql, compiled.params ?? []);
            } catch (e) {
              console.error("[db] run() error:", e instanceof Error ? e.message : e);
            }
          };
        }
        if (prop === "get") {
          return () => {
            try {
              if (typeof target.toSQL !== "function") return undefined;
              const compiled = target.toSQL();
              const execSync = _pgExecSync ?? _libsqlExecSync;
              if (!execSync) return undefined;
              const result = execSync(compiled.sql, compiled.params ?? []);
              return Array.isArray(result) ? result[0] : undefined;
            } catch (e) {
              console.error("[db] get() error:", e instanceof Error ? e.message : e);
              return undefined;
            }
          };
        }

        const val = (target as any)[prop];

        if (typeof val === "function") {
          return (...args: any[]) => {
            const result = (val as Function).apply(target, args);
            return wrap(result);
          };
        }

        return val;
      },
    });

    proxyCache.set(qb, proxy);
    (proxy as any).__thawabProxy = proxy;
    return proxy;
  };

  return {
    select: (...args: any[]) => wrap(realDb.select(...args)),
    insert: (table: any) => wrap(realDb.insert(table)),
    update: (table: any) => wrap(realDb.update(table)),
    delete: (table: any) => wrap(realDb.delete(table)),
    _: realDb._,
  };
}

function ensureDb() {
  if (_initialized) return;
  _initialized = true;

  if (isMysqlUrl(DATABASE_URL)) {
    throw new Error(
      "MySQL is not supported in this build. Set DATABASE_URL to a PostgreSQL URL " +
        "(postgres://...) or leave it unset to use local SQLite for development.",
    );
  } else if (isPgUrl(DATABASE_URL)) {
    _dialect = "postgres";
    _db = createPgSyncDb();
  } else if (isFileUrl(DATABASE_URL)) {
    _dialect = "sqlite";
    _db = createSqliteDb();
  } else {
    _dialect = "sqlite";
    _db = createSqliteDb();
  }
}

export function getDb() {
  ensureDb();
  return _db;
}

export function getDialect() {
  ensureDb();
  return _dialect;
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export const dialect = new Proxy({} as any, {
  get() {
    return getDialect();
  },
});

export function runRawSql(sql: string) {
  ensureDb();
  const execSync = _pgExecSync ?? _libsqlExecSync;
  if (!execSync) throw new Error("synckit not initialized");
  execSync(sql);
}

export function getDrizzleSchemas() {
  ensureDb();
  return _dialect === "postgres" ? pgSchema : sqliteSchema;
}
