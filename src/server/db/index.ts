/**
 * Database barrel + shared helpers.
 *
 * Migrations are managed by drizzle-kit (see `drizzle.config.ts`, `./drizzle`).
 * On first request we run any pending migrations against Postgres.
 */
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { db, getDb, diagnose, runRawSql, closeDb } from "./client";
import { auditLog } from "./schema";

export { db, getDb, diagnose, runRawSql, closeDb };

let _initPromise: Promise<void> | null = null;

export function ensureInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const t0 = Date.now();
    try {
      await migrate(getDb(), { migrationsFolder: resolve(process.cwd(), "drizzle") });
      console.log(`[db] migrations applied (${Date.now() - t0}ms)`);
    } catch (e) {
      // Do NOT cache a failed init — allow the next request to retry.
      _initPromise = null;
      console.error("[db] init/migrate failed:", e instanceof Error ? e.message : e);
      throw e;
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
