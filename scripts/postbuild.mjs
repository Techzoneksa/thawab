import { copyFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
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

console.log(`[postbuild] mirrored server bundle to ${targetServer}/`);
if (existsSync(sourcePublic)) {
  console.log(`[postbuild] mirrored static assets to ${targetPublic}/`);
}
