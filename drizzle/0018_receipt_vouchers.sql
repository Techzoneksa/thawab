CREATE TABLE IF NOT EXISTS "receipt_vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"voucher_number" text NOT NULL,
	"voucher_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cashbox_id" text,
	"bank_account_id" text,
	"payer_name" text DEFAULT '' NOT NULL,
	"payer_reference_type" text,
	"payer_reference_id" text,
	"external_reference" text,
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"currency" text DEFAULT 'SAR' NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
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
	CONSTRAINT "receipt_vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipt_voucher_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_voucher_id" text NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"account_id" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"description" text DEFAULT '',
	"cost_center_id" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
-- Exactly ONE money destination: never both, never neither.
DO $$ BEGIN
  ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_one_destination_chk"
    CHECK (("cashbox_id" IS NOT NULL AND "bank_account_id" IS NULL)
        OR ("cashbox_id" IS NULL AND "bank_account_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_cashbox_id_cashboxes_id_fk" FOREIGN KEY ("cashbox_id") REFERENCES "public"."cashboxes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_vouchers" ADD CONSTRAINT "receipt_vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_voucher_lines" ADD CONSTRAINT "receipt_voucher_lines_receipt_voucher_id_receipt_vouchers_id_fk" FOREIGN KEY ("receipt_voucher_id") REFERENCES "public"."receipt_vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_voucher_lines" ADD CONSTRAINT "receipt_voucher_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "receipt_voucher_lines" ADD CONSTRAINT "receipt_voucher_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_vouchers_number_idx" ON "receipt_vouchers" ("voucher_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receipt_vouchers_journal_entry_idx" ON "receipt_vouchers" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_vouchers_status_idx" ON "receipt_vouchers" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_vouchers_date_idx" ON "receipt_vouchers" ("voucher_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_vouchers_cashbox_idx" ON "receipt_vouchers" ("cashbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_vouchers_bank_idx" ON "receipt_vouchers" ("bank_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_voucher_lines_voucher_idx" ON "receipt_voucher_lines" ("receipt_voucher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_voucher_lines_account_idx" ON "receipt_voucher_lines" ("account_id");--> statement-breakpoint
-- Idempotency backstop: at most one journal per receipt voucher source, scoped to
-- receipt_voucher only so existing sources/constraints are never touched.
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_receipt_voucher_source_idx" ON "journal_entries" ("source_id") WHERE "source_type" = 'receipt_voucher';
