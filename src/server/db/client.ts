import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import postgres from "postgres";
import { createSyncFn } from "synckit";
import { existsSync, mkdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import * as sqliteSchema from "./schema.sqlite";
import * as pgSchema from "./schema.pg";

const DB_PATH = resolve("./data/thawab.db");
const DATABASE_URL = process.env.DATABASE_URL;
const SYNCKIT_TIMEOUT = 15_000;

type PgExec = (text: string, params?: any[]) => Promise<any[]>;

function isPgUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function isMysqlUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("mysql://") || url.startsWith("mysql2://");
}

let _dialect: "postgres" | "sqlite";
let _db: any;
let _pgExecSync: ((text: string, params?: any[]) => any[]) | null = null;
let _initialized = false;

function diagnose() {
  const info: Record<string, any> = {
    dialect: _dialect,
    initialized: _initialized,
    dbPath: DB_PATH,
    dbUrl: DATABASE_URL || "none (sqlite)",
  };
  try {
    info.dbExists = existsSync(DB_PATH);
    if (info.dbExists) info.dbSize = statSync(DB_PATH).size;
  } catch { info.dbStatError = "failed"; }
  try {
    if (_db && _dialect === "sqlite") {
      const native = (_db as any).__native;
      if (native) {
        info.tableCount = native.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get()?.c;
        info.userCount = native.prepare("SELECT count(*) as c FROM users").get()?.c;
        info.accountCount = native.prepare("SELECT count(*) as c FROM accounts").get()?.c;
        info.donorCount = native.prepare("SELECT count(*) as c FROM donors").get()?.c;
        info.projectCount = native.prepare("SELECT count(*) as c FROM projects").get()?.c;
      }
    }
  } catch {}
  return info;
}

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
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const native = new Database(DB_PATH);
  native.pragma("journal_mode = WAL");
  native.pragma("foreign_keys = ON");

  const realDb = drizzleSqlite(native, { schema: sqliteSchema });

  const wrapped = wrapSync(realDb);
  (wrapped as any).__native = native;
  return wrapped;
}

function wrapSync(realDb: any) {
  const proxyCache = new WeakMap<object, any>();

  const wrap = (qb: any): any => {
    if (qb == null || (typeof qb !== "object" && typeof qb !== "function")) return qb;
    if (qb.__thawabProxy) return qb.__thawabProxy;
    const existing = proxyCache.get(qb);
    if (existing) return existing;

    const proxy = new Proxy(qb, {
      get(target, prop) {
        if (prop === "all") {
          return () => {
            try {
              if (typeof target.toSQL !== "function") return [];
              const compiled = target.toSQL();
              if (_dialect === "sqlite") {
                const native = (_db as any).__native;
                if (!native) return [];
                const stmt = native.prepare(compiled.sql);
                const rows = compiled.params?.length ? stmt.all(...compiled.params) : stmt.all();
                return rows;
              }
              const execSync = _pgExecSync;
              if (!execSync) return [];
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
              if (_dialect === "sqlite") {
                const native = (_db as any).__native;
                if (!native) return undefined;
                const stmt = native.prepare(compiled.sql);
                if (compiled.params?.length) stmt.run(...compiled.params);
                else stmt.run();
                return undefined;
              }
              const execSync = _pgExecSync;
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
              if (_dialect === "sqlite") {
                const native = (_db as any).__native;
                if (!native) return undefined;
                const stmt = native.prepare(compiled.sql);
                const row = compiled.params?.length ? stmt.get(...compiled.params) : stmt.get();
                return row || undefined;
              }
              const execSync = _pgExecSync;
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
      "MySQL is not supported. Set DATABASE_URL to postgres:// or leave unset for SQLite.",
    );
  } else if (isPgUrl(DATABASE_URL)) {
    _dialect = "postgres";
    _db = createPgSyncDb();
  } else {
    _dialect = "sqlite";
    _db = createSqliteDb();
  }
  const d = diagnose();
  console.log("[db] initialized:", JSON.stringify(d));
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
  if (_dialect === "sqlite") {
    const native = (_db as any).__native;
    if (!native) throw new Error("sqlite not initialized");
    native.exec(sql);
    return;
  }
  const execSync = _pgExecSync;
  if (!execSync) throw new Error("synckit not initialized");
  execSync(sql);
}

export function getDrizzleSchemas() {
  ensureDb();
  return _dialect === "postgres" ? pgSchema : sqliteSchema;
}

export { diagnose };
