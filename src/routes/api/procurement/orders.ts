import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import {
  purchaseOrders,
  purchaseOrderLines,
  purchaseRequests,
  inventoryItems,
  stockMovements,
} from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

export const ORDER_STATUSES = [
  "ظ…ط³ظˆط¯ط©",
  "ظ…ط¹طھظ…ط¯",
  "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ… ط¬ط²ط¦ظٹظ‹ط§",
  "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ…",
  "ظ…ط؛ظ„ظ‚",
  "ظ…ظ„ط؛ظٹ",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// GET /api/procurement/orders - list with search/filter
// GET /api/procurement/orders?id=xxx - single with lines
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const order = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    if (!order)
      return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    const lines = await db
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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(purchaseOrders.status, status));
  if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db
        .select()
        .from(purchaseOrders)
        .where(whereClause)
        .orderBy(desc(purchaseOrders.createdAt))
        .all()
    : await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/procurement/orders - create or workflow action
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ظ…ط³ظˆط¯ط©")
      return Response.json(
        { error: "ظٹظ…ظƒظ† ط§ط¹طھظ…ط§ط¯ ط§ظ„ظ…ط³ظˆط¯ط© ظپظ‚ط·" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(purchaseOrders)
      .set({ status: "ظ…ط¹طھظ…ط¯", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();
    await addAudit(
      "ط§ط¹طھظ…ط§ط¯",
      "ط£ظ…ط± ط´ط±ط§ط،",
      id,
      `طھظ… ط§ط¹طھظ…ط§ط¯ ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "cancel") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ظ„ط؛ظٹ")
      return Response.json({ error: "ط§ظ„ط£ظ…ط± ظ…ظ„ط؛ظٹ ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });
    if (existing.status === "ظ…ط؛ظ„ظ‚")
      return Response.json({ error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ظ„ط؛ط§ط، ط£ظ…ط± ظ…ط؛ظ„ظ‚" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(purchaseOrders)
      .set({ status: "ظ…ظ„ط؛ظٹ", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();

    // If linked to a request, mark it as not converted
    if (existing.requestId) {
      const linked = (await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, existing.requestId))
        .limit(1)
        .all())[0];
      if (linked && linked.status === "ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،") {
        await db.update(purchaseRequests)
          .set({ status: "ظ…ط¹طھظ…ط¯", updatedAt: now() })
          .where(eq(purchaseRequests.id, existing.requestId))
          .run();
      }
    }

    await addAudit(
      "ط¥ظ„ط؛ط§ط،",
      "ط£ظ…ط± ط´ط±ط§ط،",
      id,
      `طھظ… ط¥ظ„ط؛ط§ط، ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "receive") {
    const { id, receipts, userId, userName } = body as {
      id: string;
      receipts: Array<{ lineId: string; receivedQty: number }>;
      userId?: string;
      userName?: string;
    };

    const order = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    if (!order)
      return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (order.status !== "ظ…ط¹طھظ…ط¯" && order.status !== "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ… ط¬ط²ط¦ظٹظ‹ط§") {
      return Response.json(
        {
          error:
            "ظٹظ…ظƒظ† ط§ظ„ط§ط³طھظ„ط§ظ… ظپظ‚ط· ظ„ظ„ط£ظˆط§ظ…ط± ط§ظ„ظ…ط¹طھظ…ط¯ط© ط£ظˆ ط§ظ„ظ…ط³طھظ„ظ…ط© ط¬ط²ط¦ظٹط§ظ‹",
        },
        { status: 400 },
      );
    }
    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return Response.json(
        { error: "ظٹط¬ط¨ طھط­ط¯ظٹط¯ ط§ظ„ظƒظ…ظٹط§طھ ط§ظ„ظ…ط³طھظ„ظ…ط©" },
        { status: 400 },
      );
    }

    const lines = await db
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
            error: `ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…ط³طھظ„ظ…ط© ظ„ظ„ط³ط·ط± "${line.description}" طھطھط¬ط§ظˆط² ط§ظ„ظ…ط·ظ„ظˆط¨ (${line.quantity})`,
          },
          { status: 400 },
        );
      }
      await db.update(purchaseOrderLines)
        .set({ receivedQuantity: newReceived })
        .where(eq(purchaseOrderLines.id, line.id))
        .run();

      if (r.receivedQty > 0 && line.itemId) {
        anyReceived = true;
        // Update inventory item quantity
        const item = (await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, line.itemId))
          .limit(1)
          .all())[0];
        if (item) {
          const newQty = (item.quantity || 0) + r.receivedQty;
          await db.update(inventoryItems)
            .set({ quantity: newQty, updatedAt: ts })
            .where(eq(inventoryItems.id, line.itemId))
            .run();
          // Record stock movement
          await db.insert(stockMovements)
            .values({
              id: genId("MV"),
              itemId: line.itemId,
              warehouseId: item.warehouseId || null,
              type: "ط§ط³طھظ„ط§ظ…",
              quantity: r.receivedQty,
              balanceAfter: newQty,
              sourceType: "purchase_order",
              sourceId: order.id,
              reference: `PO ${order.id}`,
              date: ts,
              notes: `ط§ط³طھظ„ط§ظ… ظ…ظ† ط£ظ…ط± ط´ط±ط§ط، ${order.id}`,
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
    const newStatus: OrderStatus = allComplete
      ? "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ…"
      : "طھظ… ط§ظ„ط§ط³طھظ„ط§ظ… ط¬ط²ط¦ظٹظ‹ط§";
    const totalReceived = lines.reduce((sum, l) => {
      const r = receipts.find((x) => x.lineId === l.id);
      return sum + (l.receivedQuantity || 0) + (r?.receivedQty || 0);
    }, 0);
    await db.update(purchaseOrders)
      .set({ status: newStatus, receivedAmount: totalReceived, updatedAt: ts })
      .where(eq(purchaseOrders.id, id))
      .run();

    await addAudit(
      "ط§ط³طھظ„ط§ظ…",
      "ط£ظ…ط± ط´ط±ط§ط،",
      id,
      `طھظ… ط§ط³طھظ„ط§ظ… ${anyReceived ? "ط£طµظ†ط§ظپ" : "طھط­ط¯ظٹط«"} ظ„ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${order.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "close") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ط؛ظ„ظ‚")
      return Response.json({ error: "ط§ظ„ط£ظ…ط± ظ…ط؛ظ„ظ‚ ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(purchaseOrders)
      .set({ status: "ظ…ط؛ظ„ظ‚", updatedAt: now() })
      .where(eq(purchaseOrders.id, id))
      .run();
    await addAudit(
      "ط¥ط؛ظ„ط§ظ‚",
      "ط£ظ…ط± ط´ط±ط§ط،",
      id,
      `طھظ… ط¥ط؛ظ„ط§ظ‚ ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const { supplierId, requestId, subject, date, deliveryDate, notes, lines, userId, userName } =
    body;

  if (!subject?.trim())
    return Response.json({ error: "ظ…ظˆط¶ظˆط¹ ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!Array.isArray(lines) || lines.length === 0) {
    return Response.json(
      { error: "ظٹط¬ط¨ ط¥ط¶ط§ظپط© ط³ط·ط± ظˆط§ط­ط¯ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" },
      { status: 400 },
    );
  }

  // If linked to request, verify status
  if (requestId) {
    const req = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, requestId))
      .limit(1)
      .all())[0];
    if (!req)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (req.status !== "ظ…ط¹طھظ…ط¯") {
      return Response.json(
        {
          error:
            "ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ظ…ط¹طھظ…ط¯ط§ظ‹ ظ‚ط¨ظ„ ط¥ظ†ط´ط§ط، ط£ظ…ط± ط´ط±ط§ط،",
        },
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

  await db.insert(purchaseOrders)
    .values({
      id: orderId,
      supplierId: supplierId || null,
      requestId: requestId || null,
      subject: subject.trim(),
      date: date || ts,
      deliveryDate: deliveryDate || "",
      status: "ظ…ط³ظˆط¯ط©",
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
    await db.insert(purchaseOrderLines)
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
    await db.update(purchaseRequests)
      .set({ status: "ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،", updatedAt: ts })
      .where(eq(purchaseRequests.id, requestId))
      .run();
  }

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط£ظ…ط± ط´ط±ط§ط،",
    orderId,
    `طھظ… ط¥ط¶ط§ظپط© ط£ظ…ط± ط´ط±ط§ط،: ${subject} (${lines.length} ط³ط·ط±طŒ ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ ${total})`,
    userId,
    userName,
  );
  const created = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .limit(1)
    .all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/orders - update (only draft)
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, subject, date, deliveryDate, notes, userId, userName } = body;

  if (!id)
    return Response.json({ error: "ظ…ط¹ط±ظپ ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©") {
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ط£ظ…ط± ط´ط±ط§ط، ظپظٹ ط­ط§ظ„ط© ط­ط§ظ„ظٹط©" },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.update(purchaseOrders)
    .set({
      subject: subject?.trim() ?? existing.subject,
      date: date ?? existing.date,
      deliveryDate: deliveryDate ?? existing.deliveryDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(purchaseOrders.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط£ظ…ط± ط´ط±ط§ط،",
    id,
    `طھظ… طھط­ط¯ظٹط« ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  const updated = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/orders - only draft
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id)
    return Response.json({ error: "ظ…ط¹ط±ظپ ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط£ظ…ط± ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©") {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط£ظ…ط± ط´ط±ط§ط، ط؛ظٹط± ظ…ط³ظˆط¯ط©. ط£ظ„ط؛ظگظ‡ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  // Roll back linked request
  if (existing.requestId) {
    await db.update(purchaseRequests)
      .set({ status: "ظ…ط¹طھظ…ط¯", updatedAt: now() })
      .where(eq(purchaseRequests.id, existing.requestId))
      .run();
  }
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط£ظ…ط± ط´ط±ط§ط،",
    id,
    `طھظ… ط­ط°ظپ ط£ظ…ط± ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/orders")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
