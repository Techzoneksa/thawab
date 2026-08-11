import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { warehouses, inventoryItems, stockMovements } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { WarehouseStatus } from "@/lib/enums";

// GET /api/inventory/warehouses?id=xxx — single with usage info; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const wh = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1))[0];
    if (!wh) return err("المستودع غير موجود", 404, "NOT_FOUND");

    const [{ c: itemCount }] = await db
      .select({ c: count() })
      .from(inventoryItems)
      .where(eq(inventoryItems.warehouseId, id));
    const [{ c: movementCount }] = await db
      .select({ c: count() })
      .from(stockMovements)
      .where(eq(stockMovements.warehouseId, id));
    const [{ total: totalQty }] = await db
      .select({ total: sql<number>`coalesce(sum(${inventoryItems.quantity}), 0)` })
      .from(inventoryItems)
      .where(eq(inventoryItems.warehouseId, id));

    return Response.json({
      item: wh,
      itemCount: Number(itemCount),
      movementCount: Number(movementCount),
      totalQty: Number(totalQty),
      hasMovements: Number(itemCount) > 0 || Number(movementCount) > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

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
  if (status) conditions.push(eq(warehouses.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(warehouses).where(where);
  const items = await db
    .select()
    .from(warehouses)
    .where(where)
    .orderBy(desc(warehouses.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const postSchema = z.object({
  action: z.enum(["activate", "deactivate", "create"]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  location: z.string().optional(),
  manager: z.string().optional(),
  capacity: z.coerce.number().optional(),
  occupancy: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(WarehouseStatus).optional(),
});

// POST /api/inventory/warehouses — create or activate/deactivate.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "activate" || b.action === "deactivate") {
      if (!b.id) return err("معرف المستودع مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(warehouses).where(eq(warehouses.id, b.id)).limit(1))[0];
      if (!existing) return err("المستودع غير موجود", 404, "NOT_FOUND");

      const newStatus =
        b.action === "activate" ? WarehouseStatus.ACTIVE : WarehouseStatus.INACTIVE;
      if (existing.status === newStatus) {
        return err(
          b.action === "activate" ? "المستودع نشط بالفعل" : "المستودع موقوف بالفعل",
          400,
          "ALREADY_IN_STATE",
        );
      }

      const before = JSON.stringify(existing);
      await db
        .update(warehouses)
        .set({ status: newStatus, updatedAt: now() })
        .where(eq(warehouses.id, b.id));
      await addAudit({
        action: b.action,
        entityType: "warehouse",
        entityId: b.id,
        description: `تم ${b.action === "activate" ? "تفعيل" : "تعطيل"} المستودع: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });
      const updated = (await db.select().from(warehouses).where(eq(warehouses.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create
    if (!b.name?.trim()) return err("اسم المستودع مطلوب", 400, "BAD_REQUEST");

    const whId = genId("WH");
    const ts = now();

    await db.insert(warehouses).values({
      id: whId,
      name: b.name!.trim(),
      location: b.location || "",
      manager: b.manager || "",
      capacity: b.capacity ?? 0,
      occupancy: b.occupancy ?? 0,
      notes: b.notes || "",
      status: b.status ?? WarehouseStatus.ACTIVE,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "warehouse",
      entityId: whId,
      description: `تم إضافة مستودع: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(warehouses).where(eq(warehouses.id, whId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف المستودع مطلوب"),
  name: z.string().optional(),
  location: z.string().optional(),
  manager: z.string().optional(),
  capacity: z.coerce.number().optional(),
  occupancy: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(WarehouseStatus).optional(),
});

// PUT /api/inventory/warehouses — update.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(warehouses).where(eq(warehouses.id, b.id)).limit(1))[0];
    if (!existing) return err("المستودع غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(warehouses)
      .set({
        name: b.name?.trim() ?? existing.name,
        location: b.location ?? existing.location,
        manager: b.manager ?? existing.manager,
        capacity: b.capacity ?? existing.capacity,
        occupancy: b.occupancy ?? existing.occupancy,
        notes: b.notes ?? existing.notes,
        status: b.status ?? existing.status,
        updatedAt: now(),
      })
      .where(eq(warehouses.id, b.id));

    await addAudit({
      action: "update",
      entityType: "warehouse",
      entityId: b.id,
      description: `تم تحديث المستودع: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(warehouses).where(eq(warehouses.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/inventory/warehouses?id=xxx — only when no items/movements.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المستودع مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1))[0];
  if (!existing) return err("المستودع غير موجود", 404, "NOT_FOUND");

  const [{ c: itemCount }] = await db
    .select({ c: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.warehouseId, id));
  const [{ c: movementCount }] = await db
    .select({ c: count() })
    .from(stockMovements)
    .where(eq(stockMovements.warehouseId, id));

  if (Number(itemCount) > 0 || Number(movementCount) > 0) {
    const parts: string[] = [];
    if (Number(itemCount) > 0) parts.push(`${Number(itemCount)} صنف`);
    if (Number(movementCount) > 0) parts.push(`${Number(movementCount)} حركة`);
    return err(
      `لا يمكن حذف المستودع لارتباطه بـ ${parts.join(" و ")}. قم بإيقاف المستودع بدلاً من ذلك.`,
      400,
      "HAS_REFERENCES",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(warehouses).where(eq(warehouses.id, id));
  await addAudit({
    action: "delete",
    entityType: "warehouse",
    entityId: id,
    description: `تم حذف المستودع: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/warehouses")({
  server: {
    handlers: {
      GET: authHandler("inventory.view", GET),
      POST: authHandler("inventory.create", POST),
      PUT: authHandler("inventory.update", PUT),
      DELETE: authHandler("inventory.delete", DELETE),
    },
  },
});
