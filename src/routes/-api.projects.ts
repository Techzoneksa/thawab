import { db, now, genId, addAudit } from "@/server/db/index";
import { projects, donations, beneficiaries, aidRecords } from "@/server/db/schema";
import { eq, like, or, and, desc, sum, count } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

// GET /api/projects - List with search, filters, pagination
// GET /api/projects?id=xxx - Single project by ID with summary
// GET /api/projects?id=xxx&summary=true - Project summary calculations
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const project = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    if (!project) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });

    // Get project donations total
    const projDonations = db
      .select()
      .from(donations)
      .where(and(eq(donations.projectId, id), eq(donations.status, "مؤكد")))
      .all();
    const totalDonations = projDonations.reduce((s, d) => s + d.amount, 0);

    // Get aid records count and total
    const projAid = db
      .select()
      .from(aidRecords)
      .where(and(eq(aidRecords.projectId, id), eq(aidRecords.status, "تم التسليم")))
      .all();
    const totalAid = projAid.reduce((s, a) => s + a.amount, 0);
    const beneficiaryCount = projAid.length;

    const remainingBudget = project.budget - project.spent;

    if (summary === "true") {
      return Response.json({
        item: {
          ...project,
          totalDonations,
          totalAid,
          aidCount: projAid.length,
          remainingBudget,
          beneficiaryCount,
          progressPercentage: project.progress,
          utilizationPercent:
            project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0,
          donationsPercent:
            project.budget > 0 ? Math.round((totalDonations / project.budget) * 100) : 0,
        },
      });
    }

    // Get linked donations for display
    const linkedDonations = db
      .select()
      .from(donations)
      .where(eq(donations.projectId, id))
      .orderBy(desc(donations.createdAt))
      .limit(20)
      .all();

    // Get linked aid records for display
    const linkedAid = db
      .select()
      .from(aidRecords)
      .where(eq(aidRecords.projectId, id))
      .orderBy(desc(aidRecords.createdAt))
      .limit(20)
      .all();

    // Get linked beneficiaries
    const linkedBeneficiaryIds = Array.from(
      new Set(linkedAid.map((a) => a.beneficiaryId).filter(Boolean)),
    );
    const linkedBeneficiaries =
      linkedBeneficiaryIds.length > 0
        ? db
            .select()
            .from(beneficiaries)
            .where(or(...linkedBeneficiaryIds.map((bid) => eq(beneficiaries.id, bid))))
            .limit(20)
            .all()
        : [];

    return Response.json({
      item: {
        ...project,
        totalDonations,
        totalAid,
        aidCount: projAid.length,
        remainingBudget,
        beneficiaryCount,
      },
      donations: linkedDonations,
      aid: linkedAid,
      beneficiaries: linkedBeneficiaries,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const branch = url.searchParams.get("branch") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(projects.name, `%${search}%`),
        like(projects.manager, `%${search}%`),
        like(projects.code, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(projects.status, status));
  if (category && category !== "الكل") conditions.push(eq(projects.category, category));
  if (branch && branch !== "الكل") conditions.push(eq(projects.branch, branch));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(projects).$dynamic();
  const all = whereClause
    ? allQuery.where(whereClause).orderBy(desc(projects.createdAt)).all()
    : allQuery.orderBy(desc(projects.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(projects).$dynamic();
  const items = whereClause
    ? itemsQuery
        .where(whereClause)
        .orderBy(desc(projects.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : itemsQuery.orderBy(desc(projects.createdAt)).limit(limit).offset(offset).all();

  return Response.json({ items, total, page, limit });
}

// POST /api/projects - Create project or change status (activate/pause/complete/cancel)
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  // Workflow actions
  if (action === "activate" || action === "pause" || action === "complete" || action === "cancel") {
    const statusMap = {
      activate: "نشط",
      pause: "متوقف",
      complete: "مكتمل",
      cancel: "ملغي",
    };

    const newStatus = statusMap[action as keyof typeof statusMap];
    const project = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    if (!project) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });

    // Workflow rules
    if (action === "activate" && project.status === "مكتمل") {
      return Response.json(
        { error: "لا يمكن تفعيل مشروع مكتمل. أنشئ مشروعاً جديداً بدلاً من ذلك." },
        { status: 400 },
      );
    }

    if (action === "complete" && project.status === "ملغي") {
      return Response.json({ error: "لا يمكن إكمال مشروع ملغي." }, { status: 400 });
    }

    const before = JSON.stringify(project);
    const ts = now();
    db.update(projects).set({ status: newStatus, updatedAt: ts }).where(eq(projects.id, id)).run();

    const actionLabel =
      action === "activate"
        ? "تفعيل"
        : action === "pause"
          ? "إيقاف"
          : action === "complete"
            ? "إكمال"
            : "إلغاء";

    addAudit(
      actionLabel,
      "مشروع",
      id,
      `تم ${actionLabel} المشروع: ${project.name} (الحالة: ${newStatus})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Legacy "status" action - keep for backward compat
  if (action === "status") {
    const { status } = body;
    const project = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    if (!project) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });

    const before = JSON.stringify(project);
    db.update(projects).set({ status, updatedAt: now() }).where(eq(projects.id, id)).run();
    addAudit(
      "تغيير الحالة",
      "مشروع",
      id,
      `تم تغيير حالة المشروع إلى: ${status}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create new project
  const {
    name,
    code,
    type,
    category,
    branch,
    manager,
    budget,
    startDate,
    endDate,
    description,
    notes,
    status,
    progress,
    userId: uid,
    userName: uname,
  } = body;

  if (!name?.trim()) return Response.json({ error: "اسم المشروع مطلوب" }, { status: 400 });

  const projectId = genId("PRJ");
  const ts = now();

  db.insert(projects)
    .values({
      id: projectId,
      name: name.trim(),
      code: code || "",
      type: type || "",
      category: category || "",
      branch: branch || "",
      manager: manager || "",
      budget: parseFloat(budget) || 0,
      spent: 0,
      donations: 0,
      beneficiaryCount: 0,
      progress: parseInt(progress) || 0,
      status: status || "مخطط",
      startDate: startDate || "",
      endDate: endDate || "",
      description: description || "",
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "مشروع", projectId, `تم إضافة مشروع جديد: ${name}`, uid, uname);
  const created = db.select().from(projects).where(eq(projects.id, projectId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/projects - Update project
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const {
    id,
    name,
    code,
    type,
    category,
    branch,
    manager,
    budget,
    startDate,
    endDate,
    description,
    notes,
    status,
    progress,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "معرف المشروع مطلوب" }, { status: 400 });

  const existing = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });

  // Read-only rule for completed/cancelled projects
  if (existing.status === "مكتمل" || existing.status === "ملغي") {
    return Response.json(
      { error: `لا يمكن تعديل مشروع بحالة: ${existing.status}` },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(projects)
    .set({
      name: name?.trim() ?? existing.name,
      code: code ?? existing.code,
      type: type ?? existing.type,
      category: category ?? existing.category,
      branch: branch ?? existing.branch,
      manager: manager ?? existing.manager,
      budget: budget !== undefined ? parseFloat(budget) : existing.budget,
      startDate: startDate ?? existing.startDate,
      endDate: endDate ?? existing.endDate,
      description: description ?? existing.description,
      notes: notes ?? existing.notes,
      status: status ?? existing.status,
      progress: progress !== undefined ? parseInt(progress) : existing.progress,
      updatedAt: ts,
    })
    .where(eq(projects.id, id))
    .run();

  addAudit(
    "تعديل",
    "مشروع",
    id,
    `تم تحديث بيانات المشروع: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/projects - Soft-delete project (only if no linked records)
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف المشروع مطلوب" }, { status: 400 });

  const existing = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المشروع غير موجود" }, { status: 404 });

  // Check for linked donations or aid records
  const linkedDonations = db
    .select()
    .from(donations)
    .where(eq(donations.projectId, id))
    .limit(1)
    .all();
  const linkedAid = db.select().from(aidRecords).where(eq(aidRecords.projectId, id)).limit(1).all();

  if (linkedDonations.length > 0 || linkedAid.length > 0) {
    return Response.json(
      { error: "لا يمكن حذف مشروع مرتبط بتبرعات أو مساعدات. يمكن إيقافه فقط." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(projects).where(eq(projects.id, id)).run();
  addAudit("حذف", "مشروع", id, `تم حذف المشروع: ${existing.name}`, userId, userName, before);

  return Response.json({ success: true });
}
