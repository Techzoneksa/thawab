/**
 * Phase 5C.0.2 — FORWARD Input-VAT journal provenance + Credit-Note eligibility.
 *
 * A taxable Supplier Invoice POST emits exactly ONE aggregated Input VAT debit
 * leg on the CONFIRMED Input VAT account resolved for THAT posting transaction.
 * `supplier_invoice_tax_journal_links` captures the immutable identity of that
 * journal line, inside the SAME POST transaction, so the historical VAT account
 * is later recoverable EXACTLY — even after the Input VAT mapping is changed —
 * without any amount/description/current-mapping inference.
 *
 * Design invariants (Phase 5C.0.2 spec):
 *   - No amount column: the linked journal_lines row (debit/credit/account_id) is
 *     the evidence. Historical account = link → journal_lines.account_id.
 *   - No account_id denormalization (journal_line_id already pins it immutably).
 *   - Link is created ONLY at POST, only for tax > 0, only for the exact VAT leg.
 *   - One link per invoice (UNIQUE invoice_id) · one line per link (UNIQUE line).
 *   - Zero-tax invoices get NO link (POST emits no VAT leg) and are still eligible.
 *   - Reversal never links a mirror line; the link documents the ORIGINAL posting.
 *   - Corrupt/orphan links fail CLOSED (never silently fall back to inference).
 *   - No historical backfill of pre-existing taxable invoices.
 */
import { and, eq, sql } from "drizzle-orm";
import { now, genId } from "./index";
import {
  supplierInvoices,
  supplierInvoiceTaxJournalLinks,
  journalLines,
  journalEntries,
} from "./schema";
import { AppError } from "./errors";
import { SupplierInvoiceStatus } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

const AMOUNT_TOLERANCE = 0.005;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Create the VAT provenance link for a taxable Supplier Invoice POST. The VAT
 * leg's `lineNumber` is captured by the POST service WHILE constructing the
 * journal (deterministic identity — NOT a post-commit search). This resolves the
 * exact created line by (journal_entry_id, line_number) inside the same tx and
 * HARD-validates it against the posting before linking; any mismatch throws so
 * the whole POST rolls back (fail closed). Must run in the POST transaction.
 */
export async function createSupplierInvoiceTaxLink(
  tx: any,
  input: {
    supplierInvoiceId: string;
    journalEntryId: string;
    /** 1-based lineNumber of the VAT debit leg, captured at journal construction. */
    vatLineNumber: number;
    /** computed.taxAmount posted for this invoice. */
    expectedVatDebit: number;
    /** The confirmed Input VAT account resolved for THIS posting. */
    expectedAccountId: string;
    userId?: string | null;
  },
): Promise<string> {
  if (!(input.vatLineNumber > 0))
    throw new AppError("رقم سطر ضريبة المدخلات غير صالح", 500, "VAT_PROVENANCE_LINE_INVALID");

  const line = (
    await tx
      .select()
      .from(journalLines)
      .where(
        and(
          eq(journalLines.journalEntryId, input.journalEntryId),
          eq(journalLines.lineNumber, input.vatLineNumber),
        ),
      )
      .limit(1)
  )[0];
  // The captured line MUST be the VAT debit leg exactly: on the confirmed VAT
  // account, a pure debit, equal to the posted tax at halala precision. If any
  // check fails the POST transaction must abort (never link the wrong line).
  if (!line) throw new AppError("سطر ضريبة المدخلات غير موجود", 500, "VAT_PROVENANCE_LINE_INVALID");
  if (line.accountId !== input.expectedAccountId)
    throw new AppError(
      "سطر الضريبة ليس على حساب الضريبة المؤكَّد",
      500,
      "VAT_PROVENANCE_LINE_INVALID",
    );
  if (!(Number(line.debit) > 0) || Number(line.credit) !== 0)
    throw new AppError("سطر الضريبة يجب أن يكون مديناً صرفاً", 500, "VAT_PROVENANCE_LINE_INVALID");
  if (Math.abs(r2(line.debit) - r2(input.expectedVatDebit)) > 0.000001)
    throw new AppError(
      "قيمة سطر الضريبة لا تطابق ضريبة الفاتورة",
      500,
      "VAT_PROVENANCE_LINE_INVALID",
    );

  const id = genId("SITL");
  await tx.insert(supplierInvoiceTaxJournalLinks).values({
    id,
    supplierInvoiceId: input.supplierInvoiceId,
    journalLineId: line.id,
    createdBy: input.userId ?? null,
    createdAt: now(),
  });
  return id;
}

export type HistoricalInputVat =
  | {
      status: "NO_INPUT_VAT_REQUIRED";
      invoiceId: string;
      taxAmount: number;
    }
  | {
      status: "RESOLVED";
      invoiceId: string;
      journalLineId: string;
      journalEntryId: string;
      accountId: string;
      postedVatDebit: number;
    };

/**
 * Resolve the ORIGINAL historical Input VAT account + posted debit for an
 * invoice, from immutable provenance ONLY.
 *   - zero-tax invoice           → { status: NO_INPUT_VAT_REQUIRED }
 *   - taxable, no link           → throws HISTORICAL_INPUT_VAT_PROVENANCE_REQUIRED
 *   - taxable, link present      → validated → { status: RESOLVED, accountId, ... }
 *   - taxable, link but corrupt  → throws VAT_PROVENANCE_CORRUPT (fail closed)
 * Never infers the account from current mapping / amount / description.
 */
export async function resolveSupplierInvoiceHistoricalInputVat(
  dbh: Db,
  invoiceId: string,
): Promise<HistoricalInputVat> {
  const inv = (
    await (dbh as any)
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, invoiceId))
      .limit(1)
  )[0];
  if (!inv) throw new AppError("فاتورة المورد غير موجودة", 404, "NOT_FOUND");

  const taxAmount = r2(inv.taxAmount);
  if (taxAmount <= AMOUNT_TOLERANCE)
    return { status: "NO_INPUT_VAT_REQUIRED", invoiceId, taxAmount: 0 };

  const link = (
    await (dbh as any)
      .select()
      .from(supplierInvoiceTaxJournalLinks)
      .where(eq(supplierInvoiceTaxJournalLinks.supplierInvoiceId, invoiceId))
      .limit(1)
  )[0];
  if (!link)
    throw new AppError(
      "لا يوجد إثبات لحساب ضريبة المدخلات التاريخي لهذه الفاتورة — غير مؤهَّلة لإشعار دائن",
      409,
      "HISTORICAL_INPUT_VAT_PROVENANCE_REQUIRED",
    );

  const line = (
    await (dbh as any)
      .select()
      .from(journalLines)
      .where(eq(journalLines.id, link.journalLineId))
      .limit(1)
  )[0];
  if (!line) throw new AppError("سطر إثبات الضريبة مفقود", 409, "VAT_PROVENANCE_CORRUPT");
  const entry = (
    await (dbh as any)
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, line.journalEntryId))
      .limit(1)
  )[0];
  if (!entry) throw new AppError("قيد إثبات الضريبة مفقود", 409, "VAT_PROVENANCE_CORRUPT");

  // The linked line MUST belong to THIS invoice's ORIGINAL posting entry, be a
  // pure debit, and equal the invoice tax. Otherwise the link is corrupt.
  const belongsToOriginal =
    entry.id === inv.journalEntryId &&
    entry.sourceType === "supplier_invoice" &&
    entry.sourceId === invoiceId;
  if (!belongsToOriginal)
    throw new AppError("سطر الإثبات لا يخص قيد ترحيل هذه الفاتورة", 409, "VAT_PROVENANCE_CORRUPT");
  if (!(Number(line.debit) > 0) || Number(line.credit) !== 0)
    throw new AppError("سطر الإثبات ليس مديناً صرفاً", 409, "VAT_PROVENANCE_CORRUPT");
  if (Math.abs(r2(line.debit) - taxAmount) > 0.000001)
    throw new AppError("قيمة سطر الإثبات لا تطابق ضريبة الفاتورة", 409, "VAT_PROVENANCE_CORRUPT");

  return {
    status: "RESOLVED",
    invoiceId,
    journalLineId: line.id,
    journalEntryId: entry.id,
    accountId: line.accountId,
    postedVatDebit: r2(line.debit),
  };
}

export type VatEligibility =
  | "ELIGIBLE_ZERO_TAX"
  | "ELIGIBLE_PROVENANCE"
  | "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED"
  | "BLOCKED_INVOICE_NOT_POSTED"
  | "BLOCKED_VAT_PROVENANCE_CORRUPT";

export interface CreditNoteEligibility {
  invoiceId: string;
  invoiceStatus: string;
  taxAmount: number;
  vatProvenanceStatus: VatEligibility;
  /** True only when the VAT/foundation gate passes (later phases add more gates). */
  eligibleForFutureCreditNoteFoundation: boolean;
  reason: string;
}

/**
 * The VAT/foundation eligibility gate for a future Supplier Credit Note. Creates
 * NO accounting. It ONLY evaluates invoice status + historical VAT provenance;
 * Phase 5C proper will additionally apply return capacity, supplier, payment
 * allocation and credit-note capacity gates.
 */
export async function getSupplierInvoiceCreditNoteEligibility(
  dbh: Db,
  invoiceId: string,
): Promise<CreditNoteEligibility> {
  const inv = (
    await (dbh as any)
      .select()
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, invoiceId))
      .limit(1)
  )[0];
  if (!inv) throw new AppError("فاتورة المورد غير موجودة", 404, "NOT_FOUND");

  const taxAmount = r2(inv.taxAmount);
  const base = { invoiceId, invoiceStatus: inv.status, taxAmount };

  if (inv.status !== SupplierInvoiceStatus.POSTED)
    return {
      ...base,
      vatProvenanceStatus: "BLOCKED_INVOICE_NOT_POSTED",
      eligibleForFutureCreditNoteFoundation: false,
      reason: "BLOCKED_INVOICE_NOT_POSTED",
    };

  if (taxAmount <= AMOUNT_TOLERANCE)
    return {
      ...base,
      vatProvenanceStatus: "ELIGIBLE_ZERO_TAX",
      eligibleForFutureCreditNoteFoundation: true,
      reason: "ELIGIBLE_ZERO_TAX",
    };

  // Taxable + POSTED → require valid immutable provenance.
  try {
    const res = await resolveSupplierInvoiceHistoricalInputVat(dbh, invoiceId);
    if (res.status === "RESOLVED")
      return {
        ...base,
        vatProvenanceStatus: "ELIGIBLE_PROVENANCE",
        eligibleForFutureCreditNoteFoundation: true,
        reason: "ELIGIBLE_PROVENANCE",
      };
    // Zero-tax was handled above; RESOLVED is the only taxable success.
    return {
      ...base,
      vatProvenanceStatus: "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED",
      eligibleForFutureCreditNoteFoundation: false,
      reason: "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED",
    };
  } catch (e: any) {
    if (e?.code === "HISTORICAL_INPUT_VAT_PROVENANCE_REQUIRED")
      return {
        ...base,
        vatProvenanceStatus: "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED",
        eligibleForFutureCreditNoteFoundation: false,
        reason: "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED",
      };
    if (e?.code === "VAT_PROVENANCE_CORRUPT")
      return {
        ...base,
        vatProvenanceStatus: "BLOCKED_VAT_PROVENANCE_CORRUPT",
        eligibleForFutureCreditNoteFoundation: false,
        reason: "VAT_PROVENANCE_CORRUPT",
      };
    throw e;
  }
}

/**
 * READ-ONLY provenance coverage report (Phase 5C.0.2 §21/§22). Counts POSTED
 * supplier invoices by taxable/zero-tax and, for taxable, whether a VAT
 * provenance link exists. Establishes how many historical taxable invoices would
 * be blocked from future Supplier Credit Notes. Never remediates.
 */
export async function supplierInvoiceTaxProvenanceReport(dbh: Db) {
  const row = (await (dbh as any).execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE si.status='posted' AND si.tax_amount > ${AMOUNT_TOLERANCE})::int AS posted_taxable,
        COUNT(*) FILTER (WHERE si.status='posted' AND si.tax_amount > ${AMOUNT_TOLERANCE}
          AND EXISTS (SELECT 1 FROM supplier_invoice_tax_journal_links l WHERE l.supplier_invoice_id = si.id))::int AS posted_taxable_linked,
        COUNT(*) FILTER (WHERE si.status='posted' AND si.tax_amount > ${AMOUNT_TOLERANCE}
          AND NOT EXISTS (SELECT 1 FROM supplier_invoice_tax_journal_links l WHERE l.supplier_invoice_id = si.id))::int AS posted_taxable_unlinked,
        COUNT(*) FILTER (WHERE si.status='posted' AND si.tax_amount <= ${AMOUNT_TOLERANCE})::int AS posted_zero_tax
      FROM supplier_invoices si
    `)) as any;
  const r = (row.rows ?? row ?? [])[0] ?? {};
  return {
    postedTaxable: Number(r.posted_taxable || 0),
    postedTaxableWithLink: Number(r.posted_taxable_linked || 0),
    postedTaxableWithoutLink: Number(r.posted_taxable_unlinked || 0),
    postedZeroTax: Number(r.posted_zero_tax || 0),
  };
}
