import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { journalEntries, journalLines, accounts, costCenters, projects } from "@/server/db/schema";
import { eq, like, or, and, desc, ne, sql } from "drizzle-orm";

export const JOURNAL_STATUSES = [
  "ظ…ط³ظˆط¯ط©",
  "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯",
  "ظ…ط±ط­ظ‘ظ„",
  "ظ…ظ„ط؛ظ‰",
  "ظ…ط¹ظƒظˆط³",
] as const;
export const JOURNAL_FUNDS = ["ظ…ظ‚ظٹط¯", "ط؛ظٹط± ظ…ظ‚ظٹط¯", "ط£ظˆظ‚ط§ظپ"] as const;

// GET /api/finance/journal - list with filters
// GET /api/finance/journal?id=xxx - single with lines
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const entry = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber)
      .all();

    // Enrich lines with account/cost center/project names
    const enrichedLines = lines.map(async (l) => {
      const account = (await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, l.accountId))
        .limit(1)
        .all())[0];
      const cc = l.costCenterId
        ? (await db.select().from(costCenters).where(eq(costCenters.id, l.costCenterId)).limit(1).all())[0]
        : null;
      const project = l.projectId
        ? (await db.select().from(projects).where(eq(projects.id, l.projectId)).limit(1).all())[0]
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
      reversedOf = (await db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entry.reversedOf))
        .limit(1)
        .all())[0];
    }
    const reversalEntries = await db
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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(journalEntries.status, status));
  if (fund && fund !== "ط§ظ„ظƒظ„") conditions.push(eq(journalEntries.fund, fund));
  if (projectId) conditions.push(eq(journalEntries.projectId, projectId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(journalEntries).$dynamic();
  const all = whereClause
    ? await allQuery.where(whereClause).orderBy(desc(journalEntries.createdAt)).all()
    : await allQuery.orderBy(desc(journalEntries.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(journalEntries).$dynamic();
  const items = whereClause
    ? await itemsQuery
        .where(whereClause)
        .orderBy(desc(journalEntries.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : await itemsQuery.orderBy(desc(journalEntries.createdAt)).limit(limit).offset(offset).all();

  // Enrich with totals and line counts
  const enrichedItems = items.map(async (entry) => {
    const lines = await db
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
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  if (action === "post") {
    const entry = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (entry.status === "ظ…ط±ط­ظ‘ظ„")
      return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ظ…ط±ط­ظ‘ظ„ ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });
    if (entry.status !== "ظ…ط³ظˆط¯ط©" && entry.status !== "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† طھط±ط­ظٹظ„ ظ‚ظٹط¯ ظ…ظ„ط؛ظ‰ ط£ظˆ ظ…ط¹ظƒظˆط³" },
        { status: 400 },
      );

    const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, id)).all();
    if (lines.length === 0)
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† طھط±ط­ظٹظ„ ظ‚ظٹط¯ ط¨ط¯ظˆظ† ط³ط·ظˆط±" },
        { status: 400 },
      );

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return Response.json(
        {
          error: `ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…طھظˆط§ط²ظ†: ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظٹظ† ${totalDebit} â‰  ظ…ط¬ظ…ظˆط¹ ط§ظ„ط¯ط§ط¦ظ† ${totalCredit}`,
        },
        { status: 400 },
      );
    }

    // Verify all line accounts are postable and active
    for (const line of lines) {
      const account = (await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, line.accountId))
        .limit(1)
        .all())[0];
      if (!account)
        return Response.json(
          { error: `ط§ظ„ط­ط³ط§ط¨ ظپظٹ ط§ظ„ط³ط·ط± ${line.lineNumber} ط؛ظٹط± ظ…ظˆط¬ظˆط¯` },
          { status: 400 },
        );
      if (!account.postable)
        return Response.json(
          {
            error: `ط§ظ„ط­ط³ط§ط¨ "${account.code} - ${account.name}" ط؛ظٹط± ظ‚ط§ط¨ظ„ ظ„ظ„طھط±ط­ظٹظ„. ط§ط®طھط± ط­ط³ط§ط¨ط§ظ‹ طھظپطµظٹظ„ظٹط§ظ‹.`,
          },
          { status: 400 },
        );
      if (account.status !== "ظ†ط´ط·")
        return Response.json(
          {
            error: `ط§ظ„ط­ط³ط§ط¨ "${account.code}" ظ…ظˆظ‚ظˆظپ ظˆظ„ط§ ظٹظ…ظƒظ† ط§ط³طھط®ط¯ط§ظ…ظ‡ ظپظٹ ظ‚ظٹط¯.`,
          },
          { status: 400 },
        );
    }

    const before = JSON.stringify(entry);
    const ts = now();
    await db.update(journalEntries)
      .set({
        status: "ظ…ط±ط­ظ‘ظ„",
        postedBy: userId || null,
        postedAt: ts,
        updatedAt: ts,
      })
      .where(eq(journalEntries.id, id))
      .run();

    await addAudit(
      "طھط±ط­ظٹظ„",
      "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
      id,
      `طھظ… طھط±ط­ظٹظ„ ط§ظ„ظ‚ظٹط¯: ${entry.number} ط¨ظ…ط¨ظ„ط؛ ${totalDebit} ط±.ط³`,
      userId,
      userName,
      before,
    );

    const updated = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "reverse") {
    const entry = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (entry.status !== "ظ…ط±ط­ظ‘ظ„")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¹ظƒط³ ظ‚ظٹط¯ ط؛ظٹط± ظ…ط±ط­ظ‘ظ„" },
        { status: 400 },
      );

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber)
      .all();
    if (lines.length === 0)
      return Response.json(
        { error: "ط§ظ„ظ‚ظٹط¯ ط§ظ„ط£طµظ„ظٹ ظ„ط§ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ط³ط·ظˆط±" },
        { status: 400 },
      );

    // Generate reversal number
    const newNumber = await generateJournalNumber();
    const reversalId = genId("JV");
    const ts = now();

    // Create reversal header
    await db.insert(journalEntries)
      .values({
        id: reversalId,
        number: newNumber,
        date: ts.split(" ")[0],
        description: `ط¹ظƒط³ ط§ظ„ظ‚ظٹط¯: ${entry.number} - ${entry.description}`,
        debitAccount: lines[0].credit ? `${lines[0].accountId}` : "",
        creditAccount: lines[0].debit ? `${lines[0].accountId}` : "",
        amount: lines[0].debit || lines[0].credit || 0,
        fund: entry.fund,
        currency: entry.currency,
        projectId: entry.projectId,
        sourceType: "reversal",
        sourceId: entry.id,
        status: "ظ…ط±ط­ظ‘ظ„",
        postedBy: userId || null,
        postedAt: ts,
        reversedOf: entry.id,
        notes: entry.notes || "",
        createdBy: userId || null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // Copy lines in reverse (debitâ†”credit)
    let lineNum = 1;
    for (const line of lines) {
      await db.insert(journalLines)
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
    await db.update(journalEntries)
      .set({ status: "ظ…ط¹ظƒظˆط³", updatedAt: ts })
      .where(eq(journalEntries.id, id))
      .run();

    await addAudit(
      "ط¹ظƒط³",
      "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
      reversalId,
      `طھظ… ط¥ظ†ط´ط§ط، ظ‚ظٹط¯ ط¹ظƒط³ظٹ ${newNumber} ظ„ظ„ظ‚ظٹط¯ ${entry.number}`,
      userId,
      userName,
    );
    await addAudit(
      "ط¹ظƒط³",
      "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
      id,
      `طھظ… ط¹ظƒط³ ط§ظ„ظ‚ظٹط¯ ${entry.number} ط¨ظˆط§ط³ط·ط© ${newNumber}`,
      userId,
      userName,
    );
    const created = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, reversalId))
      .limit(1)
      .all())[0];
    return Response.json({ item: created }, { status: 201 });
  }

  if (action === "cancel") {
    const entry = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (entry.status === "ظ…ط±ط­ظ‘ظ„" || entry.status === "ظ…ط¹ظƒظˆط³")
      return Response.json(
        {
          error:
            "ظ„ط§ ظٹظ…ظƒظ† ط¥ظ„ط؛ط§ط، ظ‚ظٹط¯ ظ…ط±ط­ظ‘ظ„ ط£ظˆ ظ…ط¹ظƒظˆط³. ط§ط³طھط®ط¯ظ… ط§ظ„ط¹ظƒط³.",
        },
        { status: 400 },
      );

    const before = JSON.stringify(entry);
    await db.update(journalEntries)
      .set({ status: "ظ…ظ„ط؛ظ‰", updatedAt: now() })
      .where(eq(journalEntries.id, id))
      .run();
    await addAudit(
      "ط¥ظ„ط؛ط§ط،",
      "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
      id,
      `طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ظ‚ظٹط¯: ${entry.number}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Create new entry with lines
  const { number, date, description, fund, projectId, notes, lines, currency } = body;
  if (!description?.trim())
    return Response.json({ error: "ظˆطµظپ ط§ظ„ظ‚ظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length < 2)
    return Response.json(
      { error: "ط§ظ„ظ‚ظٹط¯ ظٹط¬ط¨ ط£ظ† ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ط³ط·ط±ظٹظ† ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" },
      { status: 400 },
    );

  // Validate lines
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [idx, line] of lines.entries()) {
    if (!line.accountId)
      return Response.json(
        { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨` },
        { status: 400 },
      );
    const debit = parseFloat(line.debit) || 0;
    const credit = parseFloat(line.credit) || 0;
    if (debit === 0 && credit === 0)
      return Response.json(
        { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ظٹط¬ط¨ ط¥ط¯ط®ط§ظ„ ظ…ط¯ظٹظ† ط£ظˆ ط¯ط§ط¦ظ†` },
        { status: 400 },
      );
    if (debit > 0 && credit > 0)
      return Response.json(
        {
          error: `ط§ظ„ط³ط·ط± ${idx + 1}: ظ„ط§ ظٹظ…ظƒظ† ط£ظ† ظٹظƒظˆظ† ظ…ط¯ظٹظ† ظˆط¯ط§ط¦ظ† ظپظٹ ظ†ظپط³ ط§ظ„ظˆظ‚طھ`,
        },
        { status: 400 },
      );
    totalDebit += debit;
    totalCredit += credit;

    const account = (await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, line.accountId))
      .limit(1)
      .all())[0];
    if (!account)
      return Response.json(
        { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯` },
        { status: 400 },
      );
    if (!account.postable)
      return Response.json(
        {
          error: `ط§ظ„ط³ط·ط± ${idx + 1}: ط§ظ„ط­ط³ط§ط¨ "${account.code} - ${account.name}" ط؛ظٹط± ظ‚ط§ط¨ظ„ ظ„ظ„طھط±ط­ظٹظ„. ط§ط®طھط± ط­ط³ط§ط¨ط§ظ‹ طھظپطµظٹظ„ظٹط§ظ‹.`,
        },
        { status: 400 },
      );
    if (account.status !== "ظ†ط´ط·")
      return Response.json(
        { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ط§ظ„ط­ط³ط§ط¨ "${account.code}" ظ…ظˆظ‚ظˆظپ.` },
        { status: 400 },
      );
  }
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    return Response.json(
      {
        error: `ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…طھظˆط§ط²ظ†: ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظٹظ† ${totalDebit.toFixed(2)} â‰  ظ…ط¬ظ…ظˆط¹ ط§ظ„ط¯ط§ط¦ظ† ${totalCredit.toFixed(2)}`,
      },
      { status: 400 },
    );
  }

  const newNumber = number || (await generateJournalNumber());
  const newId = genId("JV");
  const ts = now();

  await db.insert(journalEntries)
    .values({
      id: newId,
      number: newNumber,
      date: date || ts.split(" ")[0],
      description: description.trim(),
      debitAccount: lines[0].accountId || "",
      creditAccount: lines[1]?.accountId || lines[0].accountId || "",
      amount: totalDebit,
      fund: fund || "ظ…ظ‚ظٹط¯",
      currency: currency || "SAR",
      projectId: projectId || null,
      status: "ظ…ط³ظˆط¯ط©",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  let lineNum = 1;
  for (const line of lines) {
    await db.insert(journalLines)
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

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
    newId,
    `طھظ… ط¥ط¶ط§ظپط© ظ‚ظٹط¯ ظٹظˆظ…ظٹط©: ${newNumber} ط¨ظ…ط¨ظ„ط؛ ${totalDebit.toFixed(2)} ط±.ط³`,
    userId,
    userName,
  );
  const created = (await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, newId))
    .limit(1)
    .all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/journal - update draft only
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, date, description, fund, projectId, notes, lines, userId, userName } = body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ‚ظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const entry = (await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1).all())[0];
  if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (entry.status !== "ظ…ط³ظˆط¯ط©" && entry.status !== "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯")
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ظ‚ظٹط¯ ظ…ط±ط­ظ‘ظ„ ط£ظˆ ظ…ط¹ظƒظˆط³ ط£ظˆ ظ…ظ„ط؛ظ‰" },
      { status: 400 },
    );

  if (Array.isArray(lines) && lines.length > 0) {
    if (lines.length < 2)
      return Response.json(
        { error: "ط§ظ„ظ‚ظٹط¯ ظٹط¬ط¨ ط£ظ† ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ط³ط·ط±ظٹظ† ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" },
        { status: 400 },
      );
    let totalDebit = 0;
    let totalCredit = 0;
    for (const [idx, line] of lines.entries()) {
      if (!line.accountId)
        return Response.json(
          { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨` },
          { status: 400 },
        );
      const debit = parseFloat(line.debit) || 0;
      const credit = parseFloat(line.credit) || 0;
      if (debit === 0 && credit === 0)
        return Response.json(
          { error: `ط§ظ„ط³ط·ط± ${idx + 1}: ظٹط¬ط¨ ط¥ط¯ط®ط§ظ„ ظ…ط¯ظٹظ† ط£ظˆ ط¯ط§ط¦ظ†` },
          { status: 400 },
        );
      if (debit > 0 && credit > 0)
        return Response.json(
          {
            error: `ط§ظ„ط³ط·ط± ${idx + 1}: ظ„ط§ ظٹظ…ظƒظ† ط£ظ† ظٹظƒظˆظ† ظ…ط¯ظٹظ† ظˆط¯ط§ط¦ظ† ظپظٹ ظ†ظپط³ ط§ظ„ظˆظ‚طھ`,
          },
          { status: 400 },
        );
      totalDebit += debit;
      totalCredit += credit;
    }
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return Response.json(
        {
          error: `ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…طھظˆط§ط²ظ†: ظ…ط¬ظ…ظˆط¹ ط§ظ„ظ…ط¯ظٹظ† ${totalDebit.toFixed(2)} â‰  ظ…ط¬ظ…ظˆط¹ ط§ظ„ط¯ط§ط¦ظ† ${totalCredit.toFixed(2)}`,
        },
        { status: 400 },
      );
    }

    // Replace lines
    await db.delete(journalLines).where(eq(journalLines.journalEntryId, id)).run();
    let lineNum = 1;
    const ts = now();
    for (const line of lines) {
      await db.insert(journalLines)
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
    await db.update(journalEntries)
      .set({ amount: totalDebit, updatedAt: ts })
      .where(eq(journalEntries.id, id))
      .run();
  }

  const before = JSON.stringify(entry);
  await db.update(journalEntries)
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

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ظ‚ظٹط¯: ${entry.number}`,
    userId,
    userName,
    before,
  );
  const updated = (await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1)
    .all())[0];
  return Response.json({ item: updated });
}

// DELETE - only drafts
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ‚ظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const entry = (await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1).all())[0];
  if (!entry) return Response.json({ error: "ط§ظ„ظ‚ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (entry.status !== "ظ…ط³ظˆط¯ط©")
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ‚ظٹط¯ ظ…ط±ط­ظ‘ظ„ ط£ظˆ ظ…ط¹ظƒظˆط³ ط£ظˆ ظ…ظ„ط؛ظ‰" },
      { status: 400 },
    );

  const before = JSON.stringify(entry);
  // Lines are cascaded
  await db.delete(journalEntries).where(eq(journalEntries.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ‚ظٹط¯ ظٹظˆظ…ظٹط©",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ‚ظٹط¯: ${entry.number}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

// Generate next journal number
async function generateJournalNumber(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const all = await db.select().from(journalEntries).all();
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

export const Route = createFileRoute("/api/finance/journal")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
