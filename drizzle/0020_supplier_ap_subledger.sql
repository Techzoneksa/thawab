-- Phase 3A — Supplier financial identity (non-destructive additive columns).
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "supplier_code" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "legal_name" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "commercial_registration" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'SAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "bank_name" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "iban" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "iban_normalized" text;--> statement-breakpoint
-- Unique supplier code when present (NULLs allowed for legacy rows).
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_code_idx" ON "suppliers" ("supplier_code");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_journal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"journal_line_id" text NOT NULL,
	"source_type" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "supplier_journal_links_journal_line_id_unique" UNIQUE("journal_line_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_journal_links" ADD CONSTRAINT "supplier_journal_links_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_journal_links" ADD CONSTRAINT "supplier_journal_links_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_journal_links" ADD CONSTRAINT "supplier_journal_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_journal_links_line_idx" ON "supplier_journal_links" ("journal_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_journal_links_supplier_idx" ON "supplier_journal_links" ("supplier_id");
