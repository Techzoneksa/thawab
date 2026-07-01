import { db, now, genId, addAudit } from "@/server/db/index";
import { journalEntries, journalLines, accounts, costCenters, projects } from "@/server/db/schema";
import { eq, like, or, and, desc, ne, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const JOURNAL_STATUSES = ["مسودة", "بانتظار الاعتماد", "مرحّل", "ملغى", "معكوس"] as const;
export const JOURNAL_FUNDS = ["مقيد", "غير مقيد", "أوقاف"] as const;

// GET /api/finance/journal - list with filters
// GET /api/finance/journal?id=xxx - single with lines
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const entry = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });

    const lines = db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber)
      .all();

    // Enrich lines with account/cost center/project names
    const enrichedLines = lines.map((l) => {
      const account = db
        .select()
        .from(accounts)
        .where(eq(accounts.id, l.accountId))
        .limit(1)
        .all()[0];
      const cc = l.costCenterId
        ? db.select().from(costCenters).where(eq(costCenters.id, l.costCenterId)).limit(1).all()[0]
        : null;
      const project = l.projectId
        ? db.select().from(projects).where(eq(projects.id, l.projectId)).limit(1).all()[0]
        : null;
      return {
        ...l,
        accountCode: account?.code || "",
        accountName: account?.name || "",
        costCenterName: cc?.name || "",
        projectName: project?.name || "",
      };
    });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

    let reversedOf = null;
    if (entry.reversedOf) {
      reversedOf = db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entry.reversedOf))
        .limit(1)
        .all()[0];
    }
    const reversalEntries = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.reversedOf, id))
      .all();

    return Response.json({
      item: entry,
      lines: enrichedLines,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      reversedOf,
      reversalEntries,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const fund = url.searchParams.get("fund") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(journalEntries.number, `%${search}%`),
        like(journalEntries.description, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(journalEntries.status, status));
  if (fund && fund !== "الكل") conditions.push(eq(journalEntries.fund, fund));
  if (projectId) conditions.push(eq(journalEntries.projectId, projectId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(journalEntries).$dynamic();
  const all = whereClause
    ? allQuery.where(whereClause).orderBy(desc(journalEntries.createdAt)).all()
    : allQuery.orderBy(desc(journalEntries.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(journalEntries).$dynamic();
  const items = whereClause
    ? itemsQuery
        .where(whereClause)
        .orderBy(desc(journalEntries.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : itemsQuery.orderBy(desc(journalEntries.createdAt)).limit(limit).offset(offset).all();

  // Enrich with totals and line counts
  const enrichedItems = items.map((entry) => {
    const lines = db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, entry.id))
      .all();
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    return { ...entry, lineCount: lines.length, totalDebit, totalCredit };
  });

  return Response.json({ items: enrichedItems, total, page, limit });
}

// POST /api/finance/journal - create or workflow actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  if (action === "post") {
    const entry = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });
    if (entry.status === "مرحّل")
      return Response.json({ error: "القيد مرحّل بالفعل" }, { status: 400 });
    if (entry.status !== "مسودة" && entry.status !== "بانتظار الاعتماد")
      return Response.json({ error: "لا يمكن ترحيل قيد ملغى أو معكوس" }, { status: 400 });

    const lines = db.select().from(journalLines).where(eq(journalLines.journalEntryId, id)).all();
    if (lines.length === 0)
      return Response.json({ error: "لا يمكن ترحيل قيد بدون سطور" }, { status: 400 });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return Response.json(
        {
          error: `القيد غير متوازن: مجموع المدين ${totalDebit} ≠ مجموع الدائن ${totalCredit}`,
        },
        { status: 400 },
      );
    }

    // Verify all line accounts are postable and active
    for (const line of lines) {
      const account = db
        .select()
        .from(accounts)
        .where(eq(accounts.id, line.accountId))
        .limit(1)
        .all()[0];
      if (!account)
        return Response.json(
          { error: `الحساب في السطر ${line.lineNumber} غير موجود` },
          { status: 400 },
        );
      if (!account.postable)
        return Response.json(
          {
            error: `الحساب "${account.code} - ${account.name}" غير قابل للترحيل. اختر حساباً تفصيلياً.`,
          },
          { status: 400 },
        );
      if (account.status !== "نشط")
        return Response.json(
          { error: `الحساب "${account.code}" موقوف ولا يمكن استخدامه في قيد.` },
          { status: 400 },
        );
    }

    const before = JSON.stringify(entry);
    const ts = now();
    db.update(journalEntries)
      .set({
        status: "مرحّل",
        postedBy: userId || null,
        postedAt: ts,
        updatedAt: ts,
      })
      .where(eq(journalEntries.id, id))
      .run();

    addAudit(
      "ترحيل",
      "قيد يومية",
      id,
      `تم ترحيل القيد: ${entry.number} بمبلغ ${totalDebit} ر.س`,
      userId,
      userName,
      before,
    );

    const updated = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "reverse") {
    const entry = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });
    if (entry.status !== "مرحّل")
      return Response.json({ error: "لا يمكن عكس قيد غير مرحّل" }, { status: 400 });

    const lines = db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber)
      .all();
    if (lines.length === 0)
      return Response.json({ error: "القيد الأصلي لا يحتوي على سطور" }, { status: 400 });

    // Generate reversal number
    const newNumber = generateJournalNumber();
    const reversalId = genId("JV");
    const ts = now();

    // Create reversal header
    db.insert(journalEntries)
      .values({
        id: reversalId,
        number: newNumber,
        date: ts.split(" ")[0],
        description: `عكس القيد: ${entry.number} - ${entry.description}`,
        debitAccount: lines[0].credit ? `${lines[0].accountId}` : "",
        creditAccount: lines[0].debit ? `${lines[0].accountId}` : "",
        amount: lines[0].debit || lines[0].credit || 0,
        fund: entry.fund,
        currency: entry.currency,
        projectId: entry.projectId,
        sourceType: "reversal",
        sourceId: entry.id,
        status: "مرحّل",
        postedBy: userId || null,
        postedAt: ts,
        reversedOf: entry.id,
        notes: entry.notes || "",
        createdBy: userId || null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Copy lines in reverse (debit↔credit)
    let lineNum = 1;
    for (const line of lines) {
      db.insert(journalLines)
        .values({
          id: genId("JL"),
          journalEntryId: reversalId,
          lineNumber: lineNum++,
          accountId: line.accountId,
          description: line.description,
          debit: line.credit,
          credit: line.debit,
          costCenterId: line.costCenterId,
          projectId: line.projectId,
          notes: line.notes,
          createdAt: ts,
        })
        .run();
    }

    // Mark original as reversed
    db.update(journalEntries)
      .set({ status: "معكوس", updatedAt: ts })
      .where(eq(journalEntries.id, id))
      .run();

    addAudit(
      "عكس",
      "قيد يومية",
      reversalId,
      `تم إنشاء قيد عكسي ${newNumber} للقيد ${entry.number}`,
      userId,
      userName,
    );
    addAudit(
      "عكس",
      "قيد يومية",
      id,
      `تم عكس القيد ${entry.number} بواسطة ${newNumber}`,
      userId,
      userName,
    );
    const created = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, reversalId))
      .limit(1)
      .all()[0];
    return Response.json({ item: created }, { status: 201 });
  }

  if (action === "cancel") {
    const entry = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });
    if (entry.status === "مرحّل" || entry.status === "معكوس")
      return Response.json(
        { error: "لا يمكن إلغاء قيد مرحّل أو معكوس. استخدم العكس." },
        { status: 400 },
      );

    const before = JSON.stringify(entry);
    db.update(journalEntries)
      .set({ status: "ملغى", updatedAt: now() })
      .where(eq(journalEntries.id, id))
      .run();
    addAudit("إلغاء", "قيد يومية", id, `تم إلغاء القيد: ${entry.number}`, userId, userName, before);
    const updated = db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Create new entry with lines
  const { number, date, description, fund, projectId, notes, lines, currency } = body;
  if (!description?.trim()) return Response.json({ error: "وصف القيد مطلوب" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length < 2)
    return Response.json({ error: "القيد يجب أن يحتوي على سطرين على الأقل" }, { status: 400 });

  // Validate lines
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [idx, line] of lines.entries()) {
    if (!line.accountId)
      return Response.json({ error: `السطر ${idx + 1}: الحساب مطلوب` }, { status: 400 });
    const debit = parseFloat(line.debit) || 0;
    const credit = parseFloat(line.credit) || 0;
    if (debit === 0 && credit === 0)
      return Response.json({ error: `السطر ${idx + 1}: يجب إدخال مدين أو دائن` }, { status: 400 });
    if (debit > 0 && credit > 0)
      return Response.json(
        { error: `السطر ${idx + 1}: لا يمكن أن يكون مدين ودائن في نفس الوقت` },
        { status: 400 },
      );
    totalDebit += debit;
    totalCredit += credit;

    const account = db
      .select()
      .from(accounts)
      .where(eq(accounts.id, line.accountId))
      .limit(1)
      .all()[0];
    if (!account)
      return Response.json({ error: `السطر ${idx + 1}: الحساب غير موجود` }, { status: 400 });
    if (!account.postable)
      return Response.json(
        {
          error: `السطر ${idx + 1}: الحساب "${account.code} - ${account.name}" غير قابل للترحيل. اختر حساباً تفصيلياً.`,
        },
        { status: 400 },
      );
    if (account.status !== "نشط")
      return Response.json(
        { error: `السطر ${idx + 1}: الحساب "${account.code}" موقوف.` },
        { status: 400 },
      );
  }
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    return Response.json(
      {
        error: `القيد غير متوازن: مجموع المدين ${totalDebit.toFixed(2)} ≠ مجموع الدائن ${totalCredit.toFixed(2)}`,
      },
      { status: 400 },
    );
  }

  const newNumber = number || generateJournalNumber();
  const newId = genId("JV");
  const ts = now();

  db.insert(journalEntries)
    .values({
      id: newId,
      number: newNumber,
      date: date || ts.split(" ")[0],
      description: description.trim(),
      debitAccount: lines[0].accountId || "",
      creditAccount: lines[1]?.accountId || lines[0].accountId || "",
      amount: totalDebit,
      fund: fund || "مقيد",
      currency: currency || "SAR",
      projectId: projectId || null,
      status: "مسودة",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  let lineNum = 1;
  for (const line of lines) {
    db.insert(journalLines)
      .values({
        id: genId("JL"),
        journalEntryId: newId,
        lineNumber: lineNum++,
        accountId: line.accountId,
        description: line.description || "",
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        costCenterId: line.costCenterId || null,
        projectId: line.projectId || null,
        notes: line.notes || "",
        createdAt: ts,
      })
      .run();
  }

  addAudit(
    "إضافة",
    "قيد يومية",
    newId,
    `تم إضافة قيد يومية: ${newNumber} بمبلغ ${totalDebit.toFixed(2)} ر.س`,
    userId,
    userName,
  );
  const created = db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, newId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/journal - update draft only
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, date, description, fund, projectId, notes, lines, userId, userName } = body;
  if (!id) return Response.json({ error: "معرف القيد مطلوب" }, { status: 400 });

  const entry = db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1).all()[0];
  if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });
  if (entry.status !== "مسودة" && entry.status !== "بانتظار الاعتماد")
    return Response.json({ error: "لا يمكن تعديل قيد مرحّل أو معكوس أو ملغى" }, { status: 400 });

  if (Array.isArray(lines) && lines.length > 0) {
    if (lines.length < 2)
      return Response.json({ error: "القيد يجب أن يحتوي على سطرين على الأقل" }, { status: 400 });
    let totalDebit = 0;
    let totalCredit = 0;
    for (const [idx, line] of lines.entries()) {
      if (!line.accountId)
        return Response.json({ error: `السطر ${idx + 1}: الحساب مطلوب` }, { status: 400 });
      const debit = parseFloat(line.debit) || 0;
      const credit = parseFloat(line.credit) || 0;
      if (debit === 0 && credit === 0)
        return Response.json(
          { error: `السطر ${idx + 1}: يجب إدخال مدين أو دائن` },
          { status: 400 },
        );
      if (debit > 0 && credit > 0)
        return Response.json(
          { error: `السطر ${idx + 1}: لا يمكن أن يكون مدين ودائن في نفس الوقت` },
          { status: 400 },
        );
      totalDebit += debit;
      totalCredit += credit;
    }
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return Response.json(
        {
          error: `القيد غير متوازن: مجموع المدين ${totalDebit.toFixed(2)} ≠ مجموع الدائن ${totalCredit.toFixed(2)}`,
        },
        { status: 400 },
      );
    }

    // Replace lines
    db.delete(journalLines).where(eq(journalLines.journalEntryId, id)).run();
    let lineNum = 1;
    const ts = now();
    for (const line of lines) {
      db.insert(journalLines)
        .values({
          id: genId("JL"),
          journalEntryId: id,
          lineNumber: lineNum++,
          accountId: line.accountId,
          description: line.description || "",
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0,
          costCenterId: line.costCenterId || null,
          projectId: line.projectId || null,
          notes: line.notes || "",
          createdAt: ts,
        })
        .run();
    }
    db.update(journalEntries)
      .set({ amount: totalDebit, updatedAt: ts })
      .where(eq(journalEntries.id, id))
      .run();
  }

  const before = JSON.stringify(entry);
  db.update(journalEntries)
    .set({
      date: date ?? entry.date,
      description: description?.trim() ?? entry.description,
      fund: fund ?? entry.fund,
      projectId: projectId ?? entry.projectId,
      notes: notes ?? entry.notes,
      updatedAt: now(),
    })
    .where(eq(journalEntries.id, id))
    .run();

  addAudit("تعديل", "قيد يومية", id, `تم تحديث القيد: ${entry.number}`, userId, userName, before);
  const updated = db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// DELETE - only drafts
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف القيد مطلوب" }, { status: 400 });

  const entry = db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1).all()[0];
  if (!entry) return Response.json({ error: "القيد غير موجود" }, { status: 404 });
  if (entry.status !== "مسودة")
    return Response.json({ error: "لا يمكن حذف قيد مرحّل أو معكوس أو ملغى" }, { status: 400 });

  const before = JSON.stringify(entry);
  // Lines are cascaded
  db.delete(journalEntries).where(eq(journalEntries.id, id)).run();
  addAudit("حذف", "قيد يومية", id, `تم حذف القيد: ${entry.number}`, userId, userName, before);
  return Response.json({ success: true });
}

// Generate next journal number
function generateJournalNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const all = db.select().from(journalEntries).all();
  const sameYear = all.filter((e) => e.number.startsWith(`JV-${year}`));
  const maxSeq = sameYear.reduce((max, e) => {
    const m = e.number.match(/-(\d+)$/);
    if (m) {
      const n = parseInt(m[1]);
      return n > max ? n : max;
    }
    return max;
  }, 0);
  const next = (maxSeq + 1).toString().padStart(4, "0");
  return `JV-${year}-${next}`;
}
