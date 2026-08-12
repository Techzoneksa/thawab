CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '',
	"title" text DEFAULT '',
	"salary" double precision DEFAULT 0 NOT NULL,
	"phone" text DEFAULT '',
	"email" text DEFAULT '',
	"joined_at" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;