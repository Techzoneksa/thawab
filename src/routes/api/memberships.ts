import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { memberships } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { MembershipRole, MembershipType, MembershipStatus } from "@/lib/enums";

// GET /api/memberships?id=xxx — single; else list with optional search/type/status.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(memberships).where(eq(memberships.id, id)).limit(1))[0];
    if (!item) return err("العضو غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const type = url.searchParams.get("type") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search) conditions.push(like(memberships.name, `%${search}%`));
  if (type) conditions.push(eq(memberships.type, type));
  if (status) conditions.push(eq(memberships.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(memberships)
    .where(where)
    .orderBy(desc(memberships.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم العضو مطلوب"),
  role: z.nativeEnum(MembershipRole).optional(),
  type: z.nativeEnum(MembershipType).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.nativeEnum(MembershipStatus).optional(),
  joinedAt: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("MBR");
    const ts = now();

    await db.insert(memberships).values({
      id,
      name: b.name,
      role: b.role ?? MembershipRole.MEMBER,
      type: b.type ?? MembershipType.BOARD,
      phone: b.phone ?? "",
      email: b.email ?? "",
      status: b.status ?? MembershipStatus.ACTIVE,
      joinedAt: b.joinedAt ?? ts.slice(0, 10),
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "membership",
      entityId: id,
      description: `إضافة عضو: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(memberships).where(eq(memberships.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  role: z.nativeEnum(MembershipRole).optional(),
  type: z.nativeEnum(MembershipType).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.nativeEnum(MembershipStatus).optional(),
  joinedAt: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(memberships).where(eq(memberships.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("العضو غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(memberships)
      .set({
        name: b.name ?? existing.name,
        role: b.role ?? existing.role,
        type: b.type ?? existing.type,
        phone: b.phone ?? existing.phone,
        email: b.email ?? existing.email,
        status: b.status ?? existing.status,
        joinedAt: b.joinedAt ?? existing.joinedAt,
      })
      .where(eq(memberships.id, b.id));

    await addAudit({
      action: "update",
      entityType: "membership",
      entityId: b.id,
      description: `تحديث بيانات العضو: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(memberships).where(eq(memberships.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف العضو مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(memberships).where(eq(memberships.id, id)).limit(1))[0];
  if (!existing) return err("العضو غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(memberships).where(eq(memberships.id, id));
  await addAudit({
    action: "delete",
    entityType: "membership",
    entityId: id,
    description: `حذف العضو: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/memberships")({
  server: {
    handlers: {
      GET: authHandler("memberships.view", GET),
      POST: authHandler("memberships.create", POST),
      PUT: authHandler("memberships.update", PUT),
      DELETE: authHandler("memberships.delete", DELETE),
    },
  },
});
