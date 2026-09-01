-- Phase Sales-1 — Customers, Accounts Receivable subledger & Sales Invoices.
-- Additive & idempotent. A sales invoice is a controlled financial DOCUMENT: its
-- header/lines are not accounting truth. Only POSTING creates the certified
-- revenue journal (Dr accounts receivable / Cr revenue) and links the AR DEBIT
-- line to the customer subledger. Revenue-only (no VAT, no inventory) in Sales-1.

CREATE TABLE IF NOT EXISTS "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_code" text,
	"name" text NOT NULL,
	"legal_name" text DEFAULT '',
	"commercial_registration" text,
	"tax_number" text DEFAULT '',
	"phone" text,
	"email" text,
	"contact_person" text DEFAULT '',
	"address" text DEFAULT '',
	"building_no" text DEFAULT '',
	"street" text DEFAULT '',
	"district" text DEFAULT '',
	"city" text DEFAULT '',
	"postal_code" text DEFAULT '',
	"additional_no" text DEFAULT '',
	"currency" text DEFAULT 'SAR' NOT NULL,
	"payment_terms_days" integer,
	"notes" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_journal_links" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"journal_line_id" text NOT NULL,
	"source_type" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"invoice_date" text DEFAULT '' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"subtotal" double precision DEFAULT 0 NOT NULL,
	"tax_amount" double precision DEFAULT 0 NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"project_id" text,
	"customer_reference" text,
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
	CONSTRAINT "sales_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"sales_invoice_id" text NOT NULL,
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
  ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_journal_links" ADD CONSTRAINT "customer_journal_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_journal_links" ADD CONSTRAINT "customer_journal_links_journal_line_id_journal_lines_id_fk" FOREIGN KEY ("journal_line_id") REFERENCES "public"."journal_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "customer_journal_links" ADD CONSTRAINT "customer_journal_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_sales_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("sales_invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_code_idx" ON "customers" ("customer_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_status_idx" ON "customers" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_journal_links_line_idx" ON "customer_journal_links" ("journal_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_journal_links_customer_idx" ON "customer_journal_links" ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_number_idx" ON "sales_invoices" ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_journal_entry_idx" ON "sales_invoices" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_customer_idx" ON "sales_invoices" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_status_idx" ON "sales_invoices" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_date_idx" ON "sales_invoices" ("invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_due_idx" ON "sales_invoices" ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_invoice_idx" ON "sales_invoice_lines" ("sales_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_account_idx" ON "sales_invoice_lines" ("account_id");--> statement-breakpoint
-- Idempotency backstop: at most one journal per sales-invoice source, scoped to
-- sales_invoice only so existing sources/constraints are never touched.
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_sales_invoice_source_idx" ON "journal_entries" ("source_id") WHERE "source_type" = 'sales_invoice';--> statement-breakpoint
-- Accounts Receivable control account (ذمم مدينة — عملاء), an ASSET. Resolved at
-- posting time by systemKey 'accounts_receivable' (never a hardcoded number).
-- Seeded idempotently for existing deployments; the bootstrap seed keeps it in sync.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "accounts" WHERE "system_key" = 'accounts_receivable')
     AND NOT EXISTS (SELECT 1 FROM "accounts" WHERE "code" = '110307') THEN
    INSERT INTO "accounts" ("id","code","name","classification","level","parent_id","system_key","currency","balance","postable","status","created_at","updated_at")
    VALUES ('ACC-110307','110307','ذمم مدينة — عملاء','asset',4,
            (SELECT "id" FROM "accounts" WHERE "code" = '1103' LIMIT 1),
            'accounts_receivable','SAR',0,true,'active','','');
  END IF;
END $$;
