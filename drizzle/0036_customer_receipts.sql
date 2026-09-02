-- Phase Sales-2 — Customer Receipts & AR settlement allocation. Additive &
-- idempotent. A customer receipt posts Dr Cash|Bank / Cr AR and links the AR
-- credit to the customer subledger. Allocation is settlement metadata only —
-- it writes NO journal, NO GL, NO cash/bank movement.

CREATE TABLE IF NOT EXISTS "customer_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"receipt_method" text DEFAULT 'bank' NOT NULL,
	"reference" text,
	"receipt_date" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '',
	"journal_entry_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_receipt_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_receipt_id" text NOT NULL,
	"sales_invoice_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_by" text,
	"updated_at" text,
	CONSTRAINT "customer_receipt_allocations_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "customer_receipt_allocations_amount_2dp" CHECK (abs("amount" - round("amount"::numeric, 2)) < 0.000001)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipts" ADD CONSTRAINT "customer_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_customer_receipt_id_customer_receipts_id_fk" FOREIGN KEY ("customer_receipt_id") REFERENCES "public"."customer_receipts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_sales_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("sales_invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_receipt_allocations" ADD CONSTRAINT "customer_receipt_allocations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_receipts_journal_entry_idx" ON "customer_receipts" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_receipts_customer_idx" ON "customer_receipts" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_receipt_allocations_pair_idx" ON "customer_receipt_allocations" ("customer_receipt_id","sales_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_receipt_allocations_receipt_idx" ON "customer_receipt_allocations" ("customer_receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_receipt_allocations_invoice_idx" ON "customer_receipt_allocations" ("sales_invoice_id");--> statement-breakpoint
-- Idempotency backstop: at most one journal per customer-receipt source.
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_customer_receipt_source_idx" ON "journal_entries" ("source_id") WHERE "source_type" = 'customer_receipt';
