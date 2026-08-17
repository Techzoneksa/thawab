import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let _cached: string | null = null;

/** Deployed application commit (short SHA), or "unknown". Stamped by postbuild. */
export function getAppCommit(): string {
  if (_cached) return _cached;
  if (process.env.APP_COMMIT) return (_cached = process.env.APP_COMMIT);
  for (const p of [
    resolve(process.cwd(), "commit.txt"),
    resolve(process.cwd(), "server", "commit.txt"),
  ]) {
    try {
      if (existsSync(p)) return (_cached = readFileSync(p, "utf8").trim() || "unknown");
    } catch {
      /* ignore */
    }
  }
  return (_cached = "unknown");
}
