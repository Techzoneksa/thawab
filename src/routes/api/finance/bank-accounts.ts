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
  accountHasPostedHistory,
  linkedAccountBalance,
} from "@/server/db/cash-bank";
import { AccountStatus } from "@/lib/enums";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { normalizeIban, isValidSaudiIban, maskIban } from "@/lib/iban";

async function require(ctx: Ctx, perm: string): Promise<Response | null> {
  return (await hasPermission(ctx.user.role, perm))
    ? null
    : err("لا تملك صلاحية لهذا الإجراء", 403, "FORBIDDEN");
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
    const balance = await linkedAccountBalance(db, item.linkedAccountId, {
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      asOf: url.searchParams.get("asOf") || undefined,
    });
    // Full IBAN is returned only to bank-view holders (the route gate) AND only
    // when explicitly requested; lists/logs stay masked.
    const wantFull = url.searchParams.get("full") === "1";
    const projected = maskedRow(item);
    if (wantFull) (projected as any).iban = item.iban;
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
  isDefault: z.boolean().optional(),
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
    const acc = await validateLinkedAccount(db, b.linkedAccountId);
    await assertMappingAvailable(db, b.linkedAccountId);
    const ibanRes = resolveIban(b.iban);
    if (ibanRes instanceof Response) return ibanRes;
    const currency = (b.currency || acc.currency || "SAR").toUpperCase();
    if (acc.currency && currency !== acc.currency)
      return err("عملة الحساب البنكي يجب أن تطابق عملة الحساب المرتبط", 400, "CURRENCY_MISMATCH");

    const id = genId("BA");
    const ts = now();
    const rec = {
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
      isDefault: b.isDefault ?? false,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    };
    try {
      await db.insert(bankAccounts).values(rec);
    } catch (e) {
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
  isDefault: z.boolean().optional(),
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
    if (b.isDefault !== undefined) set.isDefault = b.isDefault;
    if (b.notes !== undefined) set.notes = b.notes;
    if (b.iban !== undefined) {
      const ibanRes = resolveIban(b.iban);
      if (ibanRes instanceof Response) return ibanRes;
      set.iban = ibanRes.iban;
      set.ibanNormalized = ibanRes.ibanNormalized;
    }
    if (b.linkedAccountId && b.linkedAccountId !== ba.linkedAccountId) {
      await assertMappingChangeAllowed(db, ba.linkedAccountId);
      const acc = await validateLinkedAccount(db, b.linkedAccountId);
      await assertMappingAvailable(db, b.linkedAccountId, { bankId: ba.id });
      const currency = (b.currency || ba.currency).toUpperCase();
      if (acc.currency && currency !== acc.currency)
        return err("عملة الحساب البنكي يجب أن تطابق عملة الحساب المرتبط", 400, "CURRENCY_MISMATCH");
      set.linkedAccountId = b.linkedAccountId;
      set.currency = currency;
    } else if (b.currency !== undefined) {
      set.currency = b.currency.toUpperCase();
    }

    try {
      await db.update(bankAccounts).set(set).where(eq(bankAccounts.id, b.id));
    } catch (e) {
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
