CREATE TABLE "finance_certifications" (
	"id" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'FINANCE_PHASE_1A' NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"status" text NOT NULL,
	"application_commit" text DEFAULT '',
	"result_json" text DEFAULT '{}' NOT NULL,
	"certified_by" text,
	"certified_by_name" text DEFAULT '',
	"certified_at" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_certifications" ADD CONSTRAINT "finance_certifications_certified_by_users_id_fk" FOREIGN KEY ("certified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_certifications_phase_env_commit_idx" ON "finance_certifications" ("phase","environment","application_commit");