// PostgreSQL worker — runs in a separate thread via synckit
// Receives query requests from main thread, executes async against PG, returns results
import { runAsWorker } from "synckit";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
});

runAsWorker(async (text, params) => {
  if (params && params.length > 0) {
    return await sql.unsafe(text, params);
  }
  return await sql.unsafe(text);
});
