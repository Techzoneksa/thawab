import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { branches } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { BranchStatus } from "@/lib/enums";

// GET /api/settings/branches?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(branches).where(eq(branches.id, id)).limit(1))[0];
    if (!item) return err("الفرع غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search) conditions.push(like(branches.name, `%${search}%`));
  if (status) conditions.push(eq(branches.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(branches).where(where).orderBy(desc(branches.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الفرع مطلوب"),
  city: z.string().optional(),
  manager: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.nativeEnum(BranchStatus).optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("BR");
    const ts = now();

    await db.insert(branches).values({
      id,
      name: b.name,
      city: b.city ?? "",
      manager: b.manager ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      status: b.status ?? BranchStatus.ACTIVE,
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "branch",
      entityId: id,
      description: `إضافة فرع: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(branches).where(eq(branches.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  city: z.string().optional(),
  manager: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.nativeEnum(BranchStatus).optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(branches).where(eq(branches.id, b.id)).limit(1))[0];
    if (!existing) return err("الفرع غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(branches)
      .set({
        name: b.name ?? existing.name,
        city: b.city ?? existing.city,
        manager: b.manager ?? existing.manager,
        phone: b.phone ?? existing.phone,
        email: b.email ?? existing.email,
        status: b.status ?? existing.status,
      })
      .where(eq(branches.id, b.id));

    await addAudit({
      action: "update",
      entityType: "branch",
      entityId: b.id,
      description: `تحديث الفرع: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(branches).where(eq(branches.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الفرع مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(branches).where(eq(branches.id, id)).limit(1))[0];
  if (!existing) return err("الفرع غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(branches).where(eq(branches.id, id));
  await addAudit({
    action: "delete",
    entityType: "branch",
    entityId: id,
    description: `حذف الفرع: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/settings/branches")({
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
      POST: authHandler("settings.manage", POST),
      PUT: authHandler("settings.manage", PUT),
      DELETE: authHandler("settings.manage", DELETE),
    },
  },
});
