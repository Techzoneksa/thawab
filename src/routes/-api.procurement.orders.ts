import { db, now, genId, addAudit } from "@/server/db/index";
import {
  purchaseOrders,
  purchaseOrderLines,
  purchaseRequests,
  inventoryItems,
  stockMovements,
} from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const ORDER_STATUSES = [
  "مسودة",
  "معتمد",
  "تم الاستلام جزئيًا",
  "تم الاستلام",
  "مغلق",
  "ملغي",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// GET /api/procurement/orders - list with search/filter
// GET /api/procurement/orders?id=xxx - single with lines
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const order = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    if (!order) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
    const lines = db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, id))
      .orderBy(purchaseOrderLines.lineNumber)
      .all();
    return Response.json({ item: order, lines });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const supplierId = url.searchParams.get("supplierId") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(like(purchaseOrders.subject, `%${search}%`), like(purchaseOrders.notes, `%${search}%`)),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(purchaseOrders.status, status));
  if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db
        .select()
        .from(purchaseOrders)
        .where(whereClause)
        .orderBy(desc(purchaseOrders.createdAt))
        .all()
    : db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/procurement/orders - create or workflow action
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
    if (existing.status !== "مسودة")
      return Response.json({ error: "يمكن اعتماد المسودة فقط" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseOrders)
      .set({ status: "معتمد", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();
    addAudit(
      "اعتماد",
      "أمر شراء",
      id,
      `تم اعتماد أمر الشراء: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "cancel") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
    if (existing.status === "ملغي")
      return Response.json({ error: "الأمر ملغي بالفعل" }, { status: 400 });
    if (existing.status === "مغلق")
      return Response.json({ error: "لا يمكن إلغاء أمر مغلق" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseOrders)
      .set({ status: "ملغي", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();

    // If linked to a request, mark it as not converted
    if (existing.requestId) {
      const linked = db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, existing.requestId))
        .limit(1)
        .all()[0];
      if (linked && linked.status === "محول إلى أمر شراء") {
        db.update(purchaseRequests)
          .set({ status: "معتمد", updatedAt: now() })
          .where(eq(purchaseRequests.id, existing.requestId))
          .run();
      }
    }

    addAudit(
      "إلغاء",
      "أمر شراء",
      id,
      `تم إلغاء أمر الشراء: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "receive") {
    const { id, receipts, userId, userName } = body as {
      id: string;
      receipts: Array<{ lineId: string; receivedQty: number }>;
      userId?: string;
      userName?: string;
    };

    const order = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    if (!order) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
    if (order.status !== "معتمد" && order.status !== "تم الاستلام جزئيًا") {
      return Response.json(
        { error: "يمكن الاستلام فقط للأوامر المعتمدة أو المستلمة جزئياً" },
        { status: 400 },
      );
    }
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return Response.json({ error: "يجب تحديد الكميات المستلمة" }, { status: 400 });
    }

    const lines = db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, id))
      .all();

    let anyReceived = false;
    let allComplete = true;
    const ts = now();
    const lineMap = new Map(lines.map((l) => [l.id, l]));

    for (const r of receipts) {
      const line = lineMap.get(r.lineId);
      if (!line) continue;
      const newReceived = (line.receivedQuantity || 0) + (r.receivedQty || 0);
      if (newReceived > line.quantity + 0.0001) {
        return Response.json(
          {
            error: `الكمية المستلمة للسطر "${line.description}" تتجاوز المطلوب (${line.quantity})`,
          },
          { status: 400 },
        );
      }
      db.update(purchaseOrderLines)
        .set({ receivedQuantity: newReceived })
        .where(eq(purchaseOrderLines.id, line.id))
        .run();

      if (r.receivedQty > 0 && line.itemId) {
        anyReceived = true;
        // Update inventory item quantity
        const item = db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, line.itemId))
          .limit(1)
          .all()[0];
        if (item) {
          const newQty = (item.quantity || 0) + r.receivedQty;
          db.update(inventoryItems)
            .set({ quantity: newQty, updatedAt: ts })
            .where(eq(inventoryItems.id, line.itemId))
            .run();
          // Record stock movement
          db.insert(stockMovements)
            .values({
              id: genId("MV"),
              itemId: line.itemId,
              warehouseId: item.warehouseId || null,
              type: "استلام",
              quantity: r.receivedQty,
              balanceAfter: newQty,
              sourceType: "purchase_order",
              sourceId: order.id,
              reference: `PO ${order.id}`,
              date: ts,
              notes: `استلام من أمر شراء ${order.id}`,
              createdBy: userId || null,
              createdAt: ts,
            })
            .run();
        }
      }

      if (newReceived < line.quantity - 0.0001) {
        allComplete = false;
      }
    }

    const before = JSON.stringify(order);
    const newStatus: OrderStatus = allComplete ? "تم الاستلام" : "تم الاستلام جزئيًا";
    const totalReceived = lines.reduce((sum, l) => {
      const r = receipts.find((x) => x.lineId === l.id);
      return sum + (l.receivedQuantity || 0) + (r?.receivedQty || 0);
    }, 0);
    db.update(purchaseOrders)
      .set({ status: newStatus, receivedAmount: totalReceived, updatedAt: ts })
      .where(eq(purchaseOrders.id, id))
      .run();

    addAudit(
      "استلام",
      "أمر شراء",
      id,
      `تم استلام ${anyReceived ? "أصناف" : "تحديث"} لأمر الشراء: ${order.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  if (action === "close") {
    const { id, userId, userName } = body;
    const existing = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    if (!existing) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
    if (existing.status === "مغلق")
      return Response.json({ error: "الأمر مغلق بالفعل" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(purchaseOrders)
      .set({ status: "مغلق", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();
    addAudit(
      "إغلاق",
      "أمر شراء",
      id,
      `تم إغلاق أمر الشراء: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const { supplierId, requestId, subject, date, deliveryDate, notes, lines, userId, userName } =
    body;

  if (!subject?.trim()) return Response.json({ error: "موضوع أمر الشراء مطلوب" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length === 0) {
    return Response.json({ error: "يجب إضافة سطر واحد على الأقل" }, { status: 400 });
  }

  // If linked to request, verify status
  if (requestId) {
    const req = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, requestId))
      .limit(1)
      .all()[0];
    if (!req) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
    if (req.status !== "معتمد") {
      return Response.json(
        { error: "يجب أن يكون طلب الشراء معتمداً قبل إنشاء أمر شراء" },
        { status: 400 },
      );
    }
  }

  const orderId = genId("PO");
  const ts = now();
  let total = 0;
  for (const l of lines) {
    total += (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0);
  }

  db.insert(purchaseOrders)
    .values({
      id: orderId,
      supplierId: supplierId || null,
      requestId: requestId || null,
      subject: subject.trim(),
      date: date || ts,
      deliveryDate: deliveryDate || "",
      status: "مسودة",
      total,
      receivedAmount: 0,
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    db.insert(purchaseOrderLines)
      .values({
        id: genId("POL"),
        orderId,
        lineNumber: i + 1,
        itemId: l.itemId || null,
        description: l.description || "",
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        receivedQuantity: 0,
        unit: l.unit || "",
        notes: l.notes || "",
        createdAt: ts,
      })
      .run();
  }

  // Link request status
  if (requestId) {
    db.update(purchaseRequests)
      .set({ status: "محول إلى أمر شراء", updatedAt: ts })
      .where(eq(purchaseRequests.id, requestId))
      .run();
  }

  addAudit(
    "إضافة",
    "أمر شراء",
    orderId,
    `تم إضافة أمر شراء: ${subject} (${lines.length} سطر، الإجمالي ${total})`,
    userId,
    userName,
  );
  const created = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/orders - update (only draft)
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, subject, date, deliveryDate, notes, userId, userName } = body;

  if (!id) return Response.json({ error: "معرف أمر الشراء مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
  if (existing.status !== "مسودة") {
    return Response.json({ error: "لا يمكن تعديل أمر شراء في حالة حالية" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  db.update(purchaseOrders)
    .set({
      subject: subject?.trim() ?? existing.subject,
      date: date ?? existing.date,
      deliveryDate: deliveryDate ?? existing.deliveryDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(purchaseOrders.id, id))
    .run();

  addAudit(
    "تعديل",
    "أمر شراء",
    id,
    `تم تحديث أمر الشراء: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  const updated = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/orders - only draft
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف أمر الشراء مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all()[0];
  if (!existing) return Response.json({ error: "أمر الشراء غير موجود" }, { status: 404 });
  if (existing.status !== "مسودة") {
    return Response.json(
      { error: "لا يمكن حذف أمر شراء غير مسودة. ألغِه بدلاً من ذلك." },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  // Roll back linked request
  if (existing.requestId) {
    db.update(purchaseRequests)
      .set({ status: "معتمد", updatedAt: now() })
      .where(eq(purchaseRequests.id, existing.requestId))
      .run();
  }
  db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).run();
  addAudit(
    "حذف",
    "أمر شراء",
    id,
    `تم حذف أمر الشراء: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
