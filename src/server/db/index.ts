/**
 * Database barrel + shared helpers.
 *
 * Migrations are managed by drizzle-kit (see `drizzle.config.ts`, `./drizzle`).
 * On first request we run any pending migrations against Postgres.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { db, getDb, diagnose, runRawSql, closeDb } from "./client";
import { auditLog } from "./schema";

export { db, getDb, diagnose, runRawSql, closeDb };

let _initPromise: Promise<void> | null = null;

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
    // Look in several candidate locations: the repo root (dev / full-repo
    // deploys) and inside the server bundle (postbuild ships migrations to
    // `server/drizzle` for deploys that only include the built server).
    const candidates = [
      resolve(process.cwd(), "drizzle"),
      resolve(process.cwd(), "server", "drizzle"),
    ];
    const folder = candidates.find((c) => existsSync(c));
    if (!folder) {
      console.warn(
        `[db] migrations folder not found (checked: ${candidates.join(", ")}) — assuming DB migrated externally (npm run db:migrate).`,
      );
      return;
    }
    const t0 = Date.now();
    try {
      await migrate(getDb(), { migrationsFolder: folder });
      console.log(`[db] migrations applied (${Date.now() - t0}ms)`);
    } catch (e) {
      // Do not crash the app — external migration is the source of truth.
      console.error("[db] auto-migrate skipped:", e instanceof Error ? e.message : e);
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
