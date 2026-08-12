import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { grants } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { GrantStatus } from "@/lib/enums";

// GET /api/grants?id=xxx — single; else list with optional search/status filter.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(grants).where(eq(grants.id, id)).limit(1))[0];
    if (!item) return err("المنحة غير موجودة", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search)
    conditions.push(or(like(grants.name, `%${search}%`), like(grants.donor, `%${search}%`)));
  if (status) conditions.push(eq(grants.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(grants).where(where).orderBy(desc(grants.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم المنحة مطلوب"),
  donor: z.string().trim().min(1, "الجهة المانحة مطلوبة"),
  amount: z.coerce.number().min(0, "القيمة لا يمكن أن تكون سالبة").optional(),
  status: z.nativeEnum(GrantStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("GRT");
    const ts = now();

    await db.insert(grants).values({
      id,
      name: b.name,
      donor: b.donor,
      amount: b.amount ?? 0,
      status: b.status ?? GrantStatus.PENDING,
      startDate: b.startDate ?? "",
      endDate: b.endDate ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "grant",
      entityId: id,
      description: `إضافة منحة: ${b.name} من ${b.donor}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(grants).where(eq(grants.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  donor: z.string().trim().min(1).optional(),
  amount: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(GrantStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(grants).where(eq(grants.id, b.id)).limit(1))[0];
    if (!existing) return err("المنحة غير موجودة", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(grants)
      .set({
        name: b.name ?? existing.name,
        donor: b.donor ?? existing.donor,
        amount: b.amount ?? existing.amount,
        status: b.status ?? existing.status,
        startDate: b.startDate ?? existing.startDate,
        endDate: b.endDate ?? existing.endDate,
        notes: b.notes ?? existing.notes,
      })
      .where(eq(grants.id, b.id));

    await addAudit({
      action: "update",
      entityType: "grant",
      entityId: b.id,
      description: `تحديث المنحة: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(grants).where(eq(grants.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المنحة مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(grants).where(eq(grants.id, id)).limit(1))[0];
  if (!existing) return err("المنحة غير موجودة", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(grants).where(eq(grants.id, id));
  await addAudit({
    action: "delete",
    entityType: "grant",
    entityId: id,
    description: `حذف المنحة: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/grants")({
  server: {
    handlers: {
      GET: authHandler("grants.view", GET),
      POST: authHandler("grants.create", POST),
      PUT: authHandler("grants.update", PUT),
      DELETE: authHandler("grants.delete", DELETE),
    },
  },
});
