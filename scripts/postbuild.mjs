import { mkdir, cp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceServer = resolve(root, ".output/server");
const sourcePublic = resolve(root, ".output/public");
const targetServer = resolve(root, "server");
const targetPublic = resolve(root, "public");

if (!existsSync(sourceServer)) {
  console.error(`[postbuild] missing ${sourceServer}. Run \`npm run build\` first.`);
  process.exit(1);
}

// Resolve the build commit (same rule as vite.config.ts / getAppCommit).
let commit = process.env.APP_COMMIT || "";
if (!commit) {
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    /* no git in build env — leave blank; bundle still carries the baked constant */
  }
}

// Make the CANONICAL Nitro artifact (.output/server) self-contained FIRST, so
// whichever entry the host launches — `.output/server/index.mjs` (Nitro's
// serverEntry) or the repo-root `server/index.mjs` mirror — finds migrations
// and the commit stamp next to the bundle, independent of process.cwd().
// (Root cause of the production "commit unknown / migrations MISSING" blockers:
// these files previously lived only in the repo-root mirror.)
const sourceDrizzle = resolve(root, "drizzle");
if (existsSync(sourceDrizzle)) {
  await cp(sourceDrizzle, resolve(sourceServer, "drizzle"), { recursive: true });
  console.log(`[postbuild] embedded migrations in ${sourceServer}/drizzle/`);
}
if (commit) {
  await writeFile(resolve(sourceServer, "commit.txt"), commit);
  console.log(`[postbuild] stamped commit ${commit} in ${sourceServer}/commit.txt`);
}

// Mirror the (now self-contained) server bundle to the repo root so Node hosts
// that auto-detect `node server/index.mjs` boot without a wrapper. The mirror
// inherits drizzle/ and commit.txt from the source above.
await rm(targetServer, { recursive: true, force: true });
await mkdir(targetServer, { recursive: true });
await cp(sourceServer, targetServer, { recursive: true });

if (existsSync(sourcePublic)) {
  await rm(targetPublic, { recursive: true, force: true });
  await mkdir(targetPublic, { recursive: true });
  await cp(sourcePublic, targetPublic, { recursive: true });
}

console.log(`[postbuild] mirrored server bundle to ${targetServer}/`);
if (existsSync(sourcePublic)) {
  console.log(`[postbuild] mirrored static assets to ${targetPublic}/`);
}
