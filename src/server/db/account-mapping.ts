/**
 * Phase 3B.1 — Finance system-account mapping (explicit, admin-configured).
 *
 * The application must NEVER silently decide which General Ledger account plays a
 * system accounting role (e.g. recoverable Input VAT). The mapping mechanism is
 * the existing `accounts.system_key` column (a stable semantic key → one
 * accounts.id); this module adds the SAFE way to configure it:
 *   - purpose-specific validation (Input VAT must be an active, postable,
 *     asset-classified, non-parent account that is not the AP control account and
 *     is not mapped to any cashbox/bank), and
 *   - ATOMIC reassignment (clear the key from any prior holder, set it on the new
 *     account) so there is never more than one account per purpose.
 *
 * No new configuration framework, no duplicated balances, no account definitions.
 * Posting resolves the account by system_key (resolveSystemAccountId), never by a
 * hardcoded chart-of-accounts code.
 */
import { and, eq, ne } from "drizzle-orm";
import { db, now, addAudit } from "./index";
import { accounts, supplierInvoices } from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { accountMappedToAnyCashBank } from "./cash-bank";
import { AppError } from "./errors";
import { AccountStatus, AccountClassification } from "@/lib/enums";
import type { Ctx } from "./api-utils";

type Db = { select: (...a: any[]) => any };

/**
 * Validate that `accountId` may be mapped as the recoverable Input VAT control
 * account. Throws an AppError with a stable code on the first violation; returns
 * the account row on success. Pure read — safe to run with `db` or a tx handle.
 */
export async function validateInputVatMappingAccount(dbh: Db, accountId: string) {
  const acc = (
    await dbh.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
  )[0] as any;
  if (!acc) throw new AppError("الحساب غير موجود", 404, "ACCOUNT_NOT_FOUND");
  if (acc.status !== AccountStatus.ACTIVE)
    throw new AppError("الحساب غير نشط", 400, "ACCOUNT_INACTIVE");
  if (!acc.postable)
    throw new AppError(
      "الحساب رئيسي/غير قابل للترحيل — اختر حساباً فرعياً",
      400,
      "ACCOUNT_NOT_POSTABLE",
    );
  // Control-account protections first, so the AP control account is reported as
  // such rather than merely "not an asset".
  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  if (acc.id === apId)
    throw new AppError("لا يمكن استخدام حساب الذمم الدائنة كضريبة مدخلات", 400, "MAPPING_IS_AP");
  const mapped = await accountMappedToAnyCashBank(dbh, accountId);
  if (mapped)
    throw new AppError(
      "لا يمكن استخدام حساب مرتبط بصندوق/بنك كضريبة مدخلات",
      400,
      "MAPPING_IS_CASH_BANK",
    );
  if (acc.classification !== AccountClassification.ASSET)
    throw new AppError(
      "حساب ضريبة المدخلات يجب أن يكون أصلاً (ذمم مدينة قابلة للاسترداد)",
      400,
      "MAPPING_CLASS_INVALID",
    );
  return acc;
}

/**
 * Atomically (re)assign the Input VAT system mapping to `accountId` inside the
 * caller's transaction: validate, clear `input_vat` from any prior holder, then
 * set it on the target. Guarantees exactly one Input VAT mapping. Returns the
 * account row.
 */
export async function assignInputVatAccount(
  tx: any,
  input: { accountId: string; userId?: string | null },
) {
  const acc = await validateInputVatMappingAccount(tx, input.accountId);
  const ts = now();
  // Clear the key from any other account first so the UNIQUE(system_key) is never
  // transiently violated, then stamp it on the chosen account.
  await tx
    .update(accounts)
    .set({ systemKey: null, updatedAt: ts })
    .where(and(eq(accounts.systemKey, SYS.INPUT_VAT), ne(accounts.id, input.accountId)));
  await tx
    .update(accounts)
    .set({ systemKey: SYS.INPUT_VAT, updatedAt: ts })
    .where(eq(accounts.id, input.accountId));
  return acc;
}

/** Admin action: set/change the configured Input VAT account (atomic + audited). */
export async function setInputVatAccount(ctx: Ctx, accountId: string) {
  await db.transaction(async (tx) => {
    await assignInputVatAccount(tx as any, { accountId, userId: ctx.user.id });
  });
  const acc = (await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0];
  await addAudit({
    action: "FINANCE_INPUT_VAT_MAPPING_SET",
    entityType: "account_mapping",
    entityId: "input_vat",
    description: `ربط حساب ضريبة المدخلات: ${acc?.code} — ${acc?.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return acc;
}

/** The account currently mapped to Input VAT (or null if unconfigured). */
export async function getInputVatMapping(dbh: Db) {
  const rows = await dbh.select().from(accounts).where(eq(accounts.systemKey, SYS.INPUT_VAT));
  return (rows[0] as any) ?? null;
}

/**
 * Diagnostic ONLY (never mutates, never auto-maps). Surfaces the current Input
 * VAT configuration and any risk signals so an administrator can act. No mapping
 * is ever inferred from an account's name, Arabic label, or code resemblance.
 */
export async function inputVatPreflight(dbh: Db) {
  const mapped = (await dbh
    .select()
    .from(accounts)
    .where(eq(accounts.systemKey, SYS.INPUT_VAT))) as any[];
  const configured = mapped[0] ?? null;

  // What (if anything) currently occupies the legacy 0022 seed code 110306.
  const at110306 = (
    await dbh.select().from(accounts).where(eq(accounts.code, "110306")).limit(1)
  )[0] as any;

  // Taxable supplier-invoice counts (documents carrying tax).
  const taxableRows = (await dbh
    .select({ status: supplierInvoices.status, tax: supplierInvoices.taxAmount })
    .from(supplierInvoices)) as any[];
  const taxable = taxableRows.filter((r) => Number(r.tax || 0) > 0.005);
  const taxableCount = taxable.length;
  const postedTaxableCount = taxable.filter((r) => r.status === "posted").length;
  // Not-yet-posted taxable docs that CANNOT post while no mapping exists.
  const blockedByMissingMapping = configured
    ? 0
    : taxable.filter(
        (r) => r.status === "draft" || r.status === "submitted" || r.status === "approved",
      ).length;

  return {
    purpose: "input_vat",
    configured: configured
      ? {
          accountId: configured.id,
          code: configured.code,
          name: configured.name,
          active: configured.status === AccountStatus.ACTIVE,
          postable: !!configured.postable,
          classification: configured.classification,
        }
      : null,
    duplicateMappingCount: mapped.length, // must be ≤ 1 by design
    code110306Exists: !!at110306,
    code110306AccountId: at110306?.id ?? null,
    code110306SystemKey: at110306?.systemKey ?? null,
    taxableInvoiceCount: taxableCount,
    postedTaxableInvoiceCount: postedTaxableCount,
    taxableInvoicesBlockedByMissingMapping: blockedByMissingMapping,
  };
}
