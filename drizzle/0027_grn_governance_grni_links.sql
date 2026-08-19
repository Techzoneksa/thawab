-- Phase 3D.1 — GRN governance lifecycle + GRNI subledger. Additive, non-
-- destructive, idempotent. This migration deliberately creates NO GRNI account
-- and hardcodes NO account code: the GRNI accrual account is chosen by an
-- administrator from EXISTING valid liability accounts and explicitly confirmed
-- (finance.account_mapping.update). It never rewrites journal history, never
-- writes any balance, and never mutates inventory.

-- GRN governance actor columns (draft → submitted → approved → posted lifecycle).
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "submitted_by" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "submitted_at" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "approved_by" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "approved_at" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "posted_by" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "posted_at" text;--> statement-breakpoint
-- New receipts are DRAFTs (zero accounting/inventory effect until POST). Existing
-- rows are untouched; posting code always sets the status explicitly.
ALTER TABLE "goods_receipts" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint

-- GRNI subledger: maps a goods receipt (and optionally a GRN line) to a SINGLE
-- GRNI control-account journal line. The monetary amount lives ONLY in
-- journal_lines — there is deliberately NO amount column here. journal_line_id is
-- UNIQUE so one GRNI line can never be double-linked. link_type distinguishes the
-- original receipt credit ('receipt') from the reversal debit mirror ('reversal').
CREATE TABLE IF NOT EXISTS "grni_journal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"goods_receipt_id" text NOT NULL,
	"goods_receipt_line_id" text,
	"journal_line_id" text NOT NULL,
	"link_type" text DEFAULT 'receipt' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grni_journal_links" ADD CONSTRAINT "grni_journal_links_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grni_journal_links" ADD CONSTRAINT "grni_journal_links_goods_receipt_line_id_goods_receipt_lines_id_fk" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "public"."goods_receipt_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grni_journal_links" ADD CONSTRAINT "grni_journal_links_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- One GRNI journal line can never belong to two receipts.
CREATE UNIQUE INDEX IF NOT EXISTS "grni_journal_links_line_idx" ON "grni_journal_links" ("journal_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grni_journal_links_grn_idx" ON "grni_journal_links" ("goods_receipt_id");
