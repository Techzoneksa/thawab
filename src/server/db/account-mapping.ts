/**
 * Phase 3B.1 / 3B.2 — Finance system-account mapping (explicit, admin-confirmed).
 *
 * The application must NEVER silently decide which General Ledger account plays a
 * system accounting role (e.g. recoverable Input VAT). The mapping itself remains
 * the existing `accounts.system_key` column (a stable semantic key → one
 * accounts.id). But a mapping that merely EXISTS is not trusted: `code +
 * system_key` cannot prove how it came to exist (it may pre-date 0022, or have
 * been set through the generic accounts API). So taxable posting additionally
 * requires an EXPLICIT administrator confirmation
 * (finance_account_mapping_confirmations) that matches the current mapping.
 *
 *   usable Input VAT configuration = system_key mapping
 *                                    + confirmation whose account_id == mapping
 *                                    + the account still passes all validations
 *
 * Configuration provenance only — the confirmation table holds no amount and is
 * not a chart of accounts. Posting resolves the account via the confirmed
 * resolver below, never by a hardcoded chart-of-accounts code.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { accounts, supplierInvoices, financeAccountMappingConfirmations } from "./schema";
import { resolveSystemAccountId, SYS } from "./gl";
import { accountMappedToAnyCashBank } from "./cash-bank";
import { LOCK_NS } from "./lock-namespaces";
import { AppError } from "./errors";
import { AccountStatus, AccountClassification } from "@/lib/enums";
import type { Ctx } from "./api-utils";

type Db = { select: (...a: any[]) => any };

/** Confirmation purpose key (distinct from the account system_key value). */
export const INPUT_VAT_PURPOSE = "INPUT_VAT";

/** Configuration status of a system-purpose mapping. */
export type MappingStatus = "MISSING" | "UNCONFIRMED" | "MISMATCH" | "INVALID" | "READY";

/**
 * Validate that `accountId` may be mapped as the recoverable Input VAT control
 * account. Throws an AppError with a stable code on the first violation; returns
 * the account row on success. Pure read — safe to run with `db` or a tx handle.
 */
export async function validateInputVatMappingAccount(dbh: Db, accountId: string) {
  const acc = (await dbh.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0] as
    any | undefined;
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

/** The account currently carrying system_key='input_vat' (or null). */
export async function getInputVatMapping(dbh: Db) {
  const rows = await dbh.select().from(accounts).where(eq(accounts.systemKey, SYS.INPUT_VAT));
  return (rows[0] as any) ?? null;
}

/** The explicit Input VAT confirmation row (or null). */
export async function getInputVatConfirmation(dbh: Db) {
  const rows = await dbh
    .select()
    .from(financeAccountMappingConfirmations)
    .where(eq(financeAccountMappingConfirmations.purpose, INPUT_VAT_PURPOSE));
  return (rows[0] as any) ?? null;
}

/**
 * Full Input VAT configuration snapshot: the current system_key mapping, the
 * explicit confirmation, and the derived status.
 *   MISSING     — no system_key mapping at all
 *   UNCONFIRMED — mapping exists but no explicit confirmation
 *   MISMATCH    — confirmation exists but points at a different account
 *   INVALID     — mapping+confirmation agree but the account fails validation
 *   READY       — agree + valid → usable for taxable posting
 */
export async function getInputVatConfiguration(dbh: Db): Promise<{
  mapping: any | null;
  confirmation: any | null;
  status: MappingStatus;
  matches: boolean;
  valid: boolean;
}> {
  const mapping = await getInputVatMapping(dbh);
  const confirmation = await getInputVatConfirmation(dbh);
  const matches = !!mapping && !!confirmation && confirmation.accountId === mapping.id;
  let valid = false;
  if (matches) {
    try {
      await validateInputVatMappingAccount(dbh, mapping.id);
      valid = true;
    } catch {
      valid = false;
    }
  }
  let status: MappingStatus;
  if (!mapping) status = "MISSING";
  else if (!confirmation) status = "UNCONFIRMED";
  else if (!matches) status = "MISMATCH";
  else if (!valid) status = "INVALID";
  else status = "READY";
  return { mapping, confirmation, status, matches, valid };
}

/**
 * The single resolver taxable Supplier Invoice posting MUST use. Requires a
 * system_key mapping AND a matching explicit confirmation AND a still-valid
 * account. Returns the confirmed account id, or throws with one clear policy:
 *   - no mapping                       → INPUT_VAT_ACCOUNT_MISSING
 *   - mapping present but unconfirmed / mismatched / invalid → INPUT_VAT_MAPPING_UNCONFIRMED
 * `resolveSystemAccountId(SYS.INPUT_VAT)` alone is NOT sufficient anymore.
 */
export async function resolveConfirmedInputVatAccount(dbh: Db): Promise<string> {
  const mapping = await getInputVatMapping(dbh);
  if (!mapping)
    throw new AppError(
      "لا يوجد حساب ضريبة مدخلات مُهيّأ في الدليل المحاسبي",
      400,
      "INPUT_VAT_ACCOUNT_MISSING",
    );
  const confirmation = await getInputVatConfirmation(dbh);
  if (!confirmation || confirmation.accountId !== mapping.id)
    throw new AppError(
      "ربط حساب ضريبة المدخلات غير مؤكَّد من مسؤول مالي — يلزم التأكيد قبل ترحيل فاتورة خاضعة للضريبة",
      400,
      "INPUT_VAT_MAPPING_UNCONFIRMED",
    );
  // Re-validate at resolution time (the account may have been deactivated etc.).
  try {
    await validateInputVatMappingAccount(dbh, mapping.id);
  } catch {
    throw new AppError(
      "حساب ضريبة المدخلات المؤكَّد لم يعد صالحاً — أعد تهيئته وتأكيده",
      400,
      "INPUT_VAT_MAPPING_UNCONFIRMED",
    );
  }
  return mapping.id as string;
}

/**
 * Atomically (re)assign AND confirm the Input VAT mapping inside the caller's
 * transaction: serialize on an advisory lock, validate, clear `input_vat` from
 * any prior holder, set it on the target, and upsert the explicit confirmation.
 * Guarantees exactly one mapping and one matching confirmation. Returns the
 * account row plus the previously-mapped account (for audit).
 */
export async function assignInputVatAccount(
  tx: any,
  input: { accountId: string; userId?: string | null },
): Promise<{ account: any; previousAccountId: string | null }> {
  // Serialize mapping reassignment for this purpose (real-Postgres safety; PGlite
  // serializes transactions anyway).
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.ACCOUNT_MAPPING}, hashtext(${INPUT_VAT_PURPOSE}))`,
  );
  const prior = await getInputVatMapping(tx);
  const previousAccountId = prior?.id ?? null;
  const acc = await validateInputVatMappingAccount(tx, input.accountId);
  const ts = now();
  // Clear the key from any other account first so UNIQUE(system_key) is never
  // transiently violated, then stamp it on the chosen account.
  await tx
    .update(accounts)
    .set({ systemKey: null, updatedAt: ts })
    .where(and(eq(accounts.systemKey, SYS.INPUT_VAT), ne(accounts.id, input.accountId)));
  await tx
    .update(accounts)
    .set({ systemKey: SYS.INPUT_VAT, updatedAt: ts })
    .where(eq(accounts.id, input.accountId));
  // Upsert the explicit confirmation (purpose is UNIQUE → exactly one).
  await tx
    .insert(financeAccountMappingConfirmations)
    .values({
      id: genId("FMAP"),
      purpose: INPUT_VAT_PURPOSE,
      accountId: input.accountId,
      confirmedBy: input.userId ?? null,
      confirmedAt: ts,
      updatedAt: ts,
    })
    .onConflictDoUpdate({
      target: financeAccountMappingConfirmations.purpose,
      set: {
        accountId: input.accountId,
        confirmedBy: input.userId ?? null,
        confirmedAt: ts,
        updatedAt: ts,
      },
    });
  return { account: acc, previousAccountId };
}

/** Admin action: set/confirm (or change) the Input VAT account — atomic + audited. */
export async function setInputVatAccount(ctx: Ctx, accountId: string) {
  let previousAccountId: string | null = null;
  await db.transaction(async (tx) => {
    const res = await assignInputVatAccount(tx as any, { accountId, userId: ctx.user.id });
    previousAccountId = res.previousAccountId;
  });
  const acc = (await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0];
  const changed = !!previousAccountId && previousAccountId !== accountId;
  const prev = previousAccountId
    ? (await db.select().from(accounts).where(eq(accounts.id, previousAccountId)).limit(1))[0]
    : null;
  await addAudit({
    action: changed ? "INPUT_VAT_MAPPING_CHANGED" : "INPUT_VAT_MAPPING_CONFIRMED",
    entityType: "account_mapping",
    entityId: INPUT_VAT_PURPOSE,
    description: changed
      ? `تغيير وتأكيد حساب ضريبة المدخلات من ${prev?.code ?? "—"} إلى ${acc?.code} — ${acc?.name}`
      : `تأكيد حساب ضريبة المدخلات: ${acc?.code} — ${acc?.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return acc;
}

/**
 * Diagnostic ONLY (never mutates, never auto-maps, never infers from name/label/
 * code). Surfaces the full Input VAT configuration + status so an administrator
 * can act.
 */
export async function inputVatPreflight(dbh: Db) {
  const { mapping, confirmation, status, matches, valid } = await getInputVatConfiguration(dbh);

  const dupMapping = (await dbh
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.systemKey, SYS.INPUT_VAT))) as any[];

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
  // Not-yet-posted taxable docs that CANNOT post while configuration is not READY.
  const blockedByConfig =
    status === "READY"
      ? 0
      : taxable.filter(
          (r) => r.status === "draft" || r.status === "submitted" || r.status === "approved",
        ).length;

  return {
    purpose: "input_vat",
    status,
    mappingMatchesConfirmation: matches,
    mappingValid: valid,
    mapping: mapping
      ? {
          accountId: mapping.id,
          code: mapping.code,
          name: mapping.name,
          active: mapping.status === AccountStatus.ACTIVE,
          postable: !!mapping.postable,
          classification: mapping.classification,
        }
      : null,
    confirmation: confirmation
      ? {
          accountId: confirmation.accountId,
          confirmedBy: confirmation.confirmedBy,
          confirmedAt: confirmation.confirmedAt,
        }
      : null,
    // Back-compat field: the "configured" mapping (kept for existing readers).
    configured: mapping
      ? {
          accountId: mapping.id,
          code: mapping.code,
          name: mapping.name,
          active: mapping.status === AccountStatus.ACTIVE,
          postable: !!mapping.postable,
          classification: mapping.classification,
        }
      : null,
    duplicateMappingCount: dupMapping.length, // must be ≤ 1 by design
    code110306Exists: !!at110306,
    code110306AccountId: at110306?.id ?? null,
    code110306SystemKey: at110306?.systemKey ?? null,
    taxableInvoiceCount: taxableCount,
    postedTaxableInvoiceCount: postedTaxableCount,
    taxableInvoicesBlockedByMissingMapping: blockedByConfig,
  };
}

// ============================================================================
// Phase 3D — GRNI (Goods Received Not Invoiced) mapping. Same admin-confirmed
// provenance model as Input VAT: a system_key='grni' mapping is trusted ONLY
// when a matching explicit confirmation (purpose 'GRNI') exists. GRNI is a
// LIABILITY accrual and is explicitly NOT the Accounts Payable control account.
// ============================================================================

export const GRNI_PURPOSE = "GRNI";

/** Validate that `accountId` may be mapped as the GRNI accrual control account. */
export async function validateGrniMappingAccount(dbh: Db, accountId: string) {
  const acc = (await dbh.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0] as
    any | undefined;
  if (!acc) throw new AppError("الحساب غير موجود", 404, "ACCOUNT_NOT_FOUND");
  if (acc.status !== AccountStatus.ACTIVE)
    throw new AppError("الحساب غير نشط", 400, "ACCOUNT_INACTIVE");
  if (!acc.postable)
    throw new AppError(
      "الحساب رئيسي/غير قابل للترحيل — اختر حساباً فرعياً",
      400,
      "ACCOUNT_NOT_POSTABLE",
    );
  const apId = await resolveSystemAccountId(dbh as any, SYS.ACCOUNTS_PAYABLE);
  if (acc.id === apId)
    throw new AppError(
      "لا يمكن استخدام حساب الذمم الدائنة كحساب بضاعة مستلمة لم تُفوتر (GRNI منفصل عن الذمم الدائنة)",
      400,
      "MAPPING_IS_AP",
    );
  const mapped = await accountMappedToAnyCashBank(dbh, accountId);
  if (mapped)
    throw new AppError(
      "لا يمكن استخدام حساب مرتبط بصندوق/بنك كحساب GRNI",
      400,
      "MAPPING_IS_CASH_BANK",
    );
  if (acc.classification !== AccountClassification.LIABILITY)
    throw new AppError(
      "حساب البضاعة المستلمة لم تُفوتر يجب أن يكون التزاماً (استحقاق)",
      400,
      "MAPPING_CLASS_INVALID",
    );
  return acc;
}

/** The account currently carrying system_key='grni' (or null). */
export async function getGrniMapping(dbh: Db) {
  const rows = await dbh.select().from(accounts).where(eq(accounts.systemKey, SYS.GRNI));
  return (rows[0] as any) ?? null;
}

/** The explicit GRNI confirmation row (or null). */
export async function getGrniConfirmation(dbh: Db) {
  const rows = await dbh
    .select()
    .from(financeAccountMappingConfirmations)
    .where(eq(financeAccountMappingConfirmations.purpose, GRNI_PURPOSE));
  return (rows[0] as any) ?? null;
}

/** Full GRNI configuration snapshot + derived status (see MappingStatus). */
export async function getGrniConfiguration(dbh: Db): Promise<{
  mapping: any | null;
  confirmation: any | null;
  status: MappingStatus;
  matches: boolean;
  valid: boolean;
}> {
  const mapping = await getGrniMapping(dbh);
  const confirmation = await getGrniConfirmation(dbh);
  const matches = !!mapping && !!confirmation && confirmation.accountId === mapping.id;
  let valid = false;
  if (matches) {
    try {
      await validateGrniMappingAccount(dbh, mapping.id);
      valid = true;
    } catch {
      valid = false;
    }
  }
  let status: MappingStatus;
  if (!mapping) status = "MISSING";
  else if (!confirmation) status = "UNCONFIRMED";
  else if (!matches) status = "MISMATCH";
  else if (!valid) status = "INVALID";
  else status = "READY";
  return { mapping, confirmation, status, matches, valid };
}

/**
 * The single resolver a governed Goods Receipt MUST use for its GRNI credit.
 * Requires a system_key mapping + matching confirmation + a still-valid account,
 * else throws GRNI_ACCOUNT_MISSING / GRNI_MAPPING_UNCONFIRMED. No hardcoded code.
 */
export async function resolveConfirmedGrniAccount(dbh: Db): Promise<string> {
  const mapping = await getGrniMapping(dbh);
  if (!mapping)
    throw new AppError(
      "لا يوجد حساب بضاعة مستلمة لم تُفوتر (GRNI) مُهيّأ في الدليل المحاسبي",
      400,
      "GRNI_ACCOUNT_MISSING",
    );
  const confirmation = await getGrniConfirmation(dbh);
  if (!confirmation || confirmation.accountId !== mapping.id)
    throw new AppError(
      "ربط حساب GRNI غير مؤكَّد من مسؤول مالي — يلزم التأكيد قبل ترحيل استلام بضاعة",
      400,
      "GRNI_MAPPING_UNCONFIRMED",
    );
  try {
    await validateGrniMappingAccount(dbh, mapping.id);
  } catch {
    throw new AppError(
      "حساب GRNI المؤكَّد لم يعد صالحاً — أعد تهيئته وتأكيده",
      400,
      "GRNI_MAPPING_UNCONFIRMED",
    );
  }
  return mapping.id as string;
}

/** Atomically (re)assign AND confirm the GRNI mapping inside the caller's tx. */
export async function assignGrniAccount(
  tx: any,
  input: { accountId: string; userId?: string | null },
): Promise<{ account: any; previousAccountId: string | null }> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${LOCK_NS.ACCOUNT_MAPPING}, hashtext(${GRNI_PURPOSE}))`,
  );
  const prior = await getGrniMapping(tx);
  const previousAccountId = prior?.id ?? null;
  const acc = await validateGrniMappingAccount(tx, input.accountId);
  const ts = now();
  await tx
    .update(accounts)
    .set({ systemKey: null, updatedAt: ts })
    .where(and(eq(accounts.systemKey, SYS.GRNI), ne(accounts.id, input.accountId)));
  await tx
    .update(accounts)
    .set({ systemKey: SYS.GRNI, updatedAt: ts })
    .where(eq(accounts.id, input.accountId));
  await tx
    .insert(financeAccountMappingConfirmations)
    .values({
      id: genId("FMAP"),
      purpose: GRNI_PURPOSE,
      accountId: input.accountId,
      confirmedBy: input.userId ?? null,
      confirmedAt: ts,
      updatedAt: ts,
    })
    .onConflictDoUpdate({
      target: financeAccountMappingConfirmations.purpose,
      set: {
        accountId: input.accountId,
        confirmedBy: input.userId ?? null,
        confirmedAt: ts,
        updatedAt: ts,
      },
    });
  return { account: acc, previousAccountId };
}

/** Admin action: set/confirm (or change) the GRNI account — atomic + audited. */
export async function setGrniAccount(ctx: Ctx, accountId: string) {
  let previousAccountId: string | null = null;
  await db.transaction(async (tx) => {
    const res = await assignGrniAccount(tx as any, { accountId, userId: ctx.user.id });
    previousAccountId = res.previousAccountId;
  });
  const acc = (await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1))[0];
  const changed = !!previousAccountId && previousAccountId !== accountId;
  const prev = previousAccountId
    ? (await db.select().from(accounts).where(eq(accounts.id, previousAccountId)).limit(1))[0]
    : null;
  await addAudit({
    action: changed ? "GRNI_MAPPING_CHANGED" : "GRNI_MAPPING_CONFIRMED",
    entityType: "account_mapping",
    entityId: GRNI_PURPOSE,
    description: changed
      ? `تغيير وتأكيد حساب GRNI من ${prev?.code ?? "—"} إلى ${acc?.code} — ${acc?.name}`
      : `تأكيد حساب GRNI: ${acc?.code} — ${acc?.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return acc;
}

/** Diagnostic ONLY for GRNI configuration (never mutates, never auto-maps). */
export async function grniPreflight(dbh: Db) {
  const { mapping, confirmation, status, matches, valid } = await getGrniConfiguration(dbh);
  const dupMapping = (await dbh
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.systemKey, SYS.GRNI))) as any[];
  return {
    purpose: "grni",
    status,
    mappingMatchesConfirmation: matches,
    mappingValid: valid,
    mapping: mapping
      ? {
          accountId: mapping.id,
          code: mapping.code,
          name: mapping.name,
          active: mapping.status === AccountStatus.ACTIVE,
          postable: !!mapping.postable,
          classification: mapping.classification,
        }
      : null,
    confirmation: confirmation
      ? {
          accountId: confirmation.accountId,
          confirmedBy: confirmation.confirmedBy,
          confirmedAt: confirmation.confirmedAt,
        }
      : null,
    duplicateMappingCount: dupMapping.length,
  };
}
