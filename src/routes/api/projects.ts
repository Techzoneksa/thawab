import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { projects, donations, beneficiaries, aidRecords } from "@/server/db/schema";
import { eq, like, or, and, desc, sum, count } from "drizzle-orm";

// GET /api/projects - List with search, filters, pagination
// GET /api/projects?id=xxx - Single project by ID with summary
// GET /api/projects?id=xxx&summary=true - Project summary calculations
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const project = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    if (!project)
      return Response.json({ error: "ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Get project donations total
    const projDonations = db
      .select()
      .from(donations)
      .where(and(eq(donations.projectId, id), eq(donations.status, "ظ…ط¤ظƒط¯")))
      .all();
    const totalDonations = projDonations.reduce((s, d) => s + d.amount, 0);

    // Get aid records count and total
    const projAid = db
      .select()
      .from(aidRecords)
      .where(and(eq(aidRecords.projectId, id), eq(aidRecords.status, "طھظ… ط§ظ„طھط³ظ„ظٹظ…")))
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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(projects.status, status));
  if (category && category !== "ط§ظ„ظƒظ„") conditions.push(eq(projects.category, category));
  if (branch && branch !== "ط§ظ„ظƒظ„") conditions.push(eq(projects.branch, branch));

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
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  // Workflow actions
  if (action === "activate" || action === "pause" || action === "complete" || action === "cancel") {
    const statusMap = {
      activate: "ظ†ط´ط·",
      pause: "ظ…طھظˆظ‚ظپ",
      complete: "ظ…ظƒطھظ…ظ„",
      cancel: "ظ…ظ„ط؛ظٹ",
    };

    const newStatus = statusMap[action as keyof typeof statusMap];
    const project = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
    if (!project)
      return Response.json({ error: "ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Workflow rules
    if (action === "activate" && project.status === "ظ…ظƒطھظ…ظ„") {
      return Response.json(
        {
          error:
            "ظ„ط§ ظٹظ…ظƒظ† طھظپط¹ظٹظ„ ظ…ط´ط±ظˆط¹ ظ…ظƒطھظ…ظ„. ط£ظ†ط´ط¦ ظ…ط´ط±ظˆط¹ط§ظ‹ ط¬ط¯ظٹط¯ط§ظ‹ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.",
        },
        { status: 400 },
      );
    }

    if (action === "complete" && project.status === "ظ…ظ„ط؛ظٹ") {
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ظƒظ…ط§ظ„ ظ…ط´ط±ظˆط¹ ظ…ظ„ط؛ظٹ." },
        { status: 400 },
      );
    }

    const before = JSON.stringify(project);
    const ts = now();
    db.update(projects).set({ status: newStatus, updatedAt: ts }).where(eq(projects.id, id)).run();

    const actionLabel =
      action === "activate"
        ? "طھظپط¹ظٹظ„"
        : action === "pause"
          ? "ط¥ظٹظ‚ط§ظپ"
          : action === "complete"
            ? "ط¥ظƒظ…ط§ظ„"
            : "ط¥ظ„ط؛ط§ط،";

    addAudit(
      actionLabel,
      "ظ…ط´ط±ظˆط¹",
      id,
      `طھظ… ${actionLabel} ط§ظ„ظ…ط´ط±ظˆط¹: ${project.name} (ط§ظ„ط­ط§ظ„ط©: ${newStatus})`,
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
    if (!project)
      return Response.json({ error: "ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const before = JSON.stringify(project);
    db.update(projects).set({ status, updatedAt: now() }).where(eq(projects.id, id)).run();
    addAudit(
      "طھط؛ظٹظٹط± ط§ظ„ط­ط§ظ„ط©",
      "ظ…ط´ط±ظˆط¹",
      id,
      `طھظ… طھط؛ظٹظٹط± ط­ط§ظ„ط© ط§ظ„ظ…ط´ط±ظˆط¹ ط¥ظ„ظ‰: ${status}`,
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

  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ط´ط±ظˆط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

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
      status: status || "ظ…ط®ط·ط·",
      startDate: startDate || "",
      endDate: endDate || "",
      description: description || "",
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ط´ط±ظˆط¹",
    projectId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ط´ط±ظˆط¹ ط¬ط¯ظٹط¯: ${name}`,
    uid,
    uname,
  );
  const created = db.select().from(projects).where(eq(projects.id, projectId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/projects - Update project
async function __handler_PUT({ request }: { request: Request }) {
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

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط´ط±ظˆط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // Read-only rule for completed/cancelled projects
  if (existing.status === "ظ…ظƒطھظ…ظ„" || existing.status === "ظ…ظ„ط؛ظٹ") {
    return Response.json(
      { error: `ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ظ…ط´ط±ظˆط¹ ط¨ط­ط§ظ„ط©: ${existing.status}` },
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
    "طھط¹ط¯ظٹظ„",
    "ظ…ط´ط±ظˆط¹",
    id,
    `طھظ… طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط´ط±ظˆط¹: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/projects - Soft-delete project (only if no linked records)
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط´ط±ظˆط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db.select().from(projects).where(eq(projects.id, id)).limit(1).all()[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط´ط±ظˆط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

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
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ط´ط±ظˆط¹ ظ…ط±طھط¨ط· ط¨طھط¨ط±ط¹ط§طھ ط£ظˆ ظ…ط³ط§ط¹ط¯ط§طھ. ظٹظ…ظƒظ† ط¥ظٹظ‚ط§ظپظ‡ ظپظ‚ط·.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(projects).where(eq(projects.id, id)).run();
  addAudit(
    "ط­ط°ظپ",
    "ظ…ط´ط±ظˆط¹",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…ط´ط±ظˆط¹: ${existing.name}`,
    userId,
    userName,
    before,
  );

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
