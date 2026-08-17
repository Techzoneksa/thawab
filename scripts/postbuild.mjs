import { copyFile, mkdir, cp, rm, writeFile } from "node:fs/promises";
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

// Wipe and recreate the mirror so deleted/changed chunks are not left
// behind in `server/` from a previous build.
await rm(targetServer, { recursive: true, force: true });
await mkdir(targetServer, { recursive: true });
await cp(sourceServer, targetServer, { recursive: true });

if (existsSync(sourcePublic)) {
  await rm(targetPublic, { recursive: true, force: true });
  await mkdir(targetPublic, { recursive: true });
  await cp(sourcePublic, targetPublic, { recursive: true });
}

// Ship the drizzle migration files inside the server bundle so runtime
// auto-migrate can find them even when the deploy only includes `server/`
// (not the repo root). ensureInit() checks `server/drizzle` as a candidate.
const sourceDrizzle = resolve(root, "drizzle");
if (existsSync(sourceDrizzle)) {
  const targetDrizzle = resolve(targetServer, "drizzle");
  await cp(sourceDrizzle, targetDrizzle, { recursive: true });
  console.log(`[postbuild] copied migrations to ${targetDrizzle}/`);
}

// Stamp the deployed commit so the running app can report its revision
// (used by the finance certification). Falls back silently if git is absent.
let commit = process.env.APP_COMMIT || "";
if (!commit) {
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {
    /* no git in build env — leave blank */
  }
}
if (commit) {
  await writeFile(resolve(targetServer, "commit.txt"), commit);
  console.log(`[postbuild] stamped commit ${commit}`);
}

console.log(`[postbuild] mirrored server bundle to ${targetServer}/`);
if (existsSync(sourcePublic)) {
  console.log(`[postbuild] mirrored static assets to ${targetPublic}/`);
}
