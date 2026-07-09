// SQLite (libsql) worker — runs in a separate thread via synckit.
// Receives query requests from main thread, executes async against the local
// SQLite file via @libsql/client, returns results.
//
// @libsql/client ships prebuilt binaries (libsql@^0.5.28) — no Python/node-gyp
// compilation is required at deploy time. This is the local-dev fallback for
// environments where `better-sqlite3` cannot be compiled (Hostinger's
// Python 3.6.8 + old GLIBC).
import { runAsWorker } from "synckit";
import { createClient } from "@libsql/client";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync } from "node:fs";

function resolveDbPath() {
  const envUrl = process.env.LIBSQL_URL;
  if (envUrl) return envUrl;
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "data", "thawab.db");
    if (existsSync(candidate)) {
      return `file:${candidate.replace(/\\/g, "/")}`;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return `file:${resolve(here, "..", "..", "data", "thawab.db").replace(/\\/g, "/")}`;
}

const url = resolveDbPath();

const client = createClient({ url });

// IMPORTANT: runAsWorker MUST be called before any top-level await.
// synckit's createSyncFn() blocks the main thread with Atomics.wait()
// until runAsWorker signals readiness. If we await PRAGMA before
// runAsWorker, the main thread deadlocks waiting for a signal that
// never comes.
// libsql's `execute()` only runs a single statement per call. When the
// caller (Drizzle's runRawSql) sends a multi-statement SQL string we
// split on `;` and run each statement individually so the entire
// bootstrap DDL executes end-to-end.
function splitStatements(text) {
  return text
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--|\/\*)/.test(s));
}

// Register the worker FIRST so createSyncFn() in the main thread
// can complete. The PRAGMA initialization below runs after the
// worker is already listening for messages.
runAsWorker(async (text, params) => {
  const statements = splitStatements(text);
  if (statements.length > 1) {
    const allRows = [];
    for (const stmt of statements) {
      const rs = await client.execute({ sql: stmt, args: params ?? [] });
      if (rs.rows?.length) allRows.push(...rs.rows);
    }
    return allRows;
  }
  const rs = await client.execute({ sql: text, args: params ?? [] });
  return rs.rows;
});

// Background initialization — runs after the worker is ready
await client.execute("PRAGMA journal_mode = WAL;");
await client.execute("PRAGMA foreign_keys = ON;");
