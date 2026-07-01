import { db, now, genId, addAudit } from "@/server/db/index";
import { costCenters, journalLines, budgetLines } from "@/server/db/schema";
import { eq, like, or, and, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const COST_CENTER_STATUSES = ["نشط", "موقوف", "مغلق"] as const;

// GET /api/finance/cost-centers - list
// GET /api/finance/cost-centers?id=xxx - single with usage info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const cc = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
    if (!cc) return Response.json({ error: "مركز التكلفة غير موجود" }, { status: 404 });

    const journalUsage =
      db
        .select({ count: sql<number>`count(*)` })
        .from(journalLines)
        .where(eq(journalLines.costCenterId, id))
        .all()[0]?.count || 0;
    const budgetUsage =
      db
        .select({ count: sql<number>`count(*)` })
        .from(budgetLines)
        .where(eq(budgetLines.costCenterId, id))
        .all()[0]?.count || 0;

    return Response.json({
      item: cc,
      journalUsage,
      budgetUsage,
      hasUsage: journalUsage > 0 || budgetUsage > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(like(costCenters.code, `%${search}%`), like(costCenters.name, `%${search}%`)),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(costCenters.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(costCenters).where(whereClause).orderBy(costCenters.code).all()
    : db.select().from(costCenters).orderBy(costCenters.code).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/cost-centers - create or status change
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "مركز التكلفة غير موجود" }, { status: 404 });
    if (existing.status === "موقوف")
      return Response.json({ error: "مركز التكلفة موقوف بالفعل" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(costCenters)
      .set({ status: "موقوف", updatedAt: now() })
      .where(eq(costCenters.id, id))
      .run();
    addAudit(
      "إيقاف",
      "مركز تكلفة",
      id,
      `تم إيقاف مركز التكلفة: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "activate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "مركز التكلفة غير موجود" }, { status: 404 });
    if (existing.status === "نشط")
      return Response.json({ error: "مركز التكلفة نشط بالفعل" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(costCenters)
      .set({ status: "نشط", updatedAt: now() })
      .where(eq(costCenters.id, id))
      .run();
    addAudit(
      "تفعيل",
      "مركز تكلفة",
      id,
      `تم تفعيل مركز التكلفة: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const { code, name, manager, budget, spent, status, description, notes, userId, userName } = body;

  if (!code?.trim()) return Response.json({ error: "رمز المركز مطلوب" }, { status: 400 });
  if (!name?.trim()) return Response.json({ error: "اسم المركز مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(costCenters)
    .where(eq(costCenters.code, code.trim()))
    .limit(1)
    .all()[0];
  if (existing) return Response.json({ error: "رمز المركز مستخدم بالفعل" }, { status: 400 });

  const ccId = genId("CC");
  const ts = now();

  db.insert(costCenters)
    .values({
      id: ccId,
      code: code.trim(),
      name: name.trim(),
      manager: manager || "",
      budget: parseFloat(budget) || 0,
      spent: parseFloat(spent) || 0,
      status: status || "نشط",
      description: description || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "مركز تكلفة", ccId, `تم إضافة مركز تكلفة: ${code} - ${name}`, userId, userName);
  const created = db.select().from(costCenters).where(eq(costCenters.id, ccId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT - update
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, name, manager, budget, spent, status, description, notes, userId, userName } = body;

  if (!id) return Response.json({ error: "معرف مركز التكلفة مطلوب" }, { status: 400 });

  const existing = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "مركز التكلفة غير موجود" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(costCenters)
    .set({
      name: name?.trim() ?? existing.name,
      manager: manager ?? existing.manager,
      budget: budget !== undefined ? parseFloat(budget) : existing.budget,
      spent: spent !== undefined ? parseFloat(spent) : existing.spent,
      status: status ?? existing.status,
      description: description ?? existing.description,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(costCenters.id, id))
    .run();

  addAudit(
    "تعديل",
    "مركز تكلفة",
    id,
    `تم تحديث مركز التكلفة: ${existing.code} - ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE - only if no usage
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف مركز التكلفة مطلوب" }, { status: 400 });

  const existing = db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "مركز التكلفة غير موجود" }, { status: 404 });

  const journalUsage =
    db
      .select({ count: sql<number>`count(*)` })
      .from(journalLines)
      .where(eq(journalLines.costCenterId, id))
      .all()[0]?.count || 0;
  const budgetUsage =
    db
      .select({ count: sql<number>`count(*)` })
      .from(budgetLines)
      .where(eq(budgetLines.costCenterId, id))
      .all()[0]?.count || 0;

  if (journalUsage > 0 || budgetUsage > 0) {
    return Response.json(
      {
        error: `لا يمكن حذف مركز تكلفة مستخدم في ${journalUsage} سطر قيد و ${budgetUsage} سطر موازنة. أوقف المركز بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(costCenters).where(eq(costCenters.id, id)).run();
  addAudit(
    "حذف",
    "مركز تكلفة",
    id,
    `تم حذف مركز التكلفة: ${existing.code} - ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
