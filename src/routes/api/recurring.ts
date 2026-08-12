import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { recurringDonations } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { RecurringFrequency, RecurringStatus } from "@/lib/enums";

async function nextCode(): Promise<string> {
  const [{ c }] = await db.select({ c: count() }).from(recurringDonations);
  return `RCR-${String(101 + Number(c)).padStart(3, "0")}`;
}

// GET /api/recurring?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (
      await db.select().from(recurringDonations).where(eq(recurringDonations.id, id)).limit(1)
    )[0];
    if (!item) return err("التبرع المتكرر غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const frequency = url.searchParams.get("frequency") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(recurringDonations.donorName, `%${search}%`),
        like(recurringDonations.code, `%${search}%`),
        like(recurringDonations.projectName, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(recurringDonations.status, status));
  if (frequency) conditions.push(eq(recurringDonations.frequency, frequency));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(recurringDonations).where(where);
  const [{ s: monthly }] = await db
    .select({ s: sql<number>`coalesce(sum(${recurringDonations.amount}), 0)` })
    .from(recurringDonations)
    .where(eq(recurringDonations.status, RecurringStatus.ACTIVE));
  const items = await db
    .select()
    .from(recurringDonations)
    .where(where)
    .orderBy(desc(recurringDonations.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({
    items,
    total: Number(total),
    activeMonthly: Number(monthly),
    page,
    limit,
  });
}

const createSchema = z.object({
  donorName: z.string().trim().min(1, "اسم المتبرع مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  frequency: z.nativeEnum(RecurringFrequency).optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  nextRunDate: z.string().optional(),
  startDate: z.string().optional(),
  status: z.nativeEnum(RecurringStatus).optional(),
  notes: z.string().optional(),
});

const postSchema = createSchema.partial().extend({
  action: z.enum(["activate", "pause"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "activate" || b.action === "pause") {
      if (!b.id) return err("معرف التبرع المتكرر مطلوب", 400, "BAD_REQUEST");
      const existing = (
        await db.select().from(recurringDonations).where(eq(recurringDonations.id, b.id)).limit(1)
      )[0];
      if (!existing) return err("التبرع المتكرر غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(existing);
      const target = b.action === "pause" ? RecurringStatus.PAUSED : RecurringStatus.ACTIVE;
      await db
        .update(recurringDonations)
        .set({ status: target, updatedAt: now() })
        .where(eq(recurringDonations.id, b.id));

      await addAudit({
        action: b.action,
        entityType: "recurring_donation",
        entityId: b.id,
        description: `${b.action === "pause" ? "تم إيقاف" : "تم تفعيل"} التبرع المتكرر: ${existing.code} - ${existing.donorName}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (
        await db.select().from(recurringDonations).where(eq(recurringDonations.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const rcrId = genId("RCR");
    const code = await nextCode();
    const ts = now();

    await db.insert(recurringDonations).values({
      id: rcrId,
      code,
      donorName: c.donorName,
      amount: c.amount,
      frequency: c.frequency ?? RecurringFrequency.MONTHLY,
      projectId: c.projectId || null,
      projectName: c.projectName ?? "",
      nextRunDate: c.nextRunDate ?? "",
      startDate: c.startDate ?? "",
      status: c.status ?? RecurringStatus.ACTIVE,
      notes: c.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "recurring_donation",
      entityId: rcrId,
      description: `تم إضافة تبرع متكرر: ${code} - ${c.donorName}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(recurringDonations).where(eq(recurringDonations.id, rcrId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف التبرع المتكرر مطلوب"),
  donorName: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  frequency: z.nativeEnum(RecurringFrequency).optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  nextRunDate: z.string().optional(),
  startDate: z.string().optional(),
  status: z.nativeEnum(RecurringStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(recurringDonations).where(eq(recurringDonations.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("التبرع المتكرر غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(recurringDonations)
      .set({
        donorName: b.donorName ?? existing.donorName,
        amount: b.amount ?? existing.amount,
        frequency: b.frequency ?? existing.frequency,
        projectId: b.projectId !== undefined ? b.projectId || null : existing.projectId,
        projectName: b.projectName ?? existing.projectName,
        nextRunDate: b.nextRunDate ?? existing.nextRunDate,
        startDate: b.startDate ?? existing.startDate,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(recurringDonations.id, b.id));

    await addAudit({
      action: "update",
      entityType: "recurring_donation",
      entityId: b.id,
      description: `تم تحديث التبرع المتكرر: ${existing.code} - ${b.donorName || existing.donorName}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(recurringDonations).where(eq(recurringDonations.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/recurring?id=xxx — identity from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف التبرع المتكرر مطلوب", 400, "BAD_REQUEST");

  const existing = (
    await db.select().from(recurringDonations).where(eq(recurringDonations.id, id)).limit(1)
  )[0];
  if (!existing) return err("التبرع المتكرر غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(recurringDonations).where(eq(recurringDonations.id, id));
  await addAudit({
    action: "delete",
    entityType: "recurring_donation",
    entityId: id,
    description: `تم حذف التبرع المتكرر: ${existing.code} - ${existing.donorName}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/recurring")({
  server: {
    handlers: {
      GET: authHandler("donations.view", GET),
      POST: authHandler("donations.create", POST),
      PUT: authHandler("donations.update", PUT),
      DELETE: authHandler("donations.delete", DELETE),
    },
  },
});
