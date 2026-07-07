import { db, now, genId, addAudit } from "@/server/db/index";
import { suppliers, purchaseOrders, stockMovements, fixedAssets } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const SUPPLIER_STATUSES = ["نشط", "موقوف"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

// GET /api/procurement/suppliers - list with search/filter
// GET /api/procurement/suppliers?id=xxx - single with usage info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
    if (!supplier) return Response.json({ error: "المورد غير موجود" }, { status: 404 });

    const orderCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.supplierId, id))
        .all()[0]?.count || 0;

    const movementCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(and(eq(stockMovements.sourceType, "supplier"), eq(stockMovements.sourceId, id)))
        .all()[0]?.count || 0;

    const assetCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(fixedAssets)
        .where(eq(fixedAssets.supplierId, id))
        .all()[0]?.count || 0;

    const usage = orderCount + assetCount;

    return Response.json({
      item: supplier,
      orderCount,
      assetCount,
      movementCount,
      hasTransactions: usage > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(suppliers.name, `%${search}%`),
        like(suppliers.activity, `%${search}%`),
        like(suppliers.phone, `%${search}%`),
        like(suppliers.taxNumber, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(suppliers.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(suppliers).where(whereClause).orderBy(desc(suppliers.createdAt)).all()
    : db.select().from(suppliers).orderBy(desc(suppliers.createdAt)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/procurement/suppliers - create or activate/deactivate
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "activate" || action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "المورد غير موجود" }, { status: 404 });

    const newStatus: SupplierStatus = action === "activate" ? "نشط" : "موقوف";
    if (existing.status === newStatus) {
      return Response.json(
        { error: `المورد ${newStatus === "نشط" ? "نشط" : "موقوف"} بالفعل` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    db.update(suppliers)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(suppliers.id, id))
      .run();
    addAudit(
      action === "activate" ? "تفعيل" : "تعطيل",
      "مورد",
      id,
      `تم ${action === "activate" ? "تفعيل" : "تعطيل"} المورد: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  const {
    name,
    activity,
    phone,
    email,
    taxNumber,
    contactPerson,
    address,
    rating,
    notes,
    status,
    userId,
    userName,
  } = body;

  if (!name?.trim()) return Response.json({ error: "اسم المورد مطلوب" }, { status: 400 });

  const supId = genId("SUP");
  const ts = now();

  db.insert(suppliers)
    .values({
      id: supId,
      name: name.trim(),
      activity: activity || "",
      phone: phone || null,
      email: email || null,
      taxNumber: taxNumber || "",
      contactPerson: contactPerson || "",
      address: address || "",
      rating: parseFloat(rating) || 0,
      notes: notes || "",
      status: status || "نشط",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "مورد", supId, `تم إضافة مورد: ${name}`, userId, userName);
  const created = db.select().from(suppliers).where(eq(suppliers.id, supId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/suppliers - update
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const {
    id,
    name,
    activity,
    phone,
    email,
    taxNumber,
    contactPerson,
    address,
    rating,
    notes,
    status,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "معرف المورد مطلوب" }, { status: 400 });

  const existing = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المورد غير موجود" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(suppliers)
    .set({
      name: name?.trim() ?? existing.name,
      activity: activity ?? existing.activity,
      phone: phone ?? existing.phone,
      email: email ?? existing.email,
      taxNumber: taxNumber ?? existing.taxNumber,
      contactPerson: contactPerson ?? existing.contactPerson,
      address: address ?? existing.address,
      rating: rating !== undefined ? parseFloat(rating) : existing.rating,
      notes: notes ?? existing.notes,
      status: status ?? existing.status,
      updatedAt: ts,
    })
    .where(eq(suppliers.id, id))
    .run();

  addAudit(
    "تعديل",
    "مورد",
    id,
    `تم تحديث المورد: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/suppliers - only if no orders/assets/movements
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف المورد مطلوب" }, { status: 400 });

  const existing = db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "المورد غير موجود" }, { status: 404 });

  const orderCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id))
      .all()[0]?.count || 0;

  const assetCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(fixedAssets)
      .where(eq(fixedAssets.supplierId, id))
      .all()[0]?.count || 0;

  if (orderCount > 0 || assetCount > 0) {
    const parts: string[] = [];
    if (orderCount > 0) parts.push(`${orderCount} أمر شراء`);
    if (assetCount > 0) parts.push(`${assetCount} أصل`);
    return Response.json(
      {
        error: `لا يمكن حذف المورد لارتباطه بـ ${parts.join(" و ")}. قم بتعطيل المورد بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(suppliers).where(eq(suppliers.id, id)).run();
  addAudit("حذف", "مورد", id, `تم حذف المورد: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
