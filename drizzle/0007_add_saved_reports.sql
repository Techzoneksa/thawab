CREATE TABLE "saved_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'financial' NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"format" text DEFAULT 'pdf' NOT NULL,
	"scheduled" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;