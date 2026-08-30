import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { db, diagnose, getBootMigrationStatus, ensureInit } from "@/server/db/index";

const startTime = Date.now();

/**
 * Unauthenticated health + self-diagnosis.
 *
 * When login returns "حدث خطأ داخلي" the operator is locked out and the
 * authenticated /api/diagnose is unreachable — so this endpoint answers, without
 * leaking any secret (no DATABASE_URL, no host, no filesystem path, no raw error
 * string), the one question that matters: is the database reachable AND migrated?
 * A degraded status with coreTablesPresent=false almost always means the deploy
 * skipped `npm run db:migrate` (or DATABASE_URL points at the wrong database).
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

async function __handler_GET() {
  // Kick the (background, once) boot-migration check so its status is populated.
  ensureInit();

  const diag = (await withTimeout(diagnose(), 2500)) as {
    configured?: boolean;
    tableCount?: number;
    ok?: boolean;
  } | null;
  const reachable = !!diag?.ok;
  const tableCount = Number(diag?.tableCount ?? 0);

  // Are the login-critical tables present? (Missing ⇒ schema not migrated.)
  let coreTablesPresent = false;
  if (reachable) {
    const core = (await withTimeout(
      db.execute(
        sql`SELECT
              (to_regclass('public.users') IS NOT NULL
               AND to_regclass('public.sessions') IS NOT NULL
               AND to_regclass('public.login_attempts') IS NOT NULL) AS ok`,
      ),
      2500,
    )) as any;
    coreTablesPresent = !!core?.[0]?.ok;
  }

  const boot = getBootMigrationStatus();
  const ok = reachable && coreTablesPresent;
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "production",
      db: {
        configured: !!diag?.configured,
        reachable,
        tableCount,
        coreTablesPresent,
      },
      // Boot migrations are a best-effort convenience; the authoritative step is
      // `npm run db:migrate` at deploy. hasError=true here means that convenience
      // pass hit a problem (surfaced without leaking its text/paths).
      bootMigrations: {
        folderFound: boot.folderFound,
        ran: boot.ran,
        hasError: !!boot.error,
      },
      // Actionable, secret-free hint for the common lockout cause.
      hint: ok
        ? undefined
        : !reachable
          ? "قاعدة البيانات غير متاحة — تحقق من DATABASE_URL واتصال الخادم بقاعدة البيانات."
          : "قاعدة البيانات متصلة لكن المخطط غير مُهيّأ — نفّذ ترحيل قاعدة البيانات (npm run db:migrate) عند النشر.",
    },
    { status: ok ? 200 : 503 },
  );
}

export const Route = createFileRoute("/api/health")({
  component: () => null,
  server: {
    handlers: {
      GET: __handler_GET,
    },
  },
});
