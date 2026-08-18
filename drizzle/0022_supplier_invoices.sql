-- Phase 3B — Supplier Invoices (فواتير الموردين). Additive & idempotent.
-- A supplier invoice is a controlled financial DOCUMENT. Its header/lines are not
-- accounting truth: only POSTING creates the certified accrual journal
-- (Dr expense/asset + Dr input VAT / Cr accounts payable) and links the AP CREDIT
-- line to the supplier subledger. Nothing here writes an accounting balance.

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"supplier_invoice_number" text DEFAULT '',
	"supplier_invoice_number_normalized" text DEFAULT '',
	"supplier_id" text NOT NULL,
	"invoice_date" text DEFAULT '' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"external_reference" text,
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"journal_entry_id" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	"submitted_by" text,
	"submitted_at" text,
	"approved_by" text,
	"approved_at" text,
	"posted_by" text,
	"posted_at" text,
	"reversed_by" text,
	"reversed_at" text,
	CONSTRAINT "supplier_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"description" text DEFAULT '',
	"account_id" text NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"line_subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_rate" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"line_total" double precision DEFAULT 0 NOT NULL,
	"cost_center_id" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_supplier_invoice_id_supplier_invoices_id_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_number_idx" ON "supplier_invoices" ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_journal_entry_idx" ON "supplier_invoices" ("journal_entry_id");--> statement-breakpoint
-- Duplicate-entry protection: one supplier cannot re-enter the same document number.
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_supplier_doc_idx" ON "supplier_invoices" ("supplier_id","supplier_invoice_number_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_supplier_idx" ON "supplier_invoices" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_status_idx" ON "supplier_invoices" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_date_idx" ON "supplier_invoices" ("invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_due_idx" ON "supplier_invoices" ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_lines_invoice_idx" ON "supplier_invoice_lines" ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoice_lines_account_idx" ON "supplier_invoice_lines" ("account_id");--> statement-breakpoint
-- Idempotency backstop: at most one journal per supplier-invoice source, scoped to
-- supplier_invoice only so existing sources/constraints are never touched.
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_supplier_invoice_source_idx" ON "journal_entries" ("source_id") WHERE "source_type" = 'supplier_invoice';--> statement-breakpoint
-- Recoverable input VAT control account (ضريبة القيمة المضافة — مدخلات), an ASSET.
-- Resolved at posting time by systemKey 'input_vat' (never a hardcoded number).
-- Seeded idempotently for existing deployments; the bootstrap seed keeps it in sync.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "accounts" WHERE "system_key" = 'input_vat')
     AND NOT EXISTS (SELECT 1 FROM "accounts" WHERE "code" = '110306') THEN
    INSERT INTO "accounts" ("id","code","name","classification","level","parent_id","system_key","currency","balance","postable","status","created_at","updated_at")
    VALUES ('ACC-110306','110306','ضريبة القيمة المضافة — مدخلات قابلة للاسترداد','asset',4,
            (SELECT "id" FROM "accounts" WHERE "code" = '1103' LIMIT 1),
            'input_vat','SAR',0,true,'active','','');
  END IF;
END $$;
