import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import {
  stocktakes,
  stocktakeLines,
  inventoryItems,
  warehouses,
  stockMovements,
} from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const STOCKTAKE_STATUSES = [
  "ظ…ط³ظˆط¯ط©",
  "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯",
  "ظ…ط¹طھظ…ط¯",
  "ظ…ط؛ظ„ظ‚",
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

const READ_ONLY_STATUSES: StocktakeStatus[] = ["ظ…ط¹طھظ…ط¯", "ظ…ط؛ظ„ظ‚"];

// GET /api/inventory/stocktake - list
// GET /api/inventory/stocktake?id=xxx - single with lines
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const st = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    if (!st) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();
    return Response.json({ item: st, lines });
  }

  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(stocktakes.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(stocktakes).where(whereClause).orderBy(desc(stocktakes.createdAt)).all()
    : await db.select().from(stocktakes).orderBy(desc(stocktakes.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/inventory/stocktake - create or workflow actions
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "submit") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    if (!existing) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ظ…ط³ظˆط¯ط©")
      return Response.json({ error: "ظٹظ…ظƒظ† ط¥ط±ط³ط§ظ„ ط§ظ„ظ…ط³ظˆط¯ط© ظپظ‚ط·" }, { status: 400 });

    const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();
    if (lines.length === 0)
      return Response.json({ error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ط±ط³ط§ظ„ ط¬ط±ط¯ ظپط§ط±ط؛" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(stocktakes)
      .set({ status: "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯", updatedAt: now() })
      .where(eq(stocktakes.id, id))
      .run();
    await addAudit(
      "ط¥ط±ط³ط§ظ„ ظ„ظ„ط§ط¹طھظ…ط§ط¯",
      "ط¬ط±ط¯",
      id,
      `طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¬ط±ط¯ ظ„ظ„ط§ط¹طھظ…ط§ط¯: ${existing.name} (${lines.length} ط³ط·ط±)`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    if (!existing) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯")
      return Response.json(
        { error: "ط§ظ„ط¬ط±ط¯ ظ„ظٹط³ ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ط§ط¹طھظ…ط§ط¯" },
        { status: 400 },
      );

    const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();

    const ts = now();
    const before = JSON.stringify(existing);

    // For each line with a difference, create an adjustment stock movement
    for (const line of lines) {
      if (Math.abs(line.difference) < 0.0001) continue;
      const item = (await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, line.itemId))
        .limit(1)
        .all())[0];
      if (!item) continue;

      const newQty = item.quantity + line.difference;
      await db.update(inventoryItems)
        .set({ quantity: newQty, updatedAt: ts })
        .where(eq(inventoryItems.id, item.id))
        .run();

      await db.insert(stockMovements)
        .values({
          id: genId("MV"),
          itemId: item.id,
          warehouseId: existing.warehouseId || item.warehouseId || null,
          type: "طھط³ظˆظٹط©",
          quantity: line.difference,
          balanceAfter: newQty,
          relatedStocktakeId: id,
          sourceType: "stocktake",
          sourceId: id,
          reference: `ط¬ط±ط¯ ${existing.name}`,
          date: ts,
          notes: `طھط³ظˆظٹط© ط¬ط±ط¯: ط§ظ„ظپط±ظ‚ ${line.difference} (ط§ظ„ظ…ط¹ط¯ظˆط¯ ${line.countedQuantity}طŒ ط¨ط§ظ„ظ†ط¸ط§ظ… ${line.systemQuantity})`,
          createdBy: userId || null,
          createdAt: ts,
        })
        .run();
    }

    await db.update(stocktakes)
      .set({
        status: "ظ…ط¹طھظ…ط¯",
        approvedBy: userId || null,
        approvedAt: ts,
        updatedAt: ts,
      })
      .where(eq(stocktakes.id, id))
      .run();

    await addAudit(
      "ط§ط¹طھظ…ط§ط¯",
      "ط¬ط±ط¯",
      id,
      `طھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط¬ط±ط¯ ظˆط¥ظ†ط´ط§ط، طھط³ظˆظٹط§طھ طھظ„ظ‚ط§ط¦ظٹط©: ${existing.name} (${lines.length} ط³ط·ط±)`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "close") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    if (!existing) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ظ…ط¹طھظ…ط¯")
      return Response.json(
        { error: "ظٹظ…ظƒظ† ط¥ط؛ظ„ط§ظ‚ ط§ظ„ط¬ط±ط¯ ط§ظ„ظ…ط¹طھظ…ط¯ ظپظ‚ط·" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(stocktakes)
      .set({ status: "ظ…ط؛ظ„ظ‚", updatedAt: now() })
      .where(eq(stocktakes.id, id))
      .run();
    await addAudit(
      "ط¥ط؛ظ„ط§ظ‚",
      "ط¬ط±ط¯",
      id,
      `طھظ… ط¥ط؛ظ„ط§ظ‚ ط§ظ„ط¬ط±ط¯: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const { name, warehouseId, date, notes, lines, userId, userName } = body;
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ط¬ط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!date?.trim())
    return Response.json({ error: "طھط§ط±ظٹط® ط§ظ„ط¬ط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  if (warehouseId) {
    const wh = (await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1).all())[0];
    if (!wh) return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 400 });
  }

  const stId = genId("ST");
  const ts = now();

  await db.insert(stocktakes)
    .values({
      id: stId,
      name: name.trim(),
      warehouseId: warehouseId || null,
      date,
      status: "ظ…ط³ظˆط¯ط©",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const item = (await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, l.itemId))
        .limit(1)
        .all())[0];
      const systemQty = item?.quantity || 0;
      const countedQty = parseFloat(l.countedQuantity) || 0;
      await db.insert(stocktakeLines)
        .values({
          id: genId("STL"),
          stocktakeId: stId,
          itemId: l.itemId,
          systemQuantity: systemQty,
          countedQuantity: countedQty,
          difference: countedQty - systemQty,
          notes: l.notes || "",
          createdAt: ts,
        })
        .run();
    }
  }

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط¬ط±ط¯",
    stId,
    `طھظ… ط¥ط¶ط§ظپط© ط¬ط±ط¯: ${name} (${Array.isArray(lines) ? lines.length : 0} ط³ط·ط±)`,
    userId,
    userName,
  );
  const created = (await db.select().from(stocktakes).where(eq(stocktakes.id, stId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/inventory/stocktake - update draft
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, warehouseId, date, notes, userId, userName } = body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¬ط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (READ_ONLY_STATUSES.includes(existing.status as StocktakeStatus)) {
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ط¬ط±ط¯ ظ…ط¹طھظ…ط¯ ط£ظˆ ظ…ط؛ظ„ظ‚" },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.update(stocktakes)
    .set({
      name: name?.trim() ?? existing.name,
      warehouseId: warehouseId ?? existing.warehouseId,
      date: date ?? existing.date,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(stocktakes.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط¬ط±ط¯",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ط¬ط±ط¯: ${existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/stocktake - only draft
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¬ط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط¬ط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©") {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط¬ط±ط¯ طھظ…طھ ظ…ط¹ط§ظ„ط¬طھظ‡. ظٹط­طھظپط¸ ط§ظ„ظ†ط¸ط§ظ… ط¨ظ‡ ظ„ظ„ط³ط¬ظ„ ط§ظ„طھط§ط±ظٹط®ظٹ.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(stocktakes).where(eq(stocktakes.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط¬ط±ط¯",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ط¬ط±ط¯: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/stocktake")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
