import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { inventoryItems, warehouses, stockMovements, purchaseOrderLines } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

export const ITEM_STATUSES = ["ظ†ط´ط·", "ظ…ظˆظ‚ظˆظپ", "ظ…ط؛ظ„ظ‚"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const MOVEMENT_TYPES = [
  "ط§ط³طھظ„ط§ظ…",
  "طµط±ظپ",
  "طھط­ظˆظٹظ„",
  "طھط³ظˆظٹط©",
  "ط¬ط±ط¯",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// GET /api/inventory/items - list
// GET /api/inventory/items?id=xxx - single with movement count
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1)
      .all()[0];
    if (!item) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const movementCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(eq(stockMovements.itemId, id))
        .all()[0]?.count || 0;

    const poLineCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.itemId, id))
        .all()[0]?.count || 0;

    return Response.json({
      item,
      movementCount,
      poLineCount,
      hasMovements: movementCount > 0 || poLineCount > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const warehouseId = url.searchParams.get("warehouseId") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(inventoryItems.name, `%${search}%`),
        like(inventoryItems.sku, `%${search}%`),
        like(inventoryItems.category, `%${search}%`),
      ),
    );
  }
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(inventoryItems.status, status));
  if (category && category !== "ط§ظ„ظƒظ„") conditions.push(eq(inventoryItems.category, category));
  if (warehouseId) conditions.push(eq(inventoryItems.warehouseId, warehouseId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db
        .select()
        .from(inventoryItems)
        .where(whereClause)
        .orderBy(desc(inventoryItems.createdAt))
        .all()
    : db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/inventory/items - create or activate/deactivate/move
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "activate" || action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const newStatus: ItemStatus = action === "activate" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ";
    if (existing.status === newStatus) {
      return Response.json(
        { error: `ط§ظ„طµظ†ظپ ${newStatus === "ظ†ط´ط·" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ"} ط¨ط§ظ„ظپط¹ظ„` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    db.update(inventoryItems)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(inventoryItems.id, id))
      .run();
    addAudit(
      action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„",
      "طµظ†ظپ",
      id,
      `طھظ… ${action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„"} ط§ظ„طµظ†ظپ: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "receive" || action === "issue" || action === "adjust") {
    return handleStockMovement(body);
  }

  if (action === "transfer") {
    return handleTransfer(body);
  }

  // Create item
  const {
    name,
    sku,
    unit,
    category,
    warehouseId,
    quantity,
    minQuantity,
    price,
    notes,
    status,
    userId,
    userName,
  } = body;

  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„طµظ†ظپ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!unit?.trim()) return Response.json({ error: "ط§ظ„ظˆط­ط¯ط© ظ…ط·ظ„ظˆط¨ط©" }, { status: 400 });

  if (warehouseId) {
    const wh = db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1).all()[0];
    if (!wh) return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 400 });
  }

  const itemId = genId("INV");
  const ts = now();
  const qty = parseFloat(quantity) || 0;

  db.insert(inventoryItems)
    .values({
      id: itemId,
      name: name.trim(),
      sku: sku || "",
      unit: unit.trim(),
      category: category || "",
      warehouseId: warehouseId || null,
      quantity: qty,
      minQuantity: parseFloat(minQuantity) || 0,
      price: parseFloat(price) || 0,
      notes: notes || "",
      status: status || "ظ†ط´ط·",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  if (qty > 0 && warehouseId) {
    db.insert(stockMovements)
      .values({
        id: genId("MV"),
        itemId,
        warehouseId,
        type: "ط§ط³طھظ„ط§ظ…",
        quantity: qty,
        balanceAfter: qty,
        sourceType: "manual",
        reference: "ط±طµظٹط¯ ط§ظپطھطھط§ط­ظٹ",
        date: ts,
        notes: "ط±طµظٹط¯ ط§ظپطھطھط§ط­ظٹ ط¹ظ†ط¯ ط¥ظ†ط´ط§ط، ط§ظ„طµظ†ظپ",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();
  }

  addAudit("ط¥ط¶ط§ظپط©", "طµظ†ظپ", itemId, `طھظ… ط¥ط¶ط§ظپط© طµظ†ظپ: ${name}`, userId, userName);
  const created = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

function handleStockMovement(body: {
  id: string;
  action: string;
  warehouseId?: string;
  quantity?: number;
  notes?: string;
  userId?: string;
  userName?: string;
}) {
  const { id, action, warehouseId, quantity, notes, userId, userName } = body;
  const qty = parseFloat(String(quantity)) || 0;
  if (qty <= 0)
    return Response.json(
      { error: "ط§ظ„ظƒظ…ظٹط© ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† طµظپط±" },
      { status: 400 },
    );

  const item = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1).all()[0];
  if (!item) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (item.status === "ظ…ط؛ظ„ظ‚")
    return Response.json(
      { error: "ط§ظ„طµظ†ظپ ظ…ط؛ظ„ظ‚. ظ„ط§ ظٹظ…ظƒظ† ط¥ط¬ط±ط§ط، ط­ط±ظƒط§طھ ط¹ظ„ظٹظ‡." },
      { status: 400 },
    );

  const movementType: MovementType =
    action === "receive" ? "ط§ط³طھظ„ط§ظ…" : action === "issue" ? "طµط±ظپ" : "طھط³ظˆظٹط©";

  let newQty = item.quantity;
  if (movementType === "ط§ط³طھظ„ط§ظ…") {
    newQty = item.quantity + qty;
  } else if (movementType === "طµط±ظپ") {
    if (qty > item.quantity)
      return Response.json(
        {
          error: `ط§ظ„ظƒظ…ظٹط© ط؛ظٹط± ظƒط§ظپظٹط©. ط§ظ„ظ…طھط§ط­: ${item.quantity} ${item.unit}طŒ ط§ظ„ظ…ط·ظ„ظˆط¨: ${qty} ${item.unit}.`,
        },
        { status: 400 },
      );
    newQty = item.quantity - qty;
  } else if (movementType === "طھط³ظˆظٹط©") {
    newQty = qty;
  }

  const whId = warehouseId || item.warehouseId;
  const ts = now();

  db.update(inventoryItems)
    .set({ quantity: newQty, warehouseId: whId || null, updatedAt: ts })
    .where(eq(inventoryItems.id, id))
    .run();

  db.insert(stockMovements)
    .values({
      id: genId("MV"),
      itemId: id,
      warehouseId: whId || null,
      type: movementType,
      quantity: qty,
      balanceAfter: newQty,
      sourceType: "manual",
      reference: movementType,
      date: ts,
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
    })
    .run();

  addAudit(
    movementType,
    "طµظ†ظپ",
    id,
    `ط­ط±ظƒط© ${movementType} ط¹ظ„ظ‰ ط§ظ„طµظ†ظپ ${item.name}: ${qty} ${item.unit} (ط§ظ„ط±طµظٹط¯ ${newQty})`,
    userId,
    userName,
  );

  const updated = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

function handleTransfer(body: {
  id: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  quantity?: number;
  notes?: string;
  userId?: string;
  userName?: string;
}) {
  const { id, fromWarehouseId, toWarehouseId, quantity, notes, userId, userName } = body;
  const qty = parseFloat(String(quantity)) || 0;
  if (qty <= 0)
    return Response.json(
      { error: "ط§ظ„ظƒظ…ظٹط© ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† طµظپط±" },
      { status: 400 },
    );
  if (!fromWarehouseId || !toWarehouseId)
    return Response.json(
      { error: "ظٹط¬ط¨ طھط­ط¯ظٹط¯ ط§ظ„ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ…طµط¯ط± ظˆط§ظ„ظ‡ط¯ظپ" },
      { status: 400 },
    );
  if (fromWarehouseId === toWarehouseId)
    return Response.json(
      { error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ…طµط¯ط± ظˆط§ظ„ظ‡ط¯ظپ ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ†ط§ ظ…ط®طھظ„ظپظٹظ†" },
      { status: 400 },
    );

  const item = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1).all()[0];
  if (!item) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (item.status === "ظ…ط؛ظ„ظ‚")
    return Response.json(
      { error: "ط§ظ„طµظ†ظپ ظ…ط؛ظ„ظ‚. ظ„ط§ ظٹظ…ظƒظ† ط¥ط¬ط±ط§ط، طھط­ظˆظٹظ„ ط¹ظ„ظٹظ‡." },
      { status: 400 },
    );

  if (qty > item.quantity)
    return Response.json(
      {
        error: `ط§ظ„ظƒظ…ظٹط© ط؛ظٹط± ظƒط§ظپظٹط© ظ„ظ„طھط­ظˆظٹظ„. ط§ظ„ظ…طھط§ط­: ${item.quantity} ${item.unit}طŒ ط§ظ„ظ…ط·ظ„ظˆط¨: ${qty} ${item.unit}.`,
      },
      { status: 400 },
    );

  const ts = now();
  const mvId = genId("MV");
  const balanceAfter = item.quantity - qty;

  db.update(inventoryItems)
    .set({ quantity: balanceAfter, warehouseId: toWarehouseId, updatedAt: ts })
    .where(eq(inventoryItems.id, id))
    .run();

  // Out movement
  db.insert(stockMovements)
    .values({
      id: mvId,
      itemId: id,
      warehouseId: fromWarehouseId,
      type: "طھط­ظˆظٹظ„",
      quantity: -qty,
      balanceAfter,
      relatedWarehouseId: toWarehouseId,
      sourceType: "transfer",
      reference: "طھط­ظˆظٹظ„ طµط§ط¯ط±",
      date: ts,
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
    })
    .run();

  // In movement
  db.insert(stockMovements)
    .values({
      id: genId("MV"),
      itemId: id,
      warehouseId: toWarehouseId,
      type: "طھط­ظˆظٹظ„",
      quantity: qty,
      balanceAfter: balanceAfter, // Note: item is single-quantity tracked
      relatedWarehouseId: fromWarehouseId,
      relatedStocktakeId: mvId,
      sourceType: "transfer",
      reference: "طھط­ظˆظٹظ„ ظˆط§ط±ط¯",
      date: ts,
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
    })
    .run();

  addAudit(
    "طھط­ظˆظٹظ„",
    "طµظ†ظپ",
    id,
    `طھظ… طھط­ظˆظٹظ„ ${qty} ${item.unit} ظ…ظ† ظ…ط³طھظˆط¯ط¹ ${fromWarehouseId} ط¥ظ„ظ‰ ${toWarehouseId} ظ„ظ„طµظ†ظپ ${item.name}`,
    userId,
    userName,
  );

  const updated = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// PUT /api/inventory/items - update
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const {
    id,
    name,
    sku,
    unit,
    category,
    warehouseId,
    minQuantity,
    price,
    notes,
    status,
    userId,
    userName,
  } = body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„طµظ†ظپ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  db.update(inventoryItems)
    .set({
      name: name?.trim() ?? existing.name,
      sku: sku ?? existing.sku,
      unit: unit ?? existing.unit,
      category: category ?? existing.category,
      warehouseId: warehouseId ?? existing.warehouseId,
      minQuantity: minQuantity !== undefined ? parseFloat(minQuantity) : existing.minQuantity,
      price: price !== undefined ? parseFloat(price) : existing.price,
      notes: notes ?? existing.notes,
      status: status ?? existing.status,
      updatedAt: now(),
    })
    .where(eq(inventoryItems.id, id))
    .run();

  addAudit(
    "طھط¹ط¯ظٹظ„",
    "طµظ†ظپ",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„طµظ†ظپ: ${existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/items - only if no movements and no PO lines
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„طµظ†ظپ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "ط§ظ„طµظ†ظپ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const movementCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.itemId, id))
      .all()[0]?.count || 0;

  const poLineCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.itemId, id))
      .all()[0]?.count || 0;

  if (movementCount > 0 || poLineCount > 0) {
    const parts: string[] = [];
    if (movementCount > 0) parts.push(`${movementCount} ط­ط±ظƒط© ظ…ط®ط²ظˆظ†`);
    if (poLineCount > 0) parts.push(`${poLineCount} ط³ط·ط± ط£ظ…ط± ط´ط±ط§ط،`);
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط§ظ„طµظ†ظپ ظ„ط§ط±طھط¨ط§ط·ظ‡ ط¨ظ€ ${parts.join(" ظˆ ")}. ظ‚ظ… ط¨ط¥ظٹظ‚ط§ظپ ط§ظ„طµظ†ظپ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
  addAudit(
    "ط­ط°ظپ",
    "طµظ†ظپ",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„طµظ†ظپ: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/items")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
