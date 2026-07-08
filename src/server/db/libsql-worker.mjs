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

const url = process.env.LIBSQL_URL || "file:./data/thawab.db";

const client = createClient({ url });

await client.execute("PRAGMA journal_mode = WAL;");
await client.execute("PRAGMA foreign_keys = ON;");

runAsWorker(async (text, params) => {
  const rs = await client.execute({ sql: text, args: params ?? [] });
  return rs.rows;
});
