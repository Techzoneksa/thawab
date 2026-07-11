import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { accounts, journalLines } from "@/server/db/schema";
import { eq, like, or, and, desc, ne, isNull, sql } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

export const ACCOUNT_TYPES = [
  "ط£طµظ„",
  "ط§ظ„طھط²ط§ظ…",
  "ط­ظ‚ظˆظ‚ ظ…ظ„ظƒظٹط©",
  "ط¥ظٹط±ط§ط¯",
  "ظ…طµط±ظˆظپ",
  "ط±ط¦ظٹط³ظٹ",
  "طھظپطµظٹظ„ظٹ",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ["ظ†ط´ط·", "ظ…ظˆظ‚ظˆظپ", "ظ…ط؛ظ„ظ‚"] as const;

// GET /api/finance/accounts - list with search/filter
// GET /api/finance/accounts?id=xxx - single account with usage info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const account = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
    if (!account)
      return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Count lines that use this account
    const lineCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(journalLines)
        .where(eq(journalLines.accountId, id))
        .all())[0]?.count || 0;

    // Count child accounts
    const childCount =
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(accounts)
        .where(eq(accounts.parentId, id))
        .all())[0]?.count || 0;

    return Response.json({
      item: account,
      lineCount,
      childCount,
      hasTransactions: lineCount > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const type = url.searchParams.get("type") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(or(like(accounts.code, `%${search}%`), like(accounts.name, `%${search}%`)));
  }
  if (type && type !== "ط§ظ„ظƒظ„") conditions.push(eq(accounts.type, type));
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(accounts.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? await db.select().from(accounts).where(whereClause).orderBy(accounts.code).all()
    : await db.select().from(accounts).orderBy(accounts.code).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/accounts - create or deactivate
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ…ط؛ظ„ظ‚")
      return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ظ…ط؛ظ„ظ‚ ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(accounts)
      .set({ status: "ظ…ظˆظ‚ظˆظپ", updatedAt: now() })
      .where(eq(accounts.id, id))
      .run();
    await addAudit(
      "ط¥ظٹظ‚ط§ظپ",
      "ط­ط³ط§ط¨",
      id,
      `طھظ… ط¥ظٹظ‚ط§ظپ ط§ظ„ط­ط³ط§ط¨: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "activate") {
    const { id, userId, userName } = body;
    const existing = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
    if (!existing)
      return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status === "ظ†ط´ط·")
      return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ظ†ط´ط· ط¨ط§ظ„ظپط¹ظ„" }, { status: 400 });

    const before = JSON.stringify(existing);
    await db.update(accounts)
      .set({ status: "ظ†ط´ط·", updatedAt: now() })
      .where(eq(accounts.id, id))
      .run();
    await addAudit(
      "طھظپط¹ظٹظ„",
      "ط­ط³ط§ط¨",
      id,
      `طھظ… طھظپط¹ظٹظ„ ط§ظ„ط­ط³ط§ط¨: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    code,
    name,
    type,
    parentId,
    currency,
    balance,
    postable,
    status,
    description,
    notes,
    userId,
    userName,
  } = body;

  if (!code?.trim())
    return Response.json({ error: "ط±ظ‚ظ… ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(accounts)
    .where(eq(accounts.code, code.trim()))
    .limit(1)
    .all())[0];
  if (existing)
    return Response.json(
      { error: "ط±ظ‚ظ… ط§ظ„ط­ط³ط§ط¨ ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ظپط¹ظ„" },
      { status: 400 },
    );

  const accId = genId("ACC");
  const ts = now();

  // Derive level from parent
  let level = 1;
  if (parentId) {
    const parent = (await db.select().from(accounts).where(eq(accounts.id, parentId)).limit(1).all())[0];
    if (parent) {
      level = (parent.level || 1) + 1;
    }
  }

  await db.insert(accounts)
    .values({
      id: accId,
      code: code.trim(),
      name: name.trim(),
      type: type || "طھظپطµظٹظ„ظٹ",
      level,
      parentId: parentId || null,
      currency: currency || "SAR",
      balance: parseFloat(balance) || 0,
      postable: postable !== false,
      status: status || "ظ†ط´ط·",
      description: description || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط­ط³ط§ط¨",
    accId,
    `طھظ… ط¥ط¶ط§ظپط© ط­ط³ط§ط¨: ${code} - ${name}`,
    userId,
    userName,
  );
  const created = (await db.select().from(accounts).where(eq(accounts.id, accId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/accounts - update
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const {
    id,
    name,
    type,
    parentId,
    currency,
    balance,
    postable,
    status,
    description,
    notes,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(accounts)
    .set({
      name: name?.trim() ?? existing.name,
      type: type ?? existing.type,
      parentId: parentId ?? existing.parentId,
      currency: currency ?? existing.currency,
      balance: balance !== undefined ? parseFloat(balance) : existing.balance,
      postable: postable !== undefined ? postable : existing.postable,
      status: status ?? existing.status,
      description: description ?? existing.description,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(accounts.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط­ط³ط§ط¨",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ط­ط³ط§ط¨: ${existing.code} - ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/accounts - only if no transactions and no children
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط­ط³ط§ط¨ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // Check children
  const children =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(accounts)
      .where(eq(accounts.parentId, id))
      .all())[0]?.count || 0;
  if (children > 0) {
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط­ط³ط§ط¨ ظ„ظ‡ ${children} ط­ط³ط§ط¨ ظپط±ط¹ظٹ. ط§ط­ط°ظپ ط§ظ„ظپط±ظˆط¹ ط£ظˆظ„ط§ظ‹ ط£ظˆ ط£ظˆظ‚ظپ ط§ظ„ط­ط³ط§ط¨.`,
      },
      { status: 400 },
    );
  }

  // Check usage in journal lines
  const usage =
    (await db
      .select({ count: sql<number>`count(*)` })
      .from(journalLines)
      .where(eq(journalLines.accountId, id))
      .all())[0]?.count || 0;
  if (usage > 0) {
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط­ط³ط§ط¨ ظ…ط³طھط®ط¯ظ… ظپظٹ ${usage} ط³ط·ط± ظ‚ظٹط¯. ط£ظˆظ‚ظپ ط§ظ„ط­ط³ط§ط¨ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(accounts).where(eq(accounts.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط­ط³ط§ط¨",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ط­ط³ط§ط¨: ${existing.code} - ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/accounts")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
