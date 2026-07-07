import { db, now, genId, addAudit } from "@/server/db/index";
import { fiscalPeriods, journalEntries, journalLines } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const PERIOD_STATUSES = ["مفتوحة", "قيد الإقفال", "مقفلة", "معاد فتحتها"] as const;

// GET /api/finance/periods - list
// GET /api/finance/periods?id=xxx - single with stats
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const period = db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all()[0];
    if (!period) return Response.json({ error: "الفترة المالية غير موجودة" }, { status: 404 });

    // Count entries within period range
    const entryCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
          ),
        )
        .all()[0]?.count || 0;

    const postedCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            eq(journalEntries.status, "مرحّل"),
          ),
        )
        .all()[0]?.count || 0;

    const draftCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            eq(journalEntries.status, "مسودة"),
          ),
        )
        .all()[0]?.count || 0;

    return Response.json({
      item: period,
      stats: { totalEntries: entryCount, postedEntries: postedCount, draftEntries: draftCount },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(like(fiscalPeriods.name, `%${search}%`));
  }
  if (status && status !== "الكل") conditions.push(eq(fiscalPeriods.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db
        .select()
        .from(fiscalPeriods)
        .where(whereClause)
        .orderBy(desc(fiscalPeriods.startDate))
        .all()
    : db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate)).all();

  const total = items.length;
  return Response.json({ items, total });
}

// POST /api/finance/periods - create or close/reopen actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "close") {
    const { id, userId, userName, notes } = body;
    const period = db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all()[0];
    if (!period) return Response.json({ error: "الفترة المالية غير موجودة" }, { status: 404 });
    if (period.status === "مقفلة")
      return Response.json({ error: "الفترة مقفلة بالفعل" }, { status: 400 });
    if (period.status === "قيد الإقفال")
      return Response.json({ error: "الفترة قيد الإقفال بالفعل" }, { status: 400 });

    // Check no draft entries in period
    const draftEntries = db
      .select()
      .from(journalEntries)
      .where(
        and(
          sql`${journalEntries.date} >= ${period.startDate}`,
          sql`${journalEntries.date} <= ${period.endDate}`,
          eq(journalEntries.status, "مسودة"),
        ),
      )
      .all();
    if (draftEntries.length > 0) {
      return Response.json(
        {
          error: `لا يمكن إقفال الفترة: يوجد ${draftEntries.length} قيد مسودة في هذه الفترة. قم بترحيلها أو إلغائها أولاً.`,
        },
        { status: 400 },
      );
    }

    // Check unbalanced posted entries
    const postedEntries = db
      .select()
      .from(journalEntries)
      .where(
        and(
          sql`${journalEntries.date} >= ${period.startDate}`,
          sql`${journalEntries.date} <= ${period.endDate}`,
          eq(journalEntries.status, "مرحّل"),
        ),
      )
      .all();
    const unbalanced: string[] = [];
    for (const e of postedEntries) {
      const lines = db
        .select()
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, e.id))
        .all();
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) >= 0.01) {
        unbalanced.push(e.number);
      }
    }
    if (unbalanced.length > 0) {
      return Response.json(
        {
          error: `لا يمكن إقفال الفترة: يوجد ${unbalanced.length} قيد مرحّل غير متوازن (${unbalanced.slice(0, 3).join("، ")}).`,
        },
        { status: 400 },
      );
    }

    const before = JSON.stringify(period);
    const ts = now();
    db.update(fiscalPeriods)
      .set({
        status: "مقفلة",
        closedAt: ts,
        closedById: userId || null,
        closedByName: userName || "",
        notes: notes ?? period.notes,
        updatedAt: ts,
      })
      .where(eq(fiscalPeriods.id, id))
      .run();

    addAudit(
      "إقفال",
      "فترة مالية",
      id,
      `تم إقفال الفترة المالية: ${period.name} (من ${period.startDate} إلى ${period.endDate})`,
      userId,
      userName,
      before,
    );

    const updated = db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "reopen") {
    const { id, userId, userName } = body;
    const period = db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all()[0];
    if (!period) return Response.json({ error: "الفترة المالية غير موجودة" }, { status: 404 });
    if (period.status !== "مقفلة")
      return Response.json({ error: "لا يمكن إعادة فتح فترة غير مقفلة" }, { status: 400 });

    const before = JSON.stringify(period);
    const ts = now();
    db.update(fiscalPeriods)
      .set({
        status: "معاد فتحتها",
        reopenedAt: ts,
        reopenedById: userId || null,
        reopenedByName: userName || "",
        updatedAt: ts,
      })
      .where(eq(fiscalPeriods.id, id))
      .run();

    addAudit(
      "إعادة فتح",
      "فترة مالية",
      id,
      `تم إعادة فتح الفترة المالية: ${period.name}`,
      userId,
      userName,
      before,
    );

    const updated = db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Create new period
  const { name, startDate, endDate, notes, userId, userName } = body;
  if (!name?.trim()) return Response.json({ error: "اسم الفترة مطلوب" }, { status: 400 });
  if (!startDate?.trim()) return Response.json({ error: "تاريخ البداية مطلوب" }, { status: 400 });
  if (!endDate?.trim()) return Response.json({ error: "تاريخ النهاية مطلوب" }, { status: 400 });
  if (startDate > endDate)
    return Response.json({ error: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" }, { status: 400 });

  // Check for overlapping closed/open period with same name
  const existing = db.select().from(fiscalPeriods).where(eq(fiscalPeriods.name, name.trim())).all();
  if (existing.length > 0) {
    return Response.json({ error: "يوجد فترة مالية بنفس الاسم بالفعل" }, { status: 400 });
  }

  const periodId = genId("FP");
  const ts = now();

  db.insert(fiscalPeriods)
    .values({
      id: periodId,
      name: name.trim(),
      startDate,
      endDate,
      status: "مفتوحة",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit(
    "إضافة",
    "فترة مالية",
    periodId,
    `تم إضافة فترة مالية: ${name} (من ${startDate} إلى ${endDate})`,
    userId,
    userName,
  );

  const created = db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, periodId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/periods - update draft (open) period metadata
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, name, startDate, endDate, notes, userId, userName } = body;
  if (!id) return Response.json({ error: "معرف الفترة مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "الفترة المالية غير موجودة" }, { status: 404 });
  if (existing.status === "مقفلة")
    return Response.json({ error: "لا يمكن تعديل فترة مقفلة. أعد فتحها أولاً." }, { status: 400 });

  if (startDate && endDate && startDate > endDate) {
    return Response.json({ error: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  db.update(fiscalPeriods)
    .set({
      name: name?.trim() ?? existing.name,
      startDate: startDate ?? existing.startDate,
      endDate: endDate ?? existing.endDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(fiscalPeriods.id, id))
    .run();

  addAudit(
    "تعديل",
    "فترة مالية",
    id,
    `تم تحديث الفترة المالية: ${existing.name}`,
    userId,
    userName,
    before,
  );

  const updated = db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/periods - only open (never delete closed)
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الفترة مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "الفترة المالية غير موجودة" }, { status: 404 });
  if (existing.status !== "مفتوحة")
    return Response.json(
      { error: "لا يمكن حذف فترة مقفلة أو قيد الإقفال. يحتفظ النظام بالفترة للسجل التاريخي." },
      { status: 400 },
    );

  const before = JSON.stringify(existing);
  db.delete(fiscalPeriods).where(eq(fiscalPeriods.id, id)).run();
  addAudit(
    "حذف",
    "فترة مالية",
    id,
    `تم حذف الفترة المالية: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
