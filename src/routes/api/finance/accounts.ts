import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db, now, genId, addAudit } from "@/server/db/index";
import { accounts, journalLines } from "@/server/db/schema";
import { eq, like, or, and, sql } from "drizzle-orm";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { AccountClassification, AccountStatus } from "@/lib/enums";
import { getAllAccountBalances, getAccountBalance } from "@/server/db/balances";

// GET /api/finance/accounts - list with search/filter
// GET /api/finance/accounts?id=xxx - single account with usage info
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const account = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0];
    if (!account) return err("الحساب غير موجود", 404, "NOT_FOUND");

    // Count lines that use this account
    const lineCount =
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(journalLines)
          .where(eq(journalLines.accountId, id))
      )[0]?.count || 0;

    // Count child accounts
    const childCount =
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(accounts)
          .where(eq(accounts.parentId, id))
      )[0]?.count || 0;

    // Balance is ALWAYS derived from the General Ledger (posted, non-reversed
    // lines), never the stored accounts.balance field.
    const gl = await getAccountBalance(db, id);
    return Response.json({
      item: { ...account, balance: gl.closing },
      glBalance: gl,
      lineCount: Number(lineCount),
      childCount: Number(childCount),
      hasTransactions: Number(lineCount) > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const classification = url.searchParams.get("classification") || "";
  const status = url.searchParams.get("status") || "";

  const conditions = [];
  if (search) {
    conditions.push(or(like(accounts.code, `%${search}%`), like(accounts.name, `%${search}%`)));
  }
  if (classification) conditions.push(eq(accounts.classification, classification));
  if (status) conditions.push(eq(accounts.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select().from(accounts).where(whereClause).orderBy(accounts.code);

  // Overlay the real GL balance on every account (single source of truth).
  const balances = await getAllAccountBalances(db);
  const withBalances = items.map((a) => ({ ...a, balance: balances.get(a.id)?.balance ?? 0 }));
  const total = withBalances.length;

  return Response.json({ items: withBalances, total });
}

const createSchema = z.object({
  code: z.string().trim().min(1, "رقم الحساب مطلوب"),
  name: z.string().trim().min(1, "اسم الحساب مطلوب"),
  classification: z.nativeEnum(AccountClassification),
  parentId: z.string().nullish(),
  systemKey: z.string().nullish(),
  currency: z.string().optional(),
  balance: z.coerce.number().optional(),
  postable: z.boolean().optional(),
  status: z.nativeEnum(AccountStatus).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/finance/accounts - create
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);

    const existing = (
      await db.select().from(accounts).where(eq(accounts.code, b.code)).limit(1)
    )[0];
    if (existing) return err("رقم الحساب مستخدم بالفعل", 400, "DUPLICATE_CODE");

    const accId = genId("ACC");
    const ts = now();

    // Derive level from parent
    let level = 1;
    if (b.parentId) {
      const parent = (
        await db.select().from(accounts).where(eq(accounts.id, b.parentId)).limit(1)
      )[0];
      if (parent) level = (parent.level || 1) + 1;
    }

    await db.insert(accounts).values({
      id: accId,
      code: b.code,
      name: b.name,
      classification: b.classification,
      level,
      parentId: b.parentId || null,
      systemKey: b.systemKey || null,
      currency: b.currency || "SAR",
      // Legacy column kept at 0 — real balance comes from the GL. Opening
      // balances must be entered via the opening-balance journal, not here.
      balance: 0,
      postable: b.postable ?? true,
      status: b.status ?? AccountStatus.ACTIVE,
      description: b.description ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "account",
      entityId: accId,
      description: `تم إضافة حساب: ${b.code} - ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(accounts).where(eq(accounts.id, accId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الحساب مطلوب"),
  name: z.string().trim().min(1).optional(),
  classification: z.nativeEnum(AccountClassification).optional(),
  parentId: z.string().nullish(),
  systemKey: z.string().nullish(),
  currency: z.string().optional(),
  balance: z.coerce.number().optional(),
  postable: z.boolean().optional(),
  status: z.nativeEnum(AccountStatus).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/finance/accounts - update
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);

    const existing = (await db.select().from(accounts).where(eq(accounts.id, b.id)).limit(1))[0];
    if (!existing) return err("الحساب غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(accounts)
      .set({
        name: b.name ?? existing.name,
        classification: b.classification ?? existing.classification,
        parentId: b.parentId === undefined ? existing.parentId : b.parentId || null,
        systemKey: b.systemKey === undefined ? existing.systemKey : b.systemKey || null,
        currency: b.currency ?? existing.currency,
        // accounts.balance is no longer an accounting source of truth — never
        // written from user input; GL is authoritative.
        postable: b.postable ?? existing.postable,
        status: b.status ?? existing.status,
        description: b.description ?? existing.description,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(accounts.id, b.id));

    await addAudit({
      action: "update",
      entityType: "account",
      entityId: b.id,
      description: `تم تحديث الحساب: ${existing.code} - ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(accounts).where(eq(accounts.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/finance/accounts?id=xxx - only if no transactions and no children.
// Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الحساب مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0];
  if (!existing) return err("الحساب غير موجود", 404, "NOT_FOUND");

  // Check children
  const children = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(accounts)
        .where(eq(accounts.parentId, id))
    )[0]?.count || 0,
  );
  if (children > 0) {
    return err(
      `لا يمكن حذف حساب له ${children} حساب فرعي. احذف الفروع أولاً أو أوقف الحساب.`,
      400,
      "HAS_CHILDREN",
    );
  }

  // Check usage in journal lines
  const usage = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(journalLines)
        .where(eq(journalLines.accountId, id))
    )[0]?.count || 0,
  );
  if (usage > 0) {
    return err(
      `لا يمكن حذف حساب مستخدم في ${usage} سطر قيد. أوقف الحساب بدلاً من ذلك.`,
      400,
      "HAS_TRANSACTIONS",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(accounts).where(eq(accounts.id, id));
  await addAudit({
    action: "delete",
    entityType: "account",
    entityId: id,
    description: `تم حذف الحساب: ${existing.code} - ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/finance/accounts")({
  server: {
    handlers: {
      GET: authHandler("finance.view", GET),
      POST: authHandler("finance.create", POST),
      PUT: authHandler("finance.update", PUT),
      DELETE: authHandler("finance.delete", DELETE),
    },
  },
});
