CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '',
	"tone" text DEFAULT 'info' NOT NULL,
	"link" text DEFAULT '',
	"read" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"read_at" text
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;