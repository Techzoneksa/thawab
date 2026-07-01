import { db, now, genId, addAudit } from "@/server/db/index";
import {
  budgets,
  budgetLines,
  journalLines,
  accounts,
  costCenters,
  projects,
  journalEntries,
} from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const BUDGET_STATUSES = ["مسودة", "معتمد", "مقفل", "ملغى"] as const;

// GET /api/finance/budgets - list with filters
// GET /api/finance/budgets?id=xxx - single with lines and actual vs budget
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const budget = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    if (!budget) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });

    const lines = db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetId, id))
      .orderBy(budgetLines.lineNumber)
      .all();

    // Enrich with names + compute actual from posted journal entries
    const enrichedLines = await Promise.all(
      lines.map(async (l) => {
        const account = l.accountId
          ? db.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1).all()[0]
          : null;
        const cc = l.costCenterId
          ? db
              .select()
              .from(costCenters)
              .where(eq(costCenters.id, l.costCenterId))
              .limit(1)
              .all()[0]
          : null;
        const project = l.projectId
          ? db.select().from(projects).where(eq(projects.id, l.projectId)).limit(1).all()[0]
          : null;

        // Compute actual from posted journal entries
        let actual = 0;
        if (l.accountId) {
          const conditions = [
            eq(journalLines.accountId, l.accountId),
            eq(journalEntries.status, "مرحّل"),
          ];
          if (l.costCenterId) conditions.push(eq(journalLines.costCenterId, l.costCenterId));
          if (l.projectId) conditions.push(eq(journalLines.projectId, l.projectId));
          const actuals = db
            .select({
              debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
              credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .where(and(...conditions))
            .all()[0];
          // For expenses, actual = debit - credit
          actual = (actuals?.debit || 0) - (actuals?.credit || 0);
        }

        return {
          ...l,
          accountCode: account?.code || "",
          accountName: account?.name || "",
          costCenterName: cc?.name || "",
          projectName: project?.name || "",
          actualAmount: actual,
          variance: l.plannedAmount - actual,
          utilization: l.plannedAmount > 0 ? Math.round((actual / l.plannedAmount) * 100) : 0,
        };
      }),
    );

    const totalPlanned = lines.reduce((s, l) => s + l.plannedAmount, 0);
    const totalActual = enrichedLines.reduce((s, l) => s + l.actualAmount, 0);

    return Response.json({
      item: budget,
      lines: enrichedLines,
      totals: {
        planned: totalPlanned,
        actual: totalActual,
        variance: totalPlanned - totalActual,
        utilization: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
      },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const year = url.searchParams.get("year") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(budgets.name, `%${search}%`),
        like(budgets.department, `%${search}%`),
        like(budgets.year, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(budgets.status, status));
  if (year && year !== "الكل") conditions.push(eq(budgets.year, year));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(budgets).where(whereClause).orderBy(desc(budgets.year)).all()
    : db.select().from(budgets).orderBy(desc(budgets.year)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/budgets - create or workflow actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });
    if (existing.status === "معتمد")
      return Response.json({ error: "الموازنة معتمدة بالفعل" }, { status: 400 });
    if (existing.status === "مقفل")
      return Response.json({ error: "لا يمكن اعتماد موازنة مقفلة" }, { status: 400 });

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(budgets)
      .set({
        status: "معتمد",
        approvedBy: userId || null,
        approvedAt: ts,
        updatedAt: ts,
      })
      .where(eq(budgets.id, id))
      .run();
    addAudit(
      "اعتماد",
      "موازنة",
      id,
      `تم اعتماد الموازنة: ${existing.name} (${existing.year})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "lock") {
    const { id, userId, userName } = body;
    const existing = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });
    if (existing.status !== "معتمد")
      return Response.json({ error: "يجب اعتماد الموازنة قبل قفلها" }, { status: 400 });

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(budgets)
      .set({
        status: "مقفل",
        lockedBy: userId || null,
        lockedAt: ts,
        updatedAt: ts,
      })
      .where(eq(budgets.id, id))
      .run();
    addAudit(
      "قفل",
      "موازنة",
      id,
      `تم قفل الموازنة: ${existing.name} (${existing.year})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "unlock") {
    const { id, userId, userName } = body;
    const existing = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });
    if (existing.status !== "مقفل")
      return Response.json({ error: "الموازنة ليست مقفلة" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(budgets).set({ status: "معتمد", updatedAt: now() }).where(eq(budgets.id, id)).run();
    addAudit(
      "فتح قفل",
      "موازنة",
      id,
      `تم فتح قفل الموازنة: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    name,
    year,
    amount,
    department,
    status,
    currency,
    description,
    notes,
    lines,
    userId,
    userName,
  } = body;

  if (!name?.trim()) return Response.json({ error: "اسم الموازنة مطلوب" }, { status: 400 });
  if (!year?.trim()) return Response.json({ error: "سنة الموازنة مطلوبة" }, { status: 400 });

  const budgetId = genId("BUD");
  const ts = now();

  db.insert(budgets)
    .values({
      id: budgetId,
      name: name.trim(),
      year: year.trim(),
      amount: parseFloat(amount) || 0,
      department: department || "",
      status: status || "مسودة",
      currency: currency || "SAR",
      description: description || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  if (Array.isArray(lines) && lines.length > 0) {
    let lineNum = 1;
    let totalPlanned = 0;
    for (const line of lines) {
      const planned = parseFloat(line.plannedAmount) || 0;
      totalPlanned += planned;
      db.insert(budgetLines)
        .values({
          id: genId("BL"),
          budgetId,
          lineNumber: lineNum++,
          accountId: line.accountId || null,
          costCenterId: line.costCenterId || null,
          projectId: line.projectId || null,
          plannedAmount: planned,
          actualAmount: 0,
          notes: line.notes || "",
          createdAt: ts,
        })
        .run();
    }
    // Sync header amount
    if (totalPlanned !== (parseFloat(amount) || 0)) {
      db.update(budgets)
        .set({ amount: totalPlanned, updatedAt: ts })
        .where(eq(budgets.id, budgetId))
        .run();
    }
  }

  addAudit("إضافة", "موازنة", budgetId, `تم إضافة موازنة: ${name} (${year})`, userId, userName);
  const created = db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/budgets - update draft only
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, name, year, amount, department, description, notes, lines, userId, userName } = body;
  if (!id) return Response.json({ error: "معرف الموازنة مطلوب" }, { status: 400 });

  const existing = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });
  if (existing.status !== "مسودة")
    return Response.json({ error: "لا يمكن تعديل موازنة معتمدة أو مقفلة" }, { status: 400 });

  if (Array.isArray(lines) && lines.length > 0) {
    let totalPlanned = 0;
    for (const line of lines) {
      totalPlanned += parseFloat(line.plannedAmount) || 0;
    }
    db.delete(budgetLines).where(eq(budgetLines.budgetId, id)).run();
    let lineNum = 1;
    const ts = now();
    for (const line of lines) {
      db.insert(budgetLines)
        .values({
          id: genId("BL"),
          budgetId: id,
          lineNumber: lineNum++,
          accountId: line.accountId || null,
          costCenterId: line.costCenterId || null,
          projectId: line.projectId || null,
          plannedAmount: parseFloat(line.plannedAmount) || 0,
          actualAmount: 0,
          notes: line.notes || "",
          createdAt: ts,
        })
        .run();
    }
    db.update(budgets).set({ amount: totalPlanned, updatedAt: ts }).where(eq(budgets.id, id)).run();
  }

  const before = JSON.stringify(existing);
  db.update(budgets)
    .set({
      name: name?.trim() ?? existing.name,
      year: year?.trim() ?? existing.year,
      department: department ?? existing.department,
      description: description ?? existing.description,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(budgets.id, id))
    .run();
  addAudit("تعديل", "موازنة", id, `تم تحديث الموازنة: ${existing.name}`, userId, userName, before);
  const updated = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/budgets - only drafts
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الموازنة مطلوب" }, { status: 400 });

  const existing = db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الموازنة غير موجودة" }, { status: 404 });
  if (existing.status !== "مسودة")
    return Response.json({ error: "لا يمكن حذف موازنة معتمدة أو مقفلة" }, { status: 400 });

  const before = JSON.stringify(existing);
  db.delete(budgets).where(eq(budgets.id, id)).run();
  addAudit("حذف", "موازنة", id, `تم حذف الموازنة: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
