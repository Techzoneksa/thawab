import { createFileRoute } from "@tanstack/react-router";
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
import { safeHandler } from "@/server/db/api-utils";

export const BUDGET_STATUSES = ["ظ…ط³ظˆط¯ط©", "ظ…ط¹طھظ…ط¯", "ظ…ظ‚ظپظ„", "ظ…ظ„ط؛ظ‰"] as const;

// GET /api/finance/budgets - list with filters
// GET /api/finance/budgets?id=xxx - single with lines and actual vs budget
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const budget = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    if (!budget)
      return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });

    const lines = await db
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.budgetId, id))
      .orderBy(budgetLines.lineNumber)
      .all();

    // Enrich with names + compute actual from posted journal entries
    const enrichedLines = await Promise.all(
      lines.map(async (l) => {
        const account = l.accountId
          ? (await db.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1).all())[0]
          : null;
        const cc = l.costCenterId
          ? (await db
              .select()
              .from(costCenters)
              .where(eq(costCenters.id, l.costCenterId))
              .limit(1)
              .all())[0]
          : null;
        const project = l.projectId
          ? (await db.select().from(projects).where(eq(projects.id, l.projectId)).limit(1).all())[0]
          : null;

        // Compute actual from posted journal entries
        let actual = 0;
        if (l.accountId) {
          const conditions = [
            eq(journalLines.accountId, l.accountId),
            eq(journalEntries.status, "ظ…ط±ط­ظ‘ظ„"),
          ];
          if (l.costCenterId) conditions.push(eq(journalLines.costCenterId, l.costCenterId));
          if (l.projectId) conditions.push(eq(journalLines.projectId, l.projectId));
          const actuals = (await db
            .select({
              debit: sql<number>`COALESCE(SUM(${journalLines.debit}), 0)`,
              credit: sql<number>`COALESCE(SUM(${journalLines.credit}), 0)`,
            })
            .from(journalLines)
            .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
            .where(and(...conditions))
            .all())[0];
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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(budgets.status, status));
  if (year && year !== "ط§ظ„ظƒظ„") conditions.push(eq(budgets.year, year));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(budgets).where(whereClause).orderBy(desc(budgets.year)).all()
    : await db.select().from(budgets).orderBy(desc(budgets.year)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/budgets - create or workflow actions
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });
    if (existing.status === "ظ…ط¹طھظ…ط¯")
      return Response.json(
        { error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ…ط¹طھظ…ط¯ط© ط¨ط§ظ„ظپط¹ظ„" },
        { status: 400 },
      );
    if (existing.status === "ظ…ظ‚ظپظ„")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط§ط¹طھظ…ط§ط¯ ظ…ظˆط§ط²ظ†ط© ظ…ظ‚ظپظ„ط©" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    const ts = now();
    await db.update(budgets)
      .set({
        status: "ظ…ط¹طھظ…ط¯",
        approvedBy: userId || null,
        approvedAt: ts,
        updatedAt: ts,
      })
      .where(eq(budgets.id, id))
      .run();
    await addAudit(
      "ط§ط¹طھظ…ط§ط¯",
      "ظ…ظˆط§ط²ظ†ط©",
      id,
      `طھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ظ…ظˆط§ط²ظ†ط©: ${existing.name} (${existing.year})`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "lock") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });
    if (existing.status !== "ظ…ط¹طھظ…ط¯")
      return Response.json(
        { error: "ظٹط¬ط¨ ط§ط¹طھظ…ط§ط¯ ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ‚ط¨ظ„ ظ‚ظپظ„ظ‡ط§" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    const ts = now();
    await db.update(budgets)
      .set({
        status: "ظ…ظ‚ظپظ„",
        lockedBy: userId || null,
        lockedAt: ts,
        updatedAt: ts,
      })
      .where(eq(budgets.id, id))
      .run();
    await addAudit(
      "ظ‚ظپظ„",
      "ظ…ظˆط§ط²ظ†ط©",
      id,
      `طھظ… ظ‚ظپظ„ ط§ظ„ظ…ظˆط§ط²ظ†ط©: ${existing.name} (${existing.year})`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "unlock") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });
    if (existing.status !== "ظ…ظ‚ظپظ„")
      return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ„ظٹط³طھ ظ…ظ‚ظپظ„ط©" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(budgets)
      .set({ status: "ظ…ط¹طھظ…ط¯", updatedAt: now() })
      .where(eq(budgets.id, id))
      .run();
    await addAudit(
      "ظپطھط­ ظ‚ظپظ„",
      "ظ…ظˆط§ط²ظ†ط©",
      id,
      `طھظ… ظپطھط­ ظ‚ظپظ„ ط§ظ„ظ…ظˆط§ط²ظ†ط©: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
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

  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!year?.trim())
    return Response.json({ error: "ط³ظ†ط© ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ…ط·ظ„ظˆط¨ط©" }, { status: 400 });

  const budgetId = genId("BUD");
  const ts = now();

  await db.insert(budgets)
    .values({
      id: budgetId,
      name: name.trim(),
      year: year.trim(),
      amount: parseFloat(amount) || 0,
      department: department || "",
      status: status || "ظ…ط³ظˆط¯ط©",
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
      await db.insert(budgetLines)
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
      await db.update(budgets)
        .set({ amount: totalPlanned, updatedAt: ts })
        .where(eq(budgets.id, budgetId))
        .run();
    }
  }

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ظˆط§ط²ظ†ط©",
    budgetId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ظˆط§ط²ظ†ط©: ${name} (${year})`,
    userId,
    userName,
  );
  const created = (await db.select().from(budgets).where(eq(budgets.id, budgetId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/budgets - update draft only
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, year, amount, department, description, notes, lines, userId, userName } = body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©")
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ظ…ظˆط§ط²ظ†ط© ظ…ط¹طھظ…ط¯ط© ط£ظˆ ظ…ظ‚ظپظ„ط©" },
      { status: 400 },
    );

  if (Array.isArray(lines) && lines.length > 0) {
    let totalPlanned = 0;
    for (const line of lines) {
      totalPlanned += parseFloat(line.plannedAmount) || 0;
    }
    await db.delete(budgetLines).where(eq(budgetLines.budgetId, id)).run();
    let lineNum = 1;
    const ts = now();
    for (const line of lines) {
      await db.insert(budgetLines)
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
    await db.update(budgets).set({ amount: totalPlanned, updatedAt: ts }).where(eq(budgets.id, id)).run();
  }

  const before = JSON.stringify(existing);
  await db.update(budgets)
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
  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ظˆط§ط²ظ†ط©",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ظ…ظˆط§ط²ظ†ط©: ${existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/budgets - only drafts
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظˆط§ط²ظ†ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(budgets).where(eq(budgets.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ظˆط§ط²ظ†ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©")
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ظˆط§ط²ظ†ط© ظ…ط¹طھظ…ط¯ط© ط£ظˆ ظ…ظ‚ظپظ„ط©" },
      { status: 400 },
    );

  const before = JSON.stringify(existing);
  await db.delete(budgets).where(eq(budgets.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ…ظˆط§ط²ظ†ط©",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…ظˆط§ط²ظ†ط©: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/budgets")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
