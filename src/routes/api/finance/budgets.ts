import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import {
  budgets,
  budgetLines,
  journalLines,
  accounts,
  costCenters,
  projects,
  journalEntries,
} from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { BudgetStatus, JournalStatus } from "@/lib/enums";

// GET /api/finance/budgets?id=xxx — single with lines + actual-vs-budget; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const budget = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1))[0];
    if (!budget) return err("الموازنة غير موجودة", 404, "NOT_FOUND");

    const lines = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetId, id))
      .orderBy(budgetLines.lineNumber);

    // Enrich with names + compute actual from posted journal entries.
    // MUST await Promise.all before reducing — otherwise the array holds
    // unresolved promises and totals serialize as {} / NaN.
    const enrichedLines = await Promise.all(
      lines.map(async (l) => {
        const account = l.accountId
          ? (await db.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1))[0]
          : null;
        const cc = l.costCenterId
          ? (
              await db
                .select()
                .from(costCenters)
                .where(eq(costCenters.id, l.costCenterId))
                .limit(1)
            )[0]
          : null;
        const project = l.projectId
          ? (await db.select().from(projects).where(eq(projects.id, l.projectId)).limit(1))[0]
          : null;

        // Compute actual from posted journal entries.
        let actual = 0;
        if (l.accountId) {
          const conditions = [
            eq(journalLines.accountId, l.accountId),
            eq(journalEntries.status, JournalStatus.POSTED),
          ];
          if (l.costCenterId) conditions.push(eq(journalLines.costCenterId, l.costCenterId));
          if (l.projectId) conditions.push(eq(journalLines.projectId, l.projectId));
          const actuals = (
            await db
              .select({
                debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
                credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
              })
              .from(journalLines)
              .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
              .where(and(...conditions))
          )[0];
          // For expenses, actual = debit - credit.
          actual = Number(actuals?.debit || 0) - Number(actuals?.credit || 0);
        }

        return {
          ...l,
          accountCode: account?.code || "",
          accountName: account?.name || "",
          costCenterName: cc?.name || "",
          projectName: project?.name || "",
          actualAmount: actual,
          variance: l.plannedAmount - actual,
          utilization: l.plannedAmount > 0 ? Math.round((actual / l.plannedAmount) * 100) : 0,
        };
      }),
    );

    const totalPlanned = lines.reduce((s, l) => s + l.plannedAmount, 0);
    const totalActual = enrichedLines.reduce((s, l) => s + l.actualAmount, 0);

    return Response.json({
      item: budget,
      lines: enrichedLines,
      totals: {
        planned: totalPlanned,
        actual: totalActual,
        variance: totalPlanned - totalActual,
        utilization: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
      },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const year = url.searchParams.get("year") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(budgets.name, `%${search}%`),
        like(budgets.department, `%${search}%`),
        like(budgets.year, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(budgets.status, status));
  if (year) conditions.push(eq(budgets.year, year));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(budgets).where(where);
  const items = await db
    .select()
    .from(budgets)
    .where(where)
    .orderBy(desc(budgets.year))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const lineSchema = z.object({
  accountId: z.string().nullish(),
  costCenterId: z.string().nullish(),
  projectId: z.string().nullish(),
  plannedAmount: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الموازنة مطلوب"),
  year: z.string().trim().min(1, "سنة الموازنة مطلوبة"),
  amount: z.coerce.number().optional(),
  department: z.string().optional(),
  status: z.nativeEnum(BudgetStatus).optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).optional(),
});

// The client also POSTs { action: "approve" | "lock" | "unlock", id } for workflow.
const postSchema = createSchema.partial().extend({
  action: z.enum(["approve", "lock", "unlock"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    // ---- Workflow actions ----
    if (b.action === "approve" || b.action === "lock" || b.action === "unlock") {
      if (!b.id) return err("معرف الموازنة مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(budgets).where(eq(budgets.id, b.id)).limit(1))[0];
      if (!existing) return err("الموازنة غير موجودة", 404, "NOT_FOUND");

      const before = JSON.stringify(existing);
      const ts = now();

      if (b.action === "approve") {
        if (existing.status === BudgetStatus.APPROVED)
          return err("الموازنة معتمدة بالفعل", 400, "INVALID_STATE");
        if (existing.status === BudgetStatus.LOCKED)
          return err("لا يمكن اعتماد موازنة مقفلة", 400, "INVALID_STATE");

        await db
          .update(budgets)
          .set({
            status: BudgetStatus.APPROVED,
            approvedBy: ctx.user.id,
            approvedAt: ts,
            updatedAt: ts,
          })
          .where(eq(budgets.id, b.id));
        await addAudit({
          action: "approve",
          entityType: "budget",
          entityId: b.id,
          description: `تم اعتماد الموازنة: ${existing.name} (${existing.year})`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "lock") {
        if (existing.status !== BudgetStatus.APPROVED)
          return err("يجب اعتماد الموازنة قبل قفلها", 400, "INVALID_STATE");

        await db
          .update(budgets)
          .set({
            status: BudgetStatus.LOCKED,
            lockedBy: ctx.user.id,
            lockedAt: ts,
            updatedAt: ts,
          })
          .where(eq(budgets.id, b.id));
        await addAudit({
          action: "lock",
          entityType: "budget",
          entityId: b.id,
          description: `تم قفل الموازنة: ${existing.name} (${existing.year})`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else {
        // unlock
        if (existing.status !== BudgetStatus.LOCKED)
          return err("الموازنة ليست مقفلة", 400, "INVALID_STATE");

        await db
          .update(budgets)
          .set({ status: BudgetStatus.APPROVED, updatedAt: ts })
          .where(eq(budgets.id, b.id));
        await addAudit({
          action: "unlock",
          entityType: "budget",
          entityId: b.id,
          description: `تم فتح قفل الموازنة: ${existing.name}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      }

      const updated = (await db.select().from(budgets).where(eq(budgets.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // ---- Create ----
    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const budgetId = genId("BUD");
    const ts = now();
    const headerAmount = c.amount ?? 0;
    const lines = c.lines ?? [];

    // Header + lines written atomically.
    await db.transaction(async (tx) => {
      await tx.insert(budgets).values({
        id: budgetId,
        name: c.name,
        year: c.year,
        amount: headerAmount,
        department: c.department ?? "",
        status: c.status ?? BudgetStatus.DRAFT,
        currency: c.currency ?? "SAR",
        description: c.description ?? "",
        notes: c.notes ?? "",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });

      if (lines.length > 0) {
        let lineNum = 1;
        let totalPlanned = 0;
        for (const line of lines) {
          const planned = line.plannedAmount ?? 0;
          totalPlanned += planned;
          await tx.insert(budgetLines).values({
            id: genId("BL"),
            budgetId,
            lineNumber: lineNum++,
            accountId: line.accountId || null,
            costCenterId: line.costCenterId || null,
            projectId: line.projectId || null,
            plannedAmount: planned,
            actualAmount: 0,
            notes: line.notes || "",
            createdAt: ts,
          });
        }
        // Sync header amount to the sum of lines.
        if (totalPlanned !== headerAmount) {
          await tx
            .update(budgets)
            .set({ amount: totalPlanned, updatedAt: ts })
            .where(eq(budgets.id, budgetId));
        }
      }
    });

    await addAudit({
      action: "create",
      entityType: "budget",
      entityId: budgetId,
      description: `تم إضافة موازنة: ${c.name} (${c.year})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الموازنة مطلوب"),
  name: z.string().trim().min(1).optional(),
  year: z.string().trim().min(1).optional(),
  amount: z.coerce.number().optional(),
  department: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).optional(),
});

// PUT /api/finance/budgets — draft only.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);

    const existing = (await db.select().from(budgets).where(eq(budgets.id, b.id)).limit(1))[0];
    if (!existing) return err("الموازنة غير موجودة", 404, "NOT_FOUND");
    if (existing.status !== BudgetStatus.DRAFT)
      return err("لا يمكن تعديل موازنة معتمدة أو مقفلة", 400, "INVALID_STATE");

    const before = JSON.stringify(existing);
    const ts = now();
    const hasLines = Array.isArray(b.lines) && b.lines.length > 0;

    // Header update + line replacement written atomically.
    await db.transaction(async (tx) => {
      if (hasLines) {
        const lines = b.lines!;
        let totalPlanned = 0;
        for (const line of lines) totalPlanned += line.plannedAmount ?? 0;

        await tx.delete(budgetLines).where(eq(budgetLines.budgetId, b.id));
        let lineNum = 1;
        for (const line of lines) {
          await tx.insert(budgetLines).values({
            id: genId("BL"),
            budgetId: b.id,
            lineNumber: lineNum++,
            accountId: line.accountId || null,
            costCenterId: line.costCenterId || null,
            projectId: line.projectId || null,
            plannedAmount: line.plannedAmount ?? 0,
            actualAmount: 0,
            notes: line.notes || "",
            createdAt: ts,
          });
        }

        await tx
          .update(budgets)
          .set({
            name: b.name ?? existing.name,
            year: b.year ?? existing.year,
            department: b.department ?? existing.department,
            description: b.description ?? existing.description,
            notes: b.notes ?? existing.notes,
            amount: totalPlanned,
            updatedAt: ts,
          })
          .where(eq(budgets.id, b.id));
      } else {
        await tx
          .update(budgets)
          .set({
            name: b.name ?? existing.name,
            year: b.year ?? existing.year,
            department: b.department ?? existing.department,
            description: b.description ?? existing.description,
            notes: b.notes ?? existing.notes,
            updatedAt: ts,
          })
          .where(eq(budgets.id, b.id));
      }
    });

    await addAudit({
      action: "update",
      entityType: "budget",
      entityId: b.id,
      description: `تم تحديث الموازنة: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(budgets).where(eq(budgets.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/finance/budgets?id=xxx — drafts only. Identity from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الموازنة مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1))[0];
  if (!existing) return err("الموازنة غير موجودة", 404, "NOT_FOUND");
  if (existing.status !== BudgetStatus.DRAFT)
    return err("لا يمكن حذف موازنة معتمدة أو مقفلة", 400, "INVALID_STATE");

  const before = JSON.stringify(existing);
  await db.delete(budgets).where(eq(budgets.id, id));
  await addAudit({
    action: "delete",
    entityType: "budget",
    entityId: id,
    description: `تم حذف الموازنة: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/budgets")({
  server: {
    handlers: {
      GET: authHandler("finance.view", GET),
      POST: authHandler("finance.create", POST),
      PUT: authHandler("finance.update", PUT),
      DELETE: authHandler("finance.delete", DELETE),
    },
  },
});
