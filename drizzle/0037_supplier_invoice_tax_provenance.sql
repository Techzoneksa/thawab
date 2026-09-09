-- Phase 5C.0.2 — FORWARD Input-VAT journal provenance. Additive & idempotent.
-- Records the immutable identity of the Input VAT debit journal line that a
-- taxable Supplier Invoice POST actually created, captured inside that same POST
-- transaction. NO amount column (the linked journal_lines row is the evidence),
-- NO second VAT ledger. One link per invoice, one line per link. Historical
-- taxable invoices are NOT backfilled.

CREATE TABLE IF NOT EXISTS "supplier_invoice_tax_journal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"journal_line_id" text NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_tax_journal_links" ADD CONSTRAINT "supplier_invoice_tax_journal_links_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_tax_journal_links" ADD CONSTRAINT "supplier_invoice_tax_journal_links_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_tax_journal_links" ADD CONSTRAINT "supplier_invoice_tax_journal_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- One VAT provenance link per invoice; one journal line per link.
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoice_tax_journal_links_invoice_idx" ON "supplier_invoice_tax_journal_links" ("supplier_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoice_tax_journal_links_line_idx" ON "supplier_invoice_tax_journal_links" ("journal_line_id");
