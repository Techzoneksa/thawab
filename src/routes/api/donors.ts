import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donors } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { DonorType, DonorTag, DonorStatus } from "@/lib/enums";

// GET /api/donors?id=xxx  — single; else list with search/filter/pagination.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const donor = (await db.select().from(donors).where(eq(donors.id, id)).limit(1))[0];
    if (!donor) return err("المتبرع غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: donor });
  }

  const search = url.searchParams.get("search") || "";
  const type = url.searchParams.get("type") || "";
  const tag = url.searchParams.get("tag") || "";
  const city = url.searchParams.get("city") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(donors.name, `%${search}%`),
        like(donors.phone, `%${search}%`),
        like(donors.email, `%${search}%`),
      ),
    );
  }
  if (type) conditions.push(eq(donors.type, type));
  if (tag) conditions.push(eq(donors.tag, tag));
  if (city) conditions.push(eq(donors.city, city));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(donors).where(where);
  const items = await db
    .select()
    .from(donors)
    .where(where)
    .orderBy(desc(donors.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  type: z.nativeEnum(DonorType).optional(),
  email: z.string().email().nullish().or(z.literal("")),
  phone: z.string().nullish(),
  city: z.string().optional(),
  address: z.string().optional(),
  tag: z.nativeEnum(DonorTag).optional(),
  recurring: z.boolean().optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("D");
    const ts = now();

    await db.insert(donors).values({
      id,
      name: b.name,
      type: b.type ?? DonorType.INDIVIDUAL,
      email: b.email || null,
      phone: b.phone || null,
      city: b.city ?? "",
      address: b.address ?? "",
      tag: b.tag ?? DonorTag.BRONZE,
      totalDonations: 0,
      donationCount: 0,
      recurring: b.recurring ?? false,
      notes: b.notes ?? "",
      status: DonorStatus.ACTIVE,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "donor",
      entityId: id,
      description: `تم إضافة متبرع جديد: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(donors).where(eq(donors.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1, "معرف المتبرع مطلوب"),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(donors).where(eq(donors.id, b.id)).limit(1))[0];
    if (!existing) return err("المتبرع غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(donors)
      .set({
        name: b.name ?? existing.name,
        type: b.type ?? existing.type,
        email: b.email === undefined ? existing.email : b.email || null,
        phone: b.phone ?? existing.phone,
        city: b.city ?? existing.city,
        address: b.address ?? existing.address,
        tag: b.tag ?? existing.tag,
        recurring: b.recurring ?? existing.recurring,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(donors.id, b.id));

    await addAudit({
      action: "update",
      entityType: "donor",
      entityId: b.id,
      description: `تم تحديث بيانات المتبرع: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(donors).where(eq(donors.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/donors?id=xxx — soft delete. Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المتبرع مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(donors).where(eq(donors.id, id)).limit(1))[0];
  if (!existing) return err("المتبرع غير موجود", 404, "NOT_FOUND");

  await db
    .update(donors)
    .set({ status: DonorStatus.INACTIVE, updatedAt: now() })
    .where(eq(donors.id, id));

  await addAudit({
    action: "delete",
    entityType: "donor",
    entityId: id,
    description: `تم حذف المتبرع: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/donors")({
  server: {
    handlers: {
      GET: authHandler("donors.view", GET),
      POST: authHandler("donors.create", POST),
      PUT: authHandler("donors.update", PUT),
      DELETE: authHandler("donors.delete", DELETE),
    },
  },
});
