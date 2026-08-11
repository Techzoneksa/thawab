import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { projects, donations, beneficiaries, aidRecords } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { nextCode } from "@/server/db/numbering";
import { ProjectStatus, Fund, DonationStatus, AidStatus } from "@/lib/enums";

// GET /api/projects — list with search/filter/pagination.
// GET /api/projects?id=xxx — single project with linked records.
// GET /api/projects?id=xxx&summary=true — project summary calculations.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const project = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
    if (!project) return err("المشروع غير موجود", 404, "NOT_FOUND");

    // Confirmed donations total
    const projDonations = await db
      .select()
      .from(donations)
      .where(and(eq(donations.projectId, id), eq(donations.status, DonationStatus.CONFIRMED)));
    const totalDonations = projDonations.reduce((s, d) => s + d.amount, 0);

    // Delivered aid records
    const projAid = await db
      .select()
      .from(aidRecords)
      .where(and(eq(aidRecords.projectId, id), eq(aidRecords.status, AidStatus.DELIVERED)));
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

    // Linked donations for display
    const linkedDonations = await db
      .select()
      .from(donations)
      .where(eq(donations.projectId, id))
      .orderBy(desc(donations.createdAt))
      .limit(20);

    // Linked aid records for display
    const linkedAid = await db
      .select()
      .from(aidRecords)
      .where(eq(aidRecords.projectId, id))
      .orderBy(desc(aidRecords.createdAt))
      .limit(20);

    // Linked beneficiaries
    const linkedBeneficiaryIds = Array.from(
      new Set(linkedAid.map((a) => a.beneficiaryId).filter((bid): bid is string => Boolean(bid))),
    );
    const linkedBeneficiaries =
      linkedBeneficiaryIds.length > 0
        ? await db
            .select()
            .from(beneficiaries)
            .where(or(...linkedBeneficiaryIds.map((bid) => eq(beneficiaries.id, bid))))
            .limit(20)
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
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
  if (status) conditions.push(eq(projects.status, status));
  if (category) conditions.push(eq(projects.category, category));
  if (branch) conditions.push(eq(projects.branch, branch));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(projects).where(where);
  const items = await db
    .select()
    .from(projects)
    .where(where)
    .orderBy(desc(projects.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const WORKFLOW_ACTIONS = ["activate", "pause", "complete", "cancel"] as const;

// Broad body schema: covers create fields and workflow actions. Enum values are
// validated as canonical English keys. Identity NEVER comes from the body.
const upsertSchema = z.object({
  action: z.enum([...WORKFLOW_ACTIONS, "status"]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  branch: z.string().optional(),
  manager: z.string().optional(),
  budget: z.coerce.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  fund: z.nativeEnum(Fund).optional(),
  progress: z.coerce.number().int().optional(),
});

// POST /api/projects — create project, or run a lifecycle workflow action.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, upsertSchema);

    // Lifecycle workflow actions
    if (b.action && b.action !== "status") {
      if (!b.id) return err("معرف المشروع مطلوب", 400, "BAD_REQUEST");

      const statusMap = {
        activate: ProjectStatus.ACTIVE,
        pause: ProjectStatus.ON_HOLD,
        complete: ProjectStatus.COMPLETED,
        cancel: ProjectStatus.CANCELLED,
      } as const;
      const newStatus = statusMap[b.action];

      const project = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
      if (!project) return err("المشروع غير موجود", 404, "NOT_FOUND");

      // Workflow rules
      if (b.action === "activate" && project.status === ProjectStatus.COMPLETED) {
        return err(
          "لا يمكن تفعيل مشروع مكتمل. أنشئ مشروعاً جديداً بدلاً من ذلك.",
          400,
          "INVALID_TRANSITION",
        );
      }
      if (b.action === "complete" && project.status === ProjectStatus.CANCELLED) {
        return err("لا يمكن إكمال مشروع ملغي.", 400, "INVALID_TRANSITION");
      }

      const before = JSON.stringify(project);
      await db
        .update(projects)
        .set({ status: newStatus, updatedAt: now() })
        .where(eq(projects.id, b.id));

      const actionLabels: Record<(typeof WORKFLOW_ACTIONS)[number], string> = {
        activate: "تفعيل",
        pause: "إيقاف",
        complete: "إكمال",
        cancel: "إلغاء",
      };

      await addAudit({
        action: "update",
        entityType: "project",
        entityId: b.id,
        description: `تم ${actionLabels[b.action]} المشروع: ${project.name} (الحالة: ${newStatus})`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Legacy direct "status" action — keep for backward compat.
    if (b.action === "status") {
      if (!b.id) return err("معرف المشروع مطلوب", 400, "BAD_REQUEST");
      if (!b.status) return err("الحالة مطلوبة", 400, "BAD_REQUEST");

      const project = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
      if (!project) return err("المشروع غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(project);
      await db
        .update(projects)
        .set({ status: b.status, updatedAt: now() })
        .where(eq(projects.id, b.id));

      await addAudit({
        action: "update",
        entityType: "project",
        entityId: b.id,
        description: `تم تغيير حالة المشروع إلى: ${b.status}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create new project
    if (!b.name?.trim()) return err("اسم المشروع مطلوب", 400, "BAD_REQUEST");

    const projectId = genId("PRJ");
    const ts = now();
    // Auto-generate a sequential project code when not provided.
    const code =
      b.code?.trim() ||
      (await db.transaction((tx) =>
        nextCode(tx as any, { table: "projects", column: "code", prefix: "PRJ-" }),
      ));

    await db.insert(projects).values({
      id: projectId,
      name: b.name.trim(),
      code,
      type: b.type ?? "",
      category: b.category ?? "",
      branch: b.branch ?? "",
      manager: b.manager ?? "",
      budget: b.budget ?? 0,
      spent: 0,
      donations: 0,
      beneficiaryCount: 0,
      progress: b.progress ?? 0,
      status: b.status ?? ProjectStatus.PLANNED,
      fund: b.fund ?? Fund.UNRESTRICTED,
      startDate: b.startDate ?? "",
      endDate: b.endDate ?? "",
      description: b.description ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "project",
      entityId: projectId,
      description: `تم إضافة مشروع جديد: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف المشروع مطلوب"),
  name: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  branch: z.string().optional(),
  manager: z.string().optional(),
  budget: z.coerce.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  fund: z.nativeEnum(Fund).optional(),
  progress: z.coerce.number().int().optional(),
});

// PUT /api/projects — update project.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);

    const existing = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
    if (!existing) return err("المشروع غير موجود", 404, "NOT_FOUND");

    // Completed/cancelled projects are read-only.
    if (
      existing.status === ProjectStatus.COMPLETED ||
      existing.status === ProjectStatus.CANCELLED
    ) {
      return err(`لا يمكن تعديل مشروع بحالة: ${existing.status}`, 400, "READ_ONLY");
    }

    const before = JSON.stringify(existing);
    await db
      .update(projects)
      .set({
        name: b.name?.trim() ?? existing.name,
        code: b.code ?? existing.code,
        type: b.type ?? existing.type,
        category: b.category ?? existing.category,
        branch: b.branch ?? existing.branch,
        manager: b.manager ?? existing.manager,
        budget: b.budget ?? existing.budget,
        startDate: b.startDate ?? existing.startDate,
        endDate: b.endDate ?? existing.endDate,
        description: b.description ?? existing.description,
        notes: b.notes ?? existing.notes,
        status: b.status ?? existing.status,
        fund: b.fund ?? existing.fund,
        progress: b.progress ?? existing.progress,
        updatedAt: now(),
      })
      .where(eq(projects.id, b.id));

    await addAudit({
      action: "update",
      entityType: "project",
      entityId: b.id,
      description: `تم تحديث بيانات المشروع: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(projects).where(eq(projects.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/projects?id=xxx — hard delete, only if no linked donations/aid.
// Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المشروع مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(projects).where(eq(projects.id, id)).limit(1))[0];
  if (!existing) return err("المشروع غير موجود", 404, "NOT_FOUND");

  // Block deletion if there are linked donations or aid records.
  const linkedDonations = await db
    .select()
    .from(donations)
    .where(eq(donations.projectId, id))
    .limit(1);
  const linkedAid = await db
    .select()
    .from(aidRecords)
    .where(eq(aidRecords.projectId, id))
    .limit(1);

  if (linkedDonations.length > 0 || linkedAid.length > 0) {
    return err(
      "لا يمكن حذف مشروع مرتبط بتبرعات أو مساعدات. يمكن إيقافه فقط.",
      400,
      "HAS_LINKED_RECORDS",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(projects).where(eq(projects.id, id));

  await addAudit({
    action: "delete",
    entityType: "project",
    entityId: id,
    description: `تم حذف المشروع: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: authHandler("projects.view", GET),
      POST: authHandler("projects.create", POST),
      PUT: authHandler("projects.update", PUT),
      DELETE: authHandler("projects.delete", DELETE),
    },
  },
});
