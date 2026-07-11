import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donors } from "@/server/db/schema";
import { eq, like, or, and, desc } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

// GET /api/donors - List with search, filters, pagination
// GET /api/donors?id=xxx - Single donor by ID
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const donor = (await db.select().from(donors).where(eq(donors.id, id)).limit(1).all())[0];
    if (!donor) {
      return Response.json({ error: "ط§ظ„ظ…طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    }
    return Response.json({ item: donor });
  }

  const search = url.searchParams.get("search") || "";
  const type = url.searchParams.get("type") || "";
  const tag = url.searchParams.get("tag") || "";
  const city = url.searchParams.get("city") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(donors.name, `%${search}%`),
        like(donors.phone, `%${search}%`),
        like(donors.email, `%${search}%`),
      ),
    );
  }

  if (type && type !== "ط§ظ„ظƒظ„") {
    conditions.push(eq(donors.type, type));
  }

  if (tag && tag !== "ط§ظ„ظƒظ„") {
    conditions.push(eq(donors.tag, tag));
  }

  if (city && city !== "ط§ظ„ظƒظ„") {
    conditions.push(eq(donors.city, city));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(donors);
  const all = whereClause
    ? await allQuery.where(whereClause).orderBy(desc(donors.createdAt)).all()
    : await allQuery.orderBy(desc(donors.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(donors);
  const items = whereClause
    ? await itemsQuery
        .where(whereClause)
        .orderBy(desc(donors.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : await itemsQuery.orderBy(desc(donors.createdAt)).limit(limit).offset(offset).all();

  return Response.json({ items, total, page, limit });
}

// POST /api/donors - Create new donor
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { name, type, email, phone, city, address, tag, notes, userId, userName } = body;

  if (!name?.trim()) {
    return Response.json({ error: "ط§ظ„ط§ط³ظ… ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const id = genId("D");
  const ts = now();

  await db.insert(donors)
    .values({
      id,
      name: name.trim(),
      type: type || "ظپط±ط¯",
      email: email || null,
      phone: phone || null,
      city: city || "",
      address: address || "",
      tag: tag || "ط¨ط±ظˆظ†ط²ظٹ",
      totalDonations: 0,
      donationCount: 0,
      recurring: false,
      notes: notes || "",
      status: "ظ†ط´ط·",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…طھط¨ط±ط¹",
    id,
    `طھظ… ط¥ط¶ط§ظپط© ظ…طھط¨ط±ط¹ ط¬ط¯ظٹط¯: ${name}`,
    userId,
    userName,
  );

  const created = (await db.select().from(donors).where(eq(donors.id, id)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/donors - Update donor
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, name, type, email, phone, city, address, tag, notes, userId, userName } = body;

  if (!id) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…طھط¨ط±ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const existing = (await db.select().from(donors).where(eq(donors.id, id)).limit(1).all())[0];
  if (!existing) {
    return Response.json({ error: "ط§ظ„ظ…طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(donors)
    .set({
      name: name?.trim() ?? existing.name,
      type: type ?? existing.type,
      email: email ?? existing.email,
      phone: phone ?? existing.phone,
      city: city ?? existing.city,
      address: address ?? existing.address,
      tag: tag ?? existing.tag,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(donors.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…طھط¨ط±ط¹",
    id,
    `طھظ… طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…طھط¨ط±ط¹: ${name || existing.name}`,
    userId,
    userName,
    before,
  );

  const updated = (await db.select().from(donors).where(eq(donors.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/donors - Soft delete donor
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…طھط¨ط±ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const existing = (await db.select().from(donors).where(eq(donors.id, id)).limit(1).all())[0];
  if (!existing) {
    return Response.json({ error: "ط§ظ„ظ…طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  await db.update(donors)
    .set({ status: "ط؛ظٹط± ظ†ط´ط·", updatedAt: now() })
    .where(eq(donors.id, id))
    .run();

  await addAudit(
    "ط­ط°ظپ",
    "ظ…طھط¨ط±ط¹",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…طھط¨ط±ط¹: ${existing.name}`,
    userId,
    userName,
  );

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/donors")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
