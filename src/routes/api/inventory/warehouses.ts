import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { warehouses, inventoryItems, stockMovements } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

export const WAREHOUSE_STATUSES = ["ظ†ط´ط·", "ظ…ظˆظ‚ظˆظپ"] as const;
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number];

// GET /api/inventory/warehouses - list
// GET /api/inventory/warehouses?id=xxx - single with usage info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const wh = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
    if (!wh) return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const itemCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryItems)
        .where(eq(inventoryItems.warehouseId, id))
        .all())[0]?.count || 0;

    const movementCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(eq(stockMovements.warehouseId, id))
        .all())[0]?.count || 0;

    const totalQty =
      (await db
        .select({ total: sql<number>`coalesce(sum(${inventoryItems.quantity}), 0)` })
        .from(inventoryItems)
        .where(eq(inventoryItems.warehouseId, id))
        .all())[0]?.total || 0;

    return Response.json({
      item: wh,
      itemCount,
      movementCount,
      totalQty,
      hasMovements: itemCount > 0 || movementCount > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(warehouses.name, `%${search}%`),
        like(warehouses.location, `%${search}%`),
        like(warehouses.manager, `%${search}%`),
      ),
    );
  }
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(warehouses.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(warehouses).where(whereClause).orderBy(desc(warehouses.createdAt)).all()
    : await db.select().from(warehouses).orderBy(desc(warehouses.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/inventory/warehouses - create or activate/deactivate
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "activate" || action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const newStatus: WarehouseStatus = action === "activate" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ";
    if (existing.status === newStatus) {
      return Response.json(
        {
          error: `ط§ظ„ظ…ط³طھظˆط¯ط¹ ${newStatus === "ظ†ط´ط·" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ"} ط¨ط§ظ„ظپط¹ظ„`,
        },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    await db.update(warehouses)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(warehouses.id, id))
      .run();
    await addAudit(
      action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„",
      "ظ…ط³طھظˆط¯ط¹",
      id,
      `طھظ… ${action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„"} ط§ظ„ظ…ط³طھظˆط¯ط¹: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const { name, location, manager, capacity, occupancy, notes, status, userId, userName } = body;
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ط³طھظˆط¯ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const whId = genId("WH");
  const ts = now();

  await db.insert(warehouses)
    .values({
      id: whId,
      name: name.trim(),
      location: location || "",
      manager: manager || "",
      capacity: parseFloat(capacity) || 0,
      occupancy: parseFloat(occupancy) || 0,
      notes: notes || "",
      status: status || "ظ†ط´ط·",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ط³طھظˆط¯ط¹",
    whId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ط³طھظˆط¯ط¹: ${name}`,
    userId,
    userName,
  );
  const created = (await db.select().from(warehouses).where(eq(warehouses.id, whId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/inventory/warehouses
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, location, manager, capacity, occupancy, notes, status, userId, userName } =
    body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط³طھظˆط¯ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  await db.update(warehouses)
    .set({
      name: name?.trim() ?? existing.name,
      location: location ?? existing.location,
      manager: manager ?? existing.manager,
      capacity: capacity !== undefined ? parseFloat(capacity) : existing.capacity,
      occupancy: occupancy !== undefined ? parseFloat(occupancy) : existing.occupancy,
      notes: notes ?? existing.notes,
      status: status ?? existing.status,
      updatedAt: now(),
    })
    .where(eq(warehouses.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ط³طھظˆط¯ط¹",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ظ…ط³طھظˆط¯ط¹: ${existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/warehouses - only if no items and no movements
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط³طھظˆط¯ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط³طھظˆط¯ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const itemCount =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(eq(inventoryItems.warehouseId, id))
      .all())[0]?.count || 0;

  const movementCount =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.warehouseId, id))
      .all())[0]?.count || 0;

  if (itemCount > 0 || movementCount > 0) {
    const parts: string[] = [];
    if (itemCount > 0) parts.push(`${itemCount} طµظ†ظپ`);
    if (movementCount > 0) parts.push(`${movementCount} ط­ط±ظƒط©`);
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط§ظ„ظ…ط³طھظˆط¯ط¹ ظ„ط§ط±طھط¨ط§ط·ظ‡ ط¨ظ€ ${parts.join(" ظˆ ")}. ظ‚ظ… ط¨ط¥ظٹظ‚ط§ظپ ط§ظ„ظ…ط³طھظˆط¯ط¹ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(warehouses).where(eq(warehouses.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ…ط³طھظˆط¯ط¹",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…ط³طھظˆط¯ط¹: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/warehouses")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
