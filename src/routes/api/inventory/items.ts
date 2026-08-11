import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { inventoryItems, warehouses, stockMovements, purchaseOrderLines } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { InventoryItemStatus, StockMovementType } from "@/lib/enums";

// GET /api/inventory/items?id=xxx — single with movement/PO usage; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1))[0];
    if (!item) return err("الصنف غير موجود", 404, "NOT_FOUND");

    const [{ c: movementCount }] = await db
      .select({ c: count() })
      .from(stockMovements)
      .where(eq(stockMovements.itemId, id));
    const [{ c: poLineCount }] = await db
      .select({ c: count() })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.itemId, id));

    return Response.json({
      item,
      movementCount: Number(movementCount),
      poLineCount: Number(poLineCount),
      hasMovements: Number(movementCount) > 0 || Number(poLineCount) > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const warehouseId = url.searchParams.get("warehouseId") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

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
  if (status) conditions.push(eq(inventoryItems.status, status));
  if (category) conditions.push(eq(inventoryItems.category, category));
  if (warehouseId) conditions.push(eq(inventoryItems.warehouseId, warehouseId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(inventoryItems).where(where);
  const items = await db
    .select()
    .from(inventoryItems)
    .where(where)
    .orderBy(desc(inventoryItems.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const postSchema = z.object({
  action: z.enum(["activate", "deactivate", "receive", "issue", "adjust", "transfer", "create"]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  warehouseId: z.string().nullish(),
  fromWarehouseId: z.string().optional(),
  toWarehouseId: z.string().optional(),
  quantity: z.coerce.number().optional(),
  minQuantity: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(InventoryItemStatus).optional(),
});
type PostBody = z.infer<typeof postSchema>;

// POST /api/inventory/items — create, activate/deactivate, or stock movement/transfer.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "activate" || b.action === "deactivate") {
      if (!b.id) return err("معرف الصنف مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
      if (!existing) return err("الصنف غير موجود", 404, "NOT_FOUND");

      const newStatus =
        b.action === "activate" ? InventoryItemStatus.ACTIVE : InventoryItemStatus.INACTIVE;
      if (existing.status === newStatus) {
        return err(
          b.action === "activate" ? "الصنف نشط بالفعل" : "الصنف موقوف بالفعل",
          400,
          "ALREADY_IN_STATE",
        );
      }

      const before = JSON.stringify(existing);
      await db
        .update(inventoryItems)
        .set({ status: newStatus, updatedAt: now() })
        .where(eq(inventoryItems.id, b.id));
      await addAudit({
        action: b.action,
        entityType: "inventory_item",
        entityId: b.id,
        description: `تم ${b.action === "activate" ? "تفعيل" : "تعطيل"} الصنف: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });
      const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    if (b.action === "receive" || b.action === "issue" || b.action === "adjust") {
      return handleStockMovement(b, ctx);
    }

    if (b.action === "transfer") {
      return handleTransfer(b, ctx);
    }

    // Create item
    if (!b.name?.trim()) return err("اسم الصنف مطلوب", 400, "BAD_REQUEST");
    if (!b.unit?.trim()) return err("الوحدة مطلوبة", 400, "BAD_REQUEST");

    if (b.warehouseId) {
      const wh = (await db.select().from(warehouses).where(eq(warehouses.id, b.warehouseId)).limit(1))[0];
      if (!wh) return err("المستودع غير موجود", 400, "BAD_REQUEST");
    }

    const itemId = genId("INV");
    const ts = now();
    const qty = b.quantity ?? 0;

    await db.transaction(async (tx) => {
      await tx.insert(inventoryItems).values({
        id: itemId,
        name: b.name!.trim(),
        sku: b.sku || "",
        unit: b.unit!.trim(),
        category: b.category || "",
        warehouseId: b.warehouseId || null,
        quantity: qty,
        minQuantity: b.minQuantity ?? 0,
        price: b.price ?? 0,
        notes: b.notes || "",
        status: b.status ?? InventoryItemStatus.ACTIVE,
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });

      if (qty > 0 && b.warehouseId) {
        await tx.insert(stockMovements).values({
          id: genId("MV"),
          itemId,
          warehouseId: b.warehouseId,
          type: StockMovementType.IN,
          quantity: qty,
          balanceAfter: qty,
          sourceType: "manual",
          reference: "رصيد افتتاحي",
          date: ts,
          notes: "رصيد افتتاحي عند إنشاء الصنف",
          createdBy: ctx.user.id,
          createdAt: ts,
        });
      }
    });

    await addAudit({
      action: "create",
      entityType: "inventory_item",
      entityId: itemId,
      description: `تم إضافة صنف: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

// Receive / issue / adjust — item quantity update + movement, atomic.
async function handleStockMovement(b: PostBody, ctx: Ctx) {
  if (!b.id) return err("معرف الصنف مطلوب", 400, "BAD_REQUEST");
  const qty = b.quantity ?? 0;
  if (qty <= 0) return err("الكمية يجب أن تكون أكبر من صفر", 400, "BAD_REQUEST");

  const item = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
  if (!item) return err("الصنف غير موجود", 404, "NOT_FOUND");
  if (item.status === InventoryItemStatus.INACTIVE)
    return err("الصنف موقوف. لا يمكن إجراء حركات عليه.", 400, "ITEM_INACTIVE");

  const movementType =
    b.action === "receive"
      ? StockMovementType.IN
      : b.action === "issue"
        ? StockMovementType.OUT
        : StockMovementType.ADJUSTMENT;

  let newQty = item.quantity;
  if (movementType === StockMovementType.IN) {
    newQty = item.quantity + qty;
  } else if (movementType === StockMovementType.OUT) {
    if (qty > item.quantity)
      return err(
        `الكمية غير كافية. المتاح: ${item.quantity} ${item.unit}، المطلوب: ${qty} ${item.unit}.`,
        400,
        "INSUFFICIENT_QTY",
      );
    newQty = item.quantity - qty;
  } else {
    newQty = qty;
  }

  const whId = b.warehouseId || item.warehouseId;
  const ts = now();

  await db.transaction(async (tx) => {
    await tx
      .update(inventoryItems)
      .set({ quantity: newQty, warehouseId: whId || null, updatedAt: ts })
      .where(eq(inventoryItems.id, b.id!));

    await tx.insert(stockMovements).values({
      id: genId("MV"),
      itemId: b.id!,
      warehouseId: whId || null,
      type: movementType,
      quantity: qty,
      balanceAfter: newQty,
      sourceType: "manual",
      reference: movementType,
      date: ts,
      notes: b.notes || "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });
  });

  await addAudit({
    action: movementType,
    entityType: "inventory_item",
    entityId: b.id,
    description: `حركة ${movementType} على الصنف ${item.name}: ${qty} ${item.unit} (الرصيد ${newQty})`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
  return Response.json({ item: updated });
}

// Transfer between warehouses — item update + paired out/in movements, atomic.
async function handleTransfer(b: PostBody, ctx: Ctx) {
  if (!b.id) return err("معرف الصنف مطلوب", 400, "BAD_REQUEST");
  const qty = b.quantity ?? 0;
  if (qty <= 0) return err("الكمية يجب أن تكون أكبر من صفر", 400, "BAD_REQUEST");
  if (!b.fromWarehouseId || !b.toWarehouseId)
    return err("يجب تحديد المستودع المصدر والهدف", 400, "BAD_REQUEST");
  if (b.fromWarehouseId === b.toWarehouseId)
    return err("المستودع المصدر والهدف يجب أن يكونا مختلفين", 400, "BAD_REQUEST");

  const item = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
  if (!item) return err("الصنف غير موجود", 404, "NOT_FOUND");
  if (item.status === InventoryItemStatus.INACTIVE)
    return err("الصنف موقوف. لا يمكن إجراء تحويل عليه.", 400, "ITEM_INACTIVE");
  if (qty > item.quantity)
    return err(
      `الكمية غير كافية للتحويل. المتاح: ${item.quantity} ${item.unit}، المطلوب: ${qty} ${item.unit}.`,
      400,
      "INSUFFICIENT_QTY",
    );

  const ts = now();
  const mvId = genId("MV");
  const balanceAfter = item.quantity - qty;

  await db.transaction(async (tx) => {
    await tx
      .update(inventoryItems)
      .set({ quantity: balanceAfter, warehouseId: b.toWarehouseId, updatedAt: ts })
      .where(eq(inventoryItems.id, b.id!));

    // Out movement
    await tx.insert(stockMovements).values({
      id: mvId,
      itemId: b.id!,
      warehouseId: b.fromWarehouseId,
      type: StockMovementType.TRANSFER,
      quantity: -qty,
      balanceAfter,
      relatedWarehouseId: b.toWarehouseId,
      sourceType: "transfer",
      reference: "تحويل صادر",
      date: ts,
      notes: b.notes || "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    // In movement
    await tx.insert(stockMovements).values({
      id: genId("MV"),
      itemId: b.id!,
      warehouseId: b.toWarehouseId,
      type: StockMovementType.TRANSFER,
      quantity: qty,
      balanceAfter, // item is single-quantity tracked
      relatedWarehouseId: b.fromWarehouseId,
      relatedStocktakeId: mvId,
      sourceType: "transfer",
      reference: "تحويل وارد",
      date: ts,
      notes: b.notes || "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });
  });

  await addAudit({
    action: StockMovementType.TRANSFER,
    entityType: "inventory_item",
    entityId: b.id,
    description: `تم تحويل ${qty} ${item.unit} من مستودع ${b.fromWarehouseId} إلى ${b.toWarehouseId} للصنف ${item.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
  return Response.json({ item: updated });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الصنف مطلوب"),
  name: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  warehouseId: z.string().nullish(),
  minQuantity: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(InventoryItemStatus).optional(),
});

// PUT /api/inventory/items — update item.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
    if (!existing) return err("الصنف غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(inventoryItems)
      .set({
        name: b.name?.trim() ?? existing.name,
        sku: b.sku ?? existing.sku,
        unit: b.unit ?? existing.unit,
        category: b.category ?? existing.category,
        warehouseId: b.warehouseId ?? existing.warehouseId,
        minQuantity: b.minQuantity ?? existing.minQuantity,
        price: b.price ?? existing.price,
        notes: b.notes ?? existing.notes,
        status: b.status ?? existing.status,
        updatedAt: now(),
      })
      .where(eq(inventoryItems.id, b.id));

    await addAudit({
      action: "update",
      entityType: "inventory_item",
      entityId: b.id,
      description: `تم تحديث الصنف: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/inventory/items?id=xxx — hard delete only when no movements/PO lines.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الصنف مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1))[0];
  if (!existing) return err("الصنف غير موجود", 404, "NOT_FOUND");

  const [{ c: movementCount }] = await db
    .select({ c: count() })
    .from(stockMovements)
    .where(eq(stockMovements.itemId, id));
  const [{ c: poLineCount }] = await db
    .select({ c: count() })
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.itemId, id));

  if (Number(movementCount) > 0 || Number(poLineCount) > 0) {
    const parts: string[] = [];
    if (Number(movementCount) > 0) parts.push(`${Number(movementCount)} حركة مخزون`);
    if (Number(poLineCount) > 0) parts.push(`${Number(poLineCount)} سطر أمر شراء`);
    return err(
      `لا يمكن حذف الصنف لارتباطه بـ ${parts.join(" و ")}. قم بإيقاف الصنف بدلاً من ذلك.`,
      400,
      "HAS_REFERENCES",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  await addAudit({
    action: "delete",
    entityType: "inventory_item",
    entityId: id,
    description: `تم حذف الصنف: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/items")({
  server: {
    handlers: {
      GET: authHandler("inventory.view", GET),
      POST: authHandler("inventory.create", POST),
      PUT: authHandler("inventory.update", PUT),
      DELETE: authHandler("inventory.delete", DELETE),
    },
  },
});
