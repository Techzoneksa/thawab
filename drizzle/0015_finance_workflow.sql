ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "submitted_by" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "submitted_at" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approved_by" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "approved_at" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_workflow_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"user_id" text,
	"user_name" text DEFAULT '',
	"reason" text DEFAULT '',
	"metadata" text DEFAULT '{}',
	"created_at" text DEFAULT '' NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "finance_workflow_events" ADD CONSTRAINT "finance_workflow_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_workflow_events_entity_idx" ON "finance_workflow_events" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_workflow_events_created_idx" ON "finance_workflow_events" ("created_at");
