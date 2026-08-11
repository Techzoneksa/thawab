import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { costCenters, journalLines, budgetLines } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { CostCenterStatus } from "@/lib/enums";

// GET /api/finance/cost-centers?id=xxx — single with usage info; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const cc = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1))[0];
    if (!cc) return err("مركز التكلفة غير موجود", 404, "NOT_FOUND");

    const [{ c: journalUsage }] = await db
      .select({ c: count() })
      .from(journalLines)
      .where(eq(journalLines.costCenterId, id));
    const [{ c: budgetUsage }] = await db
      .select({ c: count() })
      .from(budgetLines)
      .where(eq(budgetLines.costCenterId, id));

    return Response.json({
      item: cc,
      journalUsage: Number(journalUsage),
      budgetUsage: Number(budgetUsage),
      hasUsage: Number(journalUsage) > 0 || Number(budgetUsage) > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(like(costCenters.code, `%${search}%`), like(costCenters.name, `%${search}%`)),
    );
  }
  if (status) conditions.push(eq(costCenters.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(costCenters).where(where);
  const items = await db
    .select()
    .from(costCenters)
    .where(where)
    .orderBy(costCenters.code)
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  code: z.string().trim().min(1, "رمز المركز مطلوب"),
  name: z.string().trim().min(1, "اسم المركز مطلوب"),
  manager: z.string().optional(),
  budget: z.coerce.number().optional(),
  spent: z.coerce.number().optional(),
  status: z.nativeEnum(CostCenterStatus).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

// The client also POSTs { action: "activate" | "deactivate", id } for status changes.
const postSchema = createSchema.partial().extend({
  action: z.enum(["activate", "deactivate"]).optional(),
  id: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    // Workflow: activate / deactivate
    if (b.action === "activate" || b.action === "deactivate") {
      if (!b.id) return err("معرف مركز التكلفة مطلوب", 400, "BAD_REQUEST");
      const existing = (
        await db.select().from(costCenters).where(eq(costCenters.id, b.id)).limit(1)
      )[0];
      if (!existing) return err("مركز التكلفة غير موجود", 404, "NOT_FOUND");

      if (b.action === "deactivate" && existing.status === CostCenterStatus.INACTIVE) {
        return err("مركز التكلفة موقوف بالفعل", 400, "INVALID_STATE");
      }
      if (b.action === "activate" && existing.status === CostCenterStatus.ACTIVE) {
        return err("مركز التكلفة نشط بالفعل", 400, "INVALID_STATE");
      }

      const before = JSON.stringify(existing);
      const target =
        b.action === "deactivate" ? CostCenterStatus.INACTIVE : CostCenterStatus.ACTIVE;
      await db
        .update(costCenters)
        .set({ status: target, updatedAt: now() })
        .where(eq(costCenters.id, b.id));

      await addAudit({
        action: b.action,
        entityType: "cost_center",
        entityId: b.id,
        description: `${b.action === "deactivate" ? "تم إيقاف" : "تم تفعيل"} مركز التكلفة: ${existing.code} - ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (
        await db.select().from(costCenters).where(eq(costCenters.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    // Create
    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const dup = (
      await db.select().from(costCenters).where(eq(costCenters.code, c.code)).limit(1)
    )[0];
    if (dup) return err("رمز المركز مستخدم بالفعل", 400, "DUPLICATE");

    const ccId = genId("CC");
    const ts = now();

    await db.insert(costCenters).values({
      id: ccId,
      code: c.code,
      name: c.name,
      manager: c.manager ?? "",
      budget: c.budget ?? 0,
      spent: c.spent ?? 0,
      status: c.status ?? CostCenterStatus.ACTIVE,
      description: c.description ?? "",
      notes: c.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "cost_center",
      entityId: ccId,
      description: `تم إضافة مركز تكلفة: ${c.code} - ${c.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(costCenters).where(eq(costCenters.id, ccId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف مركز التكلفة مطلوب"),
  name: z.string().trim().min(1).optional(),
  manager: z.string().optional(),
  budget: z.coerce.number().optional(),
  spent: z.coerce.number().optional(),
  status: z.nativeEnum(CostCenterStatus).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (
      await db.select().from(costCenters).where(eq(costCenters.id, b.id)).limit(1)
    )[0];
    if (!existing) return err("مركز التكلفة غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(costCenters)
      .set({
        name: b.name ?? existing.name,
        manager: b.manager ?? existing.manager,
        budget: b.budget ?? existing.budget,
        spent: b.spent ?? existing.spent,
        status: b.status ?? existing.status,
        description: b.description ?? existing.description,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(costCenters.id, b.id));

    await addAudit({
      action: "update",
      entityType: "cost_center",
      entityId: b.id,
      description: `تم تحديث مركز التكلفة: ${existing.code} - ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(costCenters).where(eq(costCenters.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/finance/cost-centers?id=xxx — only if unused. Identity from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف مركز التكلفة مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1))[0];
  if (!existing) return err("مركز التكلفة غير موجود", 404, "NOT_FOUND");

  const [{ c: journalUsage }] = await db
    .select({ c: count() })
    .from(journalLines)
    .where(eq(journalLines.costCenterId, id));
  const [{ c: budgetUsage }] = await db
    .select({ c: count() })
    .from(budgetLines)
    .where(eq(budgetLines.costCenterId, id));

  if (Number(journalUsage) > 0 || Number(budgetUsage) > 0) {
    return err(
      `لا يمكن حذف مركز تكلفة مستخدم في ${Number(journalUsage)} سطر قيد و ${Number(budgetUsage)} سطر موازنة. أوقف المركز بدلاً من ذلك.`,
      400,
      "IN_USE",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(costCenters).where(eq(costCenters.id, id));
  await addAudit({
    action: "delete",
    entityType: "cost_center",
    entityId: id,
    description: `تم حذف مركز التكلفة: ${existing.code} - ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/cost-centers")({
  server: {
    handlers: {
      GET: authHandler("finance.view", GET),
      POST: authHandler("finance.create", POST),
      PUT: authHandler("finance.update", PUT),
      DELETE: authHandler("finance.delete", DELETE),
    },
  },
});
