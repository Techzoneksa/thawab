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

let _bootScheduled = false;
let _bootPromise: Promise<void> | null = null;

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

/** The actual boot-migration run — executed ONCE, in the background. */
function runBootMigrationsOnce(): Promise<void> {
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
    return Promise.resolve();
  }
  const t0 = Date.now();
  return runBootMigrations(getDb() as any, folder)
    .then(() => {
      _bootMigration.ran = true;
      console.log(`[db] migrations checked (${Date.now() - t0}ms)`);
    })
    .catch((e) => {
      // Do not crash the app — external migration is the source of truth — but
      // record the failure so diagnostics can surface it.
      _bootMigration.error = e instanceof Error ? e.message : String(e);
      console.error("[db] auto-migrate skipped:", _bootMigration.error);
    });
}

/**
 * Prepare DB-dependent runtime for a request. Returns IMMEDIATELY.
 *
 * The boot-migration check runs in the BACKGROUND (exactly once) and must never
 * sit on the request path: it can involve many round-trips to a geographically
 * distant Postgres, which otherwise makes the first request after each cold
 * start — typically the login/session check — slow or time out (the app would
 * appear "heavy" or fail to open). The application schema is expected to already
 * exist (authoritative step: `npm run db:migrate` at deploy); any still-pending
 * finance-integrity migrations are handled gracefully by the preflight/certify
 * flow and the Super Admin apply action, so requests do not need to wait here.
 */
export function ensureInit(): Promise<void> {
  if (!_bootScheduled) {
    _bootScheduled = true;
    _bootPromise = runBootMigrationsOnce();
    void _bootPromise; // fire-and-forget; never rejects (errors captured above)
  }
  return Promise.resolve();
}

/** Await the background boot-migration run. For tooling/tests, not the request path. */
export function bootMigrationsSettled(): Promise<void> {
  return _bootPromise ?? Promise.resolve();
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
