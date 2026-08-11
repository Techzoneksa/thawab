import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { beneficiaries, aidRecords, projects } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { BeneficiaryCategory, BeneficiaryStatus, MaritalStatus, AidStatus } from "@/lib/enums";

// GET /api/beneficiaries — list with search/filter/pagination.
// GET /api/beneficiaries?id=xxx — single beneficiary with aid history.
// GET /api/beneficiaries?id=xxx&summary=true — beneficiary summary calculations.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1))[0];
    if (!beneficiary) return err("المستفيد غير موجود", 404, "NOT_FOUND");

    // Aid history
    const aidHistory = await db
      .select()
      .from(aidRecords)
      .where(eq(aidRecords.beneficiaryId, id))
      .orderBy(desc(aidRecords.createdAt));

    const totalAid = aidHistory
      .filter((a) => a.status === AidStatus.DELIVERED)
      .reduce((s, a) => s + a.amount, 0);
    const aidCount = aidHistory.filter((a) => a.status === AidStatus.DELIVERED).length;
    const pendingAidCount = aidHistory.filter(
      (a) => a.status === AidStatus.PENDING || a.status === AidStatus.APPROVED,
    ).length;
    const lastAidDate = aidHistory.length > 0 ? aidHistory[0].createdAt : null;

    // Unique project IDs from aid history
    const linkedProjectIds = Array.from(
      new Set(aidHistory.map((a) => a.projectId).filter((pid): pid is string => Boolean(pid))),
    );
    const linkedProjects =
      linkedProjectIds.length > 0
        ? await db
            .select()
            .from(projects)
            .where(or(...linkedProjectIds.map((pid) => eq(projects.id, pid))))
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
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
  if (status) conditions.push(eq(beneficiaries.status, status));
  if (category) conditions.push(eq(beneficiaries.category, category));
  if (city) conditions.push(eq(beneficiaries.city, city));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(beneficiaries).where(where);
  const items = await db
    .select()
    .from(beneficiaries)
    .where(where)
    .orderBy(desc(beneficiaries.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const WORKFLOW_ACTIONS = ["review", "qualify", "disqualify", "suspend", "reactivate"] as const;

// Broad body schema: covers create fields and workflow actions. Enum values are
// validated as canonical English keys. Identity NEVER comes from the body.
const upsertSchema = z.object({
  action: z.enum([...WORKFLOW_ACTIONS, "status"]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  fileNumber: z.string().optional(),
  idNumber: z.string().optional(),
  phone: z.string().nullish(),
  city: z.string().optional(),
  address: z.string().optional(),
  category: z.nativeEnum(BeneficiaryCategory).optional(),
  status: z.nativeEnum(BeneficiaryStatus).optional(),
  familyMembers: z.coerce.number().int().optional(),
  monthlyIncome: z.coerce.number().optional(),
  maritalStatus: z.nativeEnum(MaritalStatus).optional(),
  notes: z.string().optional(),
});

// POST /api/beneficiaries — create beneficiary, or run an eligibility workflow action.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, upsertSchema);

    // Eligibility workflow actions
    if (b.action && b.action !== "status") {
      if (!b.id) return err("معرف المستفيد مطلوب", 400, "BAD_REQUEST");

      const statusMap = {
        review: BeneficiaryStatus.NEW,
        qualify: BeneficiaryStatus.ACTIVE,
        disqualify: BeneficiaryStatus.ARCHIVED,
        suspend: BeneficiaryStatus.SUSPENDED,
        reactivate: BeneficiaryStatus.ACTIVE,
      } as const;
      const newStatus = statusMap[b.action];

      const beneficiary = (await db
        .select()
        .from(beneficiaries)
        .where(eq(beneficiaries.id, b.id))
        .limit(1))[0];
      if (!beneficiary) return err("المستفيد غير موجود", 404, "NOT_FOUND");

      // Workflow rules
      if (b.action === "qualify" && beneficiary.status === BeneficiaryStatus.SUSPENDED) {
        return err("لا يمكن تأهيل مستفيد موقوف. أعد تفعيله أولاً.", 400, "INVALID_TRANSITION");
      }
      if (b.action === "reactivate" && beneficiary.status !== BeneficiaryStatus.SUSPENDED) {
        return err("لا يمكن إعادة تفعيل مستفيد غير موقوف.", 400, "INVALID_TRANSITION");
      }
      if (b.action === "suspend" && beneficiary.status === BeneficiaryStatus.ARCHIVED) {
        return err("لا يمكن إيقاف مستفيد غير مؤهل.", 400, "INVALID_TRANSITION");
      }

      const before = JSON.stringify(beneficiary);
      await db
        .update(beneficiaries)
        .set({ status: newStatus, updatedAt: now() })
        .where(eq(beneficiaries.id, b.id));

      const actionLabels: Record<(typeof WORKFLOW_ACTIONS)[number], string> = {
        review: "إرسال للمراجعة",
        qualify: "تأهيل",
        disqualify: "عدم تأهيل",
        suspend: "إيقاف",
        reactivate: "إعادة تفعيل",
      };

      await addAudit({
        action: "update",
        entityType: "beneficiary",
        entityId: b.id,
        description: `تم ${actionLabels[b.action]} المستفيد: ${beneficiary.name} (الحالة: ${newStatus})`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db
        .select()
        .from(beneficiaries)
        .where(eq(beneficiaries.id, b.id))
        .limit(1))[0];
      return Response.json({ item: updated });
    }

    // Legacy direct "status" action — keep for backward compat.
    if (b.action === "status") {
      if (!b.id) return err("معرف المستفيد مطلوب", 400, "BAD_REQUEST");
      if (!b.status) return err("الحالة مطلوبة", 400, "BAD_REQUEST");

      const beneficiary = (await db
        .select()
        .from(beneficiaries)
        .where(eq(beneficiaries.id, b.id))
        .limit(1))[0];
      if (!beneficiary) return err("المستفيد غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(beneficiary);
      await db
        .update(beneficiaries)
        .set({ status: b.status, updatedAt: now() })
        .where(eq(beneficiaries.id, b.id));

      await addAudit({
        action: "update",
        entityType: "beneficiary",
        entityId: b.id,
        description: `تم تغيير حالة المستفيد إلى: ${b.status}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db
        .select()
        .from(beneficiaries)
        .where(eq(beneficiaries.id, b.id))
        .limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create new beneficiary
    if (!b.name?.trim()) return err("اسم المستفيد مطلوب", 400, "BAD_REQUEST");

    const benId = genId("BEN");
    const ts = now();

    await db.insert(beneficiaries).values({
      id: benId,
      name: b.name.trim(),
      fileNumber: b.fileNumber ?? "",
      idNumber: b.idNumber ?? "",
      phone: b.phone || null,
      city: b.city ?? "",
      address: b.address ?? "",
      category: b.category ?? BeneficiaryCategory.NEEDY_FAMILY,
      status: b.status ?? BeneficiaryStatus.NEW,
      familyMembers: b.familyMembers ?? 1,
      monthlyIncome: b.monthlyIncome ?? 0,
      maritalStatus: b.maritalStatus ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "beneficiary",
      entityId: benId,
      description: `تم إضافة مستفيد جديد: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, benId))
      .limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف المستفيد مطلوب"),
  name: z.string().optional(),
  fileNumber: z.string().optional(),
  idNumber: z.string().optional(),
  phone: z.string().nullish(),
  city: z.string().optional(),
  address: z.string().optional(),
  category: z.nativeEnum(BeneficiaryCategory).optional(),
  status: z.nativeEnum(BeneficiaryStatus).optional(),
  familyMembers: z.coerce.number().int().optional(),
  monthlyIncome: z.coerce.number().optional(),
  maritalStatus: z.nativeEnum(MaritalStatus).optional(),
  notes: z.string().optional(),
});

// PUT /api/beneficiaries — update beneficiary.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);

    const existing = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, b.id))
      .limit(1))[0];
    if (!existing) return err("المستفيد غير موجود", 404, "NOT_FOUND");

    // Cannot qualify a suspended beneficiary directly.
    if (b.status === BeneficiaryStatus.ACTIVE && existing.status === BeneficiaryStatus.SUSPENDED) {
      return err("لا يمكن تأهيل مستفيد موقوف. أعد تفعيله أولاً.", 400, "INVALID_TRANSITION");
    }

    const before = JSON.stringify(existing);
    await db
      .update(beneficiaries)
      .set({
        name: b.name?.trim() ?? existing.name,
        fileNumber: b.fileNumber ?? existing.fileNumber,
        idNumber: b.idNumber ?? existing.idNumber,
        phone: b.phone ?? existing.phone,
        city: b.city ?? existing.city,
        address: b.address ?? existing.address,
        category: b.category ?? existing.category,
        status: b.status ?? existing.status,
        familyMembers: b.familyMembers ?? existing.familyMembers,
        monthlyIncome: b.monthlyIncome ?? existing.monthlyIncome,
        maritalStatus: b.maritalStatus ?? existing.maritalStatus,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(beneficiaries.id, b.id));

    await addAudit({
      action: "update",
      entityType: "beneficiary",
      entityId: b.id,
      description: `تم تحديث بيانات المستفيد: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, b.id))
      .limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/beneficiaries?id=xxx — hard delete, only if no delivered/pending aid.
// Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المستفيد مطلوب", 400, "BAD_REQUEST");

  const existing = (await db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))
    .limit(1))[0];
  if (!existing) return err("المستفيد غير موجود", 404, "NOT_FOUND");

  // Block deletion if there are delivered aid records.
  const linkedAid = await db
    .select()
    .from(aidRecords)
    .where(and(eq(aidRecords.beneficiaryId, id), eq(aidRecords.status, AidStatus.DELIVERED)))
    .limit(1);
  if (linkedAid.length > 0) {
    return err("لا يمكن حذف مستفيد له مساعدات مستلمة. يمكن إيقافه فقط.", 400, "HAS_LINKED_RECORDS");
  }

  // Block deletion if there are pending/approved aid records.
  const pendingAid = await db
    .select()
    .from(aidRecords)
    .where(
      and(
        eq(aidRecords.beneficiaryId, id),
        or(eq(aidRecords.status, AidStatus.PENDING), eq(aidRecords.status, AidStatus.APPROVED)),
      ),
    )
    .limit(1);
  if (pendingAid.length > 0) {
    return err(
      "لا يمكن حذف مستفيد له مساعدات قيد المعالجة. عالج المساعدات أولاً أو أوقف المستفيد.",
      400,
      "HAS_LINKED_RECORDS",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(beneficiaries).where(eq(beneficiaries.id, id));

  await addAudit({
    action: "delete",
    entityType: "beneficiary",
    entityId: id,
    description: `تم حذف المستفيد: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/beneficiaries")({
  server: {
    handlers: {
      GET: authHandler("beneficiaries.view", GET),
      POST: authHandler("beneficiaries.create", POST),
      PUT: authHandler("beneficiaries.update", PUT),
      DELETE: authHandler("beneficiaries.delete", DELETE),
    },
  },
});
