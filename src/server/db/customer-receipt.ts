/**
 * Phase Sales-2 — Customer Receipt (تحصيل من عميل), server-authoritative.
 *
 * The AR mirror of paySupplier. A customer receipt posts, with a STABLE per-receipt
 * identity (idempotent under retries + concurrency):
 *
 *     Dr  Cash | Bank      (amount)
 *         Cr  Accounts Receivable   (amount)
 *
 * and links the AR CREDIT line to the customer subledger (customer_journal_links)
 * so the customer receivable falls automatically. The GL is the only accounting
 * source of truth; no balance is stored here. Settlement (which invoices this
 * receipt pays) is recorded separately as allocation metadata and never touches GL.
 */
import { eq, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { customers, customerReceipts } from "./schema";
import {
  resolveSystemAccountId,
  cashOrBankAccountId,
  postBalancedEntry,
  existingSourceEntryId,
  SYS,
} from "./gl";
import { linkEntryArLine } from "./customer";
import { AppError } from "./errors";
import { JournalStatus, JournalSource, CustomerStatus } from "@/lib/enums";
import type { Ctx } from "./api-utils";

export interface ReceiveFromCustomerInput {
  customerId: string;
  amount: number;
  method?: "cash" | "bank";
  /** Stable idempotency key for the receipt EVENT; a retry with the same key
   *  reuses the existing journal (no second accounting effect). Omit to mint a
   *  fresh receipt event. */
  idempotencyKey?: string | null;
  reference?: string | null;
  date?: string | null;
  note?: string | null;
}
export interface ReceiveFromCustomerResult {
  receipt: any;
  entryId: string;
  reused: boolean;
}

/** Normalize a caller key / mint a fresh id — always prefixed CRC-. */
function receiptEventId(key?: string | null): string {
  const k = (key ?? "").trim();
  if (!k) return genId("CRC");
  return k.startsWith("CRC-") ? k : `CRC-${k}`;
}

/**
 * Post a customer receipt (Dr Cash|Bank / Cr AR) idempotently.
 *
 * BEGIN → upsert the receipt event (ON CONFLICT DO NOTHING) → lock it FOR UPDATE
 * → if already journaled: reuse → else post through the certified engine with
 * source_type=customer_receipt, source_id=receipt id (existingSourceEntryId + the
 * 0036 unique index are the DB backstops) → link the AR credit line to the
 * customer (exactly one) → set journal_entry_id → COMMIT.
 *
 * One customer → many receipts (distinct ids); one receipt → exactly one journal.
 */
export async function receiveFromCustomer(
  ctx: Ctx,
  input: ReceiveFromCustomerInput,
): Promise<ReceiveFromCustomerResult> {
  const amount = Number(input.amount);
  if (!(amount > 0))
    throw new AppError("قيمة التحصيل يجب أن تكون أكبر من صفر", 400, "AMOUNT_INVALID");
  const method = input.method === "cash" ? "cash" : "bank";
  const receiptId = receiptEventId(input.idempotencyKey);
  const date = (input.date || now().slice(0, 10)).slice(0, 10);
  const ts = now();

  const result = await db.transaction(async (tx) => {
    const cust = (
      await tx.select().from(customers).where(eq(customers.id, input.customerId)).limit(1)
    )[0];
    if (!cust) throw new AppError("العميل غير موجود", 404, "CUSTOMER_NOT_FOUND");
    if (cust.status !== CustomerStatus.ACTIVE)
      throw new AppError("العميل غير نشط — لا يمكن تسجيل تحصيل له", 400, "CUSTOMER_INACTIVE");

    // Stable event anchor — created once; a retry hits the existing row.
    await tx
      .insert(customerReceipts)
      .values({
        id: receiptId,
        customerId: input.customerId,
        amount,
        receiptMethod: method,
        reference: input.reference ?? null,
        receiptDate: date,
        note: input.note ?? "",
        status: "pending",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      })
      .onConflictDoNothing();

    const rec = (
      await tx
        .select()
        .from(customerReceipts)
        .where(eq(customerReceipts.id, receiptId))
        .for("update")
        .limit(1)
    )[0];

    // Idempotency-key integrity: the SAME key must represent the SAME business
    // intent. If the locked event's payload differs, reject — a reused key must
    // not silently repurpose an existing receipt.
    const mismatch =
      rec.customerId !== input.customerId ||
      Math.abs(Number(rec.amount) - amount) > 0.005 ||
      rec.receiptMethod !== method ||
      (rec.receiptDate || "") !== date ||
      (rec.reference || "") !== (input.reference ?? "");
    if (mismatch)
      throw new AppError(
        "مفتاح التحصيل مستخدم بالفعل لتحصيل آخر مختلف (عميل/مبلغ/طريقة/تاريخ/مرجع)",
        409,
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
      );

    // Already posted → idempotent reuse.
    if (rec.journalEntryId) return { receipt: rec, entryId: rec.journalEntryId, reused: true };
    const already = await existingSourceEntryId(tx as any, "customer_receipt", receiptId);
    if (already) {
      await tx
        .update(customerReceipts)
        .set({ journalEntryId: already, status: "posted", updatedAt: now() })
        .where(eq(customerReceipts.id, receiptId));
      return { receipt: { ...rec, journalEntryId: already }, entryId: already, reused: true };
    }

    const arId = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_RECEIVABLE);
    const cashBank = await cashOrBankAccountId(tx as any, method);
    const entryId = await postBalancedEntry(tx as any, {
      date,
      description: `تحصيل من العميل ${cust.name}${input.note ? ` — ${input.note}` : ""}`,
      source: JournalSource.RECEIPT,
      sourceType: "customer_receipt",
      sourceId: receiptId,
      lines: [
        { accountId: cashBank, debit: amount },
        { accountId: arId, credit: amount },
      ],
      userId: ctx.user.id,
      status: JournalStatus.POSTED,
    });
    await linkEntryArLine(tx as any, {
      customerId: input.customerId,
      entryId,
      sourceType: "customer_receipt",
      userId: ctx.user.id,
    });
    await tx
      .update(customerReceipts)
      .set({ journalEntryId: entryId, status: "posted", updatedAt: now() })
      .where(eq(customerReceipts.id, receiptId));
    return {
      receipt: { ...rec, journalEntryId: entryId, status: "posted" },
      entryId,
      reused: false,
    };
  });

  if (!result.reused) {
    await addAudit({
      action: "CUSTOMER_RECEIPT_POSTED",
      entityType: "customer",
      entityId: input.customerId,
      description: `تحصيل ${amount} من العميل (سند قبض ${receiptId})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
  }
  return result;
}
