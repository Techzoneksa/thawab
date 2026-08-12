import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { approvals } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { ApprovalStatus, Priority } from "@/lib/enums";

// GET /api/approvals?id=xxx — single; else list with optional filters.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(approvals).where(eq(approvals.id, id)).limit(1))[0];
    if (!item) return err("الطلب غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const priority = url.searchParams.get("priority") || "";
  const conditions = [];
  if (search) conditions.push(like(approvals.subject, `%${search}%`));
  if (status) conditions.push(eq(approvals.status, status));
  if (type) conditions.push(eq(approvals.type, type));
  if (priority) conditions.push(eq(approvals.priority, priority));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(approvals).where(where).orderBy(desc(approvals.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  type: z.string().trim().min(1, "نوع الطلب مطلوب"),
  subject: z.string().trim().min(1, "موضوع الطلب مطلوب"),
  requester: z.string().optional(),
  amount: z.coerce.number().min(0).optional(),
  priority: z.nativeEnum(Priority).optional(),
  level: z.coerce.number().int().min(1).optional(),
  projectId: z.string().nullish(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("APR");
    const ts = now();

    await db.insert(approvals).values({
      id,
      type: b.type,
      subject: b.subject,
      requester: b.requester?.trim() || ctx.user.name,
      amount: b.amount ?? 0,
      status: ApprovalStatus.PENDING,
      priority: b.priority ?? Priority.MEDIUM,
      level: b.level ?? 1,
      projectId: b.projectId ?? null,
      notes: b.notes ?? "",
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "approval",
      entityId: id,
      description: `طلب موافقة جديد: ${b.subject}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(approvals).where(eq(approvals.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const ACTION_STATUS: Record<string, string> = {
  approve: ApprovalStatus.APPROVED,
  reject: ApprovalStatus.REJECTED,
  return: ApprovalStatus.RETURNED,
};
const ACTION_LABEL: Record<string, string> = {
  approve: "اعتماد",
  reject: "رفض",
  return: "إرجاع للتصحيح",
};

const putSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject", "return"]),
  note: z.string().optional(),
});

// PUT /api/approvals — approve / reject / return a pending request.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, putSchema);
    const existing = (await db.select().from(approvals).where(eq(approvals.id, b.id)).limit(1))[0];
    if (!existing) return err("الطلب غير موجود", 404, "NOT_FOUND");
    if (existing.status !== ApprovalStatus.PENDING)
      return err("تمت معالجة هذا الطلب مسبقاً", 400, "BAD_STATE");

    const before = JSON.stringify(existing);
    const newStatus = ACTION_STATUS[b.action];
    const mergedNotes = b.note?.trim()
      ? `${existing.notes ? existing.notes + "\n" : ""}${b.note.trim()}`
      : existing.notes;

    await db
      .update(approvals)
      .set({ status: newStatus, notes: mergedNotes })
      .where(eq(approvals.id, b.id));

    await addAudit({
      action: b.action,
      entityType: "approval",
      entityId: b.id,
      description: `${ACTION_LABEL[b.action]} الطلب: ${existing.subject}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(approvals).where(eq(approvals.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الطلب مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(approvals).where(eq(approvals.id, id)).limit(1))[0];
  if (!existing) return err("الطلب غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(approvals).where(eq(approvals.id, id));
  await addAudit({
    action: "delete",
    entityType: "approval",
    entityId: id,
    description: `حذف طلب الموافقة: ${existing.subject}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/approvals")({
  server: {
    handlers: {
      GET: authHandler("approvals.view", GET),
      POST: authHandler("approvals.create", POST),
      PUT: authHandler("approvals.update", PUT),
      DELETE: authHandler("approvals.delete", DELETE),
    },
  },
});
