import { db } from "@/server/db/index";
import { auditLog, users } from "@/server/db/schema";
import { eq, like, or, and, desc, sql, gte, lte } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

// GET /api/audit - list with filters and pagination
// GET /api/audit?id=xxx - single audit entry with before/after
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const entry = db.select().from(auditLog).where(eq(auditLog.id, id)).limit(1).all()[0];
    if (!entry) return Response.json({ error: "السجل غير موجود" }, { status: 404 });

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
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
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
  if (userName && userName !== "الكل") conditions.push(eq(auditLog.userName, userName));
  if (action && action !== "الكل") conditions.push(eq(auditLog.action, action));
  if (entityType && entityType !== "الكل") conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  if (dateFrom) {
    conditions.push(sql`${auditLog.timestamp} >= ${dateFrom}`);
  }
  if (dateTo) {
    conditions.push(sql`${auditLog.timestamp} <= ${dateTo}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(auditLog).$dynamic();
  const all = whereClause
    ? allQuery.where(whereClause).orderBy(desc(auditLog.timestamp)).all()
    : allQuery.orderBy(desc(auditLog.timestamp)).all();
  const total = all.length;

  const itemsQuery = db.select().from(auditLog).$dynamic();
  const items = whereClause
    ? itemsQuery
        .where(whereClause)
        .orderBy(desc(auditLog.timestamp))
        .limit(limit)
        .offset(offset)
        .all()
    : itemsQuery.orderBy(desc(auditLog.timestamp)).limit(limit).offset(offset).all();

  // Derive distinct options for filters
  const allEntries = db.select().from(auditLog).all();
  const userOptions = Array.from(
    new Set(allEntries.map((e) => e.userName).filter((u): u is string => Boolean(u))),
  ).sort();
  const actionOptions = Array.from(new Set(allEntries.map((e) => e.action))).sort();
  const entityOptions = Array.from(new Set(allEntries.map((e) => e.entityType))).sort();

  return Response.json({
    items,
    total,
    page,
    limit,
    options: {
      users: userOptions,
      actions: actionOptions,
      entities: entityOptions,
    },
  });
}
