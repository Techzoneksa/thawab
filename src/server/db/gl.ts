/**
 * General Ledger posting service.
 *
 * The single, authoritative path for writing balanced double-entry journal
 * entries — used both by manual journal entry (finance/journal.ts) and by
 * automatic posting from operations (donations, aid, receipts, procurement).
 *
 * Guarantees:
 *  - debit total === credit total (rejected otherwise)
 *  - atomic journal numbering (Postgres advisory lock, no duplicates under load)
 *  - closed fiscal periods cannot be posted into
 *  - everything runs inside the caller's transaction
 */
import { and, desc, eq, like, lte, gte, sql } from "drizzle-orm";
import { accounts, journalEntries, journalLines, fiscalPeriods } from "./schema";
import { now, genId } from "./index";
import { JournalStatus, FiscalPeriodStatus, Fund } from "@/lib/enums";
import { AppError } from "./errors";

/** Stable keys for the accounts the posting engine resolves at runtime. */
export const SYS = {
  CASH: "cash",
  BANK: "bank_main",
  DONATIONS_REVENUE: "donations_revenue",
  AID_EXPENSE: "aid_expense",
  INKIND_AID: "inkind_aid",
  ACCOUNTS_PAYABLE: "accounts_payable",
  INVENTORY: "inventory",
  INVENTORY_ADJUSTMENT: "inventory_adjustment",
  FIXED_ASSETS: "fixed_assets",
  ACCUMULATED_DEPRECIATION: "accumulated_depreciation",
  DEPRECIATION_EXPENSE: "depreciation_expense",
  ASSET_DISPOSAL_LOSS: "asset_disposal_loss",
  ASSET_DISPOSAL_GAIN: "asset_disposal_gain",
  SALARIES_EXPENSE: "salaries_expense",
  SALARIES_PAYABLE: "salaries_payable",
  NET_ASSETS_UNRESTRICTED: "net_assets_unrestricted",
  NET_ASSETS_RESTRICTED: "net_assets_restricted",
  NET_ASSETS_ENDOWMENT: "net_assets_endowment",
} as const;
export type SysKey = (typeof SYS)[keyof typeof SYS];

const BALANCE_TOLERANCE = 0.005;
const NUMBER_LOCK_KEY = 918273645; // arbitrary constant for pg_advisory_xact_lock

export interface PostLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  fund?: string;
  description?: string;
  costCenterId?: string | null;
  projectId?: string | null;
}

export interface PostEntryInput {
  date: string; // ISO date (YYYY-MM-DD or full ISO)
  description: string;
  fund?: string;
  currency?: string;
  projectId?: string | null;
  source?: string;
  sourceType?: string | null;
  sourceId?: string | null;
  lines: PostLineInput[];
  userId: string;
  /** draft = do not post yet; default posts immediately. */
  status?: (typeof JournalStatus)[keyof typeof JournalStatus];
}

// A minimal structural type so this works with both `db` and a `tx` handle.
type Db = {
  select: (...a: any[]) => any;
  insert: (...a: any[]) => any;
  update: (...a: any[]) => any;
  execute: (q: any) => Promise<any>;
};

export async function resolveSystemAccountId(tx: Db, key: SysKey): Promise<string> {
  const row = (await tx.select().from(accounts).where(eq(accounts.systemKey, key)).limit(1))[0];
  if (!row) throw new AppError(`GL: system account "${key}" not found — run the bootstrap seed`);
  return row.id as string;
}

/** Cash vs bank account depending on the payment method. */
export async function cashOrBankAccountId(tx: Db, method: string | undefined): Promise<string> {
  const isCash = method === "cash";
  return resolveSystemAccountId(tx, isCash ? SYS.CASH : SYS.BANK);
}

export async function assertPeriodOpen(tx: Db, dateISO: string) {
  const day = dateISO.slice(0, 10);
  const period = (
    await tx
      .select()
      .from(fiscalPeriods)
      .where(and(lte(fiscalPeriods.startDate, day), gte(fiscalPeriods.endDate, day)))
      .limit(1)
  )[0];
  if (period && period.status === FiscalPeriodStatus.CLOSED) {
    throw new AppError(`GL: الفترة المالية "${period.name}" مقفلة — لا يمكن الترحيل فيها`);
  }
  return period?.id ?? null;
}

async function nextJournalNumber(tx: Db, dateISO: string): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${NUMBER_LOCK_KEY})`);
  const year = dateISO.slice(0, 4);
  const prefix = `JV-${year}-`;
  const last = (
    await tx
      .select({ number: journalEntries.number })
      .from(journalEntries)
      .where(like(journalEntries.number, `${prefix}%`))
      .orderBy(desc(journalEntries.number))
      .limit(1)
  )[0];
  const seq = last ? parseInt(String(last.number).slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

function validateLines(lines: PostLineInput[]) {
  if (!lines || lines.length < 2) throw new AppError("GL: القيد يجب أن يحتوي على سطرين على الأقل");
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    const d = Number(l.debit || 0);
    const c = Number(l.credit || 0);
    if (d < 0 || c < 0) throw new AppError("GL: القيم لا يمكن أن تكون سالبة");
    if (d > 0 && c > 0) throw new AppError("GL: السطر لا يمكن أن يكون مديناً ودائناً معاً");
    if (d === 0 && c === 0) throw new AppError("GL: كل سطر يجب أن يكون مديناً أو دائناً");
    totalDebit += d;
    totalCredit += c;
  }
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    throw new AppError(
      `GL: القيد غير متوازن — مجموع المدين ${totalDebit} لا يساوي مجموع الدائن ${totalCredit}`,
    );
  }
  return totalDebit;
}

/**
 * Create a balanced journal entry (+ lines) inside the given transaction.
 * Returns the new entry id. Default status = posted.
 */
export async function postBalancedEntry(tx: Db, input: PostEntryInput): Promise<string> {
  const total = validateLines(input.lines);

  // Validate every referenced account is postable & active.
  for (const l of input.lines) {
    const acc = (await tx.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1))[0];
    if (!acc) throw new AppError(`GL: الحساب ${l.accountId} غير موجود`);
    if (!acc.postable) throw new AppError(`GL: الحساب ${acc.name} غير قابل للترحيل عليه`);
    if (acc.status !== "active") throw new AppError(`GL: الحساب ${acc.name} غير نشط`);
  }

  const status = input.status ?? JournalStatus.POSTED;
  const periodId = status === JournalStatus.POSTED ? await assertPeriodOpen(tx, input.date) : null;
  const number = await nextJournalNumber(tx, input.date);
  const ts = now();
  const entryId = genId("JE");
  const fund = input.fund ?? Fund.UNRESTRICTED;

  await tx.insert(journalEntries).values({
    id: entryId,
    number,
    date: input.date,
    description: input.description,
    amount: total,
    fund,
    currency: input.currency ?? "SAR",
    periodId,
    projectId: input.projectId ?? null,
    source: input.source ?? "manual",
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    status,
    postedBy: status === JournalStatus.POSTED ? input.userId : null,
    postedAt: status === JournalStatus.POSTED ? ts : null,
    createdBy: input.userId,
    createdAt: ts,
    updatedAt: ts,
  });

  let n = 0;
  for (const l of input.lines) {
    await tx.insert(journalLines).values({
      id: genId("JL"),
      journalEntryId: entryId,
      lineNumber: ++n,
      accountId: l.accountId,
      description: l.description ?? "",
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      fund: l.fund ?? fund,
      costCenterId: l.costCenterId ?? null,
      projectId: l.projectId ?? null,
      createdAt: ts,
    });
  }

  return entryId;
}

/**
 * Post an EXISTING draft/pending entry through the same controls as a fresh
 * posting: balanced, all accounts postable + active, and the entry's own date
 * inside an OPEN fiscal period. This is the single controlled draft→posted
 * path — the manual and Excel-import posting routes both call it, so neither
 * can bypass the closed-period lock. The entry date is never silently changed
 * and the period is never auto-reopened.
 */
export async function postDraftEntry(tx: Db, entryId: string, userId: string): Promise<void> {
  const entry = (
    await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1)
  )[0];
  if (!entry) throw new AppError("GL: القيد غير موجود");
  if (entry.status !== JournalStatus.DRAFT && entry.status !== JournalStatus.PENDING)
    throw new AppError("GL: يمكن ترحيل المسودات فقط");

  const lines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId));
  if (!lines || lines.length < 2) throw new AppError("GL: القيد يجب أن يحتوي على سطرين على الأقل");
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    const d = Number(l.debit || 0);
    const c = Number(l.credit || 0);
    if (d < 0 || c < 0) throw new AppError("GL: القيم لا يمكن أن تكون سالبة");
    if (d > 0 && c > 0) throw new AppError("GL: السطر لا يمكن أن يكون مديناً ودائناً معاً");
    totalDebit += d;
    totalCredit += c;
    const acc = (await tx.select().from(accounts).where(eq(accounts.id, l.accountId)).limit(1))[0];
    if (!acc) throw new AppError(`GL: الحساب ${l.accountId} غير موجود`);
    if (!acc.postable) throw new AppError(`GL: الحساب ${acc.name} غير قابل للترحيل عليه`);
    if (acc.status !== "active") throw new AppError(`GL: الحساب ${acc.name} غير نشط`);
  }
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE)
    throw new AppError(
      `GL: القيد غير متوازن — مجموع المدين ${totalDebit} لا يساوي مجموع الدائن ${totalCredit}`,
    );

  // Enforce the closed-period lock on the entry's OWN date.
  await assertPeriodOpen(tx, entry.date);

  const ts = now();
  await tx
    .update(journalEntries)
    .set({ status: JournalStatus.POSTED, postedBy: userId, postedAt: ts, updatedAt: ts })
    .where(eq(journalEntries.id, entryId));
}

/**
 * Returns the id of an existing POSTED journal generated by this source
 * document, or null. Used by callers to guarantee one business transaction →
 * one accounting effect (idempotency). Reversed/cancelled entries free the key.
 */
export async function existingSourceEntryId(
  tx: Db,
  sourceType: string,
  sourceId: string,
): Promise<string | null> {
  if (!sourceType || !sourceId) return null;
  const row = (
    await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.sourceType, sourceType),
          eq(journalEntries.sourceId, sourceId),
          eq(journalEntries.status, JournalStatus.POSTED),
        ),
      )
      .limit(1)
  )[0];
  return row?.id ?? null;
}

/**
 * Reverse a posted entry by creating a mirror entry. Runs in the caller's tx.
 * Returns the reversing entry id.
 */
export async function reverseEntry(tx: Db, entryId: string, userId: string): Promise<string> {
  const entry = (
    await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1)
  )[0];
  if (!entry) throw new AppError("GL: القيد غير موجود");
  if (entry.status !== JournalStatus.POSTED) throw new AppError("GL: يمكن عكس القيود المرحّلة فقط");

  const lines = await tx
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId));
  const mirrored: PostLineInput[] = lines.map((l: any) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
    fund: l.fund,
    description: l.description,
    costCenterId: l.costCenterId,
    projectId: l.projectId,
  }));

  // The reversal posts on TODAY's (open) date — never inside the original's
  // possibly-closed period — and carries a distinct reversal source so it is
  // not mistaken for a duplicate of the original by idempotency controls. The
  // link back to the original is preserved via `reversedOf` below.
  const reversingId = await postBalancedEntry(tx, {
    date: now().slice(0, 10),
    description: `عكس القيد ${entry.number} — ${entry.description}`,
    fund: entry.fund,
    projectId: entry.projectId,
    source: "reversal",
    sourceType: "reversal",
    sourceId: entryId,
    lines: mirrored,
    userId,
  });

  const ts = now();
  await tx
    .update(journalEntries)
    .set({ status: JournalStatus.REVERSED, reversedBy: userId, reversedAt: ts, updatedAt: ts })
    .where(eq(journalEntries.id, entryId));
  await tx
    .update(journalEntries)
    .set({ reversedOf: entryId, updatedAt: ts })
    .where(eq(journalEntries.id, reversingId));

  return reversingId;
}
