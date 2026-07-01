import { db, now, genId, addAudit } from "@/server/db/index";
import { beneficiaries, aidRecords, projects } from "@/server/db/schema";
import { eq, like, or, and, desc, ne } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

// GET /api/beneficiaries - List with search, filters, pagination
// GET /api/beneficiaries?id=xxx - Single beneficiary by ID with aid history
// GET /api/beneficiaries?id=xxx&summary=true - Beneficiary summary calculations
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all()[0];
    if (!beneficiary) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });

    // Get aid history
    const aidHistory = db
      .select()
      .from(aidRecords)
      .where(eq(aidRecords.beneficiaryId, id))
      .orderBy(desc(aidRecords.createdAt))
      .all();

    const totalAid = aidHistory
      .filter((a) => a.status === "تم التسليم")
      .reduce((s, a) => s + a.amount, 0);
    const aidCount = aidHistory.filter((a) => a.status === "تم التسليم").length;
    const pendingAidCount = aidHistory.filter(
      (a) => a.status === "بانتظار الموافقة" || a.status === "معتمد",
    ).length;
    const lastAidDate = aidHistory.length > 0 ? aidHistory[0].createdAt : null;

    // Get unique project IDs from aid history
    const linkedProjectIds = Array.from(
      new Set(aidHistory.map((a) => a.projectId).filter((id): id is string => Boolean(id))),
    );
    const linkedProjects =
      linkedProjectIds.length > 0
        ? db
            .select()
            .from(projects)
            .where(or(...linkedProjectIds.map((pid) => eq(projects.id, pid))))
            .all()
        : [];
    const linkedProjectsCount = linkedProjects.length;

    if (summary === "true") {
      return Response.json({
        item: {
          ...beneficiary,
          totalAid,
          aidCount,
          pendingAidCount,
          lastAidDate,
          linkedProjectsCount,
          eligibilityStatus: beneficiary.status,
        },
      });
    }

    // Enrich aid history with project names
    const enrichedAidHistory = aidHistory.map((a) => {
      const project = linkedProjects.find((p) => p.id === a.projectId);
      return { ...a, projectName: project?.name || "" };
    });

    return Response.json({
      item: {
        ...beneficiary,
        totalAid,
        aidCount,
        pendingAidCount,
        lastAidDate,
      },
      aidHistory: enrichedAidHistory,
      linkedProjects,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const city = url.searchParams.get("city") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(beneficiaries.name, `%${search}%`),
        like(beneficiaries.idNumber, `%${search}%`),
        like(beneficiaries.phone, `%${search}%`),
        like(beneficiaries.fileNumber, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(beneficiaries.status, status));
  if (category && category !== "الكل") conditions.push(eq(beneficiaries.category, category));
  if (city && city !== "الكل") conditions.push(eq(beneficiaries.city, city));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(beneficiaries).$dynamic();
  const all = whereClause
    ? allQuery.where(whereClause).orderBy(desc(beneficiaries.createdAt)).all()
    : allQuery.orderBy(desc(beneficiaries.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(beneficiaries).$dynamic();
  const items = whereClause
    ? itemsQuery
        .where(whereClause)
        .orderBy(desc(beneficiaries.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : itemsQuery.orderBy(desc(beneficiaries.createdAt)).limit(limit).offset(offset).all();

  return Response.json({ items, total, page, limit });
}

// POST /api/beneficiaries - Create beneficiary or change status (workflow actions)
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  // Eligibility workflow actions
  if (
    action === "review" ||
    action === "qualify" ||
    action === "disqualify" ||
    action === "suspend" ||
    action === "reactivate"
  ) {
    const statusMap: Record<string, string> = {
      review: "قيد المراجعة",
      qualify: "مؤهل",
      disqualify: "غير مؤهل",
      suspend: "موقوف",
      reactivate: "مؤهل",
    };

    const newStatus = statusMap[action];
    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all()[0];
    if (!beneficiary) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });

    // Workflow rules
    if (action === "qualify" && beneficiary.status === "موقوف") {
      return Response.json(
        { error: "لا يمكن تأهيل مستفيد موقوف. أعد تفعيله أولاً." },
        { status: 400 },
      );
    }

    if (action === "reactivate" && beneficiary.status !== "موقوف") {
      return Response.json({ error: "لا يمكن إعادة تفعيل مستفيد غير موقوف." }, { status: 400 });
    }

    if (action === "suspend" && beneficiary.status === "غير مؤهل") {
      return Response.json({ error: "لا يمكن إيقاف مستفيد غير مؤهل." }, { status: 400 });
    }

    const before = JSON.stringify(beneficiary);
    const ts = now();
    db.update(beneficiaries)
      .set({ status: newStatus, updatedAt: ts })
      .where(eq(beneficiaries.id, id))
      .run();

    const actionLabels: Record<string, string> = {
      review: "إرسال للمراجعة",
      qualify: "تأهيل",
      disqualify: "عدم تأهيل",
      suspend: "إيقاف",
      reactivate: "إعادة تفعيل",
    };

    addAudit(
      actionLabels[action],
      "مستفيد",
      id,
      `تم ${actionLabels[action]} المستفيد: ${beneficiary.name} (الحالة: ${newStatus})`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Legacy "status" action - keep for backward compat
  if (action === "status") {
    const { status } = body;
    const beneficiary = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all()[0];
    if (!beneficiary) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });

    const before = JSON.stringify(beneficiary);
    db.update(beneficiaries)
      .set({ status, updatedAt: now() })
      .where(eq(beneficiaries.id, id))
      .run();
    addAudit(
      "تغيير الحالة",
      "مستفيد",
      id,
      `تم تغيير حالة المستفيد إلى: ${status}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Create new beneficiary
  const {
    name,
    fileNumber,
    idNumber,
    phone,
    city,
    address,
    category,
    status,
    familyMembers,
    monthlyIncome,
    maritalStatus,
    notes,
    userId: uid,
    userName: uname,
  } = body;

  if (!name?.trim()) return Response.json({ error: "اسم المستفيد مطلوب" }, { status: 400 });

  const benId = genId("BEN");
  const ts = now();

  db.insert(beneficiaries)
    .values({
      id: benId,
      name: name.trim(),
      fileNumber: fileNumber || "",
      idNumber: idNumber || "",
      phone: phone || "",
      city: city || "",
      address: address || "",
      category: category || "أسر محتاجة",
      status: status || "جديد",
      familyMembers: parseInt(familyMembers) || 1,
      monthlyIncome: parseFloat(monthlyIncome) || 0,
      maritalStatus: maritalStatus || "",
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "مستفيد", benId, `تم إضافة مستفيد جديد: ${name}`, uid, uname);
  const created = db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, benId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/beneficiaries - Update beneficiary
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const {
    id,
    name,
    fileNumber,
    idNumber,
    phone,
    city,
    address,
    category,
    status,
    familyMembers,
    monthlyIncome,
    maritalStatus,
    notes,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "معرف المستفيد مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });

  // If trying to qualify, check that beneficiary is eligible
  if (status === "مؤهل" && existing.status === "موقوف") {
    return Response.json(
      { error: "لا يمكن تأهيل مستفيد موقوف. أعد تفعيله أولاً." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(beneficiaries)
    .set({
      name: name?.trim() ?? existing.name,
      fileNumber: fileNumber ?? existing.fileNumber,
      idNumber: idNumber ?? existing.idNumber,
      phone: phone ?? existing.phone,
      city: city ?? existing.city,
      address: address ?? existing.address,
      category: category ?? existing.category,
      status: status ?? existing.status,
      familyMembers: familyMembers !== undefined ? parseInt(familyMembers) : existing.familyMembers,
      monthlyIncome:
        monthlyIncome !== undefined ? parseFloat(monthlyIncome) : existing.monthlyIncome,
      maritalStatus: maritalStatus ?? existing.maritalStatus,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(beneficiaries.id, id))
    .run();

  addAudit(
    "تعديل",
    "مستفيد",
    id,
    `تم تحديث بيانات المستفيد: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(beneficiaries).where(eq(beneficiaries.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/beneficiaries - Delete beneficiary (only if no delivered aid)
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف المستفيد مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "المستفيد غير موجود" }, { status: 404 });

  // Check for delivered aid records
  const linkedAid = db
    .select()
    .from(aidRecords)
    .where(and(eq(aidRecords.beneficiaryId, id), eq(aidRecords.status, "تم التسليم")))
    .limit(1)
    .all();

  if (linkedAid.length > 0) {
    return Response.json(
      { error: "لا يمكن حذف مستفيد له مساعدات مستلمة. يمكن إيقافه فقط." },
      { status: 400 },
    );
  }

  // Check for pending aid records
  const pendingAid = db
    .select()
    .from(aidRecords)
    .where(
      and(
        eq(aidRecords.beneficiaryId, id),
        or(eq(aidRecords.status, "بانتظار الموافقة"), eq(aidRecords.status, "معتمد")) as any,
      ),
    )
    .limit(1)
    .all();

  if (pendingAid.length > 0) {
    return Response.json(
      {
        error: "لا يمكن حذف مستفيد له مساعدات قيد المعالجة. عالج المساعدات أولاً أو أوقف المستفيد.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(beneficiaries).where(eq(beneficiaries.id, id)).run();
  addAudit("حذف", "مستفيد", id, `تم حذف المستفيد: ${existing.name}`, userId, userName, before);

  return Response.json({ success: true });
}
