import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db, now, genId, addAudit } from "@/server/db/index";
import { fiscalPeriods, journalEntries, journalLines } from "@/server/db/schema";
import { eq, like, and, desc, inArray, sql } from "drizzle-orm";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { recordWorkflowEvent } from "@/server/db/finance-workflow";
import { FiscalPeriodStatus, JournalStatus } from "@/lib/enums";
import { FINANCE_PERMISSIONS } from "@/lib/finance-permissions";

/** 403 helper — granular finance permission check inside a multi-action route. */
async function require(ctx: Ctx, permission: string): Promise<Response | null> {
  return (await hasPermission(ctx.user.role, permission))
    ? null
    : err("لا تملك صلاحية لهذا الإجراء المالي", 403, "FORBIDDEN");
}

// Map a database-level fiscal-period invariant violation (overlap trigger or
// valid-range CHECK) to a controlled application error — the DB is the final
// safety layer; the app pre-checks give the same errors first.
function mapPeriodDbError(e: unknown): Response | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("PERIOD_OVERLAP"))
    return err("الفترة تتداخل مع فترة مالية موجودة", 400, "PERIOD_OVERLAP");
  if (msg.includes("fiscal_periods_valid_range"))
    return err("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", 400, "BAD_RANGE");
  return null;
}

// GET /api/finance/periods - list
// GET /api/finance/periods?id=xxx - single with stats
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const period = (
      await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id)).limit(1)
    )[0];
    if (!period) return err("الفترة المالية غير موجودة", 404, "NOT_FOUND");

    // Count entries within period range
    const entryCount =
      (
        await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(journalEntries)
          .where(
            and(
              sql`${journalEntries.date} >= ${period.startDate}`,
              sql`${journalEntries.date} <= ${period.endDate}`,
            ),
          )
      )[0]?.count || 0;

    const postedCount =
      (
        await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(journalEntries)
          .where(
            and(
              sql`${journalEntries.date} >= ${period.startDate}`,
              sql`${journalEntries.date} <= ${period.endDate}`,
              eq(journalEntries.status, JournalStatus.POSTED),
            ),
          )
      )[0]?.count || 0;

    const draftCount =
      (
        await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(journalEntries)
          .where(
            and(
              sql`${journalEntries.date} >= ${period.startDate}`,
              sql`${journalEntries.date} <= ${period.endDate}`,
              eq(journalEntries.status, JournalStatus.DRAFT),
            ),
          )
      )[0]?.count || 0;

    return Response.json({
      item: period,
      stats: {
        totalEntries: Number(entryCount),
        postedEntries: Number(postedCount),
        draftEntries: Number(draftCount),
      },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) conditions.push(like(fiscalPeriods.name, `%${search}%`));
  if (status) conditions.push(eq(fiscalPeriods.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(fiscalPeriods)
    .where(whereClause)
    .orderBy(desc(fiscalPeriods.startDate));

  const total = items.length;
  return Response.json({ items, total });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الفترة مطلوب"),
  startDate: z.string().trim().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().trim().min(1, "تاريخ النهاية مطلوب"),
  notes: z.string().optional(),
});

// POST /api/finance/periods - create a new fiscal period
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const denied = await require(ctx, FINANCE_PERMISSIONS.periodManage);
    if (denied) return denied;
    const b = await parseBody(event.request, createSchema);

    if (b.startDate > b.endDate) {
      return err("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", 400, "BAD_RANGE");
    }

    // Deterministic single-period-per-date rule: reject any overlap so a
    // posting date never resolves to two periods. Ranges [a,b] and [c,d]
    // overlap iff a <= d AND c <= b (ISO text dates compare chronologically).
    const overlap = await db
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          sql`${fiscalPeriods.startDate} <= ${b.endDate}`,
          sql`${fiscalPeriods.endDate} >= ${b.startDate}`,
        ),
      )
      .limit(1);
    if (overlap.length > 0) {
      return err(`الفترة تتداخل مع فترة موجودة: ${overlap[0].name}`, 400, "PERIOD_OVERLAP");
    }

    const existing = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.name, b.name));
    if (existing.length > 0) {
      return err("يوجد فترة مالية بنفس الاسم بالفعل", 400, "DUPLICATE_NAME");
    }

    const periodId = genId("FP");
    const ts = now();

    try {
      await db.insert(fiscalPeriods).values({
        id: periodId,
        name: b.name,
        startDate: b.startDate,
        endDate: b.endDate,
        status: FiscalPeriodStatus.OPEN,
        notes: b.notes || "",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });
    } catch (e) {
      const mapped = mapPeriodDbError(e);
      if (mapped) return mapped;
      throw e;
    }

    await addAudit({
      action: "create",
      entityType: "fiscal_period",
      entityId: periodId,
      description: `تم إضافة فترة مالية: ${b.name} (من ${b.startDate} إلى ${b.endDate})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, periodId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const putSchema = z.object({
  id: z.string().min(1, "معرف الفترة مطلوب"),
  action: z.enum(["close", "reopen"]).optional(),
  reason: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/finance/periods - close, reopen, or update metadata (all require finance.update)
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, putSchema);

    const period = (
      await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, b.id)).limit(1)
    )[0];
    if (!period) return err("الفترة المالية غير موجودة", 404, "NOT_FOUND");

    // ---- CLOSE ----
    if (b.action === "close") {
      const denied = await require(ctx, FINANCE_PERMISSIONS.periodClose);
      if (denied) return denied;
      if (period.status === FiscalPeriodStatus.CLOSED) {
        return err("الفترة مقفلة بالفعل", 400, "ALREADY_CLOSED");
      }

      // Block if any UNRESOLVED workflow items exist in the period: drafts,
      // submitted (awaiting approval), or approved-but-not-posted journals.
      // A period must not close over accounting documents still in the pipeline.
      const openItems = await db
        .select({ status: journalEntries.status })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            inArray(journalEntries.status, [
              JournalStatus.DRAFT,
              JournalStatus.SUBMITTED,
              JournalStatus.APPROVED,
              // Legacy status: any pre-Phase-1B unposted journal must also block
              // close — no old status may hide from the period-close check.
              JournalStatus.PENDING,
            ]),
          ),
        );
      if (openItems.length > 0) {
        const counts = { draft: 0, submitted: 0, approved: 0, pending: 0 };
        for (const it of openItems) {
          if (it.status === JournalStatus.DRAFT) counts.draft++;
          else if (it.status === JournalStatus.SUBMITTED) counts.submitted++;
          else if (it.status === JournalStatus.APPROVED) counts.approved++;
          else if (it.status === JournalStatus.PENDING) counts.pending++;
        }
        return Response.json(
          {
            error: true,
            code: "HAS_OPEN_WORKFLOW_ITEMS",
            message: `لا يمكن إقفال الفترة: يوجد مستندات محاسبية غير منتهية — مسودات: ${counts.draft}، بانتظار الاعتماد: ${counts.submitted}، معتمدة غير مُرحّلة: ${counts.approved}، قديمة (pending): ${counts.pending}. أكملها أو ألغِها أولاً.`,
            counts,
          },
          { status: 400 },
        );
      }

      // Verify every posted entry in the period is balanced.
      const postedEntries = await db
        .select()
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            eq(journalEntries.status, JournalStatus.POSTED),
          ),
        );
      const unbalanced: string[] = [];
      for (const e of postedEntries) {
        const lines = await db
          .select()
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, e.id));
        const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(totalDebit - totalCredit) >= 0.01) unbalanced.push(e.number);
      }
      if (unbalanced.length > 0) {
        return err(
          `لا يمكن إقفال الفترة: يوجد ${unbalanced.length} قيد مرحّل غير متوازن (${unbalanced
            .slice(0, 3)
            .join("، ")}).`,
          400,
          "UNBALANCED_ENTRIES",
        );
      }

      const before = JSON.stringify(period);
      const ts = now();
      await db.transaction(async (tx) => {
        await tx
          .update(fiscalPeriods)
          .set({
            status: FiscalPeriodStatus.CLOSED,
            closedAt: ts,
            closedById: ctx.user.id,
            closedByName: ctx.user.name,
            notes: b.notes ?? period.notes,
            updatedAt: ts,
          })
          .where(eq(fiscalPeriods.id, b.id));
        await recordWorkflowEvent(tx as any, {
          entityType: "fiscal_period",
          entityId: b.id,
          action: "close",
          fromStatus: FiscalPeriodStatus.OPEN,
          toStatus: FiscalPeriodStatus.CLOSED,
          userId: ctx.user.id,
          userName: ctx.user.name,
          reason: (b.reason ?? "").trim(),
        });
      });

      await addAudit({
        action: "PERIOD_CLOSED",
        entityType: "fiscal_period",
        entityId: b.id,
        description: `تم إقفال الفترة المالية: ${period.name} (من ${period.startDate} إلى ${period.endDate})`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (
        await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    // ---- REOPEN ---- (higher-risk: dedicated permission + required reason)
    if (b.action === "reopen") {
      const denied = await require(ctx, FINANCE_PERMISSIONS.periodReopen);
      if (denied) return denied;
      if (period.status !== FiscalPeriodStatus.CLOSED) {
        return err("لا يمكن إعادة فتح فترة غير مقفلة", 400, "NOT_CLOSED");
      }
      const reopenReason = (b.reason ?? "").trim();
      if (!reopenReason) return err("سبب إعادة الفتح مطلوب", 400, "REASON_REQUIRED");

      const before = JSON.stringify(period);
      const ts = now();
      await db.transaction(async (tx) => {
        await tx
          .update(fiscalPeriods)
          .set({
            status: FiscalPeriodStatus.OPEN,
            reopenedAt: ts,
            reopenedById: ctx.user.id,
            reopenedByName: ctx.user.name,
            updatedAt: ts,
          })
          .where(eq(fiscalPeriods.id, b.id));
        await recordWorkflowEvent(tx as any, {
          entityType: "fiscal_period",
          entityId: b.id,
          action: "reopen",
          fromStatus: FiscalPeriodStatus.CLOSED,
          toStatus: FiscalPeriodStatus.OPEN,
          userId: ctx.user.id,
          userName: ctx.user.name,
          reason: reopenReason,
        });
      });

      await addAudit({
        action: "PERIOD_REOPENED",
        entityType: "fiscal_period",
        entityId: b.id,
        description: `تم إعادة فتح الفترة المالية: ${period.name} — ${reopenReason}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (
        await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    // ---- UPDATE METADATA ----
    const denied = await require(ctx, FINANCE_PERMISSIONS.periodManage);
    if (denied) return denied;
    if (period.status === FiscalPeriodStatus.CLOSED) {
      return err("لا يمكن تعديل فترة مقفلة. أعد فتحها أولاً.", 400, "PERIOD_CLOSED");
    }

    const startDate = b.startDate ?? period.startDate;
    const endDate = b.endDate ?? period.endDate;
    if (startDate > endDate) {
      return err("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", 400, "BAD_RANGE");
    }

    // Reject overlap with any OTHER period (deterministic single period/date).
    const overlap = await db
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          sql`${fiscalPeriods.id} <> ${b.id}`,
          sql`${fiscalPeriods.startDate} <= ${endDate}`,
          sql`${fiscalPeriods.endDate} >= ${startDate}`,
        ),
      )
      .limit(1);
    if (overlap.length > 0) {
      return err(`الفترة تتداخل مع فترة موجودة: ${overlap[0].name}`, 400, "PERIOD_OVERLAP");
    }

    const before = JSON.stringify(period);
    try {
      await db
        .update(fiscalPeriods)
        .set({
          name: b.name ?? period.name,
          startDate,
          endDate,
          notes: b.notes ?? period.notes,
          updatedAt: now(),
        })
        .where(eq(fiscalPeriods.id, b.id));
    } catch (e) {
      const mapped = mapPeriodDbError(e);
      if (mapped) return mapped;
      throw e;
    }

    await addAudit({
      action: "update",
      entityType: "fiscal_period",
      entityId: b.id,
      description: `تم تحديث الفترة المالية: ${period.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/finance/periods?id=xxx - only open periods (never delete closed).
// Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const denied = await require(ctx, FINANCE_PERMISSIONS.periodManage);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الفترة مطلوب", 400, "BAD_REQUEST");

  const existing = (
    await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id)).limit(1)
  )[0];
  if (!existing) return err("الفترة المالية غير موجودة", 404, "NOT_FOUND");
  if (existing.status !== FiscalPeriodStatus.OPEN) {
    return err("لا يمكن حذف فترة مقفلة. يحتفظ النظام بالفترة للسجل التاريخي.", 400, "NOT_OPEN");
  }

  const before = JSON.stringify(existing);
  await db.delete(fiscalPeriods).where(eq(fiscalPeriods.id, id));
  await addAudit({
    action: "delete",
    entityType: "fiscal_period",
    entityId: id,
    description: `تم حذف الفترة المالية: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/periods")({
  server: {
    handlers: {
      // Reads under finance read; each mutation checks its granular permission
      // inside (period.close / period.reopen / period.manage).
      GET: authHandler("finance.view", GET),
      POST: authHandler("finance.view", POST),
      PUT: authHandler("finance.view", PUT),
      DELETE: authHandler("finance.view", DELETE),
    },
  },
});
