import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { bankAccounts, accounts } from "@/server/db/schema";
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
import { normalizeIban, isValidSaudiIban, maskIban } from "@/lib/iban";

async function require(ctx: Ctx, perm: string): Promise<Response | null> {
  return (await hasPermission(ctx.user.role, perm))
    ? null
    : err("لا تملك صلاحية لهذا الإجراء", 403, "FORBIDDEN");
}
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
/** Masked list/detail projection — never leaks the full IBAN/account number. */
function maskedRow(b: any) {
  const { iban, ibanNormalized, accountNumber, ...safe } = b;
  return {
    ...safe,
    ibanMasked: maskIban(ibanNormalized || iban),
    accountNumberMasked: accountNumber ? `****${String(accountNumber).slice(-4)}` : null,
  };
}

// GET — list (masked) or ?id= detail (masked; full IBAN only with bank.view+full=1).
async function GET({ request }: { request: Request }, ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const item = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1))[0];
    if (!item) return err("الحساب البنكي غير موجود", 404, "NOT_FOUND");
    // Ledger drill-down — gated by the dedicated cash/bank ledger permission.
    if (url.searchParams.get("ledger") === "1") {
      if (!(await canViewLedger(ctx)))
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
    // Sensitive full identifiers (full IBAN / account number) require the
    // DEDICATED sensitive permission — bank.view alone always gets masked.
    const projected: any = maskedRow(item);
    if (url.searchParams.get("full") === "1") {
      if (!(await hasPermission(ctx.user.role, P.bankSensitiveView)))
        return err("لا تملك صلاحية عرض البيانات البنكية الحسّاسة", 403, "FORBIDDEN");
      projected.iban = item.iban;
      projected.accountNumber = item.accountNumber;
    }
    return Response.json({
      item: projected,
      linkedAccount: await acctInfo(item.linkedAccountId),
      balance,
      historyLocked: await accountHasPostedHistory(db, item.linkedAccountId),
    });
  }
  const includeInactive = url.searchParams.get("all") === "1";
  const rows = await db
    .select()
    .from(bankAccounts)
    .where(includeInactive ? undefined : eq(bankAccounts.status, AccountStatus.ACTIVE))
    .orderBy(desc(bankAccounts.createdAt));
  const bal = await getAllAccountBalances(db);
  const items = rows.map((b) => ({
    ...maskedRow(b),
    glBalance: bal.get(b.linkedAccountId)?.balance ?? 0,
  }));
  return Response.json({
    items,
    summary: {
      activeCount: rows.filter((b) => b.status === AccountStatus.ACTIVE).length,
      totalBalance: rows
        .filter((b) => b.status === AccountStatus.ACTIVE)
        .reduce((s, b) => s + (bal.get(b.linkedAccountId)?.balance ?? 0), 0),
    },
  });
}

const createSchema = z.object({
  code: z.string().trim().min(1, "الرمز مطلوب"),
  bankName: z.string().trim().min(1, "اسم البنك مطلوب"),
  accountName: z.string().trim().optional(),
  accountNumber: z.string().trim().nullish(),
  iban: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  linkedAccountId: z.string().min(1, "الحساب المرتبط مطلوب"),
  branchId: z.string().nullish(),
  notes: z.string().optional(),
});

/** Validate + normalize an optional IBAN. Returns {iban, ibanNormalized} or a Response error. */
function resolveIban(
  raw: string | undefined,
): { iban: string | null; ibanNormalized: string | null } | Response {
  if (!raw || !raw.trim()) return { iban: null, ibanNormalized: null };
  const norm = normalizeIban(raw);
  if (!isValidSaudiIban(norm)) return err("رقم الآيبان (IBAN) غير صالح", 400, "INVALID_IBAN");
  return { iban: norm, ibanNormalized: norm };
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body?.action === "deactivate" || body?.action === "reactivate") {
      const denied = await require(ctx, P.bankDeactivate);
      if (denied) return denied;
      const id = String(body.id || "");
      const ba = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1))[0];
      if (!ba) return err("الحساب البنكي غير موجود", 404, "NOT_FOUND");
      const status = body.action === "deactivate" ? AccountStatus.INACTIVE : AccountStatus.ACTIVE;
      await db
        .update(bankAccounts)
        .set({ status, updatedAt: now() })
        .where(eq(bankAccounts.id, id));
      await addAudit({
        action:
          body.action === "deactivate" ? "BANK_ACCOUNT_DEACTIVATED" : "BANK_ACCOUNT_REACTIVATED",
        entityType: "bank_account",
        entityId: id,
        description: `${body.action === "deactivate" ? "تعطيل" : "تفعيل"} الحساب البنكي ${ba.code}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before: JSON.stringify({ status: ba.status }),
        ip: ctx.ip,
      });
      return Response.json({ item: maskedRow({ ...ba, status }) });
    }

    const denied = await require(ctx, P.bankCreate);
    if (denied) return denied;
    const b = createSchema.parse(body);
    const ibanRes = resolveIban(b.iban);
    if (ibanRes instanceof Response) return ibanRes;

    const id = genId("BA");
    const ts = now();
    let currency = "SAR";
    const rec: any = {
      id,
      code: b.code,
      bankName: b.bankName,
      accountName: b.accountName ?? "",
      accountNumber: b.accountNumber ?? null,
      iban: ibanRes.iban,
      ibanNormalized: ibanRes.ibanNormalized,
      currency,
      linkedAccountId: b.linkedAccountId,
      status: AccountStatus.ACTIVE,
      branchId: b.branchId ?? null,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    };
    try {
      await db.transaction(async (tx) => {
        await acquireMappingLock(tx, b.linkedAccountId);
        const acc = await validateLinkedAccount(tx as any, b.linkedAccountId);
        await assertMappingAvailable(tx as any, b.linkedAccountId);
        currency = (b.currency || acc.currency || "SAR").toUpperCase();
        if (acc.currency && currency !== acc.currency)
          throw new AppError(
            "عملة الحساب البنكي يجب أن تطابق عملة الحساب المرتبط",
            400,
            "CURRENCY_MISMATCH",
          );
        rec.currency = currency;
        await tx.insert(bankAccounts).values(rec);
      });
    } catch (e: any) {
      if (e?.code && e?.status) return err(e.message, e.status, e.code);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("bank_accounts_code"))
        return err("رمز الحساب البنكي مستخدم بالفعل", 409, "DUPLICATE_CODE");
      if (msg.includes("iban_normalized"))
        return err("رقم الآيبان مستخدم بالفعل", 409, "DUPLICATE_IBAN");
      if (msg.includes("linked_account"))
        return err("هذا الحساب مرتبط بحساب بنكي آخر", 409, "ACCOUNT_ALREADY_MAPPED");
      throw e;
    }
    // Audit never contains the full IBAN/account number.
    await addAudit({
      action: "BANK_ACCOUNT_CREATED",
      entityType: "bank_account",
      entityId: id,
      description: `إنشاء حساب بنكي ${b.code} — ${b.bankName} (${maskIban(ibanRes.ibanNormalized)})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return Response.json({ item: maskedRow(rec) }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1).optional(),
  bankName: z.string().trim().min(1).optional(),
  accountName: z.string().trim().optional(),
  accountNumber: z.string().trim().nullish(),
  iban: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  linkedAccountId: z.string().min(1).optional(),
  branchId: z.string().nullish(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const ba = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, b.id)).limit(1))[0];
    if (!ba) return err("الحساب البنكي غير موجود", 404, "NOT_FOUND");
    const before = JSON.stringify({ ...ba, iban: maskIban(ba.iban), accountNumber: undefined });

    const set: Record<string, unknown> = { updatedAt: now() };
    if (b.code !== undefined) set.code = b.code;
    if (b.bankName !== undefined) set.bankName = b.bankName;
    if (b.accountName !== undefined) set.accountName = b.accountName;
    if (b.accountNumber !== undefined) set.accountNumber = b.accountNumber;
    if (b.branchId !== undefined) set.branchId = b.branchId;
    if (b.notes !== undefined) set.notes = b.notes;
    if (b.iban !== undefined) {
      const ibanRes = resolveIban(b.iban);
      if (ibanRes instanceof Response) return ibanRes;
      set.iban = ibanRes.iban;
      set.ibanNormalized = ibanRes.ibanNormalized;
    }
    const changingMap = !!b.linkedAccountId && b.linkedAccountId !== ba.linkedAccountId;
    if (!changingMap && b.currency !== undefined) set.currency = b.currency.toUpperCase();

    try {
      await db.transaction(async (tx) => {
        if (changingMap) {
          await acquireMappingLock(tx, b.linkedAccountId!);
          await assertMappingChangeAllowed(tx as any, ba.linkedAccountId);
          const acc = await validateLinkedAccount(tx as any, b.linkedAccountId!);
          await assertMappingAvailable(tx as any, b.linkedAccountId!, { bankId: ba.id });
          const currency = (b.currency || ba.currency).toUpperCase();
          if (acc.currency && currency !== acc.currency)
            throw new AppError(
              "عملة الحساب البنكي يجب أن تطابق عملة الحساب المرتبط",
              400,
              "CURRENCY_MISMATCH",
            );
          set.linkedAccountId = b.linkedAccountId;
          set.currency = currency;
        }
        await tx.update(bankAccounts).set(set).where(eq(bankAccounts.id, b.id));
      });
    } catch (e: any) {
      if (e?.code && e?.status) return err(e.message, e.status, e.code);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("bank_accounts_code"))
        return err("رمز الحساب البنكي مستخدم بالفعل", 409, "DUPLICATE_CODE");
      if (msg.includes("iban_normalized"))
        return err("رقم الآيبان مستخدم بالفعل", 409, "DUPLICATE_IBAN");
      throw e;
    }
    await addAudit({
      action: "BANK_ACCOUNT_UPDATED",
      entityType: "bank_account",
      entityId: b.id,
      description: `تعديل الحساب البنكي ${ba.code}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });
    const updated = (
      await db.select().from(bankAccounts).where(eq(bankAccounts.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: maskedRow(updated) });
  });
}

export const Route = createFileRoute("/api/finance/bank-accounts")({
  server: {
    handlers: {
      GET: authHandler(P.bankView, GET),
      POST: authHandler(P.bankView, POST),
      PUT: authHandler(P.bankUpdate, PUT),
    },
  },
});
