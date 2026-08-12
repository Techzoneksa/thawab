CREATE TABLE "backup_config" (
	"id" text PRIMARY KEY NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"time" text DEFAULT '03:00' NOT NULL,
	"retention" integer DEFAULT 30 NOT NULL,
	"location" text DEFAULT 'السعودية',
	"updated_by" text,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_records" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"note" text DEFAULT '',
	"created_by" text,
	"created_by_name" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_config" ADD CONSTRAINT "backup_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;