/**
 * Database barrel + shared helpers.
 *
 * Migrations are managed by drizzle-kit (see `drizzle.config.ts`, `./drizzle`).
 * On first request we run any pending migrations against Postgres.
 */
import { randomUUID } from "node:crypto";
import { db, getDb, diagnose, runRawSql, closeDb } from "./client";
import { auditLog } from "./schema";
import {
  runBootMigrations,
  resolveDrizzleFolder,
  drizzleFolderCandidates,
} from "./migrate-controlled";

export { db, getDb, diagnose, runRawSql, closeDb };

let _initPromise: Promise<void> | null = null;

// Last boot-migration outcome — exposed (read-only) so a swallowed failure is
// visible to the preflight diagnostics instead of silently leaving objects
// MISSING. Never contains secrets: a status label + a short message only.
export interface BootMigrationStatus {
  ran: boolean;
  folderFound: boolean;
  error: string | null;
  checkedCandidates: string[];
}
let _bootMigration: BootMigrationStatus = {
  ran: false,
  folderFound: false,
  error: null,
  checkedCandidates: [],
};
export function getBootMigrationStatus(): BootMigrationStatus {
  return _bootMigration;
}

/**
 * Best-effort auto-migration on first request.
 *
 * The authoritative migration step is `npm run db:migrate` (run once against the
 * production DB at deploy time). At runtime we opportunistically apply pending
 * migrations IF the ./drizzle folder is reachable from cwd — but we never crash
 * the whole app over it, since the schema is expected to already exist.
 */
export function ensureInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // Discover the migrations folder cwd- AND module-relative (see
    // resolveDrizzleFolder) so it is found inside the deployed server bundle
    // regardless of process.cwd().
    const candidates = drizzleFolderCandidates();
    const folder = resolveDrizzleFolder();
    _bootMigration = {
      ran: false,
      folderFound: !!folder,
      error: null,
      checkedCandidates: candidates,
    };
    if (!folder) {
      const msg = `migrations folder not found (checked: ${candidates.join(", ")})`;
      _bootMigration.error = msg;
      console.warn(`[db] ${msg} — assuming DB migrated externally (npm run db:migrate).`);
      return;
    }
    const t0 = Date.now();
    try {
      // Controlled runner: non-gated migrations apply normally; the
      // finance-integrity migrations (0011–0013) apply only if the read-only
      // preflight gate passes, else they are deferred to the admin action.
      await runBootMigrations(getDb() as any, folder);
      _bootMigration.ran = true;
      console.log(`[db] migrations checked (${Date.now() - t0}ms)`);
    } catch (e) {
      // Do not crash the app — external migration is the source of truth — but
      // record the failure so diagnostics can surface it (item 10).
      _bootMigration.error = e instanceof Error ? e.message : String(e);
      console.error("[db] auto-migrate skipped:", _bootMigration.error);
    }
  })();
  return _initPromise;
}

/** ISO-8601 timestamp — sortable, locale-independent. Render locale text in the UI. */
export function now(): string {
  return new Date().toISOString();
}

/** Non-security id generator for domain records (NOT for session tokens). */
export function genId(prefix = ""): string {
  const id = randomUUID();
  return prefix ? `${prefix}-${id}` : id;
}

export async function addAudit(opts: {
  action: string;
  entityType: string;
  entityId: string;
  description?: string;
  userId?: string | null;
  userName?: string;
  before?: string | null;
  after?: string | null;
  ip?: string;
}) {
  await db.insert(auditLog).values({
    id: genId("AUD"),
    userId: opts.userId ?? null,
    userName: opts.userName ?? "system",
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    description: opts.description ?? "",
    before: opts.before ?? null,
    after: opts.after ?? null,
    ip: opts.ip ?? "",
    timestamp: now(),
  });
}
