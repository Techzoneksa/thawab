import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { savedReports } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { ReportType, ReportPeriod, ReportFormat } from "@/lib/enums";

// GET /api/reports/saved?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(savedReports).where(eq(savedReports.id, id)).limit(1))[0];
    if (!item) return err("التقرير غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const [{ c: total }] = await db.select({ c: count() }).from(savedReports);
  const items = await db.select().from(savedReports).orderBy(desc(savedReports.createdAt));
  return Response.json({ items, total: Number(total) });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم التقرير مطلوب"),
  type: z.nativeEnum(ReportType).optional(),
  period: z.nativeEnum(ReportPeriod).optional(),
  format: z.nativeEnum(ReportFormat).optional(),
  scheduled: z.coerce.boolean().optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const c = await parseBody(event.request, createSchema);
    const rId = genId("RPT");
    const ts = now();

    await db.insert(savedReports).values({
      id: rId,
      name: c.name,
      type: c.type ?? ReportType.FINANCIAL,
      period: c.period ?? ReportPeriod.MONTHLY,
      format: c.format ?? ReportFormat.PDF,
      scheduled: c.scheduled ?? false,
      notes: c.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "saved_report",
      entityId: rId,
      description: `تم حفظ تقرير: ${c.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(savedReports).where(eq(savedReports.id, rId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف التقرير مطلوب"),
  name: z.string().trim().min(1).optional(),
  type: z.nativeEnum(ReportType).optional(),
  period: z.nativeEnum(ReportPeriod).optional(),
  format: z.nativeEnum(ReportFormat).optional(),
  scheduled: z.coerce.boolean().optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(savedReports).where(eq(savedReports.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("التقرير غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(savedReports)
      .set({
        name: b.name ?? existing.name,
        type: b.type ?? existing.type,
        period: b.period ?? existing.period,
        format: b.format ?? existing.format,
        scheduled: b.scheduled ?? existing.scheduled,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(savedReports.id, b.id));

    await addAudit({
      action: "update",
      entityType: "saved_report",
      entityId: b.id,
      description: `تم تحديث التقرير: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(savedReports).where(eq(savedReports.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/reports/saved?id=xxx
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف التقرير مطلوب", 400, "BAD_REQUEST");

  const existing = (
    await db.select().from(savedReports).where(eq(savedReports.id, id)).limit(1)
  )[0];
  if (!existing) return err("التقرير غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(savedReports).where(eq(savedReports.id, id));
  await addAudit({
    action: "delete",
    entityType: "saved_report",
    entityId: id,
    description: `تم حذف التقرير: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/reports/saved")({
  server: {
    handlers: {
      GET: authHandler("reports.view", GET),
      POST: authHandler("reports.create", POST),
      PUT: authHandler("reports.update", PUT),
      DELETE: authHandler("reports.delete", DELETE),
    },
  },
});
