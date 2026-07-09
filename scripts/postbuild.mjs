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

// Copy the synckit worker files used by src/server/db/client.ts.
// These are referenced via `new URL("./libsql-worker.mjs", import.meta.url)`
// at runtime but Vite does not bundle them, so they must be mirrored
// into the build output alongside the SSR chunks.
const ssrDir = resolve(targetServer, "_ssr");
await mkdir(ssrDir, { recursive: true });
for (const worker of ["libsql-worker.mjs", "pg-worker.mjs"]) {
  const src = resolve(root, "src", "server", "db", worker);
  const dst = resolve(ssrDir, worker);
  if (existsSync(src)) {
    await copyFile(src, dst);
  }
}

if (existsSync(sourcePublic)) {
  await rm(targetPublic, { recursive: true, force: true });
  await mkdir(targetPublic, { recursive: true });
  await cp(sourcePublic, targetPublic, { recursive: true });
}

console.log(`[postbuild] mirrored server bundle to ${targetServer}/`);
if (existsSync(sourcePublic)) {
  console.log(`[postbuild] mirrored static assets to ${targetPublic}/`);
}
