import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { endowmentReturns } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { EndowmentReturnStatus } from "@/lib/enums";

// GET /api/endowment-returns?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (
      await db.select().from(endowmentReturns).where(eq(endowmentReturns.id, id)).limit(1)
    )[0];
    if (!item) return err("عائد الوقف غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const endowmentId = url.searchParams.get("endowmentId") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(endowmentReturns.period, `%${search}%`),
        like(endowmentReturns.endowmentName, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(endowmentReturns.status, status));
  if (endowmentId) conditions.push(eq(endowmentReturns.endowmentId, endowmentId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(endowmentReturns).where(where);
  const [{ s: realized }] = await db
    .select({ s: sql<number>`coalesce(sum(${endowmentReturns.amount}), 0)` })
    .from(endowmentReturns)
    .where(eq(endowmentReturns.status, EndowmentReturnStatus.REALIZED));
  const items = await db
    .select()
    .from(endowmentReturns)
    .where(where)
    .orderBy(desc(endowmentReturns.date))
    .limit(limit)
    .offset(offset);

  return Response.json({
    items,
    total: Number(total),
    realizedTotal: Number(realized),
    page,
    limit,
  });
}

const createSchema = z.object({
  endowmentId: z.string().optional(),
  endowmentName: z.string().optional(),
  period: z.string().trim().min(1, "الفترة مطلوبة"),
  amount: z.coerce.number().nonnegative("المبلغ يجب ألا يكون سالباً"),
  date: z.string().optional(),
  status: z.nativeEnum(EndowmentReturnStatus).optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);

    const retId = genId("ERET");
    const ts = now();

    await db.insert(endowmentReturns).values({
      id: retId,
      endowmentId: b.endowmentId || null,
      endowmentName: b.endowmentName ?? "",
      period: b.period,
      amount: b.amount,
      date: b.date ?? "",
      status: b.status ?? EndowmentReturnStatus.REALIZED,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "endowment_return",
      entityId: retId,
      description: `تم إضافة عائد وقف: ${b.period} - ${b.amount}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(endowmentReturns).where(eq(endowmentReturns.id, retId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف عائد الوقف مطلوب"),
  endowmentId: z.string().optional(),
  endowmentName: z.string().optional(),
  period: z.string().trim().min(1).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  date: z.string().optional(),
  status: z.nativeEnum(EndowmentReturnStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(endowmentReturns).where(eq(endowmentReturns.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("عائد الوقف غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(endowmentReturns)
      .set({
        endowmentId: b.endowmentId !== undefined ? b.endowmentId || null : existing.endowmentId,
        endowmentName: b.endowmentName ?? existing.endowmentName,
        period: b.period ?? existing.period,
        amount: b.amount ?? existing.amount,
        date: b.date ?? existing.date,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(endowmentReturns.id, b.id));

    await addAudit({
      action: "update",
      entityType: "endowment_return",
      entityId: b.id,
      description: `تم تحديث عائد الوقف: ${b.period || existing.period}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(endowmentReturns).where(eq(endowmentReturns.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/endowment-returns?id=xxx — identity from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف عائد الوقف مطلوب", 400, "BAD_REQUEST");

  const existing = (
    await db.select().from(endowmentReturns).where(eq(endowmentReturns.id, id)).limit(1)
  )[0];
  if (!existing) return err("عائد الوقف غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(endowmentReturns).where(eq(endowmentReturns.id, id));
  await addAudit({
    action: "delete",
    entityType: "endowment_return",
    entityId: id,
    description: `تم حذف عائد الوقف: ${existing.period}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/endowment-returns")({
  server: {
    handlers: {
      GET: authHandler("endowments.view", GET),
      POST: authHandler("endowments.create", POST),
      PUT: authHandler("endowments.update", PUT),
      DELETE: authHandler("endowments.delete", DELETE),
    },
  },
});
