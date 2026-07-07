import { db, now, genId, addAudit } from "@/server/db/index";
import { warehouses, inventoryItems, stockMovements } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const WAREHOUSE_STATUSES = ["نشط", "موقوف"] as const;
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number];

// GET /api/inventory/warehouses - list
// GET /api/inventory/warehouses?id=xxx - single with usage info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const wh = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
    if (!wh) return Response.json({ error: "المستودع غير موجود" }, { status: 404 });

    const itemCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryItems)
        .where(eq(inventoryItems.warehouseId, id))
        .all()[0]?.count || 0;

    const movementCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(eq(stockMovements.warehouseId, id))
        .all()[0]?.count || 0;

    const totalQty =
      db
        .select({ total: sql<number>`coalesce(sum(${inventoryItems.quantity}), 0)` })
        .from(inventoryItems)
        .where(eq(inventoryItems.warehouseId, id))
        .all()[0]?.total || 0;

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
  if (status && status !== "الكل") conditions.push(eq(warehouses.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(warehouses).where(whereClause).orderBy(desc(warehouses.createdAt)).all()
    : db.select().from(warehouses).orderBy(desc(warehouses.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/inventory/warehouses - create or activate/deactivate
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "activate" || action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "المستودع غير موجود" }, { status: 404 });

    const newStatus: WarehouseStatus = action === "activate" ? "نشط" : "موقوف";
    if (existing.status === newStatus) {
      return Response.json(
        { error: `المستودع ${newStatus === "نشط" ? "نشط" : "موقوف"} بالفعل` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    db.update(warehouses)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(warehouses.id, id))
      .run();
    addAudit(
      action === "activate" ? "تفعيل" : "تعطيل",
      "مستودع",
      id,
      `تم ${action === "activate" ? "تفعيل" : "تعطيل"} المستودع: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const { name, location, manager, capacity, occupancy, notes, status, userId, userName } = body;
  if (!name?.trim()) return Response.json({ error: "اسم المستودع مطلوب" }, { status: 400 });

  const whId = genId("WH");
  const ts = now();

  db.insert(warehouses)
    .values({
      id: whId,
      name: name.trim(),
      location: location || "",
      manager: manager || "",
      capacity: parseFloat(capacity) || 0,
      occupancy: parseFloat(occupancy) || 0,
      notes: notes || "",
      status: status || "نشط",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "مستودع", whId, `تم إضافة مستودع: ${name}`, userId, userName);
  const created = db.select().from(warehouses).where(eq(warehouses.id, whId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/inventory/warehouses
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, name, location, manager, capacity, occupancy, notes, status, userId, userName } =
    body;
  if (!id) return Response.json({ error: "معرف المستودع مطلوب" }, { status: 400 });

  const existing = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المستودع غير موجود" }, { status: 404 });

  const before = JSON.stringify(existing);
  db.update(warehouses)
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

  addAudit("تعديل", "مستودع", id, `تم تحديث المستودع: ${existing.name}`, userId, userName, before);
  const updated = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/warehouses - only if no items and no movements
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف المستودع مطلوب" }, { status: 400 });

  const existing = db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المستودع غير موجود" }, { status: 404 });

  const itemCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(eq(inventoryItems.warehouseId, id))
      .all()[0]?.count || 0;

  const movementCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.warehouseId, id))
      .all()[0]?.count || 0;

  if (itemCount > 0 || movementCount > 0) {
    const parts: string[] = [];
    if (itemCount > 0) parts.push(`${itemCount} صنف`);
    if (movementCount > 0) parts.push(`${movementCount} حركة`);
    return Response.json(
      {
        error: `لا يمكن حذف المستودع لارتباطه بـ ${parts.join(" و ")}. قم بإيقاف المستودع بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(warehouses).where(eq(warehouses.id, id)).run();
  addAudit("حذف", "مستودع", id, `تم حذف المستودع: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
