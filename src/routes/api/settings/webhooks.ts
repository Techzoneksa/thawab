import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { webhooks } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { WebhookEvent } from "@/lib/enums";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const r = (await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1))[0];
    if (!r) return err("الـ Webhook غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: r });
  }
  const [{ c: total }] = await db.select({ c: count() }).from(webhooks);
  const items = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
  return Response.json({ items, total: Number(total) });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  url: z.string().trim().min(1, "الرابط مطلوب"),
  event: z.nativeEnum(WebhookEvent).optional(),
  active: z.coerce.boolean().optional(),
});

const postSchema = createSchema.partial().extend({
  action: z.enum(["toggle"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "toggle") {
      if (!b.id) return err("معرف الـ Webhook مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(webhooks).where(eq(webhooks.id, b.id)).limit(1))[0];
      if (!existing) return err("الـ Webhook غير موجود", 404, "NOT_FOUND");
      await db
        .update(webhooks)
        .set({ active: !existing.active, updatedAt: now() })
        .where(eq(webhooks.id, b.id));
      const updated = (await db.select().from(webhooks).where(eq(webhooks.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;
    const wId = genId("WHK");
    const ts = now();
    await db.insert(webhooks).values({
      id: wId,
      name: c.name,
      url: c.url,
      event: c.event ?? WebhookEvent.DONATION_CREATED,
      active: c.active ?? true,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await addAudit({
      action: "create",
      entityType: "webhook",
      entityId: wId,
      description: `تم إضافة Webhook: ${c.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const created = (await db.select().from(webhooks).where(eq(webhooks.id, wId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الـ Webhook مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1))[0];
  if (!existing) return err("الـ Webhook غير موجود", 404, "NOT_FOUND");
  await db.delete(webhooks).where(eq(webhooks.id, id));
  await addAudit({
    action: "delete",
    entityType: "webhook",
    entityId: id,
    description: `تم حذف Webhook: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/settings/webhooks")({
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
      POST: authHandler("settings.create", POST),
      DELETE: authHandler("settings.delete", DELETE),
    },
  },
});
