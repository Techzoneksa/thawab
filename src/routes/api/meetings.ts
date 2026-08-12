import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { meetings } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { MeetingStatus } from "@/lib/enums";

// GET /api/meetings?id=xxx — single; else list with optional search/status.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(meetings).where(eq(meetings.id, id)).limit(1))[0];
    if (!item) return err("الاجتماع غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search) conditions.push(like(meetings.title, `%${search}%`));
  if (status) conditions.push(eq(meetings.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(meetings).where(where).orderBy(desc(meetings.date));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "عنوان الاجتماع مطلوب"),
  date: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  status: z.nativeEnum(MeetingStatus).optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("MTG");
    const ts = now();

    await db.insert(meetings).values({
      id,
      title: b.title,
      date: b.date ?? ts.slice(0, 10),
      location: b.location ?? "",
      attendees: JSON.stringify(b.attendees ?? []),
      status: b.status ?? MeetingStatus.SCHEDULED,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "meeting",
      entityId: id,
      description: `إضافة اجتماع: ${b.title}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(meetings).where(eq(meetings.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  status: z.nativeEnum(MeetingStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(meetings).where(eq(meetings.id, b.id)).limit(1))[0];
    if (!existing) return err("الاجتماع غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(meetings)
      .set({
        title: b.title ?? existing.title,
        date: b.date ?? existing.date,
        location: b.location ?? existing.location,
        attendees: b.attendees ? JSON.stringify(b.attendees) : existing.attendees,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
      })
      .where(eq(meetings.id, b.id));

    await addAudit({
      action: "update",
      entityType: "meeting",
      entityId: b.id,
      description: `تحديث الاجتماع: ${existing.title}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(meetings).where(eq(meetings.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الاجتماع مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(meetings).where(eq(meetings.id, id)).limit(1))[0];
  if (!existing) return err("الاجتماع غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(meetings).where(eq(meetings.id, id));
  await addAudit({
    action: "delete",
    entityType: "meeting",
    entityId: id,
    description: `حذف الاجتماع: ${existing.title}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/meetings")({
  server: {
    handlers: {
      GET: authHandler("meetings.view", GET),
      POST: authHandler("meetings.create", POST),
      PUT: authHandler("meetings.update", PUT),
      DELETE: authHandler("meetings.delete", DELETE),
    },
  },
});
