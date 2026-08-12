import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { notifications } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { NotificationTone } from "@/lib/enums";

// GET /api/notifications — list (newest first) + unread count. Any authed user.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100") || 100));

  const where = unreadOnly ? eq(notifications.read, false) : undefined;
  const items = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ c: unread }] = await db
    .select({ c: count() })
    .from(notifications)
    .where(eq(notifications.read, false));

  return Response.json({ items, total: items.length, unread: Number(unread) });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "نص التنبيه مطلوب"),
  body: z.string().optional(),
  tone: z.nativeEnum(NotificationTone).optional(),
  link: z.string().optional(),
});

const postSchema = createSchema.partial().extend({
  action: z.enum(["mark_read", "mark_unread", "mark_all_read"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "mark_all_read") {
      await db
        .update(notifications)
        .set({ read: true, readAt: now() })
        .where(eq(notifications.read, false));
      return Response.json({ success: true });
    }

    if (b.action === "mark_read" || b.action === "mark_unread") {
      if (!b.id) return err("معرف التنبيه مطلوب", 400, "BAD_REQUEST");
      const read = b.action === "mark_read";
      await db
        .update(notifications)
        .set({ read, readAt: read ? now() : null })
        .where(eq(notifications.id, b.id));
      const updated = (
        await db.select().from(notifications).where(eq(notifications.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    // Create announcement — restricted to admins/settings managers.
    if (!(await hasPermission(ctx.user.role, "settings.update"))) {
      return err("لا تملك صلاحية إنشاء التنبيهات", 403, "FORBIDDEN");
    }
    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const nId = genId("NTF");
    const ts = now();
    await db.insert(notifications).values({
      id: nId,
      title: c.title,
      body: c.body ?? "",
      tone: c.tone ?? NotificationTone.INFO,
      link: c.link ?? "",
      read: false,
      createdBy: ctx.user.id,
      createdAt: ts,
      readAt: null,
    });

    await addAudit({
      action: "create",
      entityType: "notification",
      entityId: nId,
      description: `تم إنشاء تنبيه: ${c.title}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(notifications).where(eq(notifications.id, nId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

// DELETE /api/notifications?id=xxx
async function DELETE({ request }: { request: Request }, _ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف التنبيه مطلوب", 400, "BAD_REQUEST");
  await db.delete(notifications).where(eq(notifications.id, id));
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      // Any authenticated user can read and mark their notifications.
      GET: authHandler(null, GET),
      POST: authHandler(null, POST),
      DELETE: authHandler("settings.update", DELETE),
    },
  },
});
