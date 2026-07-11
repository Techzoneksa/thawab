import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { suppliers, purchaseOrders, stockMovements, fixedAssets } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

export const SUPPLIER_STATUSES = ["ظ†ط´ط·", "ظ…ظˆظ‚ظˆظپ"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

// GET /api/procurement/suppliers - list with search/filter
// GET /api/procurement/suppliers?id=xxx - single with usage info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
    if (!supplier)
      return Response.json({ error: "ط§ظ„ظ…ظˆط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const orderCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.supplierId, id))
        .all())[0]?.count || 0;

    const movementCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(and(eq(stockMovements.sourceType, "supplier"), eq(stockMovements.sourceId, id)))
        .all())[0]?.count || 0;

    const assetCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(fixedAssets)
        .where(eq(fixedAssets.supplierId, id))
        .all())[0]?.count || 0;

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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(suppliers.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(suppliers).where(whereClause).orderBy(desc(suppliers.createdAt)).all()
    : await db.select().from(suppliers).orderBy(desc(suppliers.createdAt)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/procurement/suppliers - create or activate/deactivate
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "activate" || action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ظ…ظˆط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const newStatus: SupplierStatus = action === "activate" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ";
    if (existing.status === newStatus) {
      return Response.json(
        { error: `ط§ظ„ظ…ظˆط±ط¯ ${newStatus === "ظ†ط´ط·" ? "ظ†ط´ط·" : "ظ…ظˆظ‚ظˆظپ"} ط¨ط§ظ„ظپط¹ظ„` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    await db.update(suppliers)
      .set({ status: newStatus, updatedAt: now() })
      .where(eq(suppliers.id, id))
      .run();
    await addAudit(
      action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„",
      "ظ…ظˆط±ط¯",
      id,
      `طھظ… ${action === "activate" ? "طھظپط¹ظٹظ„" : "طھط¹ط·ظٹظ„"} ط§ظ„ظ…ظˆط±ط¯: ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
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

  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ظˆط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const supId = genId("SUP");
  const ts = now();

  await db.insert(suppliers)
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
      status: status || "ظ†ط´ط·",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit("ط¥ط¶ط§ظپط©", "ظ…ظˆط±ط¯", supId, `طھظ… ط¥ط¶ط§ظپط© ظ…ظˆط±ط¯: ${name}`, userId, userName);
  const created = (await db.select().from(suppliers).where(eq(suppliers.id, supId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/suppliers - update
async function __handler_PUT({ request }: { request: Request }) {
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

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظˆط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ظ…ظˆط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(suppliers)
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

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ظˆط±ط¯",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ظ…ظˆط±ط¯: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/suppliers - only if no orders/assets/movements
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظˆط±ط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ظ…ظˆط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const orderCount =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id))
      .all())[0]?.count || 0;

  const assetCount =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(fixedAssets)
      .where(eq(fixedAssets.supplierId, id))
      .all())[0]?.count || 0;

  if (orderCount > 0 || assetCount > 0) {
    const parts: string[] = [];
    if (orderCount > 0) parts.push(`${orderCount} ط£ظ…ط± ط´ط±ط§ط،`);
    if (assetCount > 0) parts.push(`${assetCount} ط£طµظ„`);
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط§ظ„ظ…ظˆط±ط¯ ظ„ط§ط±طھط¨ط§ط·ظ‡ ط¨ظ€ ${parts.join(" ظˆ ")}. ظ‚ظ… ط¨طھط¹ط·ظٹظ„ ط§ظ„ظ…ظˆط±ط¯ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(suppliers).where(eq(suppliers.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ…ظˆط±ط¯",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…ظˆط±ط¯: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/suppliers")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
