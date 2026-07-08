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

function createPgSyncDb() {
  _pgExecSync = createSyncFn<PgExec>(
    new URL("./pg-worker.mjs", import.meta.url),
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
  );
  // libsql drizzle is async — we only use it for SQL compilation via toSQL().
  const realDb = drizzleLibsql(createClient({ url: `file:${DB_PATH}` }), {
    schema: sqliteSchema,
  });
  return wrapSync(realDb);
}

function wrapSync(realDb: any) {
  const execSync = _pgExecSync ?? _libsqlExecSync;
  const wrap = (qb: any) => {
    if (!qb || typeof qb !== "object" || typeof qb.toSQL !== "function") {
      return qb;
    }
    return new Proxy(qb, {
      get(target, prop) {
        if (prop === "all") {
          return () => {
            const compiled = target.toSQL();
            const result = execSync!(compiled.sql, compiled.params ?? []);
            return Array.isArray(result) ? result : [];
          };
        }
        if (prop === "run") {
          return () => {
            const compiled = target.toSQL();
            execSync!(compiled.sql, compiled.params ?? []);
          };
        }
        if (prop === "get") {
          return () => {
            const compiled = target.toSQL();
            const result = execSync!(compiled.sql, compiled.params ?? []);
            return Array.isArray(result) ? result[0] : undefined;
          };
        }

        const val = target[prop as keyof typeof target];

        if (typeof val === "function") {
          return (...args: any[]) => {
            const result = (val as Function).apply(target, args);
            return wrap(result);
          };
        }

        return val;
      },
    });
  };

  return {
    select: (...args: any[]) => wrap(realDb.select(...args)),
    insert: (table: any) => wrap(realDb.insert(table)),
    update: (table: any) => wrap(realDb.update(table)),
    delete: (table: any) => wrap(realDb.delete(table)),
    _: realDb._,
  };
}

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

export const dialect = _dialect;
export const db = _db;

export function runRawSql(sql: string) {
  if (_dialect === "sqlite") {
    if (!_libsqlExecSync) throw new Error("libsql synckit not initialized");
    _libsqlExecSync(sql);
  } else if (_dialect === "postgres") {
    if (!_pgExecSync) throw new Error("pg synckit not initialized");
    _pgExecSync(sql);
  }
}

export function getDrizzleSchemas() {
  return _dialect === "postgres" ? pgSchema : sqliteSchema;
}
