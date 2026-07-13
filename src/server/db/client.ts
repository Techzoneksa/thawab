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
let _dialect: "postgres" | "sqlite" = "sqlite";
let _client: any = null;
let _db: any = null;

let _createClientFn: any = null;
let _drizzleLibsqlFn: any = null;
let _drizzlePgFn: any = null;
let _postgresFn: any = null;
let _loadError: Error | null = null;

{
  const start = Date.now();
  try {
    const [libsqlMod, drizzleSqliteMod, drizzlePgMod, pgMod] = await Promise.all([
      import("@libsql/client"),
      import("drizzle-orm/libsql"),
      import("drizzle-orm/postgres-js"),
      import("postgres"),
    ]);
    _createClientFn = (libsqlMod as any).createClient;
    _drizzleLibsqlFn = (drizzleSqliteMod as any).drizzle;
    _drizzlePgFn = (drizzlePgMod as any).drizzle;
    _postgresFn = (pgMod as any).default;
    console.log(`[db] packages loaded (${Date.now() - start}ms)`);
  } catch (e) {
    _loadError = e instanceof Error ? e : new Error(String(e));
    console.error("[db] package load error:", _loadError.message);
  }
}

async function ensureClient(): Promise<void> {
  if (_initialized) return;
  if (_loadError) throw _loadError;
  _initialized = true;
  if (isPgUrl(DATABASE_URL)) {
    _dialect = "postgres";
    _client = _postgresFn(DATABASE_URL!, { max: 1, prepare: false });
    _db = _drizzlePgFn(_client, { schema: pgSchema });
  } else {
    _dialect = "sqlite";
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    _client = _createClientFn({ url: `file:${DB_PATH}` });
    _db = _drizzleLibsqlFn(_client, { schema: sqliteSchema });
  }
  console.log(`[db] init OK dialect=${_dialect} path=${DB_PATH}`);
}

function createChainProxy(exec: () => Promise<any>, chain: Array<{ method: string; args: any[] }>): any {
  return new Proxy(() => {}, {
    apply(_target, _thisArg, args) {
      chain[chain.length - 1].args = args;
      return makeNextLink(exec, chain);
    },
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: any, reject: any) => exec().then(resolve, reject);
      }
      chain.push({ method: prop as string, args: [] });
      return createChainProxy(exec, chain);
    },
  });
}

function makeNextLink(exec: () => Promise<any>, chain: Array<{ method: string; args: any[] }>): any {
  return new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: any, reject: any) => exec().then(resolve, reject);
      }
      chain.push({ method: prop as string, args: [] });
      return createChainProxy(exec, chain);
    },
  });
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    if (_initialized) {
      return _db?.[prop];
    }
    const chain: Array<{ method: string; args: any[] }> = [{ method: prop as string, args: [] }];
    const exec = async () => {
      await ensureClient();
      let result = (_db as any)[chain[0].method](...(chain[0].args || []));
      for (let i = 1; i < chain.length; i++) {
        result = result[chain[i].method](...(chain[i].args || []));
      }
      return result;
    };
    return createChainProxy(exec, chain);
  },
});

export async function getDb() {
  await ensureClient();
  return _db;
}

export async function getDialect() {
  await ensureClient();
  return _dialect;
}

export const dialect = new Proxy({} as any, {
  get() {
    return _dialect;
  },
});

export async function runRawSql(sql: string) {
  await ensureClient();
  if (_dialect === "sqlite") {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await _client.execute(stmt);
    }
  } else {
    await _client.unsafe(sql);
  }
}

export async function diagnose() {
  try {
    await ensureClient();
  } catch (e) {
    return {
      error: "init_failed",
      message: e instanceof Error ? e.message : String(e),
      dbPath: DB_PATH,
      dbUrl: DATABASE_URL || "none (sqlite)",
      dbExists: existsSync(DB_PATH),
      dbSize: existsSync(DB_PATH) ? statSync(DB_PATH).size : 0,
    };
  }
  const info: Record<string, any> = {
    dialect: _dialect,
    dbPath: DB_PATH,
    dbUrl: DATABASE_URL || "none (sqlite)",
  };
  try {
    info.dbExists = existsSync(DB_PATH);
    if (info.dbExists) info.dbSize = statSync(DB_PATH).size;
  } catch {}
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
  } catch {}
  return info;
}

export function getDrizzleSchemas() {
  return _dialect === "postgres" ? pgSchema : sqliteSchema;
}
