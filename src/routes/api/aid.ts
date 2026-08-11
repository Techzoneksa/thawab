import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, inArray, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { aidRecords, beneficiaries, projects } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import {
  postBalancedEntry,
  reverseEntry,
  resolveSystemAccountId,
  SYS,
} from "@/server/db/gl";
import { AidType, AidStatus, BeneficiaryStatus, Fund, JournalSource } from "@/lib/enums";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1))[0];
    if (!aid) return err("السجل غير موجود", 404, "NOT_FOUND");
    const beneficiary = (await db.select().from(beneficiaries).where(eq(beneficiaries.id, aid.beneficiaryId)).limit(1))[0];
    const project = aid.projectId
      ? (await db.select().from(projects).where(eq(projects.id, aid.projectId)).limit(1))[0]
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(like(aidRecords.id, `%${search}%`));
  if (status) conditions.push(eq(aidRecords.status, status));
  if (type) conditions.push(eq(aidRecords.type, type));
  if (beneficiaryId) conditions.push(eq(aidRecords.beneficiaryId, beneficiaryId));
  if (projectId) conditions.push(eq(aidRecords.projectId, projectId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(aidRecords).where(where);
  const items = await db
    .select()
    .from(aidRecords)
    .where(where)
    .orderBy(desc(aidRecords.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich names without N+1.
  const benIds = [...new Set(items.map((a) => a.beneficiaryId).filter(Boolean))] as string[];
  const prIds = [...new Set(items.map((a) => a.projectId).filter(Boolean))] as string[];
  const bens = benIds.length ? await db.select().from(beneficiaries).where(inArray(beneficiaries.id, benIds)) : [];
  const prs = prIds.length ? await db.select().from(projects).where(inArray(projects.id, prIds)) : [];
  const benMap = new Map(bens.map((b) => [b.id, b]));
  const prMap = new Map(prs.map((p) => [p.id, p]));
  const enriched = items.map((a) => ({
    ...a,
    beneficiaryName: benMap.get(a.beneficiaryId)?.name || "",
    beneficiaryStatus: benMap.get(a.beneficiaryId)?.status || "",
    projectName: a.projectId ? prMap.get(a.projectId)?.name || "" : "",
  }));

  return Response.json({ items: enriched, total: Number(total), page, limit });
}

const createSchema = z.object({
  beneficiaryId: z.string().min(1, "المستفيد مطلوب"),
  projectId: z.string().nullish(),
  type: z.nativeEnum(AidType, { errorMap: () => ({ message: "نوع المساعدة مطلوب" }) }),
  amount: z.coerce.number().min(0),
  fund: z.nativeEnum(Fund).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "deliver", "return"]),
  id: z.string().min(1),
  deliveryMethod: z.string().optional(),
  deliveryNotes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));

    if (body && typeof body === "object" && "action" in body) {
      const a = actionSchema.parse(body);
      const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, a.id)).limit(1))[0];
      if (!aid) return err("السجل غير موجود", 404, "NOT_FOUND");
      const before = JSON.stringify(aid);
      const ts = now();

      if (a.action === "approve") {
        if (aid.status !== AidStatus.PENDING) return err("لا يمكن اعتماد هذا السجل", 400, "BAD_STATE");
        await db.update(aidRecords).set({ status: AidStatus.APPROVED, approvedBy: ctx.user.id, approvedAt: ts, updatedAt: ts }).where(eq(aidRecords.id, a.id));
        await addAudit({ action: "approve", entityType: "aid", entityId: a.id, description: "اعتماد المساعدة", userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
      } else if (a.action === "reject") {
        await db.update(aidRecords).set({ status: AidStatus.REJECTED, updatedAt: ts }).where(eq(aidRecords.id, a.id));
        await addAudit({ action: "reject", entityType: "aid", entityId: a.id, description: "رفض المساعدة", userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
      } else if (a.action === "return") {
        await db.update(aidRecords).set({ status: AidStatus.PENDING, updatedAt: ts }).where(eq(aidRecords.id, a.id));
        await addAudit({ action: "return", entityType: "aid", entityId: a.id, description: "إرجاع المساعدة للتعديل", userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
      } else if (a.action === "deliver") {
        const beneficiary = (await db.select().from(beneficiaries).where(eq(beneficiaries.id, aid.beneficiaryId)).limit(1))[0];
        if (!beneficiary) return err("المستفيد غير موجود", 404, "NOT_FOUND");
        if (beneficiary.status !== BeneficiaryStatus.ACTIVE) return err("لا يمكن تسليم مساعدة لمستفيد غير مؤهل", 400, "NOT_ELIGIBLE");
        if (aid.status !== AidStatus.APPROVED) return err("يجب اعتماد المساعدة أولاً", 400, "BAD_STATE");

        await db.transaction(async (tx) => {
          let journalEntryId: string | null = null;
          if (aid.amount > 0) {
            // Dr Aid Expense, Cr Cash.
            const expense = await resolveSystemAccountId(tx as any, SYS.AID_EXPENSE);
            const cash = await resolveSystemAccountId(tx as any, SYS.CASH);
            journalEntryId = await postBalancedEntry(tx as any, {
              date: ts.slice(0, 10),
              description: `صرف مساعدة للمستفيد ${beneficiary.name}`,
              fund: aid.fund,
              projectId: aid.projectId,
              source: JournalSource.AID,
              sourceType: "aid",
              sourceId: aid.id,
              lines: [
                { accountId: expense, debit: aid.amount, fund: aid.fund, projectId: aid.projectId },
                { accountId: cash, credit: aid.amount, fund: aid.fund },
              ],
              userId: ctx.user.id,
            });
          }
          await tx.update(aidRecords).set({
            status: AidStatus.DELIVERED,
            deliveredAt: ts,
            deliveredBy: ctx.user.id,
            deliveryMethod: a.deliveryMethod || "",
            deliveryNotes: a.deliveryNotes || "",
            journalEntryId,
            updatedAt: ts,
          }).where(eq(aidRecords.id, a.id));

          if (aid.projectId && aid.amount > 0) {
            const project = (await tx.select().from(projects).where(eq(projects.id, aid.projectId)).limit(1))[0];
            if (project) {
              await tx.update(projects).set({
                spent: (project.spent || 0) + aid.amount,
                beneficiaryCount: (project.beneficiaryCount || 0) + 1,
                updatedAt: ts,
              }).where(eq(projects.id, aid.projectId));
            }
          }
        });
        await addAudit({ action: "deliver", entityType: "aid", entityId: a.id, description: `تسليم مساعدة بمبلغ ${aid.amount} ر.س`, userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
      }

      const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, a.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create
    const b = createSchema.parse(body);
    const beneficiary = (await db.select().from(beneficiaries).where(eq(beneficiaries.id, b.beneficiaryId)).limit(1))[0];
    if (!beneficiary) return err("المستفيد غير موجود", 404, "NOT_FOUND");
    if (beneficiary.status === BeneficiaryStatus.ARCHIVED || beneficiary.status === BeneficiaryStatus.SUSPENDED)
      return err(`لا يمكن إضافة مساعدة لمستفيد بحالته الحالية`, 400, "NOT_ELIGIBLE");

    const aidId = genId("AID");
    const ts = now();
    await db.insert(aidRecords).values({
      id: aidId,
      beneficiaryId: b.beneficiaryId,
      projectId: b.projectId ?? null,
      type: b.type,
      amount: b.amount,
      fund: b.fund ?? Fund.UNRESTRICTED,
      status: AidStatus.PENDING,
      date: (b.date || ts).slice(0, 10),
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await addAudit({ action: "create", entityType: "aid", entityId: aidId, description: `إضافة مساعدة جديدة`, userId: ctx.user.id, userName: ctx.user.name, ip: ctx.ip });
    const created = (await db.select().from(aidRecords).where(eq(aidRecords.id, aidId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  beneficiaryId: z.string().optional(),
  projectId: z.string().nullish(),
  type: z.nativeEnum(AidType).optional(),
  amount: z.coerce.number().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(aidRecords).where(eq(aidRecords.id, b.id)).limit(1))[0];
    if (!existing) return err("السجل غير موجود", 404, "NOT_FOUND");
    if (existing.status === AidStatus.DELIVERED || existing.status === AidStatus.REJECTED)
      return err("لا يمكن تعديل هذا السجل", 400, "BAD_STATE");

    const before = JSON.stringify(existing);
    await db.update(aidRecords).set({
      beneficiaryId: b.beneficiaryId ?? existing.beneficiaryId,
      projectId: b.projectId === undefined ? existing.projectId : b.projectId,
      type: b.type ?? existing.type,
      amount: b.amount ?? existing.amount,
      date: b.date ?? existing.date,
      notes: b.notes ?? existing.notes,
      updatedAt: now(),
    }).where(eq(aidRecords.id, b.id));
    await addAudit({ action: "update", entityType: "aid", entityId: b.id, description: "تحديث بيانات المساعدة", userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
    const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف السجل مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1))[0];
  if (!existing) return err("السجل غير موجود", 404, "NOT_FOUND");
  if (existing.status === AidStatus.DELIVERED) return err("لا يمكن حذف مساعدة تم تسليمها", 400, "BAD_STATE");
  const before = JSON.stringify(existing);
  await db.delete(aidRecords).where(eq(aidRecords.id, id));
  await addAudit({ action: "delete", entityType: "aid", entityId: id, description: "حذف المساعدة", userId: ctx.user.id, userName: ctx.user.name, before, ip: ctx.ip });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/aid")({
  server: {
    handlers: {
      GET: authHandler("aid.view", GET),
      POST: authHandler("aid.create", POST),
      PUT: authHandler("aid.update", PUT),
      DELETE: authHandler("aid.delete", DELETE),
    },
  },
});
