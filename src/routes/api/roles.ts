import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { roles, users } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";

function parsePerms(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function shape(r: typeof roles.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    permissions: parsePerms(r.permissions),
    createdAt: r.createdAt,
  };
}

// GET /api/roles?id=xxx — single (+ user count); else list with user counts.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const r = (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0];
    if (!r) return err("الدور غير موجود", 404, "NOT_FOUND");
    const [{ c: userCount }] = await db
      .select({ c: count() })
      .from(users)
      .where(eq(users.role, id));
    return Response.json({ item: shape(r), userCount: Number(userCount) });
  }

  const all = await db.select().from(roles).orderBy(roles.name);
  const counts = await db.select({ role: users.role, c: count() }).from(users).groupBy(users.role);
  const countMap = new Map(counts.map((x) => [x.role, Number(x.c)]));
  const items = all.map((r) => ({ ...shape(r), userCount: countMap.get(r.id) ?? 0 }));
  return Response.json({ items, total: items.length });
}

const permsSchema = z.array(z.string().trim().min(1)).max(500);

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الدور مطلوب"),
  description: z.string().optional(),
  permissions: permsSchema.optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);

    const dup = (await db.select().from(roles).where(eq(roles.name, b.name)).limit(1))[0];
    if (dup) return err("اسم الدور مستخدم بالفعل", 400, "DUPLICATE");

    const roleId = genId("role");
    const ts = now();
    const perms = Array.from(new Set(b.permissions ?? []));

    await db.insert(roles).values({
      id: roleId,
      name: b.name,
      description: b.description ?? "",
      permissions: JSON.stringify(perms),
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "role",
      entityId: roleId,
      description: `تم إضافة دور: ${b.name} (${perms.length} صلاحية)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0];
    return Response.json({ item: shape(created) }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الدور مطلوب"),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  permissions: permsSchema.optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(roles).where(eq(roles.id, b.id)).limit(1))[0];
    if (!existing) return err("الدور غير موجود", 404, "NOT_FOUND");

    if (b.name && b.name !== existing.name) {
      const dup = (await db.select().from(roles).where(eq(roles.name, b.name)).limit(1))[0];
      if (dup && dup.id !== b.id) return err("اسم الدور مستخدم بالفعل", 400, "DUPLICATE");
    }

    const before = JSON.stringify(existing);
    const perms = b.permissions
      ? Array.from(new Set(b.permissions))
      : parsePerms(existing.permissions);
    await db
      .update(roles)
      .set({
        name: b.name ?? existing.name,
        description: b.description ?? existing.description,
        permissions: JSON.stringify(perms),
      })
      .where(eq(roles.id, b.id));

    await addAudit({
      action: "update",
      entityType: "role",
      entityId: b.id,
      description: `تم تحديث الدور: ${b.name || existing.name} (${perms.length} صلاحية)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(roles).where(eq(roles.id, b.id)).limit(1))[0];
    return Response.json({ item: shape(updated) });
  });
}

// DELETE /api/roles?id=xxx — blocked if any user still holds the role.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الدور مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0];
  if (!existing) return err("الدور غير موجود", 404, "NOT_FOUND");

  const [{ c: userCount }] = await db.select({ c: count() }).from(users).where(eq(users.role, id));
  if (Number(userCount) > 0) {
    return err(
      `لا يمكن حذف دور مُسند إلى ${Number(userCount)} مستخدم. انقل المستخدمين إلى دور آخر أولاً.`,
      400,
      "IN_USE",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(roles).where(eq(roles.id, id));
  await addAudit({
    action: "delete",
    entityType: "role",
    entityId: id,
    description: `تم حذف الدور: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/roles")({
  server: {
    handlers: {
      GET: authHandler("users.view", GET),
      POST: authHandler("users.create", POST),
      PUT: authHandler("users.update", PUT),
      DELETE: authHandler("users.delete", DELETE),
    },
  },
});
