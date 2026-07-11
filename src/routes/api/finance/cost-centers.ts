import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { costCenters, journalLines, budgetLines } from "@/server/db/schema";
import { eq, like, or, and, sql } from "drizzle-orm";

export const COST_CENTER_STATUSES = ["ظ†ط´ط·", "ظ…ظˆظ‚ظˆظپ", "ظ…ط؛ظ„ظ‚"] as const;

// GET /api/finance/cost-centers - list
// GET /api/finance/cost-centers?id=xxx - single with usage info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const cc = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
    if (!cc)
      return Response.json({ error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const journalUsage =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(journalLines)
        .where(eq(journalLines.costCenterId, id))
        .all())[0]?.count || 0;
    const budgetUsage =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(budgetLines)
        .where(eq(budgetLines.costCenterId, id))
        .all())[0]?.count || 0;

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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(costCenters.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(costCenters).where(whereClause).orderBy(costCenters.code).all()
    : await db.select().from(costCenters).orderBy(costCenters.code).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/cost-centers - create or status change
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ظˆظ‚ظˆظپ")
      return Response.json(
        { error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ظ…ظˆظ‚ظˆظپ ط¨ط§ظ„ظپط¹ظ„" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(costCenters)
      .set({ status: "ظ…ظˆظ‚ظˆظپ", updatedAt: now() })
      .where(eq(costCenters.id, id))
      .run();
    await addAudit(
      "ط¥ظٹظ‚ط§ظپ",
      "ظ…ط±ظƒط² طھظƒظ„ظپط©",
      id,
      `طھظ… ط¥ظٹظ‚ط§ظپ ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط©: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "activate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ†ط´ط·")
      return Response.json(
        { error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ظ†ط´ط· ط¨ط§ظ„ظپط¹ظ„" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(costCenters)
      .set({ status: "ظ†ط´ط·", updatedAt: now() })
      .where(eq(costCenters.id, id))
      .run();
    await addAudit(
      "طھظپط¹ظٹظ„",
      "ظ…ط±ظƒط² طھظƒظ„ظپط©",
      id,
      `طھظ… طھظپط¹ظٹظ„ ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط©: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const { code, name, manager, budget, spent, status, description, notes, userId, userName } = body;

  if (!code?.trim())
    return Response.json({ error: "ط±ظ…ط² ط§ظ„ظ…ط±ظƒط² ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ط±ظƒط² ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(costCenters)
    .where(eq(costCenters.code, code.trim()))
    .limit(1)
    .all())[0];
  if (existing)
    return Response.json(
      { error: "ط±ظ…ط² ط§ظ„ظ…ط±ظƒط² ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ظپط¹ظ„" },
      { status: 400 },
    );

  const ccId = genId("CC");
  const ts = now();

  await db.insert(costCenters)
    .values({
      id: ccId,
      code: code.trim(),
      name: name.trim(),
      manager: manager || "",
      budget: parseFloat(budget) || 0,
      spent: parseFloat(spent) || 0,
      status: status || "ظ†ط´ط·",
      description: description || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ط±ظƒط² طھظƒظ„ظپط©",
    ccId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ط±ظƒط² طھظƒظ„ظپط©: ${code} - ${name}`,
    userId,
    userName,
  );
  const created = (await db.select().from(costCenters).where(eq(costCenters.id, ccId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT - update
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, manager, budget, spent, status, description, notes, userId, userName } = body;

  if (!id)
    return Response.json({ error: "ظ…ط¹ط±ظپ ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(costCenters)
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

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ط±ظƒط² طھظƒظ„ظپط©",
    id,
    `طھظ… طھط­ط¯ظٹط« ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط©: ${existing.code} - ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE - only if no usage
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id)
    return Response.json({ error: "ظ…ط¹ط±ظپ ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(costCenters).where(eq(costCenters.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const journalUsage =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(journalLines)
      .where(eq(journalLines.costCenterId, id))
      .all())[0]?.count || 0;
  const budgetUsage =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(budgetLines)
      .where(eq(budgetLines.costCenterId, id))
      .all())[0]?.count || 0;

  if (journalUsage > 0 || budgetUsage > 0) {
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ط±ظƒط² طھظƒظ„ظپط© ظ…ط³طھط®ط¯ظ… ظپظٹ ${journalUsage} ط³ط·ط± ظ‚ظٹط¯ ظˆ ${budgetUsage} ط³ط·ط± ظ…ظˆط§ط²ظ†ط©. ط£ظˆظ‚ظپ ط§ظ„ظ…ط±ظƒط² ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(costCenters).where(eq(costCenters.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ…ط±ظƒط² طھظƒظ„ظپط©",
    id,
    `طھظ… ط­ط°ظپ ظ…ط±ظƒط² ط§ظ„طھظƒظ„ظپط©: ${existing.code} - ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/cost-centers")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
