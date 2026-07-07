import { db, now, genId, addAudit } from "@/server/db/index";
import { inventoryItems, warehouses, stockMovements, purchaseOrderLines } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const ITEM_STATUSES = ["نشط", "موقوف", "مغلق"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const MOVEMENT_TYPES = ["استلام", "صرف", "تحويل", "تسوية", "جرد"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

// GET /api/inventory/items - list
// GET /api/inventory/items?id=xxx - single with movement count
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1)
      .all()[0];
    if (!item) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });

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
  if (status && status !== "الكل") conditions.push(eq(inventoryItems.status, status));
  if (category && category !== "الكل") conditions.push(eq(inventoryItems.category, category));
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
export async function POST({ request }: APIEvent) {
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
    if (!existing) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });

    const newStatus: ItemStatus = action === "activate" ? "نشط" : "موقوف";
    if (existing.status === newStatus) {
      return Response.json(
        { error: `الصنف ${newStatus === "نشط" ? "نشط" : "موقوف"} بالفعل` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    db.update(inventoryItems)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(inventoryItems.id, id))
      .run();
    addAudit(
      action === "activate" ? "تفعيل" : "تعطيل",
      "صنف",
      id,
      `تم ${action === "activate" ? "تفعيل" : "تعطيل"} الصنف: ${existing.name}`,
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

  if (!name?.trim()) return Response.json({ error: "اسم الصنف مطلوب" }, { status: 400 });
  if (!unit?.trim()) return Response.json({ error: "الوحدة مطلوبة" }, { status: 400 });

  if (warehouseId) {
    const wh = db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1).all()[0];
    if (!wh) return Response.json({ error: "المستودع غير موجود" }, { status: 400 });
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
      status: status || "نشط",
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
        type: "استلام",
        quantity: qty,
        balanceAfter: qty,
        sourceType: "manual",
        reference: "رصيد افتتاحي",
        date: ts,
        notes: "رصيد افتتاحي عند إنشاء الصنف",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();
  }

  addAudit("إضافة", "صنف", itemId, `تم إضافة صنف: ${name}`, userId, userName);
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
  if (qty <= 0) return Response.json({ error: "الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });

  const item = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1).all()[0];
  if (!item) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });
  if (item.status === "مغلق")
    return Response.json({ error: "الصنف مغلق. لا يمكن إجراء حركات عليه." }, { status: 400 });

  const movementType: MovementType =
    action === "receive" ? "استلام" : action === "issue" ? "صرف" : "تسوية";

  let newQty = item.quantity;
  if (movementType === "استلام") {
    newQty = item.quantity + qty;
  } else if (movementType === "صرف") {
    if (qty > item.quantity)
      return Response.json(
        {
          error: `الكمية غير كافية. المتاح: ${item.quantity} ${item.unit}، المطلوب: ${qty} ${item.unit}.`,
        },
        { status: 400 },
      );
    newQty = item.quantity - qty;
  } else if (movementType === "تسوية") {
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
    "صنف",
    id,
    `حركة ${movementType} على الصنف ${item.name}: ${qty} ${item.unit} (الرصيد ${newQty})`,
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
  if (qty <= 0) return Response.json({ error: "الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });
  if (!fromWarehouseId || !toWarehouseId)
    return Response.json({ error: "يجب تحديد المستودع المصدر والهدف" }, { status: 400 });
  if (fromWarehouseId === toWarehouseId)
    return Response.json({ error: "المستودع المصدر والهدف يجب أن يكونا مختلفين" }, { status: 400 });

  const item = db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1).all()[0];
  if (!item) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });
  if (item.status === "مغلق")
    return Response.json({ error: "الصنف مغلق. لا يمكن إجراء تحويل عليه." }, { status: 400 });

  if (qty > item.quantity)
    return Response.json(
      {
        error: `الكمية غير كافية للتحويل. المتاح: ${item.quantity} ${item.unit}، المطلوب: ${qty} ${item.unit}.`,
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
      type: "تحويل",
      quantity: -qty,
      balanceAfter,
      relatedWarehouseId: toWarehouseId,
      sourceType: "transfer",
      reference: "تحويل صادر",
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
      type: "تحويل",
      quantity: qty,
      balanceAfter: balanceAfter, // Note: item is single-quantity tracked
      relatedWarehouseId: fromWarehouseId,
      relatedStocktakeId: mvId,
      sourceType: "transfer",
      reference: "تحويل وارد",
      date: ts,
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
    })
    .run();

  addAudit(
    "تحويل",
    "صنف",
    id,
    `تم تحويل ${qty} ${item.unit} من مستودع ${fromWarehouseId} إلى ${toWarehouseId} للصنف ${item.name}`,
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
export async function PUT({ request }: APIEvent) {
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
  if (!id) return Response.json({ error: "معرف الصنف مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });

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

  addAudit("تعديل", "صنف", id, `تم تحديث الصنف: ${existing.name}`, userId, userName, before);
  const updated = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/items - only if no movements and no PO lines
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الصنف مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "الصنف غير موجود" }, { status: 404 });

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
    if (movementCount > 0) parts.push(`${movementCount} حركة مخزون`);
    if (poLineCount > 0) parts.push(`${poLineCount} سطر أمر شراء`);
    return Response.json(
      {
        error: `لا يمكن حذف الصنف لارتباطه بـ ${parts.join(" و ")}. قم بإيقاف الصنف بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run();
  addAudit("حذف", "صنف", id, `تم حذف الصنف: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
