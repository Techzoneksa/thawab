import { db, now, genId, addAudit } from "@/server/db/index";
import { purchaseRequests, purchaseOrders } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const REQUEST_STATUSES = [
  "مسودة",
  "بانتظار الموافقة",
  "معتمد",
  "مرفوض",
  "محول إلى أمر شراء",
  "ملغي",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["عاجل", "متوسطة", "منخفضة"] as const;

const TERMINAL_STATUSES: RequestStatus[] = ["محول إلى أمر شراء", "ملغي"];

// GET /api/procurement/requests - list with search/filter
// GET /api/procurement/requests?id=xxx - single with conversion info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const req = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!req) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });

    const orderCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.requestId, id))
        .all()[0]?.count || 0;

    return Response.json({ item: req, orderCount });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const department = url.searchParams.get("department") || "";

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
  if (status && status !== "الكل") conditions.push(eq(purchaseRequests.status, status));
  if (department && department !== "الكل")
    conditions.push(eq(purchaseRequests.department, department));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db
        .select()
        .from(purchaseRequests)
        .where(whereClause)
        .orderBy(desc(purchaseRequests.createdAt))
        .all()
    : db.select().from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/procurement/requests - create or workflow action
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "submit") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (existing.status !== "مسودة")
      return Response.json({ error: "يمكن إرسال المسودة فقط" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseRequests)
      .set({ status: "بانتظار الموافقة", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    addAudit(
      "إرسال للموافقة",
      "طلب شراء",
      id,
      `تم إرسال طلب الشراء للموافقة: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (existing.status !== "بانتظار الموافقة")
      return Response.json({ error: "الطلب ليس بانتظار الموافقة" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseRequests)
      .set({ status: "معتمد", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    addAudit(
      "اعتماد",
      "طلب شراء",
      id,
      `تم اعتماد طلب الشراء: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const { id, reason, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (existing.status !== "بانتظار الموافقة")
      return Response.json({ error: "الطلب ليس بانتظار الموافقة" }, { status: 400 });

    const before = JSON.stringify(existing);
    const newNotes = reason ? `${existing.notes || ""}\n[رفض: ${reason}]`.trim() : existing.notes;
    db.update(purchaseRequests)
      .set({ status: "مرفوض", notes: newNotes, updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    addAudit(
      "رفض",
      "طلب شراء",
      id,
      `تم رفض طلب الشراء: ${existing.subject}${reason ? ` — السبب: ${reason}` : ""}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "returnToDraft") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (existing.status === "مسودة")
      return Response.json({ error: "الطلب مسودة بالفعل" }, { status: 400 });
    if (TERMINAL_STATUSES.includes(existing.status as RequestStatus))
      return Response.json(
        { error: "لا يمكن إرجاع طلب محوّل أو ملغي إلى المسودة" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    db.update(purchaseRequests)
      .set({ status: "مسودة", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    addAudit(
      "إعادة لمسودة",
      "طلب شراء",
      id,
      `تم إرجاع طلب الشراء للمسودة: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "cancel") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (existing.status === "ملغي")
      return Response.json({ error: "الطلب ملغي بالفعل" }, { status: 400 });
    if (existing.status === "محول إلى أمر شراء")
      return Response.json({ error: "لا يمكن إلغاء طلب محوّل إلى أمر شراء" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseRequests)
      .set({ status: "ملغي", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    addAudit(
      "إلغاء",
      "طلب شراء",
      id,
      `تم إلغاء طلب الشراء: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    subject,
    department,
    priority,
    requester,
    amount,
    deliveryDate,
    notes,
    userId,
    userName,
  } = body;
  if (!subject?.trim()) return Response.json({ error: "موضوع الطلب مطلوب" }, { status: 400 });
  if (!department?.trim()) return Response.json({ error: "القسم مطلوب" }, { status: 400 });

  const reqId = genId("PR");
  const ts = now();

  db.insert(purchaseRequests)
    .values({
      id: reqId,
      subject: subject.trim(),
      department: department.trim(),
      priority: priority || "متوسطة",
      status: "مسودة",
      requester: requester || "",
      amount: parseFloat(amount) || 0,
      deliveryDate: deliveryDate || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "طلب شراء", reqId, `تم إضافة طلب شراء: ${subject}`, userId, userName);
  const created = db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, reqId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/requests - update (only for draft/rejected)
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const {
    id,
    subject,
    department,
    priority,
    requester,
    amount,
    deliveryDate,
    notes,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "معرف الطلب مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
  if (existing.status !== "مسودة" && existing.status !== "مرفوض") {
    return Response.json(
      { error: "لا يمكن تعديل طلب في حالة حالية. أعده إلى المسودة أولاً." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.update(purchaseRequests)
    .set({
      subject: subject?.trim() ?? existing.subject,
      department: department?.trim() ?? existing.department,
      priority: priority ?? existing.priority,
      requester: requester ?? existing.requester,
      amount: amount !== undefined ? parseFloat(amount) : existing.amount,
      deliveryDate: deliveryDate ?? existing.deliveryDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(purchaseRequests.id, id))
    .run();

  addAudit(
    "تعديل",
    "طلب شراء",
    id,
    `تم تحديث طلب الشراء: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  const updated = db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/requests - only if draft/rejected/cancelled
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الطلب مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
  if (existing.status === "معتمد" || existing.status === "بانتظار الموافقة") {
    return Response.json(
      { error: "لا يمكن حذف طلب معتمد أو بانتظار الموافقة. ألغِه أولاً." },
      { status: 400 },
    );
  }
  if (existing.status === "محول إلى أمر شراء") {
    return Response.json(
      { error: "لا يمكن حذف طلب محوّل إلى أمر شراء. يحتفظ النظام به للسجل التاريخي." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(purchaseRequests).where(eq(purchaseRequests.id, id)).run();
  addAudit(
    "حذف",
    "طلب شراء",
    id,
    `تم حذف طلب الشراء: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
