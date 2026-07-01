import { db, now, genId, addAudit } from "@/server/db/index";
import { accounts, journalLines } from "@/server/db/schema";
import { eq, like, or, and, desc, ne, isNull, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const ACCOUNT_TYPES = [
  "أصل",
  "التزام",
  "حقوق ملكية",
  "إيراد",
  "مصروف",
  "رئيسي",
  "تفصيلي",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ["نشط", "موقوف", "مغلق"] as const;

// GET /api/finance/accounts - list with search/filter
// GET /api/finance/accounts?id=xxx - single account with usage info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const account = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
    if (!account) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });

    // Count lines that use this account
    const lineCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(journalLines)
        .where(eq(journalLines.accountId, id))
        .all()[0]?.count || 0;

    // Count child accounts
    const childCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(accounts)
        .where(eq(accounts.parentId, id))
        .all()[0]?.count || 0;

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
  if (type && type !== "الكل") conditions.push(eq(accounts.type, type));
  if (status && status !== "الكل") conditions.push(eq(accounts.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(accounts).where(whereClause).orderBy(accounts.code).all()
    : db.select().from(accounts).orderBy(accounts.code).all();
  const total = items.length;

  return Response.json({ items, total });
}

// POST /api/finance/accounts - create or deactivate
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "deactivate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
    if (existing.status === "مغلق")
      return Response.json({ error: "الحساب مغلق بالفعل" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(accounts).set({ status: "موقوف", updatedAt: now() }).where(eq(accounts.id, id)).run();
    addAudit(
      "إيقاف",
      "حساب",
      id,
      `تم إيقاف الحساب: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "activate") {
    const { id, userId, userName } = body;
    const existing = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });
    if (existing.status === "نشط")
      return Response.json({ error: "الحساب نشط بالفعل" }, { status: 400 });

    const before = JSON.stringify(existing);
    db.update(accounts).set({ status: "نشط", updatedAt: now() }).where(eq(accounts.id, id)).run();
    addAudit(
      "تفعيل",
      "حساب",
      id,
      `تم تفعيل الحساب: ${existing.code} - ${existing.name}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
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

  if (!code?.trim()) return Response.json({ error: "رقم الحساب مطلوب" }, { status: 400 });
  if (!name?.trim()) return Response.json({ error: "اسم الحساب مطلوب" }, { status: 400 });

  const existing = db
    .select()
    .from(accounts)
    .where(eq(accounts.code, code.trim()))
    .limit(1)
    .all()[0];
  if (existing) return Response.json({ error: "رقم الحساب مستخدم بالفعل" }, { status: 400 });

  const accId = genId("ACC");
  const ts = now();

  // Derive level from parent
  let level = 1;
  if (parentId) {
    const parent = db.select().from(accounts).where(eq(accounts.id, parentId)).limit(1).all()[0];
    if (parent) {
      level = (parent.level || 1) + 1;
    }
  }

  db.insert(accounts)
    .values({
      id: accId,
      code: code.trim(),
      name: name.trim(),
      type: type || "تفصيلي",
      level,
      parentId: parentId || null,
      currency: currency || "SAR",
      balance: parseFloat(balance) || 0,
      postable: postable !== false,
      status: status || "نشط",
      description: description || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit("إضافة", "حساب", accId, `تم إضافة حساب: ${code} - ${name}`, userId, userName);
  const created = db.select().from(accounts).where(eq(accounts.id, accId)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/finance/accounts - update
export async function PUT({ request }: APIEvent) {
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

  if (!id) return Response.json({ error: "معرف الحساب مطلوب" }, { status: 400 });

  const existing = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });

  const before = JSON.stringify(existing);
  const ts = now();

  db.update(accounts)
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

  addAudit(
    "تعديل",
    "حساب",
    id,
    `تم تحديث الحساب: ${existing.code} - ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/finance/accounts - only if no transactions and no children
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الحساب مطلوب" }, { status: 400 });

  const existing = db.select().from(accounts).where(eq(accounts.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الحساب غير موجود" }, { status: 404 });

  // Check children
  const children =
    db
      .select({ count: sql<number>`count(*)` })
      .from(accounts)
      .where(eq(accounts.parentId, id))
      .all()[0]?.count || 0;
  if (children > 0) {
    return Response.json(
      {
        error: `لا يمكن حذف حساب له ${children} حساب فرعي. احذف الفروع أولاً أو أوقف الحساب.`,
      },
      { status: 400 },
    );
  }

  // Check usage in journal lines
  const usage =
    db
      .select({ count: sql<number>`count(*)` })
      .from(journalLines)
      .where(eq(journalLines.accountId, id))
      .all()[0]?.count || 0;
  if (usage > 0) {
    return Response.json(
      {
        error: `لا يمكن حذف حساب مستخدم في ${usage} سطر قيد. أوقف الحساب بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(accounts).where(eq(accounts.id, id)).run();
  addAudit(
    "حذف",
    "حساب",
    id,
    `تم حذف الحساب: ${existing.code} - ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}
