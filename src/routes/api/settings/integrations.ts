import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { integrations } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { IntegrationCategory, IntegrationStatus } from "@/lib/enums";

// Never leak the raw API key to the client; expose only whether one is set.
function shape(r: typeof integrations.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    apiUrl: r.apiUrl ?? "",
    hasKey: !!(r.apiKey && r.apiKey.length > 0),
    status: r.status,
    info: r.info ?? "",
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const r = (await db.select().from(integrations).where(eq(integrations.id, id)).limit(1))[0];
    if (!r) return err("التكامل غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: shape(r) });
  }
  const [{ c: total }] = await db.select({ c: count() }).from(integrations);
  const rows = await db.select().from(integrations).orderBy(desc(integrations.createdAt));
  return Response.json({ items: rows.map(shape), total: Number(total) });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم التكامل مطلوب"),
  category: z.nativeEnum(IntegrationCategory).optional(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  status: z.nativeEnum(IntegrationStatus).optional(),
  info: z.string().optional(),
});

const postSchema = createSchema.partial().extend({
  action: z.enum(["activate", "deactivate"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "activate" || b.action === "deactivate") {
      if (!b.id) return err("معرف التكامل مطلوب", 400, "BAD_REQUEST");
      const existing = (
        await db.select().from(integrations).where(eq(integrations.id, b.id)).limit(1)
      )[0];
      if (!existing) return err("التكامل غير موجود", 404, "NOT_FOUND");
      const target =
        b.action === "deactivate" ? IntegrationStatus.INACTIVE : IntegrationStatus.ACTIVE;
      await db
        .update(integrations)
        .set({ status: target, updatedAt: now() })
        .where(eq(integrations.id, b.id));
      await addAudit({
        action: b.action,
        entityType: "integration",
        entityId: b.id,
        description: `${b.action === "deactivate" ? "تعطيل" : "تفعيل"} التكامل: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        ip: ctx.ip,
      });
      const updated = (
        await db.select().from(integrations).where(eq(integrations.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: shape(updated) });
    }

    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;
    const iId = genId("INTG");
    const ts = now();
    await db.insert(integrations).values({
      id: iId,
      name: c.name,
      category: c.category ?? IntegrationCategory.PAYMENTS,
      apiUrl: c.apiUrl ?? "",
      apiKey: c.apiKey ?? "",
      status: c.status ?? IntegrationStatus.ACTIVE,
      info: c.info ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await addAudit({
      action: "create",
      entityType: "integration",
      entityId: iId,
      description: `تم إضافة تكامل: ${c.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const created = (
      await db.select().from(integrations).where(eq(integrations.id, iId)).limit(1)
    )[0];
    return Response.json({ item: shape(created) }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف التكامل مطلوب"),
  name: z.string().trim().min(1).optional(),
  category: z.nativeEnum(IntegrationCategory).optional(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  status: z.nativeEnum(IntegrationStatus).optional(),
  info: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(integrations).where(eq(integrations.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("التكامل غير موجود", 404, "NOT_FOUND");
    const before = JSON.stringify(shape(existing));
    await db
      .update(integrations)
      .set({
        name: b.name ?? existing.name,
        category: b.category ?? existing.category,
        apiUrl: b.apiUrl ?? existing.apiUrl,
        // Only overwrite the key when a non-empty value is supplied.
        apiKey: b.apiKey && b.apiKey.length > 0 ? b.apiKey : existing.apiKey,
        status: b.status ?? existing.status,
        info: b.info ?? existing.info,
        updatedAt: now(),
      })
      .where(eq(integrations.id, b.id));
    await addAudit({
      action: "update",
      entityType: "integration",
      entityId: b.id,
      description: `تم تحديث التكامل: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });
    const updated = (
      await db.select().from(integrations).where(eq(integrations.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: shape(updated) });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف التكامل مطلوب", 400, "BAD_REQUEST");
  const existing = (
    await db.select().from(integrations).where(eq(integrations.id, id)).limit(1)
  )[0];
  if (!existing) return err("التكامل غير موجود", 404, "NOT_FOUND");
  await db.delete(integrations).where(eq(integrations.id, id));
  await addAudit({
    action: "delete",
    entityType: "integration",
    entityId: id,
    description: `تم حذف التكامل: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/settings/integrations")({
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
      POST: authHandler("settings.create", POST),
      PUT: authHandler("settings.update", PUT),
      DELETE: authHandler("settings.delete", DELETE),
    },
  },
});
