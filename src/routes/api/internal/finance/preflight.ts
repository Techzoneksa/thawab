import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db, addAudit, now, genId, getBootMigrationStatus } from "@/server/db/index";
import { financeCertifications } from "@/server/db/schema";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { getAppCommit } from "@/server/db/app-info";
import {
  runPreflight,
  determineStatus,
  requiredObjectsPresent,
  buildSnapshot,
  accountingFingerprint,
  rowCounts,
  type CertHistory,
} from "@/server/db/finance-preflight";
import {
  applyGatedFinanceMigrations,
  applyFinanceInfraMigrations,
  resolveDrizzleFolder,
} from "@/server/db/migrate-controlled";

const enabled = () => process.env.ENABLE_FINANCE_PREFLIGHT !== "false";

/**
 * The PRODUCTION_READY certificate for a specific commit, or null. Guarded:
 * if the certification table is not deployed yet, returns null (never throws) —
 * so a missing 0014 yields PENDING_MIGRATIONS, not a 500.
 */
async function certForCommit(commit: string, tableExists: boolean) {
  if (!tableExists || !commit || commit === "unknown") return null;
  try {
    return (
      (
        await db
          .select()
          .from(financeCertifications)
          .where(
            and(
              eq(financeCertifications.status, "PRODUCTION_READY"),
              eq(financeCertifications.environment, "production"),
              eq(financeCertifications.applicationCommit, commit),
            ),
          )
          .orderBy(desc(financeCertifications.certifiedAt))
          .limit(1)
      )[0] ?? null
    );
  } catch {
    return null;
  }
}

async function recentCertifications(tableExists: boolean) {
  if (!tableExists) return [];
  try {
    return await db
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
  } catch {
    return [];
  }
}

async function buildHistory(): Promise<CertHistory> {
  const fp = await accountingFingerprint(db as any);
  const counts = await rowCounts(db as any);
  return {
    fingerprintBefore: fp,
    fingerprintAfter: fp,
    journalEntriesBefore: counts.journal_entries,
    journalEntriesAfter: counts.journal_entries,
    journalLinesBefore: counts.journal_lines,
    journalLinesAfter: counts.journal_lines,
  };
}

/**
 * GET — Super Admin, DIAGNOSTIC ONLY. Zero-write: no INSERT, no audit, no
 * business-state or accounting-state mutation. Reports the certification
 * lifecycle state for the CURRENT deployed commit.
 */
async function GET(_event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    void ctx; // no audit written on GET — pure diagnostic
    const report = await runPreflight(db as any);
    const commit = getAppCommit();
    const certTableExists = !!report.checks.migrationObjects.finance_certifications;
    const currentCert = await certForCommit(commit, certTableExists);
    const status = determineStatus(report, { certForCurrentCommit: !!currentCert });
    const snapshot = buildSnapshot(report, await buildHistory());

    return Response.json({
      environment: "production",
      applicationCommit: commit,
      commitResolved: commit !== "unknown",
      status, // PRODUCTION_BLOCKED | PENDING_MIGRATIONS | READY_TO_CERTIFY | PRODUCTION_READY
      certifiedForCurrentCommit: !!currentCert,
      overall: report.overall,
      migrationReady: report.migrationReady,
      requiredObjectsPresent: requiredObjectsPresent(report),
      blockingIssues: report.blockingIssues,
      warnings: report.warnings,
      snapshot,
      checks: report.checks,
      bootMigration: getBootMigrationStatus(), // surfaces swallowed boot-migration failures
      certification: currentCert, // certificate for THIS commit only (or null)
      certifications: await recentCertifications(certTableExists),
    });
  });
}

/** POST { action: "apply-migrations" } — apply infra (0014) + gated (0011–0013). */
async function applyMigrations(ctx: Ctx) {
  const folder = resolveDrizzleFolder();
  if (!folder) return err("مجلد الترحيلات غير متاح على الخادم", 500, "NO_MIGRATIONS");

  const beforeFp = await accountingFingerprint(db as any);
  const beforeCounts = await rowCounts(db as any);

  // 0014 first (infrastructure, ungated) so the certification store always
  // exists; then the data-gated integrity migrations 0011–0013.
  const infra = await applyFinanceInfraMigrations(db as any, folder);
  const result = await applyGatedFinanceMigrations(db as any, folder);

  const afterFp = await accountingFingerprint(db as any);
  const afterCounts = await rowCounts(db as any);
  const report = await runPreflight(db as any);
  const allObjects = requiredObjectsPresent(report);
  const migration = !result.blocked && allObjects ? "MIGRATION_SUCCESS" : "MIGRATION_FAILED";
  const applied = [...infra.applied, ...result.applied];
  const history: CertHistory = {
    fingerprintBefore: beforeFp,
    fingerprintAfter: afterFp,
    journalEntriesBefore: beforeCounts.journal_entries,
    journalEntriesAfter: afterCounts.journal_entries,
    journalLinesBefore: beforeCounts.journal_lines,
    journalLinesAfter: afterCounts.journal_lines,
  };

  await addAudit({
    action: "FINANCE_INTEGRITY_MIGRATION",
    entityType: "finance_preflight",
    entityId: "0011-0014",
    description: result.blocked
      ? `Migration refused — blockers: ${result.blockingIssues.map((b) => b.message).join("; ")}`
      : `Migration ${migration} — applied: ${applied.join(", ") || "(none new)"}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return Response.json({
    migration,
    blocked: result.blocked,
    blockingIssues: result.blockingIssues,
    applied,
    requiredObjectsPresent: allObjects,
    snapshot: buildSnapshot(report, history),
  });
}

/**
 * POST { action: "certify" } — issue the immutable Phase 1A certificate for the
 * CURRENT deployed commit. Re-runs every check server-side (never trusts a
 * prior GET). Idempotent per (phase, environment, commit).
 */
async function certify(ctx: Ctx) {
  // 1. Runtime commit must resolve.
  const commit = getAppCommit();
  if (!commit || commit === "unknown")
    return err(
      "تعذّر تحديد نسخة التطبيق (commit) — لا يمكن إصدار الشهادة",
      409,
      "COMMIT_UNRESOLVED",
    );

  // 2. Fresh, authoritative preflight (server-side, not the browser's result).
  const report = await runPreflight(db as any);
  const certTableExists = !!report.checks.migrationObjects.finance_certifications;

  // 3. Idempotency fast path — a certificate already exists for this commit.
  const existing = await certForCommit(commit, certTableExists);
  if (existing) {
    return Response.json({
      certified: true,
      idempotent: true,
      status: "PRODUCTION_READY",
      applicationCommit: commit,
      certification: existing,
      certifications: await recentCertifications(certTableExists),
    });
  }

  // 4. Full verification gate — every condition must hold before issuing.
  const c = report.checks;
  const reasons: string[] = [];
  if (!report.migrationReady) reasons.push("accounting preflight not PASS");
  if (!c.generalLedger.balanced) reasons.push("GL unbalanced");
  if (!c.trialBalance.balanced) reasons.push("Trial Balance unbalanced");
  if (!c.financialPosition.balanced) reasons.push("Financial Position unreconciled");
  if (c.duplicates.count > 0) reasons.push("protected-source duplicates present");
  if (c.fiscalPeriods.invalid_range_count > 0) reasons.push("invalid fiscal ranges present");
  if (c.fiscalPeriods.overlap_count > 0) reasons.push("fiscal overlaps present");
  if (!requiredObjectsPresent(report)) reasons.push("required DB objects incomplete (0011–0014)");
  const unresolved = report.blockingIssues.filter(
    (b: any) => b.severity === "P0" || b.severity === "P1",
  );
  if (unresolved.length > 0)
    reasons.push(`unresolved ${unresolved.map((b: any) => b.severity).join("/")}`);

  if (reasons.length > 0) {
    const status = determineStatus(report, { certForCurrentCommit: false });
    return Response.json(
      {
        certified: false,
        status, // PRODUCTION_BLOCKED or PENDING_MIGRATIONS
        applicationCommit: commit,
        reasons,
        blockingIssues: report.blockingIssues,
      },
      { status: 409 },
    );
  }

  // 5. Issue the immutable certificate. The unique index on
  //    (phase, environment, application_commit) is the final idempotency guard.
  const snapshot = buildSnapshot(report, await buildHistory());
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
  try {
    await db.insert(financeCertifications).values(record);
  } catch (e) {
    // Concurrent certify of the same commit → unique violation. Return existing.
    const raced = await certForCommit(commit, certTableExists);
    if (raced)
      return Response.json({
        certified: true,
        idempotent: true,
        status: "PRODUCTION_READY",
        applicationCommit: commit,
        certification: raced,
        certifications: await recentCertifications(certTableExists),
      });
    throw e;
  }

  await addAudit({
    action: "FINANCE_PHASE_CERTIFIED",
    entityType: "finance_certification",
    entityId: id,
    description: `Phase 1A certified PRODUCTION_READY @ ${commit} (cert ${id})`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return Response.json({
    certified: true,
    idempotent: false,
    status: "PRODUCTION_READY",
    applicationCommit: commit,
    certification: record,
    certifications: await recentCertifications(certTableExists),
  });
}

// POST — Super Admin. Explicit mutating actions only.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    const body = await event.request.json().catch(() => ({}));
    if (body?.action === "apply-migrations") return applyMigrations(ctx);
    if (body?.action === "certify") return certify(ctx);
    return err("إجراء غير معروف", 400, "BAD_ACTION");
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
