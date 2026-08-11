import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { purchaseRequests, purchaseOrders } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { PurchaseRequestStatus, Priority } from "@/lib/enums";

// NOTE: enums.ts PurchaseRequestStatus has no CANCELLED key. Business logic here
// still needs a cancelled state, so we use the ASCII key "cancelled" until the
// enum is extended. (Do not use Arabic — schema stores ASCII keys.)
const REQUEST_CANCELLED = "cancelled";

const TERMINAL_STATUSES: string[] = [PurchaseRequestStatus.ORDERED, REQUEST_CANCELLED];

// GET /api/procurement/requests?id=xxx — single with conversion info; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const req = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1))[0];
    if (!req) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");

    const [{ c: orderCount }] = await db
      .select({ c: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.requestId, id));

    return Response.json({ item: req, orderCount: Number(orderCount) });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const department = url.searchParams.get("department") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(purchaseRequests.subject, `%${search}%`),
        like(purchaseRequests.department, `%${search}%`),
        like(purchaseRequests.requester, `%${search}%`),
        like(purchaseRequests.notes, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(purchaseRequests.status, status));
  if (department) conditions.push(eq(purchaseRequests.department, department));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(purchaseRequests).where(where);
  const items = await db
    .select()
    .from(purchaseRequests)
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  subject: z.string().trim().min(1, "موضوع الطلب مطلوب"),
  department: z.string().trim().min(1, "القسم مطلوب"),
  priority: z.nativeEnum(Priority).optional(),
  requester: z.string().optional(),
  amount: z.coerce.number().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "returnToDraft", "cancel"]),
  id: z.string().min(1, "معرف الطلب مطلوب"),
  reason: z.string().optional(),
});

// POST /api/procurement/requests — create or workflow action.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, z.union([actionSchema, createSchema]));

    if ("action" in b) {
      const existing = (await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, b.id))
        .limit(1))[0];
      if (!existing) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(existing);

      if (b.action === "submit") {
        if (existing.status !== PurchaseRequestStatus.DRAFT)
          return err("يمكن إرسال المسودة فقط", 400, "INVALID_STATE");
        await db
          .update(purchaseRequests)
          .set({ status: PurchaseRequestStatus.SUBMITTED, updatedAt: now() })
          .where(eq(purchaseRequests.id, b.id));
        await addAudit({
          action: "submit",
          entityType: "purchase_request",
          entityId: b.id,
          description: `تم إرسال طلب الشراء للموافقة: ${existing.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "approve") {
        if (existing.status !== PurchaseRequestStatus.SUBMITTED)
          return err("الطلب ليس بانتظار الموافقة", 400, "INVALID_STATE");
        await db
          .update(purchaseRequests)
          .set({ status: PurchaseRequestStatus.APPROVED, updatedAt: now() })
          .where(eq(purchaseRequests.id, b.id));
        await addAudit({
          action: "approve",
          entityType: "purchase_request",
          entityId: b.id,
          description: `تم اعتماد طلب الشراء: ${existing.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "reject") {
        if (existing.status !== PurchaseRequestStatus.SUBMITTED)
          return err("الطلب ليس بانتظار الموافقة", 400, "INVALID_STATE");
        const newNotes = b.reason
          ? `${existing.notes || ""}\n[رفض: ${b.reason}]`.trim()
          : existing.notes;
        await db
          .update(purchaseRequests)
          .set({ status: PurchaseRequestStatus.REJECTED, notes: newNotes, updatedAt: now() })
          .where(eq(purchaseRequests.id, b.id));
        await addAudit({
          action: "reject",
          entityType: "purchase_request",
          entityId: b.id,
          description: `تم رفض طلب الشراء: ${existing.subject}${b.reason ? ` — السبب: ${b.reason}` : ""}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "returnToDraft") {
        if (existing.status === PurchaseRequestStatus.DRAFT)
          return err("الطلب مسودة بالفعل", 400, "INVALID_STATE");
        if (TERMINAL_STATUSES.includes(existing.status))
          return err("لا يمكن إرجاع طلب محوّل أو ملغي إلى المسودة", 400, "INVALID_STATE");
        await db
          .update(purchaseRequests)
          .set({ status: PurchaseRequestStatus.DRAFT, updatedAt: now() })
          .where(eq(purchaseRequests.id, b.id));
        await addAudit({
          action: "return_to_draft",
          entityType: "purchase_request",
          entityId: b.id,
          description: `تم إرجاع طلب الشراء للمسودة: ${existing.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else {
        // cancel
        if (existing.status === REQUEST_CANCELLED)
          return err("الطلب ملغي بالفعل", 400, "INVALID_STATE");
        if (existing.status === PurchaseRequestStatus.ORDERED)
          return err("لا يمكن إلغاء طلب محوّل إلى أمر شراء", 400, "INVALID_STATE");
        await db
          .update(purchaseRequests)
          .set({ status: REQUEST_CANCELLED, updatedAt: now() })
          .where(eq(purchaseRequests.id, b.id));
        await addAudit({
          action: "cancel",
          entityType: "purchase_request",
          entityId: b.id,
          description: `تم إلغاء طلب الشراء: ${existing.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      }

      const updated = (await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, b.id))
        .limit(1))[0];
      return Response.json({ item: updated });
    }

    const id = genId("PR");
    const ts = now();

    await db.insert(purchaseRequests).values({
      id,
      subject: b.subject,
      department: b.department,
      priority: b.priority ?? Priority.MEDIUM,
      status: PurchaseRequestStatus.DRAFT,
      requester: b.requester ?? "",
      amount: b.amount ?? 0,
      deliveryDate: b.deliveryDate ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "purchase_request",
      entityId: id,
      description: `تم إضافة طلب شراء: ${b.subject}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1, "معرف الطلب مطلوب"),
});

// PUT /api/procurement/requests — update (only draft/rejected).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, b.id))
      .limit(1))[0];
    if (!existing) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");
    if (
      existing.status !== PurchaseRequestStatus.DRAFT &&
      existing.status !== PurchaseRequestStatus.REJECTED
    ) {
      return err("لا يمكن تعديل طلب في حالته الحالية. أعده إلى المسودة أولاً.", 400, "INVALID_STATE");
    }

    const before = JSON.stringify(existing);
    await db
      .update(purchaseRequests)
      .set({
        subject: b.subject ?? existing.subject,
        department: b.department ?? existing.department,
        priority: b.priority ?? existing.priority,
        requester: b.requester ?? existing.requester,
        amount: b.amount ?? existing.amount,
        deliveryDate: b.deliveryDate ?? existing.deliveryDate,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(purchaseRequests.id, b.id));

    await addAudit({
      action: "update",
      entityType: "purchase_request",
      entityId: b.id,
      description: `تم تحديث طلب الشراء: ${existing.subject}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, b.id))
      .limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/procurement/requests?id=xxx — only draft/rejected/cancelled. Actor from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الطلب مطلوب", 400, "BAD_REQUEST");

  const existing = (await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1))[0];
  if (!existing) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");
  if (
    existing.status === PurchaseRequestStatus.APPROVED ||
    existing.status === PurchaseRequestStatus.SUBMITTED
  ) {
    return err("لا يمكن حذف طلب معتمد أو بانتظار الموافقة. ألغِه أولاً.", 400, "INVALID_STATE");
  }
  if (existing.status === PurchaseRequestStatus.ORDERED) {
    return err(
      "لا يمكن حذف طلب محوّل إلى أمر شراء. يحتفظ النظام به للسجل التاريخي.",
      400,
      "INVALID_STATE",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(purchaseRequests).where(eq(purchaseRequests.id, id));

  await addAudit({
    action: "delete",
    entityType: "purchase_request",
    entityId: id,
    description: `تم حذف طلب الشراء: ${existing.subject}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/requests")({
  server: {
    handlers: {
      GET: authHandler("procurement.view", GET),
      POST: authHandler("procurement.create", POST),
      PUT: authHandler("procurement.update", PUT),
      DELETE: authHandler("procurement.delete", DELETE),
    },
  },
});
