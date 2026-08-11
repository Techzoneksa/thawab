import { createFileRoute } from "@tanstack/react-router";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/server/db/index";
import { auditLog } from "@/server/db/schema";
import { authHandler, err, type Ctx } from "@/server/db/api-utils";

// GET /api/audit — list with filters and pagination.
// GET /api/audit?id=xxx — single audit entry with parsed before/after.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const entry = (await db.select().from(auditLog).where(eq(auditLog.id, id)).limit(1))[0];
    if (!entry) return err("السجل غير موجود", 404, "NOT_FOUND");

    // Parse before/after as JSON if possible
    let beforeParsed: unknown = null;
    let afterParsed: unknown = null;
    try {
      beforeParsed = entry.before ? JSON.parse(entry.before) : null;
    } catch {
      beforeParsed = entry.before;
    }
    try {
      afterParsed = entry.after ? JSON.parse(entry.after) : null;
    } catch {
      afterParsed = entry.after;
    }

    return Response.json({
      item: entry,
      before: beforeParsed,
      after: afterParsed,
    });
  }

  const search = url.searchParams.get("search") || "";
  const userName = url.searchParams.get("userName") || "";
  const action = url.searchParams.get("action") || "";
  const entityType = url.searchParams.get("entityType") || "";
  const entityId = url.searchParams.get("entityId") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(auditLog.userName, `%${search}%`),
        like(auditLog.action, `%${search}%`),
        like(auditLog.entityType, `%${search}%`),
        like(auditLog.entityId, `%${search}%`),
        like(auditLog.description, `%${search}%`),
      ),
    );
  }
  if (userName) conditions.push(eq(auditLog.userName, userName));
  if (action) conditions.push(eq(auditLog.action, action));
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  if (dateFrom) conditions.push(sql`${auditLog.timestamp} >= ${dateFrom}`);
  if (dateTo) conditions.push(sql`${auditLog.timestamp} <= ${dateTo}`);
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(auditLog).where(where);
  const items = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.timestamp))
    .limit(limit)
    .offset(offset);

  // Distinct filter options — derived without loading every row.
  const userRows = await db.selectDistinct({ v: auditLog.userName }).from(auditLog);
  const actionRows = await db.selectDistinct({ v: auditLog.action }).from(auditLog);
  const entityRows = await db.selectDistinct({ v: auditLog.entityType }).from(auditLog);

  const userOptions = userRows
    .map((r) => r.v)
    .filter((u): u is string => Boolean(u))
    .sort();
  const actionOptions = actionRows
    .map((r) => r.v)
    .filter((a): a is string => Boolean(a))
    .sort();
  const entityOptions = entityRows
    .map((r) => r.v)
    .filter((e): e is string => Boolean(e))
    .sort();

  return Response.json({
    items,
    total: Number(total),
    page,
    limit,
    options: {
      users: userOptions,
      actions: actionOptions,
      entities: entityOptions,
    },
  });
}

export const Route = createFileRoute("/api/audit")({
  server: {
    handlers: {
      GET: authHandler("audit.view", GET),
    },
  },
});
