import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db, now, addAudit } from "@/server/db/index";
import {
  journalEntries,
  journalLines,
  accounts,
  costCenters,
  projects,
  importBatches,
} from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { postBalancedEntry } from "@/server/db/gl";
import { hasPermission } from "@/server/db/auth";
import { transitionJournal, journalWorkflowHistory } from "@/server/db/finance-workflow";
import { AppError } from "@/server/db/errors";
import { JournalStatus, Fund } from "@/lib/enums";
import { FINANCE_PERMISSIONS } from "@/lib/finance-permissions";

const lineSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().optional(),
  debit: z.coerce.number().min(0).optional(),
  credit: z.coerce.number().min(0).optional(),
  costCenterId: z.string().nullish(),
  projectId: z.string().nullish(),
  notes: z.string().optional(),
});

const createSchema = z.object({
  date: z.string().optional(),
  description: z.string().trim().min(1, "الوصف مطلوب"),
  fund: z.nativeEnum(Fund).optional(),
  projectId: z.string().nullish(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(2, "القيد يجب أن يحتوي على سطرين على الأقل"),
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["submit", "approve", "return", "reject", "post", "reverse", "cancel"]),
  reason: z.string().optional(),
});

async function enrichLines(rows: any[]) {
  if (rows.length === 0) return [];
  const accIds = [...new Set(rows.map((l) => l.accountId).filter(Boolean))];
  const ccIds = [...new Set(rows.map((l) => l.costCenterId).filter(Boolean))];
  const prIds = [...new Set(rows.map((l) => l.projectId).filter(Boolean))];
  const accs = accIds.length
    ? await db.select().from(accounts).where(inArray(accounts.id, accIds))
    : [];
  const ccs = ccIds.length
    ? await db.select().from(costCenters).where(inArray(costCenters.id, ccIds))
    : [];
  const prs = prIds.length
    ? await db.select().from(projects).where(inArray(projects.id, prIds))
    : [];
  const accMap = new Map(accs.map((a) => [a.id, a]));
  const ccMap = new Map(ccs.map((c) => [c.id, c]));
  const prMap = new Map(prs.map((p) => [p.id, p]));
  return rows.map((l) => ({
    ...l,
    accountCode: accMap.get(l.accountId)?.code,
    accountName: accMap.get(l.accountId)?.name,
    costCenterName: l.costCenterId ? ccMap.get(l.costCenterId)?.name : undefined,
    projectName: l.projectId ? prMap.get(l.projectId)?.name : undefined,
  }));
}

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (
      await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1)
    )[0];
    if (!item) return err("القيد غير موجود", 404, "NOT_FOUND");
    const rawLines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber);
    const lines = await enrichLines(rawLines);
    const debit = rawLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = rawLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    const reversedOf = item.reversedOf
      ? (
          await db
            .select()
            .from(journalEntries)
            .where(eq(journalEntries.id, item.reversedOf))
            .limit(1)
        )[0] || null
      : null;
    const reversalEntries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.reversedOf, id));
    // Traceability: imported journals link to their import batch (filename,
    // hash, who/when) via source_type='journal_import', source_id=batchId.
    const importBatch =
      item.sourceType === "journal_import" && item.sourceId
        ? (
            await db
              .select()
              .from(importBatches)
              .where(eq(importBatches.id, item.sourceId))
              .limit(1)
          )[0] || null
        : null;
    const workflowHistory = await journalWorkflowHistory(id);
    return Response.json({
      item,
      lines,
      totals: { debit, credit, balanced: Math.abs(debit - credit) < 0.005 },
      reversedOf,
      reversalEntries,
      importBatch,
      workflowHistory,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const fund = url.searchParams.get("fund") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(journalEntries.number, `%${search}%`),
        like(journalEntries.description, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(journalEntries.status, status));
  if (fund) conditions.push(eq(journalEntries.fund, fund));
  if (projectId) conditions.push(eq(journalEntries.projectId, projectId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(journalEntries).where(where);
  const items = await db
    .select()
    .from(journalEntries)
    .where(where)
    .orderBy(desc(journalEntries.date), desc(journalEntries.number))
    .limit(limit)
    .offset(offset);

  // Aggregate line stats in one query (no N+1).
  const ids = items.map((i) => i.id);
  const stats = ids.length
    ? await db
        .select({
          journalEntryId: journalLines.journalEntryId,
          lineCount: count(),
          totalDebit: sql<number>`coalesce(sum(${journalLines.debit}),0)`,
          totalCredit: sql<number>`coalesce(sum(${journalLines.credit}),0)`,
        })
        .from(journalLines)
        .where(inArray(journalLines.journalEntryId, ids))
        .groupBy(journalLines.journalEntryId)
    : [];
  const statMap = new Map(stats.map((s) => [s.journalEntryId, s]));
  const enriched = items.map((i) => {
    const s = statMap.get(i.id);
    return {
      ...i,
      lineCount: s ? Number(s.lineCount) : 0,
      totalDebit: s ? Number(s.totalDebit) : 0,
      totalCredit: s ? Number(s.totalCredit) : 0,
    };
  });

  return Response.json({ items: enriched, total: Number(total), page, limit });
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    // Distinguish create vs lifecycle action.
    const body = await event.request.json().catch(() => ({}));
    if (body && typeof body === "object" && "action" in body) {
      // Every governance transition (submit/approve/return/reject/post/reverse/
      // cancel) is enforced server-side by the workflow service: state matrix +
      // exact per-action permission + maker≠checker + required reason. Posting
      // and reversal reuse the certified Phase 1A engine.
      const { id, action, reason } = actionSchema.parse(body);
      const { item, reversalId } = await transitionJournal(ctx, id, action, reason);
      return Response.json({ item, reversalId });
    }

    // Create a new (draft) balanced entry — requires the create permission.
    if (!(await hasPermission(ctx.user.role, FINANCE_PERMISSIONS.journalCreate)))
      return err("لا تملك صلاحية إنشاء القيود", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const entryId = await db.transaction((tx) =>
      postBalancedEntry(tx as any, {
        date: (b.date || now()).slice(0, 10),
        description: b.description,
        fund: b.fund,
        currency: b.currency,
        projectId: b.projectId ?? null,
        source: "manual",
        lines: b.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          fund: b.fund,
          description: l.description,
          costCenterId: l.costCenterId ?? null,
          projectId: l.projectId ?? null,
        })),
        userId: ctx.user.id,
        status: JournalStatus.DRAFT,
      }),
    );
    await addAudit({
      action: "create",
      entityType: "journal_entry",
      entityId: entryId,
      description: `إنشاء قيد: ${b.description}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const item = (
      await db.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1)
    )[0];
    return Response.json({ item }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  date: z.string().optional(),
  description: z.string().optional(),
  fund: z.nativeEnum(Fund).optional(),
  projectId: z.string().nullish(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(2).optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const entry = (
      await db.select().from(journalEntries).where(eq(journalEntries.id, b.id)).limit(1)
    )[0];
    if (!entry) return err("القيد غير موجود", 404, "NOT_FOUND");
    if (entry.status !== JournalStatus.DRAFT)
      return err("يمكن تعديل المسودات فقط", 400, "BAD_STATE");

    const before = JSON.stringify(entry);
    await db.transaction(async (tx) => {
      const ts = now();
      if (b.lines) {
        const debit = b.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
        const credit = b.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
        if (Math.abs(debit - credit) > 0.005) throw new AppError("القيد غير متوازن");
        await tx.delete(journalLines).where(eq(journalLines.journalEntryId, b.id));
        let n = 0;
        for (const l of b.lines) {
          await tx.insert(journalLines).values({
            id: `JL-${b.id}-${++n}`,
            journalEntryId: b.id,
            lineNumber: n,
            accountId: l.accountId,
            description: l.description ?? "",
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            fund: b.fund ?? entry.fund,
            costCenterId: l.costCenterId ?? null,
            projectId: l.projectId ?? null,
            createdAt: ts,
          });
        }
        await tx.update(journalEntries).set({ amount: debit }).where(eq(journalEntries.id, b.id));
      }
      await tx
        .update(journalEntries)
        .set({
          date: b.date ? b.date.slice(0, 10) : entry.date,
          description: b.description ?? entry.description,
          fund: b.fund ?? entry.fund,
          projectId: b.projectId === undefined ? entry.projectId : b.projectId,
          notes: b.notes ?? entry.notes,
          updatedAt: ts,
        })
        .where(eq(journalEntries.id, b.id));
    });

    await addAudit({
      action: "update",
      entityType: "journal_entry",
      entityId: b.id,
      description: `تعديل القيد ${entry.number}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });
    const item = (
      await db.select().from(journalEntries).where(eq(journalEntries.id, b.id)).limit(1)
    )[0];
    return Response.json({ item });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف القيد مطلوب", 400, "BAD_REQUEST");
  const entry = (
    await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1)
  )[0];
  if (!entry) return err("القيد غير موجود", 404, "NOT_FOUND");
  if (entry.status !== JournalStatus.DRAFT) return err("يمكن حذف المسودات فقط", 400, "BAD_STATE");
  await db.delete(journalEntries).where(eq(journalEntries.id, id)); // lines cascade
  await addAudit({
    action: "delete",
    entityType: "journal_entry",
    entityId: id,
    description: `حذف القيد ${entry.number}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/journal")({
  server: {
    handlers: {
      // Reads stay under the finance read permission. Every WRITE is granular:
      // POST create → finance.journal.create (checked inside); POST actions →
      // per-action permission enforced by the workflow service. Draft edit/
      // delete require finance.journal.update_draft.
      GET: authHandler("finance.view", GET),
      POST: authHandler("finance.view", POST),
      PUT: authHandler(FINANCE_PERMISSIONS.journalUpdateDraft, PUT),
      DELETE: authHandler(FINANCE_PERMISSIONS.journalUpdateDraft, DELETE),
    },
  },
});
