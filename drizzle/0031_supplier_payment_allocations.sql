-- Phase 5A — Supplier Payment ↔ Invoice allocation (settlement metadata).
-- Additive, forward-only, idempotent. Stores NO balance: invoice outstanding and
-- payment unapplied stay derived from posted AP journal lines minus Σ allocations.
-- amount strictly > 0 (a zero allocation is a removal); ONE effective row per
-- (payment, invoice). Creating/editing/removing a row produces NO accounting.
CREATE TABLE IF NOT EXISTS "supplier_payment_allocations" (
  "id" text PRIMARY KEY NOT NULL,
  "supplier_payment_id" text NOT NULL REFERENCES "supplier_payments"("id"),
  "supplier_invoice_id" text NOT NULL REFERENCES "supplier_invoices"("id"),
  "amount" double precision NOT NULL,
  "created_by" text REFERENCES "users"("id"),
  "created_at" text NOT NULL DEFAULT '',
  "updated_by" text REFERENCES "users"("id"),
  "updated_at" text,
  CONSTRAINT "supplier_payment_allocations_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payment_allocations_pair_idx"
  ON "supplier_payment_allocations" ("supplier_payment_id", "supplier_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_payment_idx"
  ON "supplier_payment_allocations" ("supplier_payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_invoice_idx"
  ON "supplier_payment_allocations" ("supplier_invoice_id");
