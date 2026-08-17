/**
 * Build-time stale-commit test.
 *
 * Verifies the commit stamp written into the deploy bundle (server/commit.txt)
 * matches the actual built git HEAD. A mismatch means the bundle would report a
 * different runtime commit than the code it actually contains — which would let
 * a certificate attach to the wrong commit. Fails (exit 1) on any mismatch or
 * missing stamp.
 *
 * Usage:  node scripts/check-commit-stamp.mjs
 *         node scripts/check-commit-stamp.mjs --expect <sha>   (test override)
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function head() {
  const i = process.argv.indexOf("--expect");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1].trim();
  return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
}

const stampPath = resolve(root, "server", "commit.txt");
const gitHead = head();
const stamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : "";
const match = !!stamp && stamp === gitHead;

console.log(`Git HEAD:     ${gitHead}`);
console.log(`Commit Stamp: ${stamp || "(missing)"}`);
console.log(`Match:        ${match ? "YES" : "NO"}`);

if (!match) {
  console.error(
    "[check-commit-stamp] FAIL — server/commit.txt does not match built HEAD. " +
      "Run `npm run build` at the current commit before deploying/certifying.",
  );
  process.exit(1);
}
console.log("[check-commit-stamp] OK");
