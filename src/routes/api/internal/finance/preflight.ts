import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db, addAudit, now, genId } from "@/server/db/index";
import { financeCertifications } from "@/server/db/schema";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { getAppCommit } from "@/server/db/app-info";
import {
  runPreflight,
  determineStatus,
  buildSnapshot,
  accountingFingerprint,
  rowCounts,
  type CertHistory,
} from "@/server/db/finance-preflight";
import { applyGatedFinanceMigrations, resolveDrizzleFolder } from "@/server/db/migrate-controlled";

const enabled = () => process.env.ENABLE_FINANCE_PREFLIGHT !== "false";

// Persist an immutable PRODUCTION_READY certification once per commit.
async function certifyIfReady(status: string, commit: string, snapshot: any, ctx: Ctx) {
  if (status !== "PRODUCTION_READY") return null;
  const existing = (
    await db
      .select()
      .from(financeCertifications)
      .where(
        and(
          eq(financeCertifications.status, "PRODUCTION_READY"),
          eq(financeCertifications.applicationCommit, commit),
        ),
      )
      .orderBy(desc(financeCertifications.certifiedAt))
      .limit(1)
  )[0];
  if (existing) return existing;
  const id = genId("CERT");
  const ts = now();
  const record = {
    id,
    phase: "FINANCE_PHASE_1A",
    environment: "production",
    status: "PRODUCTION_READY",
    applicationCommit: commit,
    resultJson: JSON.stringify(snapshot),
    certifiedBy: ctx.user.id,
    certifiedByName: ctx.user.name,
    certifiedAt: ts,
    createdAt: ts,
  };
  await db.insert(financeCertifications).values(record);
  await addAudit({
    action: "FINANCE_PHASE_CERTIFIED",
    entityType: "finance_certification",
    entityId: id,
    description: `Phase 1A certified PRODUCTION_READY @ ${commit} (cert ${id})`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return record;
}

async function recentCertifications() {
  return db
    .select({
      id: financeCertifications.id,
      status: financeCertifications.status,
      applicationCommit: financeCertifications.applicationCommit,
      certifiedByName: financeCertifications.certifiedByName,
      certifiedAt: financeCertifications.certifiedAt,
    })
    .from(financeCertifications)
    .orderBy(desc(financeCertifications.certifiedAt))
    .limit(10);
}

// GET — Super Admin, READ-ONLY. Auto-run certification.
async function GET(_event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    const report = await runPreflight(db as any);
    const status = determineStatus(report);
    const commit = getAppCommit();
    const fp = await accountingFingerprint(db as any);
    const counts = await rowCounts(db as any);
    const history: CertHistory = {
      fingerprintBefore: fp,
      fingerprintAfter: fp,
      journalEntriesBefore: counts.journal_entries,
      journalEntriesAfter: counts.journal_entries,
      journalLinesBefore: counts.journal_lines,
      journalLinesAfter: counts.journal_lines,
    };
    const snapshot = buildSnapshot(report, history);
    const record = await certifyIfReady(status, commit, snapshot, ctx);

    await addAudit({
      action: "FINANCE_PREFLIGHT_RUN",
      entityType: "finance_preflight",
      entityId: "run",
      description: `Preflight run — status ${status}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    return Response.json({
      environment: "production",
      applicationCommit: commit,
      status,
      overall: report.overall,
      migrationReady: report.migrationReady,
      blockingIssues: report.blockingIssues,
      warnings: report.warnings,
      snapshot,
      checks: report.checks,
      certification: record,
      certifications: await recentCertifications(),
    });
  });
}

// POST { action: "apply-migrations" } — Super Admin. Gated apply + auto-certify.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    const body = await event.request.json().catch(() => ({}));
    if (body?.action !== "apply-migrations") return err("إجراء غير معروف", 400, "BAD_ACTION");
    const folder = resolveDrizzleFolder();
    if (!folder) return err("مجلد الترحيلات غير متاح على الخادم", 500, "NO_MIGRATIONS");

    const beforeFp = await accountingFingerprint(db as any);
    const beforeCounts = await rowCounts(db as any);

    const result = await applyGatedFinanceMigrations(db as any, folder);

    const afterFp = await accountingFingerprint(db as any);
    const afterCounts = await rowCounts(db as any);
    const report = await runPreflight(db as any);
    const status = determineStatus(report);
    const commit = getAppCommit();
    const history: CertHistory = {
      fingerprintBefore: beforeFp,
      fingerprintAfter: afterFp,
      journalEntriesBefore: beforeCounts.journal_entries,
      journalEntriesAfter: afterCounts.journal_entries,
      journalLinesBefore: beforeCounts.journal_lines,
      journalLinesAfter: afterCounts.journal_lines,
    };
    const snapshot = buildSnapshot(report, history);
    const allObjects = Object.values(report.checks.migrationObjects).every(Boolean);
    const migration = !result.blocked && allObjects ? "MIGRATION_SUCCESS" : "MIGRATION_FAILED";

    await addAudit({
      action: "FINANCE_INTEGRITY_MIGRATION",
      entityType: "finance_preflight",
      entityId: "0011-0013",
      description: result.blocked
        ? `Migration refused — blockers: ${result.blockingIssues.map((b) => b.message).join("; ")}`
        : `Migration ${migration} — applied: ${result.applied.join(", ") || "(none new)"}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const record = await certifyIfReady(status, commit, snapshot, ctx);

    return Response.json({
      migration,
      blocked: result.blocked,
      blockingIssues: result.blockingIssues,
      applied: result.applied,
      status,
      snapshot,
      certification: record,
    });
  });
}

export const Route = createFileRoute("/api/internal/finance/preflight")({
  server: {
    handlers: {
      GET: authHandler("*", GET),
      POST: authHandler("*", POST),
    },
  },
});
