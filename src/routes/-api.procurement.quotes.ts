import { db, now, genId, addAudit } from "@/server/db/index";
import { quotes, purchaseRequests } from "@/server/db/schema";
import { eq, like, or, and, desc, ne } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const QUOTE_STATUSES = ["بانتظار", "مقبول", "مرفوض"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// GET /api/procurement/quotes - list
// GET /api/procurement/quotes?id=xxx - single
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const quote = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
    if (!quote) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    return Response.json({ item: quote });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const requestId = url.searchParams.get("requestId") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(quotes.supplier, `%${search}%`),
        like(quotes.delivery, `%${search}%`),
        like(quotes.notes, `%${search}%`),
      ),
    );
  }
  if (status && status !== "الكل") conditions.push(eq(quotes.status, status));
  if (requestId) conditions.push(eq(quotes.requestId, requestId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(quotes).where(whereClause).orderBy(desc(quotes.createdAt)).all()
    : db.select().from(quotes).orderBy(desc(quotes.createdAt)).all();
  return Response.json({ items, total: items.length });
}

// POST /api/procurement/quotes - create or accept/reject actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "accept") {
    const { id, userId, userName } = body;
    const existing = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    if (existing.status !== "بانتظار")
      return Response.json({ error: "يمكن قبول العروض بانتظار فقط" }, { status: 400 });

    const before = JSON.stringify(existing);

    // Unset other winners for the same request
    if (existing.requestId) {
      db.update(quotes)
        .set({ winner: false, updatedAt: now() })
        .where(and(eq(quotes.requestId, existing.requestId), ne(quotes.id, id)))
        .run();
    }

    db.update(quotes)
      .set({ status: "مقبول", winner: true, updatedAt: now() })
      .where(eq(quotes.id, id))
      .run();

    addAudit(
      "قبول",
      "عرض سعر",
      id,
      `تم قبول عرض السعر وتحديده كفائز: ${existing.supplier} (${existing.price})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const { id, userId, userName } = body;
    const existing = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    if (existing.status !== "بانتظار")
      return Response.json({ error: "يمكن رفض العروض بانتظار فقط" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(quotes)
      .set({ status: "مرفوض", winner: false, updatedAt: now() })
      .where(eq(quotes.id, id))
      .run();
    addAudit(
      "رفض",
      "عرض سعر",
      id,
      `تم رفض عرض السعر: ${existing.supplier}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    requestId,
    supplierId,
    supplier,
    price,
    delivery,
    warranty,
    rating,
    validUntil,
    notes,
    userId,
    userName,
  } = body;

  if (!supplier?.trim())
    return Response.json({ error: "اسم المورد/المورّد مطلوب" }, { status: 400 });

  if (requestId) {
    const req = db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, requestId))
      .limit(1)
      .all()[0];
    if (!req) return Response.json({ error: "طلب الشراء غير موجود" }, { status: 404 });
  }

  const quoteId = genId("QT");
  const ts = now();

  db.insert(quotes)
    .values({
      id: quoteId,
      requestId: requestId || null,
      supplierId: supplierId || null,
      supplier: supplier.trim(),
      price: parseFloat(price) || 0,
      delivery: delivery || "",
      warranty: warranty || "",
      rating: parseFloat(rating) || 0,
      winner: false,
      status: "بانتظار",
      validUntil: validUntil || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit(
    "إضافة",
    "عرض سعر",
    quoteId,
    `تم إضافة عرض سعر من ${supplier} بسعر ${price}`,
    userId,
    userName,
  );
  const created = db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/quotes - update (only pending)
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const { id, supplier, price, delivery, warranty, rating, validUntil, notes, userId, userName } =
    body;
  if (!id) return Response.json({ error: "معرف العرض مطلوب" }, { status: 400 });

  const existing = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });
  if (existing.status !== "بانتظار") {
    return Response.json({ error: "لا يمكن تعديل عرض تم البت فيه" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  db.update(quotes)
    .set({
      supplier: supplier?.trim() ?? existing.supplier,
      price: price !== undefined ? parseFloat(price) : existing.price,
      delivery: delivery ?? existing.delivery,
      warranty: warranty ?? existing.warranty,
      rating: rating !== undefined ? parseFloat(rating) : existing.rating,
      validUntil: validUntil ?? existing.validUntil,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(quotes.id, id))
    .run();

  addAudit(
    "تعديل",
    "عرض سعر",
    id,
    `تم تحديث عرض السعر: ${existing.supplier}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/quotes
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف العرض مطلوب" }, { status: 400 });

  const existing = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "عرض السعر غير موجود" }, { status: 404 });

  const before = JSON.stringify(existing);
  db.delete(quotes).where(eq(quotes.id, id)).run();
  addAudit(
    "حذف",
    "عرض سعر",
    id,
    `تم حذف عرض السعر: ${existing.supplier}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
