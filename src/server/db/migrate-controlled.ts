/**
 * Controlled migration runner with a finance-integrity gate.
 *
 * Non-gated migrations apply normally at boot. The finance-integrity migrations
 * (0011–0013) carry data-dependent constraints/indexes that MUST NOT be applied
 * while production data has blocking issues (duplicate sources, invalid/
 * overlapping periods, unbalanced GL). They are applied only when the read-only
 * preflight gate passes — at boot if already clean, otherwise via the Super
 * Admin "Apply Finance Integrity Migrations" action. A blocked gate never
 * crashes startup; the app runs with those migrations deferred.
 */
import { sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { preflightGate } from "./finance-preflight";

type Db = { execute: (q: any) => Promise<any>; select: (...a: any[]) => any };

export const GATED_TAGS = [
  "0011_fresh_thunderbolt_ross",
  "0012_period_guards",
  "0013_period_overlap_guard",
];

// Certification infrastructure (finance_certifications table + idempotency
// index). This is schema-only and independent of the accounting data, so it is
// NEVER gated: it must exist before any certification INSERT is attempted. It
// carries no dependency on 0011–0013, so its apply order relative to them does
// not matter — it applies unconditionally at boot and via the infra apply path.
export const INFRA_TAGS = ["0014_numerous_deadpool"];

async function rows(db: Db, q: any): Promise<any[]> {
  const r = await db.execute(q);
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

async function ensureTracking(db: Db) {
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS drizzle`));
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  );
}

function readJournal(folder: string): { entries: { idx: number; when: number; tag: string }[] } {
  const p = resolve(folder, "meta", "_journal.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Apply one migration file's statements and record it in tracking. */
async function applyFile(db: Db, folder: string, tag: string, when: number, hash: string) {
  const raw = readFileSync(resolve(folder, tag + ".sql"), "utf8");
  const stmts = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) await db.execute(sql.raw(s));
  await db.execute(
    sql.raw(
      `INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ('${hash}', ${when})`,
    ),
  );
}

/**
 * Boot migrations: apply pending non-gated migrations always; apply gated
 * finance-integrity ones only if the preflight gate passes.
 */
export async function runBootMigrations(db: Db, folder: string): Promise<void> {
  await ensureTracking(db);
  const journal = readJournal(folder);
  const applied = new Set(
    (await rows(db, sql.raw(`SELECT hash FROM drizzle."__drizzle_migrations"`))).map((r) => r.hash),
  );
  const lastRow = (
    await rows(
      db,
      sql.raw(
        `SELECT created_at FROM drizzle."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
      ),
    )
  )[0];
  const lastWhen = lastRow ? Number(lastRow.created_at) : 0;

  let gate: Awaited<ReturnType<typeof preflightGate>> | null = null;
  for (const e of journal.entries) {
    const file = resolve(folder, e.tag + ".sql");
    if (!existsSync(file)) continue;
    const hash = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
    if (applied.has(hash)) continue;
    const gated = GATED_TAGS.includes(e.tag);
    // Old, untracked, non-gated migration → assume applied externally (0000–0010).
    if (!gated && Number(e.when) <= lastWhen) continue;
    if (gated) {
      if (!gate) gate = await preflightGate(db);
      if (!gate.pass) {
        console.warn(
          `[db] finance migration ${e.tag} DEFERRED — preflight blockers: ${gate.blockingIssues
            .map((b) => b.message)
            .join("; ")}`,
        );
        continue;
      }
    }
    await applyFile(db, folder, e.tag, Number(e.when), hash);
    console.log(`[db] applied migration ${e.tag}`);
  }
}

/**
 * Super Admin action: re-check the gate, then apply any pending gated
 * finance-integrity migrations. Returns a structured result.
 */
export async function applyGatedFinanceMigrations(db: Db, folder: string) {
  await ensureTracking(db);
  const gate = await preflightGate(db);
  if (!gate.pass) {
    return { applied: [] as string[], blocked: true, blockingIssues: gate.blockingIssues };
  }
  const journal = readJournal(folder);
  const applied = new Set(
    (await rows(db, sql.raw(`SELECT hash FROM drizzle."__drizzle_migrations"`))).map((r) => r.hash),
  );
  const done: string[] = [];
  for (const e of journal.entries) {
    if (!GATED_TAGS.includes(e.tag)) continue;
    const file = resolve(folder, e.tag + ".sql");
    if (!existsSync(file)) continue;
    const hash = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
    if (applied.has(hash)) continue;
    await applyFile(db, folder, e.tag, Number(e.when), hash);
    done.push(e.tag);
  }
  return { applied: done, blocked: false, blockingIssues: [] };
}

/**
 * Apply certification-infrastructure migrations (INFRA_TAGS, e.g. 0014)
 * unconditionally. Never gated — the finance_certifications table and its
 * idempotency index must exist before a certificate is issued. Idempotent:
 * already-applied files are skipped by content hash.
 */
export async function applyFinanceInfraMigrations(db: Db, folder: string) {
  await ensureTracking(db);
  const journal = readJournal(folder);
  const applied = new Set(
    (await rows(db, sql.raw(`SELECT hash FROM drizzle."__drizzle_migrations"`))).map((r) => r.hash),
  );
  const done: string[] = [];
  for (const e of journal.entries) {
    if (!INFRA_TAGS.includes(e.tag)) continue;
    const file = resolve(folder, e.tag + ".sql");
    if (!existsSync(file)) continue;
    const hash = createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
    if (applied.has(hash)) continue;
    await applyFile(db, folder, e.tag, Number(e.when), hash);
    done.push(e.tag);
  }
  return { applied: done };
}

/**
 * A drizzle folder is only valid if it actually contains the migration journal
 * — guards against matching an empty/partial directory.
 */
function isMigrationsFolder(dir: string): boolean {
  return existsSync(dir) && existsSync(resolve(dir, "meta", "_journal.json"));
}

/**
 * Candidate migration-folder locations, cwd- AND module-relative.
 *
 * Production root cause (Phase 1A plumbing): the Nitro `node-server` artifact
 * runs `.output/server/index.mjs` whose process.cwd() is NOT the repo/mirror
 * root, so cwd-relative lookups missed the shipped migrations. Anchoring to this
 * module's own URL lets discovery find `drizzle/` shipped inside the server
 * bundle (postbuild copies it next to the entry) regardless of cwd.
 */
export function drizzleFolderCandidates(): string[] {
  const list = [resolve(process.cwd(), "drizzle"), resolve(process.cwd(), "server", "drizzle")];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Walk a few levels up from the (possibly chunked) module location and
    // probe for a sibling `drizzle` dir — covers `.output/server/_ssr/*` →
    // `.output/server/drizzle`, plain `server/` mirror, and dev `src/`.
    for (const base of [
      here,
      resolve(here, ".."),
      resolve(here, "..", ".."),
      resolve(here, "..", "..", ".."),
    ]) {
      list.push(resolve(base, "drizzle"), resolve(base, "server", "drizzle"));
    }
  } catch {
    /* import.meta.url unavailable — cwd candidates only */
  }
  return list;
}

/** Resolve the shipped drizzle folder (repo root, server bundle, or module-relative). */
export function resolveDrizzleFolder(): string | null {
  return drizzleFolderCandidates().find(isMigrationsFolder) ?? null;
}
