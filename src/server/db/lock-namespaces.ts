/**
 * Centralized advisory-lock namespace registry.
 *
 * All two-int `pg_advisory_xact_lock(ns, hashtext(key))` callers use a namespace
 * from here so the distinct concurrency domains never collide by accident. Each
 * value is a stable, unique first operand; the second operand is the hashed
 * entity key (e.g. a linked GL account id).
 *
 * Note: document numbering (numbering.ts) uses the SINGLE-operand advisory-lock
 * form `pg_advisory_xact_lock(bigint)`, which occupies a SEPARATE lock space
 * from the two-operand form used here — so it never collides with these
 * namespaces regardless of value.
 */
export const LOCK_NS = {
  /** Phase 2A — cross-table Cash/Bank GL-mapping decisions (one account ↔ one master). */
  CASH_BANK_MAPPING: 42,
  /** Phase 2C — cash payment posting (sufficiency check + journal) serialization. */
  CASH_PAYMENT_POSTING: 43,
  /** Phase 3B.2 — system-account mapping reassignment (e.g. Input VAT) serialization. */
  ACCOUNT_MAPPING: 44,
  /** Phase 3D — governed Goods Receipt posting per Purchase Order (over-receive guard). */
  GRN_POSTING: 45,
  /** Phase 5A — supplier payment↔invoice allocation (per payment AND per invoice
   *  resource), so concurrent allocations recompute outstanding/unapplied safely. */
  PAYMENT_ALLOCATION: 46,
  /** Phase 5B.1 — governed receipt CAPACITY gate, keyed by goods_receipt_id. ALL
   *  operations that validate/consume/release/reverse a receipt's shared line
   *  capacity serialize on it: Supplier Invoice matched POST, Purchase Return
   *  POST, Purchase Return REVERSE and GRN REVERSE. Acquired FIRST (before any
   *  FOR UPDATE row lock) in a deterministic sorted order over distinct GRN ids,
   *  so per-GRN serialization holds while independent GRNs stay concurrent and no
   *  FK-KEY-SHARE/row-lock deadlock can form (the 5A.1 lesson). */
  RECEIPT_CAPACITY: 47,
  /** Phase Sales-2 — customer receipt↔sales-invoice allocation (per receipt AND
   *  per invoice resource), so concurrent allocations recompute outstanding/
   *  unapplied safely. Mirror of PAYMENT_ALLOCATION on the AR side. */
  RECEIVABLE_ALLOCATION: 48,
} as const;

export type LockNamespace = (typeof LOCK_NS)[keyof typeof LOCK_NS];
