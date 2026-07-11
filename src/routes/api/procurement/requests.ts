import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { purchaseRequests, purchaseOrders } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

export const REQUEST_STATUSES = [
  "ظ…ط³ظˆط¯ط©",
  "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©",
  "ظ…ط¹طھظ…ط¯",
  "ظ…ط±ظپظˆط¶",
  "ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،",
  "ظ…ظ„ط؛ظٹ",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["ط¹ط§ط¬ظ„", "ظ…طھظˆط³ط·ط©", "ظ…ظ†ط®ظپط¶ط©"] as const;

const TERMINAL_STATUSES: RequestStatus[] = ["ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،", "ظ…ظ„ط؛ظٹ"];

// GET /api/procurement/requests - list with search/filter
// GET /api/procurement/requests?id=xxx - single with conversion info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const req = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!req)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const orderCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.requestId, id))
        .all())[0]?.count || 0;

    return Response.json({ item: req, orderCount });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const department = url.searchParams.get("department") || "";

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(purchaseRequests.subject, `%${search}%`),
        like(purchaseRequests.department, `%${search}%`),
        like(purchaseRequests.requester, `%${search}%`),
        like(purchaseRequests.notes, `%${search}%`),
      ),
    );
  }
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(purchaseRequests.status, status));
  if (department && department !== "ط§ظ„ظƒظ„")
    conditions.push(eq(purchaseRequests.department, department));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db
        .select()
        .from(purchaseRequests)
        .where(whereClause)
        .orderBy(desc(purchaseRequests.createdAt))
        .all()
    : await db.select().from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/procurement/requests - create or workflow action
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "submit") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ظ…ط³ظˆط¯ط©")
      return Response.json({ error: "ظٹظ…ظƒظ† ط¥ط±ط³ط§ظ„ ط§ظ„ظ…ط³ظˆط¯ط© ظپظ‚ط·" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(purchaseRequests)
      .set({ status: "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    await addAudit(
      "ط¥ط±ط³ط§ظ„ ظ„ظ„ظ…ظˆط§ظپظ‚ط©",
      "ط·ظ„ط¨ ط´ط±ط§ط،",
      id,
      `طھظ… ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ظ„ظ„ظ…ظˆط§ظپظ‚ط©: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "approve") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©")
      return Response.json(
        { error: "ط§ظ„ط·ظ„ط¨ ظ„ظٹط³ ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(purchaseRequests)
      .set({ status: "ظ…ط¹طھظ…ط¯", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    await addAudit(
      "ط§ط¹طھظ…ط§ط¯",
      "ط·ظ„ط¨ ط´ط±ط§ط،",
      id,
      `طھظ… ط§ط¹طھظ…ط§ط¯ ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const { id, reason, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©")
      return Response.json(
        { error: "ط§ظ„ط·ظ„ط¨ ظ„ظٹط³ ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    const newNotes = reason
      ? `${existing.notes || ""}\n[ط±ظپط¶: ${reason}]`.trim()
      : existing.notes;
    await db.update(purchaseRequests)
      .set({ status: "ظ…ط±ظپظˆط¶", notes: newNotes, updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    await addAudit(
      "ط±ظپط¶",
      "ط·ظ„ط¨ ط´ط±ط§ط،",
      id,
      `طھظ… ط±ظپط¶ ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط،: ${existing.subject}${reason ? ` â€” ط§ظ„ط³ط¨ط¨: ${reason}` : ""}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "returnToDraft") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ط³ظˆط¯ط©")
      return Response.json({ error: "ط§ظ„ط·ظ„ط¨ ظ…ط³ظˆط¯ط© ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });
    if (TERMINAL_STATUSES.includes(existing.status as RequestStatus))
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ط±ط¬ط§ط¹ ط·ظ„ط¨ ظ…ط­ظˆظ‘ظ„ ط£ظˆ ظ…ظ„ط؛ظٹ ط¥ظ„ظ‰ ط§ظ„ظ…ط³ظˆط¯ط©" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(purchaseRequests)
      .set({ status: "ظ…ط³ظˆط¯ط©", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    await addAudit(
      "ط¥ط¹ط§ط¯ط© ظ„ظ…ط³ظˆط¯ط©",
      "ط·ظ„ط¨ ط´ط±ط§ط،",
      id,
      `طھظ… ط¥ط±ط¬ط§ط¹ ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ظ„ظ„ظ…ط³ظˆط¯ط©: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  if (action === "cancel") {
    const { id, userId, userName } = body;
    const existing = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    if (!existing)
      return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ظ„ط؛ظٹ")
      return Response.json({ error: "ط§ظ„ط·ظ„ط¨ ظ…ظ„ط؛ظٹ ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });
    if (existing.status === "ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ظ„ط؛ط§ط، ط·ظ„ط¨ ظ…ط­ظˆظ‘ظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،" },
        { status: 400 },
      );

    const before = JSON.stringify(existing);
    await db.update(purchaseRequests)
      .set({ status: "ظ…ظ„ط؛ظٹ", updatedAt: now() })
      .where(eq(purchaseRequests.id, id))
      .run();
    await addAudit(
      "ط¥ظ„ط؛ط§ط،",
      "ط·ظ„ط¨ ط´ط±ط§ط،",
      id,
      `طھظ… ط¥ظ„ط؛ط§ط، ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    subject,
    department,
    priority,
    requester,
    amount,
    deliveryDate,
    notes,
    userId,
    userName,
  } = body;
  if (!subject?.trim())
    return Response.json({ error: "ظ…ظˆط¶ظˆط¹ ط§ظ„ط·ظ„ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!department?.trim())
    return Response.json({ error: "ط§ظ„ظ‚ط³ظ… ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const reqId = genId("PR");
  const ts = now();

  await db.insert(purchaseRequests)
    .values({
      id: reqId,
      subject: subject.trim(),
      department: department.trim(),
      priority: priority || "ظ…طھظˆط³ط·ط©",
      status: "ظ…ط³ظˆط¯ط©",
      requester: requester || "",
      amount: parseFloat(amount) || 0,
      deliveryDate: deliveryDate || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط·ظ„ط¨ ط´ط±ط§ط،",
    reqId,
    `طھظ… ط¥ط¶ط§ظپط© ط·ظ„ط¨ ط´ط±ط§ط،: ${subject}`,
    userId,
    userName,
  );
  const created = (await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, reqId))
    .limit(1)
    .all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/procurement/requests - update (only for draft/rejected)
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const {
    id,
    subject,
    department,
    priority,
    requester,
    amount,
    deliveryDate,
    notes,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط·ظ„ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status !== "ظ…ط³ظˆط¯ط©" && existing.status !== "ظ…ط±ظپظˆط¶") {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ط·ظ„ط¨ ظپظٹ ط­ط§ظ„ط© ط­ط§ظ„ظٹط©. ط£ط¹ط¯ظ‡ ط¥ظ„ظ‰ ط§ظ„ظ…ط³ظˆط¯ط© ط£ظˆظ„ط§ظ‹.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.update(purchaseRequests)
    .set({
      subject: subject?.trim() ?? existing.subject,
      department: department?.trim() ?? existing.department,
      priority: priority ?? existing.priority,
      requester: requester ?? existing.requester,
      amount: amount !== undefined ? parseFloat(amount) : existing.amount,
      deliveryDate: deliveryDate ?? existing.deliveryDate,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(purchaseRequests.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط·ظ„ط¨ ط´ط±ط§ط،",
    id,
    `طھظ… طھط­ط¯ظٹط« ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  const updated = (await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/procurement/requests - only if draft/rejected/cancelled
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط·ظ„ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط، ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (existing.status === "ظ…ط¹طھظ…ط¯" || existing.status === "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©") {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط·ظ„ط¨ ظ…ط¹طھظ…ط¯ ط£ظˆ ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©. ط£ظ„ط؛ظگظ‡ ط£ظˆظ„ط§ظ‹.",
      },
      { status: 400 },
    );
  }
  if (existing.status === "ظ…ط­ظˆظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،") {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط·ظ„ط¨ ظ…ط­ظˆظ‘ظ„ ط¥ظ„ظ‰ ط£ظ…ط± ط´ط±ط§ط،. ظٹط­طھظپط¸ ط§ظ„ظ†ط¸ط§ظ… ط¨ظ‡ ظ„ظ„ط³ط¬ظ„ ط§ظ„طھط§ط±ظٹط®ظٹ.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(purchaseRequests).where(eq(purchaseRequests.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط·ظ„ط¨ ط´ط±ط§ط،",
    id,
    `طھظ… ط­ط°ظپ ط·ظ„ط¨ ط§ظ„ط´ط±ط§ط،: ${existing.subject}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/requests")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
