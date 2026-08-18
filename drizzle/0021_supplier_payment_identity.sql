-- Phase 3A.1 — Supplier payment event identity.
-- Gives each supplier payment a stable business id so the GL source_id becomes the
-- payment id (SPY-…), not the supplier id. This makes the existing 0011 index
-- journal_entries_source_unique_idx (source_type, source_id) WHERE status='posted'
-- correct for supplier_payment: one supplier → many payments (distinct source_ids),
-- one payment → one posted journal (retry with the same id is blocked). 0011 is
-- intentionally NOT modified. Legacy rows (source_id = supplier id) remain readable.
CREATE TABLE IF NOT EXISTS "supplier_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"payment_method" text DEFAULT 'bank' NOT NULL,
	"reference" text,
	"payment_date" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '',
	"journal_entry_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_journal_entry_idx" ON "supplier_payments" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_payments_supplier_idx" ON "supplier_payments" ("supplier_id");
