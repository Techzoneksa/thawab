import { db, now, genId, addAudit } from "@/server/db/index";
import {
  stocktakes,
  stocktakeLines,
  inventoryItems,
  warehouses,
  stockMovements,
} from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const STOCKTAKE_STATUSES = ["مسودة", "بانتظار الاعتماد", "معتمد", "مغلق"] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

const READ_ONLY_STATUSES: StocktakeStatus[] = ["معتمد", "مغلق"];

// GET /api/inventory/stocktake - list
// GET /api/inventory/stocktake?id=xxx - single with lines
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const st = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    if (!st) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
    const lines = db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();
    return Response.json({ item: st, lines });
  }

  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (status && status !== "الكل") conditions.push(eq(stocktakes.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(stocktakes).where(whereClause).orderBy(desc(stocktakes.createdAt)).all()
    : db.select().from(stocktakes).orderBy(desc(stocktakes.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/inventory/stocktake - create or workflow actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "submit") {
    const { id, userId, userName } = body;
    const existing = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
    if (existing.status !== "مسودة")
      return Response.json({ error: "يمكن إرسال المسودة فقط" }, { status: 400 });

    const lines = db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();
    if (lines.length === 0)
      return Response.json({ error: "لا يمكن إرسال جرد فارغ" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(stocktakes)
      .set({ status: "بانتظار الاعتماد", updatedAt: now() })
      .where(eq(stocktakes.id, id))
      .run();
    addAudit(
      "إرسال للاعتماد",
      "جرد",
      id,
      `تم إرسال الجرد للاعتماد: ${existing.name} (${lines.length} سطر)`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
    if (existing.status !== "بانتظار الاعتماد")
      return Response.json({ error: "الجرد ليس بانتظار الاعتماد" }, { status: 400 });

    const lines = db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id)).all();

    const ts = now();
    const before = JSON.stringify(existing);

    // For each line with a difference, create an adjustment stock movement
    for (const line of lines) {
      if (Math.abs(line.difference) < 0.0001) continue;
      const item = db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, line.itemId))
        .limit(1)
        .all()[0];
      if (!item) continue;

      const newQty = item.quantity + line.difference;
      db.update(inventoryItems)
        .set({ quantity: newQty, updatedAt: ts })
        .where(eq(inventoryItems.id, item.id))
        .run();

      db.insert(stockMovements)
        .values({
          id: genId("MV"),
          itemId: item.id,
          warehouseId: existing.warehouseId || item.warehouseId || null,
          type: "تسوية",
          quantity: line.difference,
          balanceAfter: newQty,
          relatedStocktakeId: id,
          sourceType: "stocktake",
          sourceId: id,
          reference: `جرد ${existing.name}`,
          date: ts,
          notes: `تسوية جرد: الفرق ${line.difference} (المعدود ${line.countedQuantity}، بالنظام ${line.systemQuantity})`,
          createdBy: userId || null,
          createdAt: ts,
        })
        .run();
    }

    db.update(stocktakes)
      .set({
        status: "معتمد",
        approvedBy: userId || null,
        approvedAt: ts,
        updatedAt: ts,
      })
      .where(eq(stocktakes.id, id))
      .run();

    addAudit(
      "اعتماد",
      "جرد",
      id,
      `تم اعتماد الجرد وإنشاء تسويات تلقائية: ${existing.name} (${lines.length} سطر)`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "close") {
    const { id, userId, userName } = body;
    const existing = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
    if (existing.status !== "معتمد")
      return Response.json({ error: "يمكن إغلاق الجرد المعتمد فقط" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(stocktakes)
      .set({ status: "مغلق", updatedAt: now() })
      .where(eq(stocktakes.id, id))
      .run();
    addAudit("إغلاق", "جرد", id, `تم إغلاق الجرد: ${existing.name}`, userId, userName, before);
    const updated = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const { name, warehouseId, date, notes, lines, userId, userName } = body;
  if (!name?.trim()) return Response.json({ error: "اسم الجرد مطلوب" }, { status: 400 });
  if (!date?.trim()) return Response.json({ error: "تاريخ الجرد مطلوب" }, { status: 400 });

  if (warehouseId) {
    const wh = db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1).all()[0];
    if (!wh) return Response.json({ error: "المستودع غير موجود" }, { status: 400 });
  }

  const stId = genId("ST");
  const ts = now();

  db.insert(stocktakes)
    .values({
      id: stId,
      name: name.trim(),
      warehouseId: warehouseId || null,
      date,
      status: "مسودة",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const item = db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.id, l.itemId))
        .limit(1)
        .all()[0];
      const systemQty = item?.quantity || 0;
      const countedQty = parseFloat(l.countedQuantity) || 0;
      db.insert(stocktakeLines)
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

  addAudit(
    "إضافة",
    "جرد",
    stId,
    `تم إضافة جرد: ${name} (${Array.isArray(lines) ? lines.length : 0} سطر)`,
    userId,
    userName,
  );
  const created = db.select().from(stocktakes).where(eq(stocktakes.id, stId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/inventory/stocktake - update draft
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, name, warehouseId, date, notes, userId, userName } = body;
  if (!id) return Response.json({ error: "معرف الجرد مطلوب" }, { status: 400 });

  const existing = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
  if (READ_ONLY_STATUSES.includes(existing.status as StocktakeStatus)) {
    return Response.json({ error: "لا يمكن تعديل جرد معتمد أو مغلق" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  db.update(stocktakes)
    .set({
      name: name?.trim() ?? existing.name,
      warehouseId: warehouseId ?? existing.warehouseId,
      date: date ?? existing.date,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(stocktakes.id, id))
    .run();

  addAudit("تعديل", "جرد", id, `تم تحديث الجرد: ${existing.name}`, userId, userName, before);
  const updated = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/inventory/stocktake - only draft
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الجرد مطلوب" }, { status: 400 });

  const existing = db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الجرد غير موجود" }, { status: 404 });
  if (existing.status !== "مسودة") {
    return Response.json(
      { error: "لا يمكن حذف جرد تمت معالجته. يحتفظ النظام به للسجل التاريخي." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(stocktakes).where(eq(stocktakes.id, id)).run();
  addAudit("حذف", "جرد", id, `تم حذف الجرد: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
