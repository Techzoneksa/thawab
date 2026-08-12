CREATE TABLE "donor_orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'government' NOT NULL,
	"contact_person" text DEFAULT '',
	"phone" text DEFAULT '',
	"email" text DEFAULT '',
	"grants_count" integer DEFAULT 0 NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endowment_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"endowment_id" text,
	"endowment_name" text DEFAULT '',
	"period" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"date" text DEFAULT '',
	"status" text DEFAULT 'realized' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_donations" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"donor_name" text DEFAULT '' NOT NULL,
	"donor_id" text,
	"amount" double precision DEFAULT 0 NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"project_id" text,
	"project_name" text DEFAULT '',
	"next_run_date" text DEFAULT '',
	"start_date" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donor_orgs" ADD CONSTRAINT "donor_orgs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endowment_returns" ADD CONSTRAINT "endowment_returns_endowment_id_endowments_id_fk" FOREIGN KEY ("endowment_id") REFERENCES "public"."endowments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endowment_returns" ADD CONSTRAINT "endowment_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_donations" ADD CONSTRAINT "recurring_donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_donations" ADD CONSTRAINT "recurring_donations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_donations" ADD CONSTRAINT "recurring_donations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;