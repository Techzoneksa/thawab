/**
 * Phase 3D.1 — GRNI (Goods Received Not Invoiced) subledger, server-authoritative.
 *
 * A governed Goods Receipt's GRNI accrual is NOT stored anywhere as accounting
 * truth. It is derived from the General Ledger: each receipt is linked
 * (grni_journal_links) to the specific GRNI control-account journal line(s) that
 * belong to it; the money lives ONLY in journal_lines. The governed GRNI balance
 * is credit − debit over the linked GRNI lines whose entries are in the certified
 * GL states (posted + reversed).
 *
 * This mirrors the Phase 3A supplier AP subledger EXACTLY (createSupplierApLink /
 * linkEntryApLine / apReconciliation) — same primitive, same reconciliation
 * identity — but on the GRNI control account instead of Accounts Payable. It adds
 * NO accounting engine, stores NO amount (there is no amount column), and never
 * writes balances. On the original POST the GRNI CREDIT line is linked
 * (link_type='receipt'); on REVERSE the GRNI DEBIT mirror line is linked to the
 * SAME receipt (link_type='reversal'), so the governed GRNI linked balance nets
 * to 0. Historical links are immutable. Manual GRNI journal lines (not from a
 * governed receipt) are never linked and surface as unallocated.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { now, genId } from "./index";
import { goodsReceipts, grniJournalLinks, journalLines, journalEntries } from "./schema";
import { getAccountBalance } from "./balances";
import { getGrniMapping } from "./account-mapping";
import { AppError } from "./errors";
import { JournalStatus } from "@/lib/enums";

const GL_STATES = [JournalStatus.POSTED, JournalStatus.REVERSED];
type Db = { select: (...a: any[]) => any };

/** The account currently mapped as GRNI (system_key='grni'). Throws if unmapped. */
export async function grniAccountId(dbh: Db): Promise<string> {
  const acc = await getGrniMapping(dbh);
  if (!acc)
    throw new AppError(
      "لا يوجد حساب بضاعة مستلمة لم تُفوتر (GRNI) مُهيّأ في الدليل المحاسبي",
      400,
      "GRNI_ACCOUNT_MISSING",
    );
  return acc.id as string;
}

// ------------------------------- GRNI link primitive --------------------

/**
 * Link ONE GRNI control-account journal line to a goods receipt. The amount stays
 * in journal_lines; this records ownership only. Validates: line exists · the
 * line's account IS the GRNI control account (never AP / Input VAT / Inventory /
 * Expense) · the receipt exists · the line is not already linked (UNIQUE
 * journal_line_id) · and a per-type journal-provenance guard binds the linked
 * journal to the correct source:
 *   - 'receipt'          the receipt's OWN posting (source_type='goods_receipt',
 *                        source_id=grn) — the GRNI credit
 *   - 'reversal'         a reversal of that receipt posting (source_type='reversal',
 *                        reversed_of=grn.journalEntryId) — the GRNI debit mirror
 *   - 'invoice'          a Supplier Invoice posting (source_type='supplier_invoice')
 *                        that CLEARS this receipt's GRNI — the GRNI debit
 *   - 'invoice_reversal' a reversal of that invoice posting (source_type='reversal',
 *                        reversed_of=`expectedReversedOf`) — the GRNI credit mirror
 * Pass `expectedAccountId` to pin the account (used on every non-receipt link so it
 * matches the ORIGINAL GRNI account the receipt used, even if the mapping later
 * changed). `expectedReversedOf` is the original posting whose reversal is being
 * linked (the invoice's journalEntryId for 'invoice_reversal').
 */
export async function createGrniLink(
  tx: any,
  input: {
    goodsReceiptId: string;
    journalLineId: string;
    goodsReceiptLineId?: string | null;
    linkType?:
      "receipt" | "reversal" | "invoice" | "invoice_reversal" | "return" | "return_reversal";
    expectedAccountId?: string | null;
    expectedReversedOf?: string | null;
    userId?: string | null;
  },
): Promise<string> {
  const linkType = input.linkType ?? "receipt";
  const line = (
    await tx.select().from(journalLines).where(eq(journalLines.id, input.journalLineId)).limit(1)
  )[0];
  if (!line) throw new AppError("سطر القيد غير موجود", 400, "LINE_NOT_FOUND");

  const grniId = input.expectedAccountId ?? (await grniAccountId(tx));
  if (line.accountId !== grniId)
    throw new AppError("لا يمكن ربط سطر ليس على حساب GRNI بسند الاستلام", 400, "NOT_GRNI_LINE");

  const entry = (
    await tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, line.journalEntryId))
      .limit(1)
  )[0];
  if (!entry) throw new AppError("القيد غير موجود", 400, "ENTRY_NOT_FOUND");

  const grn = (
    await tx.select().from(goodsReceipts).where(eq(goodsReceipts.id, input.goodsReceiptId)).limit(1)
  )[0];
  if (!grn) throw new AppError("سند الاستلام غير موجود", 404, "GRN_NOT_FOUND");

  // Journal-provenance guard: the linked journal must match the link's source.
  if (linkType === "receipt") {
    if (entry.sourceType !== "goods_receipt" || entry.sourceId !== input.goodsReceiptId)
      throw new AppError("قيد الربط لا يخص سند الاستلام هذا", 400, "LINK_ENTRY_MISMATCH");
  } else if (linkType === "reversal") {
    if (entry.sourceType !== "reversal" || entry.reversedOf !== grn.journalEntryId)
      throw new AppError("قيد العكس لا يخص سند الاستلام هذا", 400, "LINK_ENTRY_MISMATCH");
  } else if (linkType === "invoice") {
    if (entry.sourceType !== "supplier_invoice")
      throw new AppError("قيد الإقفال ليس قيد فاتورة مورد", 400, "LINK_ENTRY_MISMATCH");
  } else if (linkType === "return") {
    // Phase 5B — a Purchase Return posting that clears this receipt's GRNI.
    if (entry.sourceType !== "purchase_return")
      throw new AppError("قيد الإقفال ليس قيد مرتجع مشتريات", 400, "LINK_ENTRY_MISMATCH");
  } else if (linkType === "return_reversal") {
    // The mirror of the clearing return's posting.
    if (entry.sourceType !== "reversal" || entry.reversedOf !== (input.expectedReversedOf ?? null))
      throw new AppError("قيد عكس المرتجع لا يخص هذا الإقفال", 400, "LINK_ENTRY_MISMATCH");
  } else {
    // invoice_reversal — the mirror of the clearing invoice's posting.
    if (entry.sourceType !== "reversal" || entry.reversedOf !== (input.expectedReversedOf ?? null))
      throw new AppError("قيد عكس الفاتورة لا يخص هذا الإقفال", 400, "LINK_ENTRY_MISMATCH");
  }

  const existing = (
    await tx
      .select({ id: grniJournalLinks.id })
      .from(grniJournalLinks)
      .where(eq(grniJournalLinks.journalLineId, input.journalLineId))
      .limit(1)
  )[0];
  if (existing) throw new AppError("سطر GRNI مرتبط بالفعل", 409, "LINE_ALREADY_LINKED");

  const id = genId("GNL");
  await tx.insert(grniJournalLinks).values({
    id,
    goodsReceiptId: input.goodsReceiptId,
    goodsReceiptLineId: input.goodsReceiptLineId ?? null,
    journalLineId: input.journalLineId,
    linkType,
    createdBy: input.userId ?? null,
    createdAt: now(),
  });
  return id;
}

/**
 * Attach the GRNI control-account line of an entry to a goods receipt. Finds the
 * entry's single GRNI line (on `accountId`, first by line number) and links it —
 * no new journal, no money duplication. Returns the link id (or null if the entry
 * has no GRNI line). Used by the receipt POST (the GRNI credit) and by the
 * receipt REVERSE (the GRNI debit mirror).
 */
export async function linkEntryGrniLine(
  tx: any,
  input: {
    goodsReceiptId: string;
    entryId: string;
    accountId: string;
    linkType?: "receipt" | "reversal";
    goodsReceiptLineId?: string | null;
    userId?: string | null;
  },
): Promise<string | null> {
  const grniLine = (
    await tx
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, input.entryId),
          eq(journalLines.accountId, input.accountId),
        ),
      )
      .orderBy(journalLines.lineNumber)
      .limit(1)
  )[0];
  if (!grniLine) return null;
  return createGrniLink(tx, {
    goodsReceiptId: input.goodsReceiptId,
    journalLineId: grniLine.id,
    goodsReceiptLineId: input.goodsReceiptLineId ?? null,
    linkType: input.linkType ?? "receipt",
    expectedAccountId: input.accountId,
    userId: input.userId,
  });
}

/** The original 'receipt' GRNI link for a receipt (or null) — the account it used. */
export async function receiptGrniLink(dbh: Db, goodsReceiptId: string) {
  const rows = (await (dbh as any)
    .select({
      id: grniJournalLinks.id,
      journalLineId: grniJournalLinks.journalLineId,
      accountId: journalLines.accountId,
    })
    .from(grniJournalLinks)
    .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
    .where(
      and(
        eq(grniJournalLinks.goodsReceiptId, goodsReceiptId),
        eq(grniJournalLinks.linkType, "receipt"),
      ),
    )
    .limit(1)) as any[];
  return rows[0] ?? null;
}

// ------------------------------- Reconciliation -------------------------

/**
 * GRNI control-account reconciliation. By construction every GRNI journal line is
 * either linked to a receipt or unallocated, so:
 *   GRNI GL balance = governed receipt subledger total + Unallocated GRNI net
 * and `difference` is a 0 sanity check. Amounts are credit − debit (GRNI is a
 * credit-natured liability accrual). Certified GL states only (posted + reversed).
 */
export async function grniReconciliation(dbh: Db, accountId?: string) {
  // Default to the CURRENTLY mapped GRNI account; callers may reconcile a specific
  // (e.g. historical) GRNI account by passing its id.
  const grniId = accountId ?? (await grniAccountId(dbh));
  const grniGl = (await getAccountBalance(dbh, grniId, {})).closing;

  const total = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, grniId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  const linked = (
    await (dbh as any)
      .select({
        c: sql<number>`COUNT(*)`,
        debit: sql<number>`COALESCE(SUM(${journalLines.debit}),0)`,
        credit: sql<number>`COALESCE(SUM(${journalLines.credit}),0)`,
      })
      .from(grniJournalLinks)
      .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(journalLines.accountId, grniId), inArray(journalEntries.status, GL_STATES)))
  )[0] as any;

  const tDebit = Number(total?.debit || 0),
    tCredit = Number(total?.credit || 0);
  const lDebit = Number(linked?.debit || 0),
    lCredit = Number(linked?.credit || 0);
  const subledgerTotal = lCredit - lDebit;
  const unallocated = {
    count: Number(total?.c || 0) - Number(linked?.c || 0),
    debit: tDebit - lDebit,
    credit: tCredit - lCredit,
    net: tCredit - lCredit - (tDebit - lDebit),
  };
  return {
    grniAccountId: grniId,
    grniGl,
    subledgerTotal,
    unallocated,
    difference: grniGl - (subledgerTotal + unallocated.net),
  };
}

/** Unallocated GRNI journal lines (posted/reversed, not linked to any receipt). */
export async function unallocatedGrniLines(dbh: Db) {
  const grniId = await grniAccountId(dbh);
  const rows = await (dbh as any)
    .select({
      lineId: journalLines.id,
      entryId: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      description: journalEntries.description,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(
      and(
        eq(journalLines.accountId, grniId),
        inArray(journalEntries.status, GL_STATES),
        sql`NOT EXISTS (SELECT 1 FROM ${grniJournalLinks} gjl WHERE gjl.journal_line_id = ${journalLines.id})`,
      ),
    )
    .orderBy(journalEntries.date, journalEntries.number);
  return rows;
}

/** GRNI links belonging to one receipt (audit / drill-down). */
export async function grniLinksForReceipt(dbh: Db, goodsReceiptId: string) {
  return (dbh as any)
    .select({
      id: grniJournalLinks.id,
      linkType: grniJournalLinks.linkType,
      journalLineId: grniJournalLinks.journalLineId,
      debit: journalLines.debit,
      credit: journalLines.credit,
      entryId: journalEntries.id,
      number: journalEntries.number,
      status: journalEntries.status,
    })
    .from(grniJournalLinks)
    .innerJoin(journalLines, eq(grniJournalLinks.journalLineId, journalLines.id))
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(eq(grniJournalLinks.goodsReceiptId, goodsReceiptId));
}
