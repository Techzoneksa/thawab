import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { quotes, purchaseRequests } from "@/server/db/schema";
import { eq, like, or, and, desc, ne } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

export const QUOTE_STATUSES = ["ط¨ط§ظ†طھط¸ط§ط±", "ظ…ظ‚ط¨ظˆظ„", "ظ…ط±ظپظˆط¶"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// GET /api/procurement/quotes - list
// GET /api/procurement/quotes?id=xxx - single
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const quote = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
    if (!quote)
      return Response.json({ error: "ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(quotes.status, status));
  if (requestId) conditions.push(eq(quotes.requestId, requestId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(quotes).where(whereClause).orderBy(desc(quotes.createdAt)).all()
    : await db.select().from(quotes).orderBy(desc(quotes.createdAt)).all();
  return Response.json({ items, total: items.length });
}

// POST /api/procurement/quotes - create or accept/reject actions
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "accept") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط±")
      return Response.json(
        { error: "ظٹظ…ظƒظ† ظ‚ط¨ظˆظ„ ط§ظ„ط¹ط±ظˆط¶ ط¨ط§ظ†طھط¸ط§ط± ظپظ‚ط·" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);

    // Unset other winners for the same request
    if (existing.requestId) {
      await db.update(quotes)
        .set({ winner: false, updatedAt: now() })
        .where(and(eq(quotes.requestId, existing.requestId), ne(quotes.id, id)))
        .run();
    }

    await db.update(quotes)
      .set({ status: "ظ…ظ‚ط¨ظˆظ„", winner: true, updatedAt: now() })
      .where(eq(quotes.id, id))
      .run();

    await addAudit(
      "ظ‚ط¨ظˆظ„",
      "ط¹ط±ط¶ ط³ط¹ط±",
      id,
      `طھظ… ظ‚ط¨ظˆظ„ ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ظˆطھط­ط¯ظٹط¯ظ‡ ظƒظپط§ط¦ط²: ${existing.supplier} (${existing.price})`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط±")
      return Response.json(
        { error: "ظٹظ…ظƒظ† ط±ظپط¶ ط§ظ„ط¹ط±ظˆط¶ ط¨ط§ظ†طھط¸ط§ط± ظپظ‚ط·" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(quotes)
      .set({ status: "ظ…ط±ظپظˆط¶", winner: false, updatedAt: now() })
      .where(eq(quotes.id, id))
      .run();
    await addAudit(
      "ط±ظپط¶",
      "ط¹ط±ط¶ ط³ط¹ط±",
      id,
      `طھظ… ط±ظپط¶ ط¹ط±ط¶ ط§ظ„ط³ط¹ط±: ${existing.supplier}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
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
    return Response.json(
      { error: "ط§ط³ظ… ط§ظ„ظ…ظˆط±ط¯/ط§ظ„ظ…ظˆط±ظ‘ط¯ ظ…ط·ظ„ظˆط¨" },
      { status: 400 },
    );

  if (requestId) {
    const req = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, requestId))
      .limit(1)
      .all())[0];
    if (!req)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  const quoteId = genId("QT");
  const ts = now();

  await db.insert(quotes)
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
      status: "ط¨ط§ظ†طھط¸ط§ط±",
      validUntil: validUntil || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط¹ط±ط¶ ط³ط¹ط±",
    quoteId,
    `طھظ… ط¥ط¶ط§ظپط© ط¹ط±ط¶ ط³ط¹ط± ظ…ظ† ${supplier} ط¨ط³ط¹ط± ${price}`,
    userId,
    userName,
  );
  const created = (await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/quotes - update (only pending)
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, supplier, price, delivery, warranty, rating, validUntil, notes, userId, userName } =
    body;
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¹ط±ط¶ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط±") {
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ط¹ط±ط¶ طھظ… ط§ظ„ط¨طھ ظپظٹظ‡" },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.update(quotes)
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

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط¹ط±ط¶ ط³ط¹ط±",
    id,
    `طھظ… طھط­ط¯ظٹط« ط¹ط±ط¶ ط§ظ„ط³ط¹ط±: ${existing.supplier}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/quotes
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¹ط±ط¶ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all())[0];
  if (!existing)
    return Response.json({ error: "ط¹ط±ط¶ ط§ظ„ط³ط¹ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  await db.delete(quotes).where(eq(quotes.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط¹ط±ط¶ ط³ط¹ط±",
    id,
    `طھظ… ط­ط°ظپ ط¹ط±ط¶ ط§ظ„ط³ط¹ط±: ${existing.supplier}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/quotes")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
