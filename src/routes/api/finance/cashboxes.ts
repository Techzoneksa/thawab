import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { cashboxes, accounts } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { getAllAccountBalances } from "@/server/db/balances";
import {
  validateLinkedAccount,
  assertMappingAvailable,
  assertMappingChangeAllowed,
  acquireMappingLock,
  accountHasPostedHistory,
  linkedAccountBalance,
  accountLedger,
} from "@/server/db/cash-bank";
import { AccountStatus } from "@/lib/enums";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { AppError } from "@/server/db/errors";

async function require(ctx: Ctx, perm: string): Promise<Response | null> {
  return (await hasPermission(ctx.user.role, perm))
    ? null
    : err("لا تملك صلاحية لهذا الإجراء", 403, "FORBIDDEN");
}
/** Ledger drill-down authority: the dedicated cash/bank ledger permission OR an
 *  intentionally-granted broader GL read (finance.view / finance.reports.view). */
async function canViewLedger(ctx: Ctx): Promise<boolean> {
  return (
    (await hasPermission(ctx.user.role, P.cashBankLedgerView)) ||
    (await hasPermission(ctx.user.role, "finance.view")) ||
    (await hasPermission(ctx.user.role, P.reportsView))
  );
}

async function acctInfo(id: string) {
  const a = (await db.select().from(accounts).where(eq(accounts.id, id)).limit(1))[0];
  return a ? { id: a.id, code: a.code, name: a.name, currency: a.currency } : null;
}

// GET — list, or ?id= detail (+ optional ?asOf=/?dateFrom=&dateTo= balance).
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const item = (await db.select().from(cashboxes).where(eq(cashboxes.id, id)).limit(1))[0];
    if (!item) return err("الصندوق غير موجود", 404, "NOT_FOUND");
    // Ledger drill-down — gated by the dedicated cash/bank ledger permission.
    if (url.searchParams.get("ledger") === "1") {
      if (!(await canViewLedger(_ctx)))
        return err("لا تملك صلاحية عرض حركة النقد والبنوك", 403, "FORBIDDEN");
      const ledger = await accountLedger(db, item.linkedAccountId, {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
      });
      return Response.json({
        item: { id: item.id, code: item.code, linkedAccountId: item.linkedAccountId },
        ...ledger,
      });
    }
    const balance = await linkedAccountBalance(db, item.linkedAccountId, {
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      asOf: url.searchParams.get("asOf") || undefined,
    });
    return Response.json({
      item,
      linkedAccount: await acctInfo(item.linkedAccountId),
      balance,
      historyLocked: await accountHasPostedHistory(db, item.linkedAccountId),
    });
  }
  const includeInactive = url.searchParams.get("all") === "1";
  const rows = await db
    .select()
    .from(cashboxes)
    .where(includeInactive ? undefined : eq(cashboxes.status, AccountStatus.ACTIVE))
    .orderBy(desc(cashboxes.createdAt));
  const bal = await getAllAccountBalances(db);
  const items = rows.map((c) => ({ ...c, glBalance: bal.get(c.linkedAccountId)?.balance ?? 0 }));
  return Response.json({
    items,
    summary: {
      activeCount: rows.filter((c) => c.status === AccountStatus.ACTIVE).length,
      totalBalance: items
        .filter((c) => c.status === AccountStatus.ACTIVE)
        .reduce((s, c) => s + c.glBalance, 0),
    },
  });
}

const createSchema = z.object({
  code: z.string().trim().min(1, "الرمز مطلوب"),
  name: z.string().trim().min(1, "الاسم مطلوب"),
  linkedAccountId: z.string().min(1, "الحساب المرتبط مطلوب"),
  currency: z.string().trim().optional(),
  branchId: z.string().nullish(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body?.action === "deactivate" || body?.action === "reactivate") {
      const denied = await require(ctx, P.cashDeactivate);
      if (denied) return denied;
      const id = String(body.id || "");
      const cb = (await db.select().from(cashboxes).where(eq(cashboxes.id, id)).limit(1))[0];
      if (!cb) return err("الصندوق غير موجود", 404, "NOT_FOUND");
      const status = body.action === "deactivate" ? AccountStatus.INACTIVE : AccountStatus.ACTIVE;
      await db.update(cashboxes).set({ status, updatedAt: now() }).where(eq(cashboxes.id, id));
      await addAudit({
        action: body.action === "deactivate" ? "CASHBOX_DEACTIVATED" : "CASHBOX_REACTIVATED",
        entityType: "cashbox",
        entityId: id,
        description: `${body.action === "deactivate" ? "تعطيل" : "تفعيل"} الصندوق ${cb.code}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before: JSON.stringify({ status: cb.status }),
        ip: ctx.ip,
      });
      return Response.json({ item: { ...cb, status } });
    }

    // create
    const denied = await require(ctx, P.cashCreate);
    if (denied) return denied;
    const b = createSchema.parse(body);

    const id = genId("CB");
    const ts = now();
    let currency = "SAR";
    let accCode = "";
    try {
      // Serialize the whole check-and-insert for this GL account (advisory lock)
      // so a concurrent cashbox+bank on the same account cannot both succeed.
      await db.transaction(async (tx) => {
        await acquireMappingLock(tx, b.linkedAccountId);
        const acc = await validateLinkedAccount(tx as any, b.linkedAccountId);
        await assertMappingAvailable(tx as any, b.linkedAccountId);
        currency = (b.currency || acc.currency || "SAR").toUpperCase();
        if (acc.currency && currency !== acc.currency)
          throw new AppError(
            "عملة الصندوق يجب أن تطابق عملة الحساب المرتبط",
            400,
            "CURRENCY_MISMATCH",
          );
        accCode = acc.code;
        await tx.insert(cashboxes).values({
          id,
          code: b.code,
          name: b.name,
          linkedAccountId: b.linkedAccountId,
          currency,
          status: AccountStatus.ACTIVE,
          branchId: b.branchId ?? null,
          notes: b.notes ?? "",
          createdBy: ctx.user.id,
          createdAt: ts,
          updatedAt: ts,
        });
      });
    } catch (e: any) {
      if (e?.code && e?.status) return err(e.message, e.status, e.code);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cashboxes_code"))
        return err("رمز الصندوق مستخدم بالفعل", 409, "DUPLICATE_CODE");
      if (msg.includes("linked_account"))
        return err("هذا الحساب مرتبط بصندوق آخر", 409, "ACCOUNT_ALREADY_MAPPED");
      throw e;
    }
    const rec = {
      id,
      code: b.code,
      name: b.name,
      linkedAccountId: b.linkedAccountId,
      currency,
      status: AccountStatus.ACTIVE,
      branchId: b.branchId ?? null,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    };
    await addAudit({
      action: "CASHBOX_CREATED",
      entityType: "cashbox",
      entityId: id,
      description: `إنشاء صندوق ${b.code} — ${b.name} (حساب ${accCode})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return Response.json({ item: rec }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  linkedAccountId: z.string().min(1).optional(),
  currency: z.string().trim().optional(),
  branchId: z.string().nullish(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const cb = (await db.select().from(cashboxes).where(eq(cashboxes.id, b.id)).limit(1))[0];
    if (!cb) return err("الصندوق غير موجود", 404, "NOT_FOUND");
    const before = JSON.stringify(cb);

    const set: Record<string, unknown> = { updatedAt: now() };
    if (b.code !== undefined) set.code = b.code;
    if (b.name !== undefined) set.name = b.name;
    if (b.branchId !== undefined) set.branchId = b.branchId;
    if (b.notes !== undefined) set.notes = b.notes;
    const changingMap = !!b.linkedAccountId && b.linkedAccountId !== cb.linkedAccountId;
    if (!changingMap && b.currency !== undefined) set.currency = b.currency.toUpperCase();

    try {
      await db.transaction(async (tx) => {
        // Mapping change — advisory-locked + immutable once posted history exists.
        if (changingMap) {
          await acquireMappingLock(tx, b.linkedAccountId!);
          await assertMappingChangeAllowed(tx as any, cb.linkedAccountId);
          const acc = await validateLinkedAccount(tx as any, b.linkedAccountId!);
          await assertMappingAvailable(tx as any, b.linkedAccountId!, { cashboxId: cb.id });
          const currency = (b.currency || cb.currency).toUpperCase();
          if (acc.currency && currency !== acc.currency)
            throw new AppError(
              "عملة الصندوق يجب أن تطابق عملة الحساب المرتبط",
              400,
              "CURRENCY_MISMATCH",
            );
          set.linkedAccountId = b.linkedAccountId;
          set.currency = currency;
        }
        await tx.update(cashboxes).set(set).where(eq(cashboxes.id, b.id));
      });
    } catch (e: any) {
      if (e?.code && e?.status) return err(e.message, e.status, e.code);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cashboxes_code"))
        return err("رمز الصندوق مستخدم بالفعل", 409, "DUPLICATE_CODE");
      throw e;
    }
    await addAudit({
      action: "CASHBOX_UPDATED",
      entityType: "cashbox",
      entityId: b.id,
      description: `تعديل الصندوق ${cb.code}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });
    const updated = (await db.select().from(cashboxes).where(eq(cashboxes.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

export const Route = createFileRoute("/api/finance/cashboxes")({
  server: {
    handlers: {
      GET: authHandler(P.cashView, GET),
      POST: authHandler(P.cashView, POST), // create/deactivate perms checked inside
      PUT: authHandler(P.cashUpdate, PUT),
    },
  },
});
