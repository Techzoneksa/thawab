import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { endowments } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { EndowmentType, EndowmentStatus } from "@/lib/enums";

// GET /api/endowments?id=xxx — single; else list with optional search/type/status.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(endowments).where(eq(endowments.id, id)).limit(1))[0];
    if (!item) return err("الوقف غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const type = url.searchParams.get("type") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search) conditions.push(like(endowments.name, `%${search}%`));
  if (type) conditions.push(eq(endowments.type, type));
  if (status) conditions.push(eq(endowments.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(endowments).where(where).orderBy(desc(endowments.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الوقف مطلوب"),
  type: z.nativeEnum(EndowmentType).optional(),
  value: z.coerce.number().min(0, "القيمة لا يمكن أن تكون سالبة").optional(),
  returns: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(EndowmentStatus).optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("WQF");
    const ts = now();

    await db.insert(endowments).values({
      id,
      name: b.name,
      type: b.type ?? EndowmentType.GENERAL,
      value: b.value ?? 0,
      returns: b.returns ?? 0,
      status: b.status ?? EndowmentStatus.ACTIVE,
      notes: b.notes ?? "",
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "endowment",
      entityId: id,
      description: `إضافة وقف: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(endowments).where(eq(endowments.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  type: z.nativeEnum(EndowmentType).optional(),
  value: z.coerce.number().min(0).optional(),
  returns: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(EndowmentStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(endowments).where(eq(endowments.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("الوقف غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(endowments)
      .set({
        name: b.name ?? existing.name,
        type: b.type ?? existing.type,
        value: b.value ?? existing.value,
        returns: b.returns ?? existing.returns,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
      })
      .where(eq(endowments.id, b.id));

    await addAudit({
      action: "update",
      entityType: "endowment",
      entityId: b.id,
      description: `تحديث الوقف: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(endowments).where(eq(endowments.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الوقف مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(endowments).where(eq(endowments.id, id)).limit(1))[0];
  if (!existing) return err("الوقف غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(endowments).where(eq(endowments.id, id));
  await addAudit({
    action: "delete",
    entityType: "endowment",
    entityId: id,
    description: `حذف الوقف: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/endowments")({
  server: {
    handlers: {
      GET: authHandler("endowments.view", GET),
      POST: authHandler("endowments.create", POST),
      PUT: authHandler("endowments.update", PUT),
      DELETE: authHandler("endowments.delete", DELETE),
    },
  },
});
