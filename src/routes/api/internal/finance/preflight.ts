import { createFileRoute } from "@tanstack/react-router";
import { db, addAudit } from "@/server/db/index";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import {
  runPreflight,
  accountingFingerprint,
  rowCounts,
  checkMigrationObjects,
  reconcileGL,
  reconcileTrialBalance,
  reconcileFinancialPosition,
} from "@/server/db/finance-preflight";
import { applyGatedFinanceMigrations, resolveDrizzleFolder } from "@/server/db/migrate-controlled";

// Optional server-side kill switch (never exposed to the client).
const enabled = () => process.env.ENABLE_FINANCE_PREFLIGHT !== "false";

// GET /api/internal/finance/preflight — Super Admin only, READ-ONLY.
async function GET(_event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    const report = await runPreflight(db as any);
    await addAudit({
      action: "preflight",
      entityType: "finance_preflight",
      entityId: "run",
      description: `تشغيل فحص الجاهزية المالية — النتيجة: ${report.overall}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return Response.json({ environment: "production", ...report });
  });
}

// POST /api/internal/finance/preflight  { action: "apply-migrations" }
// Super Admin only. Re-runs the gate, applies 0011–0013 only if PASS, and
// verifies accounting history is unchanged (before/after fingerprint + counts).
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!enabled()) return err("أداة الفحص معطّلة", 404, "DISABLED");
    const body = await event.request.json().catch(() => ({}));
    if (body?.action !== "apply-migrations") return err("إجراء غير معروف", 400, "BAD_ACTION");

    const folder = resolveDrizzleFolder();
    if (!folder) return err("مجلد الترحيلات غير متاح على الخادم", 500, "NO_MIGRATIONS");

    const beforeFp = await accountingFingerprint(db as any);
    const beforeCounts = await rowCounts(db as any);

    // applyGatedFinanceMigrations re-checks the preflight gate internally and
    // refuses to apply anything if blockers exist.
    const result = await applyGatedFinanceMigrations(db as any, folder);

    const afterFp = await accountingFingerprint(db as any);
    const afterCounts = await rowCounts(db as any);
    const [objects, gl, tb, fp] = await Promise.all([
      checkMigrationObjects(db as any),
      reconcileGL(db as any),
      reconcileTrialBalance(db as any),
      reconcileFinancialPosition(db as any),
    ]);

    await addAudit({
      action: "apply_migrations",
      entityType: "finance_preflight",
      entityId: "0011-0013",
      description: result.blocked
        ? `رفض تطبيق ترحيلات النزاهة — عوائق: ${result.blockingIssues.map((b) => b.message).join("; ")}`
        : `تطبيق ترحيلات النزاهة المالية: ${result.applied.join(", ") || "(لا جديد)"}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    return Response.json({
      blocked: result.blocked,
      blockingIssues: result.blockingIssues,
      applied: result.applied,
      migrationObjects: objects,
      historyIntegrity: {
        fingerprintMatch: beforeFp === afterFp,
        beforeFingerprint: beforeFp,
        afterFingerprint: afterFp,
        journalEntriesUnchanged: beforeCounts.journal_entries === afterCounts.journal_entries,
        journalLinesUnchanged: beforeCounts.journal_lines === afterCounts.journal_lines,
      },
      reconciliation: { generalLedger: gl, trialBalance: tb, financialPosition: fp },
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
