import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { fiscalPeriods, journalEntries, journalLines } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

export const PERIOD_STATUSES = [
  "ظ…ظپطھظˆط­ط©",
  "ظ‚ظٹط¯ ط§ظ„ط¥ظ‚ظپط§ظ„",
  "ظ…ظ‚ظپظ„ط©",
  "ظ…ط¹ط§ط¯ ظپطھط­طھظ‡ط§",
] as const;

// GET /api/finance/periods - list
// GET /api/finance/periods?id=xxx - single with stats
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const period = (await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all())[0];
    if (!period)
      return Response.json(
        { error: "ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" },
        { status: 404 },
      );

    // Count entries within period range
    const entryCount =
      (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
          ),
        )
        .all())[0]?.count || 0;

    const postedCount =
      (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            eq(journalEntries.status, "ظ…ط±ط­ظ‘ظ„"),
          ),
        )
        .all())[0]?.count || 0;

    const draftCount =
      (await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalEntries)
        .where(
          and(
            sql`${journalEntries.date} >= ${period.startDate}`,
            sql`${journalEntries.date} <= ${period.endDate}`,
            eq(journalEntries.status, "ظ…ط³ظˆط¯ط©"),
          ),
        )
        .all())[0]?.count || 0;

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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(fiscalPeriods.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db
        .select()
        .from(fiscalPeriods)
        .where(whereClause)
        .orderBy(desc(fiscalPeriods.startDate))
        .all()
    : await db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate)).all();

  const total = items.length;
  return Response.json({ items, total });
}

// POST /api/finance/periods - create or close/reopen actions
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "close") {
    const { id, userId, userName, notes } = body;
    const period = (await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all())[0];
    if (!period)
      return Response.json(
        { error: "ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" },
        { status: 404 },
      );
    if (period.status === "ظ…ظ‚ظپظ„ط©")
      return Response.json({ error: "ط§ظ„ظپطھط±ط© ظ…ظ‚ظپظ„ط© ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });
    if (period.status === "ظ‚ظٹط¯ ط§ظ„ط¥ظ‚ظپط§ظ„")
      return Response.json(
        { error: "ط§ظ„ظپطھط±ط© ظ‚ظٹط¯ ط§ظ„ط¥ظ‚ظپط§ظ„ ط¨ط§ظ„ظپط¹ظ„" },
        { status: 400 },
      );

    // Check no draft entries in period
    const draftEntries = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          sql`${journalEntries.date} >= ${period.startDate}`,
          sql`${journalEntries.date} <= ${period.endDate}`,
          eq(journalEntries.status, "ظ…ط³ظˆط¯ط©"),
        ),
      )
      .all();
    if (draftEntries.length > 0) {
      return Response.json(
        {
          error: `ظ„ط§ ظٹظ…ظƒظ† ط¥ظ‚ظپط§ظ„ ط§ظ„ظپطھط±ط©: ظٹظˆط¬ط¯ ${draftEntries.length} ظ‚ظٹط¯ ظ…ط³ظˆط¯ط© ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظپطھط±ط©. ظ‚ظ… ط¨طھط±ط­ظٹظ„ظ‡ط§ ط£ظˆ ط¥ظ„ط؛ط§ط¦ظ‡ط§ ط£ظˆظ„ط§ظ‹.`,
        },
        { status: 400 },
      );
    }

    // Check unbalanced posted entries
    const postedEntries = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          sql`${journalEntries.date} >= ${period.startDate}`,
          sql`${journalEntries.date} <= ${period.endDate}`,
          eq(journalEntries.status, "ظ…ط±ط­ظ‘ظ„"),
        ),
      )
      .all();
    const unbalanced: string[] = [];
    for (const e of postedEntries) {
      const lines = await db
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
          error: `ظ„ط§ ظٹظ…ظƒظ† ط¥ظ‚ظپط§ظ„ ط§ظ„ظپطھط±ط©: ظٹظˆط¬ط¯ ${unbalanced.length} ظ‚ظٹط¯ ظ…ط±ط­ظ‘ظ„ ط؛ظٹط± ظ…طھظˆط§ط²ظ† (${unbalanced.slice(0, 3).join("طŒ ")}).`,
        },
        { status: 400 },
      );
    }

    const before = JSON.stringify(period);
    const ts = now();
    await db.update(fiscalPeriods)
      .set({
        status: "ظ…ظ‚ظپظ„ط©",
        closedAt: ts,
        closedById: userId || null,
        closedByName: userName || "",
        notes: notes ?? period.notes,
        updatedAt: ts,
      })
      .where(eq(fiscalPeriods.id, id))
      .run();

    await addAudit(
      "ط¥ظ‚ظپط§ظ„",
      "ظپطھط±ط© ظ…ط§ظ„ظٹط©",
      id,
      `طھظ… ط¥ظ‚ظپط§ظ„ ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط©: ${period.name} (ظ…ظ† ${period.startDate} ط¥ظ„ظ‰ ${period.endDate})`,
      userId,
      userName,
      before,
    );

    const updated = (await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "reopen") {
    const { id, userId, userName } = body;
    const period = (await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all())[0];
    if (!period)
      return Response.json(
        { error: "ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" },
        { status: 404 },
      );
    if (period.status !== "ظ…ظ‚ظپظ„ط©")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ط¹ط§ط¯ط© ظپطھط­ ظپطھط±ط© ط؛ظٹط± ظ…ظ‚ظپظ„ط©" },
        { status: 400 },
      );

    const before = JSON.stringify(period);
    const ts = now();
    await db.update(fiscalPeriods)
      .set({
        status: "ظ…ط¹ط§ط¯ ظپطھط­طھظ‡ط§",
        reopenedAt: ts,
        reopenedById: userId || null,
        reopenedByName: userName || "",
        updatedAt: ts,
      })
      .where(eq(fiscalPeriods.id, id))
      .run();

    await addAudit(
      "ط¥ط¹ط§ط¯ط© ظپطھط­",
      "ظپطھط±ط© ظ…ط§ظ„ظٹط©",
      id,
      `طھظ… ط¥ط¹ط§ط¯ط© ظپطھط­ ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط©: ${period.name}`,
      userId,
      userName,
      before,
    );

    const updated = (await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Create new period
  const { name, startDate, endDate, notes, userId, userName } = body;
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظپطھط±ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!startDate?.trim())
    return Response.json({ error: "طھط§ط±ظٹط® ط§ظ„ط¨ط¯ط§ظٹط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!endDate?.trim())
    return Response.json({ error: "طھط§ط±ظٹط® ط§ظ„ظ†ظ‡ط§ظٹط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (startDate > endDate)
    return Response.json(
      { error: "طھط§ط±ظٹط® ط§ظ„ط¨ط¯ط§ظٹط© ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ‚ط¨ظ„ طھط§ط±ظٹط® ط§ظ„ظ†ظ‡ط§ظٹط©" },
      { status: 400 },
    );

  // Check for overlapping closed/open period with same name
  const existing = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.name, name.trim())).all();
  if (existing.length > 0) {
    return Response.json(
      { error: "ظٹظˆط¬ط¯ ظپطھط±ط© ظ…ط§ظ„ظٹط© ط¨ظ†ظپط³ ط§ظ„ط§ط³ظ… ط¨ط§ظ„ظپط¹ظ„" },
      { status: 400 },
    );
  }

  const periodId = genId("FP");
  const ts = now();

  await db.insert(fiscalPeriods)
    .values({
      id: periodId,
      name: name.trim(),
      startDate,
      endDate,
      status: "ظ…ظپطھظˆط­ط©",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظپطھط±ط© ظ…ط§ظ„ظٹط©",
    periodId,
    `طھظ… ط¥ط¶ط§ظپط© ظپطھط±ط© ظ…ط§ظ„ظٹط©: ${name} (ظ…ظ† ${startDate} ط¥ظ„ظ‰ ${endDate})`,
    userId,
    userName,
  );

  const created = (await db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, periodId))
    .limit(1)
    .all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/periods - update draft (open) period metadata
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, startDate, endDate, notes, userId, userName } = body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظپطھط±ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json(
      { error: "ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" },
      { status: 404 },
    );
  if (existing.status === "ظ…ظ‚ظپظ„ط©")
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ظپطھط±ط© ظ…ظ‚ظپظ„ط©. ط£ط¹ط¯ ظپطھط­ظ‡ط§ ط£ظˆظ„ط§ظ‹." },
      { status: 400 },
    );

  if (startDate && endDate && startDate > endDate) {
    return Response.json(
      { error: "طھط§ط±ظٹط® ط§ظ„ط¨ط¯ط§ظٹط© ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ‚ط¨ظ„ طھط§ط±ظٹط® ط§ظ„ظ†ظ‡ط§ظٹط©" },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.update(fiscalPeriods)
    .set({
      name: name?.trim() ?? existing.name,
      startDate: startDate ?? existing.startDate,
      endDate: endDate ?? existing.endDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(fiscalPeriods.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظپطھط±ط© ظ…ط§ظ„ظٹط©",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط©: ${existing.name}`,
    userId,
    userName,
    before,
  );

  const updated = (await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/periods - only open (never delete closed)
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظپطھط±ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json(
      { error: "ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" },
      { status: 404 },
    );
  if (existing.status !== "ظ…ظپطھظˆط­ط©")
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظپطھط±ط© ظ…ظ‚ظپظ„ط© ط£ظˆ ظ‚ظٹط¯ ط§ظ„ط¥ظ‚ظپط§ظ„. ظٹط­طھظپط¸ ط§ظ„ظ†ط¸ط§ظ… ط¨ط§ظ„ظپطھط±ط© ظ„ظ„ط³ط¬ظ„ ط§ظ„طھط§ط±ظٹط®ظٹ.",
      },
      { status: 400 },
    );

  const before = JSON.stringify(existing);
  await db.delete(fiscalPeriods).where(eq(fiscalPeriods.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظپطھط±ط© ظ…ط§ظ„ظٹط©",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظپطھط±ط© ط§ظ„ظ…ط§ظ„ظٹط©: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/periods")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
