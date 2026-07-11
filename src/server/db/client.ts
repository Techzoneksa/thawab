import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import postgres from "postgres";
import { existsSync, mkdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import * as sqliteSchema from "./schema.sqlite";
import * as pgSchema from "./schema.pg";

const DB_PATH = resolve("./data/thawab.db");
const DATABASE_URL = process.env.DATABASE_URL;

function isPgUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

let _initialized = false;
let _dialect: "postgres" | "sqlite";
let _client: any;
let _db: any;

function ensureClient() {
  if (_initialized) return;
  _initialized = true;
  if (isPgUrl(DATABASE_URL)) {
    _dialect = "postgres";
    _client = postgres(DATABASE_URL!, { max: 1, prepare: false });
    _db = drizzlePg(_client, { schema: pgSchema });
  } else {
    _dialect = "sqlite";
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    _client = createClient({ url: `file:${DB_PATH}` });
    _db = drizzle(_client, { schema: sqliteSchema });
  }
}

export function getDb() {
  ensureClient();
  return _db;
}

export function getDialect() {
  ensureClient();
  return _dialect;
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    ensureClient();
    return (_db as any)[prop];
  },
});

export const dialect = new Proxy({} as any, {
  get() {
    ensureClient();
    return _dialect;
  },
});

export async function runRawSql(sql: string) {
  ensureClient();
  if (_dialect === "sqlite") {
    await _client.execute(sql);
  } else {
    await _client.unsafe(sql);
  }
}

export async function diagnose() {
  ensureClient();
  const info: Record<string, any> = {
    dialect: _dialect,
    dbPath: DB_PATH,
    dbUrl: DATABASE_URL || "none (sqlite)",
  };
  try {
    info.dbExists = existsSync(DB_PATH);
    if (info.dbExists) info.dbSize = statSync(DB_PATH).size;
  } catch { }
  try {
    if (_db && _dialect === "sqlite") {
      const tables = await _client.execute("SELECT count(*) as c FROM sqlite_master WHERE type='table'");
      info.tableCount = tables.rows?.[0]?.c ?? null;
      const users = await _client.execute("SELECT count(*) as c FROM users");
      info.userCount = users.rows?.[0]?.c ?? null;
      const accounts = await _client.execute("SELECT count(*) as c FROM accounts");
      info.accountCount = accounts.rows?.[0]?.c ?? null;
      const donors = await _client.execute("SELECT count(*) as c FROM donors");
      info.donorCount = donors.rows?.[0]?.c ?? null;
      const projects = await _client.execute("SELECT count(*) as c FROM projects");
      info.projectCount = projects.rows?.[0]?.c ?? null;
    }
  } catch { }
  return info;
}

export function getDrizzleSchemas() {
  ensureClient();
  return _dialect === "postgres" ? pgSchema : sqliteSchema;
}
