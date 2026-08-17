import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Build-time constant injected by Vite `define` (see vite.config.ts). It is a
// string literal in the compiled bundle, so it needs no filesystem, no cwd, and
// no `.git` at runtime. Declared here so TypeScript/tsx (where the define is not
// applied) type-check and fall through the `typeof` guard cleanly.
declare const __APP_COMMIT__: string | undefined;

let _cached: string | null = null;

/** Candidate directories to probe for a commit-stamp file, cwd- and module-relative. */
function stampDirs(): string[] {
  const dirs = [process.cwd(), resolve(process.cwd(), "server")];
  try {
    // Anchor to this module's own location so it resolves inside the deployed
    // server bundle even when the process cwd is not the repo/mirror root.
    const here = dirname(fileURLToPath(import.meta.url));
    dirs.push(
      here,
      resolve(here, ".."),
      resolve(here, "..", ".."),
      resolve(here, "..", "..", ".."),
    );
  } catch {
    /* import.meta.url unavailable (non-ESM context) — cwd candidates only */
  }
  return dirs;
}

/**
 * Deployed application commit (short SHA), or "unknown".
 *
 * Resolution order (first hit wins), designed to survive any deployment layout:
 *   1. `__APP_COMMIT__` — baked into the bundle at build time (primary).
 *   2. `APP_COMMIT` env var — platform/runtime override.
 *   3. `commit.txt` next to cwd or the module (shipped by postbuild).
 *   4. "unknown".
 */
export function getAppCommit(): string {
  if (_cached) return _cached;
  if (typeof __APP_COMMIT__ === "string" && __APP_COMMIT__) return (_cached = __APP_COMMIT__);
  if (process.env.APP_COMMIT) return (_cached = process.env.APP_COMMIT.trim());
  for (const d of stampDirs()) {
    const p = resolve(d, "commit.txt");
    try {
      if (existsSync(p)) {
        const v = readFileSync(p, "utf8").trim();
        if (v) return (_cached = v);
      }
    } catch {
      /* ignore unreadable candidate */
    }
  }
  return (_cached = "unknown");
}
