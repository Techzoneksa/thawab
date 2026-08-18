-- Phase 3B.2 — Input VAT mapping confirmation provenance. Additive & idempotent.
--
-- A system-purpose GL mapping (accounts.system_key, e.g. 'input_vat') is no
-- longer trusted for taxable posting on its own: `code + system_key` cannot prove
-- how the mapping came to exist (it could pre-date 0022, or have been set through
-- the generic accounts API). Taxable Supplier Invoice posting now additionally
-- requires an EXPLICIT administrator confirmation that matches the current
-- mapping.
--
-- This migration ONLY creates the confirmation store. It deliberately does NOT
-- insert any confirmation row: existing mappings (including any 110306/input_vat)
-- remain UNCONFIRMED until an authorized Finance administrator confirms them —
-- auto-confirming here would recreate the very trust problem it closes. No
-- account, journal, journal line, AP link, invoice, or balance is touched.
CREATE TABLE IF NOT EXISTS "finance_account_mapping_confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"account_id" text NOT NULL,
	"confirmed_by" text,
	"confirmed_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "finance_account_mapping_confirmations_purpose_unique" UNIQUE("purpose")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_account_mapping_confirmations" ADD CONSTRAINT "finance_account_mapping_confirmations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_account_mapping_confirmations" ADD CONSTRAINT "finance_account_mapping_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_account_mapping_confirmations_purpose_idx" ON "finance_account_mapping_confirmations" ("purpose");
