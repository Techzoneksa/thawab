CREATE TABLE "payroll_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"employee_id" text,
	"employee_name" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '',
	"salary" double precision DEFAULT 0 NOT NULL,
	"allowances" double precision DEFAULT 0 NOT NULL,
	"deductions" double precision DEFAULT 0 NOT NULL,
	"net" double precision DEFAULT 0 NOT NULL,
	"notes" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pay_method" text DEFAULT 'bank' NOT NULL,
	"total_amount" double precision DEFAULT 0 NOT NULL,
	"journal_entry_id" text,
	"notes" text DEFAULT '',
	"approved_by" text,
	"approved_at" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;