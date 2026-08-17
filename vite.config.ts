// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Resolve the build's git revision ONCE, at build time, and bake it into the
// bundle as a compile-time constant. This is the primary, cwd-independent
// runtime-commit source: it ships INSIDE the server artifact, so getAppCommit()
// works regardless of process.cwd(), whether `.git` exists at runtime, or which
// entry file the host launches. Never hardcodes a SHA — empty string if git is
// unavailable, in which case getAppCommit() falls back to env/file/unknown.
function resolveBuildCommit(): string {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT.trim();
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "";
  }
}
const BUILD_COMMIT = resolveBuildCommit();

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    // Compile-time replacement — `__APP_COMMIT__` becomes a string literal in
    // both the SSR and client bundles.
    define: {
      __APP_COMMIT__: JSON.stringify(BUILD_COMMIT),
    },
  },
  nitro: {
    preset: "node-server",
    // Keep the canonical `.output/server/index.mjs` layout produced by
    // TanStack Start + Nitro v3. The TanStack Start / Nitro convention is
    // to ship the SSR bundle under `.output/server/` and the static
    // assets under `.output/public/`, and `.output/nitro.json` exposes
    // `serverEntry: "server/index.mjs"` (relative to `.output/`).
    //
    // `npm run postbuild` (see `scripts/postbuild.mjs`) then mirrors the
    // Nitro output into `./server/index.mjs` and `./public/` at the repo
    // root, so Node.js hosts that auto-detect the conventional entry
    // point (`node server/index.mjs` — Hostinger Node.js preset,
    // Render, Railway, Fly.io, a plain systemd unit, etc.) can boot the
    // app without a wrapper shim. The postbuild step is run by npm
    // automatically after `vite build` finishes, so the repo-root
    // `server/index.mjs` is regenerated on every build rather than
    // hand-authored.
  },
});
