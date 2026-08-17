CREATE TABLE IF NOT EXISTS "cashboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"linked_account_id" text NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"branch_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "cashboxes_code_unique" UNIQUE("code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"account_number" text,
	"iban" text,
	"iban_normalized" text,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"linked_account_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"branch_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "bank_accounts_code_unique" UNIQUE("code")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cashboxes" ADD CONSTRAINT "cashboxes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cashboxes_linked_account_idx" ON "cashboxes" ("linked_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashboxes_status_idx" ON "cashboxes" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_linked_account_idx" ON "bank_accounts" ("linked_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_iban_normalized_idx" ON "bank_accounts" ("iban_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_status_idx" ON "bank_accounts" ("status");
