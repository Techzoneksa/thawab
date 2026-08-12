import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donorOrgs } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { DonorOrgCategory, DonorOrgStatus } from "@/lib/enums";

// GET /api/donor-orgs?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, id)).limit(1))[0];
    if (!item) return err("الجهة المانحة غير موجودة", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(like(donorOrgs.name, `%${search}%`), like(donorOrgs.contactPerson, `%${search}%`)),
    );
  }
  if (status) conditions.push(eq(donorOrgs.status, status));
  if (category) conditions.push(eq(donorOrgs.category, category));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(donorOrgs).where(where);
  const items = await db
    .select()
    .from(donorOrgs)
    .where(where)
    .orderBy(donorOrgs.name)
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الجهة مطلوب"),
  category: z.nativeEnum(DonorOrgCategory).optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  grantsCount: z.coerce.number().int().optional(),
  totalAmount: z.coerce.number().optional(),
  status: z.nativeEnum(DonorOrgStatus).optional(),
  notes: z.string().optional(),
});

const postSchema = createSchema.partial().extend({
  action: z.enum(["activate", "deactivate"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "activate" || b.action === "deactivate") {
      if (!b.id) return err("معرف الجهة مطلوب", 400, "BAD_REQUEST");
      const existing = (
        await db.select().from(donorOrgs).where(eq(donorOrgs.id, b.id)).limit(1)
      )[0];
      if (!existing) return err("الجهة المانحة غير موجودة", 404, "NOT_FOUND");

      if (b.action === "deactivate" && existing.status === DonorOrgStatus.INACTIVE) {
        return err("الجهة موقوفة بالفعل", 400, "INVALID_STATE");
      }
      if (b.action === "activate" && existing.status === DonorOrgStatus.ACTIVE) {
        return err("الجهة نشطة بالفعل", 400, "INVALID_STATE");
      }

      const before = JSON.stringify(existing);
      const target = b.action === "deactivate" ? DonorOrgStatus.INACTIVE : DonorOrgStatus.ACTIVE;
      await db
        .update(donorOrgs)
        .set({ status: target, updatedAt: now() })
        .where(eq(donorOrgs.id, b.id));

      await addAudit({
        action: b.action,
        entityType: "donor_org",
        entityId: b.id,
        description: `${b.action === "deactivate" ? "تم إيقاف" : "تم تفعيل"} الجهة المانحة: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const orgId = genId("DORG");
    const ts = now();

    await db.insert(donorOrgs).values({
      id: orgId,
      name: c.name,
      category: c.category ?? DonorOrgCategory.GOVERNMENT,
      contactPerson: c.contactPerson ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      grantsCount: c.grantsCount ?? 0,
      totalAmount: c.totalAmount ?? 0,
      status: c.status ?? DonorOrgStatus.ACTIVE,
      notes: c.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "donor_org",
      entityId: orgId,
      description: `تم إضافة جهة مانحة: ${c.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, orgId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الجهة مطلوب"),
  name: z.string().trim().min(1).optional(),
  category: z.nativeEnum(DonorOrgCategory).optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  grantsCount: z.coerce.number().int().optional(),
  totalAmount: z.coerce.number().optional(),
  status: z.nativeEnum(DonorOrgStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, b.id)).limit(1))[0];
    if (!existing) return err("الجهة المانحة غير موجودة", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(donorOrgs)
      .set({
        name: b.name ?? existing.name,
        category: b.category ?? existing.category,
        contactPerson: b.contactPerson ?? existing.contactPerson,
        phone: b.phone ?? existing.phone,
        email: b.email ?? existing.email,
        grantsCount: b.grantsCount ?? existing.grantsCount,
        totalAmount: b.totalAmount ?? existing.totalAmount,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(donorOrgs.id, b.id));

    await addAudit({
      action: "update",
      entityType: "donor_org",
      entityId: b.id,
      description: `تم تحديث الجهة المانحة: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/donor-orgs?id=xxx — identity from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الجهة مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(donorOrgs).where(eq(donorOrgs.id, id)).limit(1))[0];
  if (!existing) return err("الجهة المانحة غير موجودة", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(donorOrgs).where(eq(donorOrgs.id, id));
  await addAudit({
    action: "delete",
    entityType: "donor_org",
    entityId: id,
    description: `تم حذف الجهة المانحة: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/donor-orgs")({
  server: {
    handlers: {
      GET: authHandler("grants.view", GET),
      POST: authHandler("grants.create", POST),
      PUT: authHandler("grants.update", PUT),
      DELETE: authHandler("grants.delete", DELETE),
    },
  },
});
