import { db, now, genId, addAudit } from "@/server/db/index";
import { aidRecords, beneficiaries, projects } from "@/server/db/schema";
import { eq, like, or, and, desc } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const aid = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    if (!aid) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, aid.beneficiaryId))
      .limit(1)
      .all()[0];
    const project = aid.projectId
      ? db.select().from(projects).where(eq(projects.id, aid.projectId)).limit(1).all()[0]
      : null;

    return Response.json({
      item: {
        ...aid,
        beneficiaryName: beneficiary?.name || "",
        beneficiaryStatus: beneficiary?.status || "",
        projectName: project?.name || "",
      },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const beneficiaryId = url.searchParams.get("beneficiaryId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(like(aidRecords.id, `%${search}%`));
  }
  if (status && status !== "الكل") conditions.push(eq(aidRecords.status, status));
  if (type && type !== "الكل") conditions.push(eq(aidRecords.type, type));
  if (beneficiaryId) conditions.push(eq(aidRecords.beneficiaryId, beneficiaryId));
  if (projectId) conditions.push(eq(aidRecords.projectId, projectId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(aidRecords).$dynamic();
  const all = whereClause
    ? allQuery.where(whereClause).orderBy(desc(aidRecords.createdAt)).all()
    : allQuery.orderBy(desc(aidRecords.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(aidRecords).$dynamic();
  const items = whereClause
    ? itemsQuery
        .where(whereClause)
        .orderBy(desc(aidRecords.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : itemsQuery.orderBy(desc(aidRecords.createdAt)).limit(limit).offset(offset).all();

  // Enrich with beneficiary and project names
  const enrichedItems = items.map((a) => {
    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, a.beneficiaryId))
      .limit(1)
      .all()[0];
    const project = a.projectId
      ? db.select().from(projects).where(eq(projects.id, a.projectId)).limit(1).all()[0]
      : null;
    return {
      ...a,
      beneficiaryName: beneficiary?.name || "",
      beneficiaryStatus: beneficiary?.status || "",
      projectName: project?.name || "",
    };
  });

  return Response.json({ items: enrichedItems, total, page, limit });
}

export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  if (action === "approve") {
    const aid = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    if (!aid) return Response.json({ error: "السجل غير موجود" }, { status: 404 });
    if (aid.status !== "قيد المراجعة")
      return Response.json({ error: "لا يمكن اعتماد هذا السجل" }, { status: 400 });

    const before = JSON.stringify(aid);
    db.update(aidRecords)
      .set({
        status: "معتمد",
        approvedBy: userId || null,
        approvedAt: now(),
        updatedAt: now(),
      })
      .where(eq(aidRecords.id, id))
      .run();

    addAudit("اعتماد", "مساعدة", id, `تم اعتماد المساعدة`, userId, userName, before);
    const updated = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const aid = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    if (!aid) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

    const before = JSON.stringify(aid);
    db.update(aidRecords)
      .set({ status: "مرفوض", updatedAt: now() })
      .where(eq(aidRecords.id, id))
      .run();
    addAudit("رفض", "مساعدة", id, `تم رفض المساعدة`, userId, userName, before);
    const updated = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "deliver") {
    const aid = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    if (!aid) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

    // Check beneficiary eligibility
    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, aid.beneficiaryId))
      .limit(1)
      .all()[0];
    if (!beneficiary) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });
    if (beneficiary.status !== "مؤهل")
      return Response.json({ error: "لا يمكن تسليم مساعدة لمستفيد غير مؤهل" }, { status: 400 });
    if (aid.status !== "معتمد")
      return Response.json({ error: "يجب اعتماد المساعدة أولاً" }, { status: 400 });

    const before = JSON.stringify(aid);
    const ts = now();
    db.update(aidRecords)
      .set({
        status: "تم التسليم",
        updatedAt: ts,
        deliveredAt: ts,
        deliveredBy: userId || null,
        deliveryMethod: body.deliveryMethod || "",
        deliveryNotes: body.deliveryNotes || "",
      })
      .where(eq(aidRecords.id, id))
      .run();

    // Update project spent
    if (aid.projectId && aid.amount > 0) {
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, aid.projectId))
        .limit(1)
        .all()[0];
      if (project) {
        db.update(projects)
          .set({
            spent: project.spent + aid.amount,
            beneficiaryCount: project.beneficiaryCount + 1,
            updatedAt: now(),
          })
          .where(eq(projects.id, aid.projectId))
          .run();
      }
    }

    addAudit(
      "تسليم",
      "مساعدة",
      id,
      `تم تسليم المساعدة بمبلغ ${aid.amount} ر.س`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "return") {
    const aid = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    if (!aid) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

    const before = JSON.stringify(aid);
    db.update(aidRecords)
      .set({ status: "بانتظار الموافقة", updatedAt: now() })
      .where(eq(aidRecords.id, id))
      .run();
    addAudit("إرجاع", "مساعدة", id, `تم إرجاع المساعدة للتعديل`, userId, userName, before);
    const updated = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Normal create
  const {
    beneficiaryId,
    projectId,
    type,
    amount,
    date,
    notes,
    userId: uid,
    userName: uname,
  } = body;

  if (!beneficiaryId) return Response.json({ error: "المستفيد مطلوب" }, { status: 400 });
  if (!type) return Response.json({ error: "نوع المساعدة مطلوب" }, { status: 400 });

  // Check beneficiary eligibility
  const beneficiary = db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, beneficiaryId))
    .limit(1)
    .all()[0];
  if (beneficiary && beneficiary.status !== "مؤهل") {
    return Response.json(
      { error: `لا يمكن إضافة مساعدة لمستفيد بحالة: ${beneficiary.status}` },
      { status: 400 },
    );
  }

  const aidId = genId("AID");
  const ts = now();

  db.insert(aidRecords)
    .values({
      id: aidId,
      beneficiaryId,
      projectId: projectId || null,
      type,
      amount: parseFloat(amount) || 0,
      status: "بانتظار الموافقة",
      date: date || ts,
      approvedBy: null,
      approvedAt: null,
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
    })
    .run();

  addAudit("إضافة", "مساعدة", aidId, `تم إضافة مساعدة جديدة: ${type}`, uid, uname);
  const created = db.select().from(aidRecords).where(eq(aidRecords.id, aidId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, beneficiaryId, projectId, type, amount, date, notes, userId, userName } = body;

  if (!id) return Response.json({ error: "معرف السجل مطلوب" }, { status: 400 });

  const existing = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

  // Can only edit draft or pending review records
  if (existing.status === "تم التسليم" || existing.status === "مرفوض") {
    return Response.json({ error: "لا يمكن تعديل هذا السجل" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(aidRecords)
    .set({
      beneficiaryId: beneficiaryId ?? existing.beneficiaryId,
      projectId: projectId !== undefined ? projectId : existing.projectId,
      type: type ?? existing.type,
      amount: amount !== undefined ? parseFloat(amount) : existing.amount,
      date: date ?? existing.date,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(aidRecords.id, id))
    .run();

  addAudit("تعديل", "مساعدة", id, `تم تحديث بيانات المساعدة`, userId, userName, before);
  const updated = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف السجل مطلوب" }, { status: 400 });

  const existing = db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

  // Can only delete draft/pending records
  if (existing.status === "تم التسليم") {
    return Response.json({ error: "لا يمكن حذف مساعدة تم تسليمها" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  db.delete(aidRecords).where(eq(aidRecords.id, id)).run();
  addAudit("حذف", "مساعدة", id, `تم حذف المساعدة`, userId, userName, before);

  return Response.json({ success: true });
}
