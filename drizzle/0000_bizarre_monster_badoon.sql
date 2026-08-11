CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"classification" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"parent_id" text,
	"system_key" text,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"postable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "accounts_system_key_unique" UNIQUE("system_key")
);
--> statement-breakpoint
CREATE TABLE "aid_records" (
	"id" text PRIMARY KEY NOT NULL,
	"beneficiary_id" text NOT NULL,
	"project_id" text,
	"type" text DEFAULT 'urgent' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"journal_entry_id" text,
	"date" text DEFAULT '' NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	"delivered_at" text,
	"delivered_by" text,
	"delivery_method" text DEFAULT '',
	"delivery_notes" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"requester" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"project_id" text,
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_depreciations" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"book_value_after" double precision DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'straight_line' NOT NULL,
	"notes" text DEFAULT '',
	"source_type" text,
	"source_id" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"type" text NOT NULL,
	"from_location" text DEFAULT '',
	"to_location" text DEFAULT '',
	"from_responsible" text DEFAULT '',
	"to_responsible" text DEFAULT '',
	"cost" double precision DEFAULT 0 NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '',
	"notes" text DEFAULT '',
	"source_type" text,
	"source_id" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text DEFAULT '',
	"before" text,
	"after" text,
	"ip" text DEFAULT '',
	"timestamp" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"file_number" text DEFAULT '',
	"id_number" text DEFAULT '',
	"phone" text,
	"city" text DEFAULT '',
	"address" text DEFAULT '',
	"category" text DEFAULT 'needy_family' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"family_members" integer DEFAULT 1 NOT NULL,
	"monthly_income" double precision DEFAULT 0 NOT NULL,
	"marital_status" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"manager" text,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" text,
	"cost_center_id" text,
	"project_id" text,
	"planned_amount" double precision DEFAULT 0 NOT NULL,
	"actual_amount" double precision DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" text NOT NULL,
	"amount" double precision NOT NULL,
	"spent" double precision DEFAULT 0 NOT NULL,
	"department" text DEFAULT '',
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"approved_by" text,
	"approved_at" text,
	"locked_by" text,
	"locked_at" text,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"goal" double precision DEFAULT 0 NOT NULL,
	"raised" double precision DEFAULT 0 NOT NULL,
	"start_date" text DEFAULT '',
	"end_date" text DEFAULT '',
	"status" text DEFAULT 'planned' NOT NULL,
	"description" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"manager" text DEFAULT '',
	"budget" double precision DEFAULT 0 NOT NULL,
	"spent" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"donor_id" text NOT NULL,
	"project_id" text,
	"campaign_id" text,
	"amount" double precision NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"channel" text DEFAULT 'direct' NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"receipt_id" text,
	"journal_entry_id" text,
	"notes" text DEFAULT '',
	"date" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'individual' NOT NULL,
	"email" text,
	"phone" text,
	"city" text DEFAULT '',
	"address" text DEFAULT '',
	"tag" text DEFAULT 'bronze',
	"total_donations" double precision DEFAULT 0 NOT NULL,
	"donation_count" integer DEFAULT 0 NOT NULL,
	"last_donation" text,
	"recurring" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endowments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"returns" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" text,
	"closed_by_id" text,
	"closed_by_name" text,
	"reopened_at" text,
	"reopened_by_id" text,
	"reopened_by_name" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '',
	"category" text DEFAULT '',
	"location" text DEFAULT '',
	"cost" double precision DEFAULT 0 NOT NULL,
	"salvage_value" double precision DEFAULT 0 NOT NULL,
	"useful_life_months" integer DEFAULT 60 NOT NULL,
	"accumulated_depreciation" double precision DEFAULT 0 NOT NULL,
	"depreciation_method" text DEFAULT 'straight_line' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"condition" text DEFAULT 'good',
	"purchase_date" text DEFAULT '',
	"supplier_id" text,
	"serial_number" text DEFAULT '',
	"responsible_person" text DEFAULT '',
	"source_type" text,
	"source_id" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"donor" text NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" text DEFAULT '',
	"end_date" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text DEFAULT '',
	"unit" text DEFAULT 'قطعة' NOT NULL,
	"category" text DEFAULT '',
	"warehouse_id" text,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"min_quantity" double precision DEFAULT 0 NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"period_id" text,
	"project_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_type" text,
	"source_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"posted_by" text,
	"posted_at" text,
	"reversed_by" text,
	"reversed_at" text,
	"reversed_of" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "journal_entries_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_entry_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" text NOT NULL,
	"description" text DEFAULT '',
	"debit" double precision DEFAULT 0 NOT NULL,
	"credit" double precision DEFAULT 0 NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"cost_center_id" text,
	"project_id" text,
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '',
	"attendees" text DEFAULT '[]',
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"type" text DEFAULT 'board' NOT NULL,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '',
	"type" text DEFAULT '',
	"category" text DEFAULT '',
	"branch" text DEFAULT '',
	"manager" text NOT NULL,
	"budget" double precision DEFAULT 0 NOT NULL,
	"spent" double precision DEFAULT 0 NOT NULL,
	"donations" double precision DEFAULT 0 NOT NULL,
	"beneficiary_count" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"fund" text DEFAULT 'unrestricted' NOT NULL,
	"start_date" text DEFAULT '',
	"end_date" text DEFAULT '',
	"description" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" text,
	"description" text DEFAULT '' NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"received_quantity" double precision DEFAULT 0 NOT NULL,
	"unit" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"request_id" text,
	"subject" text NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"delivery_date" text DEFAULT '',
	"status" text DEFAULT 'draft' NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"received_amount" double precision DEFAULT 0 NOT NULL,
	"journal_entry_id" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"department" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"requester" text DEFAULT '',
	"amount" double precision DEFAULT 0 NOT NULL,
	"delivery_date" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"supplier_id" text,
	"supplier" text NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"delivery" text DEFAULT '',
	"warranty" text DEFAULT '',
	"rating" double precision DEFAULT 0 NOT NULL,
	"winner" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"valid_until" text DEFAULT '',
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"donation_id" text,
	"number" text NOT NULL,
	"amount" double precision NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'donation' NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"printed" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "receipts_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text DEFAULT '[]' NOT NULL,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"ip" text DEFAULT '',
	"user_agent" text DEFAULT '',
	"expires_at" text NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"warehouse_id" text,
	"type" text NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"balance_after" double precision DEFAULT 0 NOT NULL,
	"related_warehouse_id" text,
	"related_stocktake_id" text,
	"source_type" text,
	"source_id" text,
	"reference" text DEFAULT '',
	"date" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocktake_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"stocktake_id" text NOT NULL,
	"item_id" text NOT NULL,
	"system_quantity" double precision DEFAULT 0 NOT NULL,
	"counted_quantity" double precision DEFAULT 0 NOT NULL,
	"difference" double precision DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '',
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocktakes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"warehouse_id" text,
	"date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"activity" text DEFAULT '',
	"phone" text,
	"email" text,
	"tax_number" text DEFAULT '',
	"contact_person" text DEFAULT '',
	"address" text DEFAULT '',
	"rating" double precision DEFAULT 0 NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"branch_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar" text,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT '' NOT NULL,
	"last_login" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '',
	"manager" text DEFAULT '',
	"capacity" double precision DEFAULT 0 NOT NULL,
	"occupancy" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_records" ADD CONSTRAINT "aid_records_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_records" ADD CONSTRAINT "aid_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_records" ADD CONSTRAINT "aid_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_records" ADD CONSTRAINT "aid_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_records" ADD CONSTRAINT "aid_records_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_depreciations" ADD CONSTRAINT "asset_depreciations_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_depreciations" ADD CONSTRAINT "asset_depreciations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_related_warehouse_id_warehouses_id_fk" FOREIGN KEY ("related_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktake_id_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_code_idx" ON "accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "accounts_classification_idx" ON "accounts" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_ts_idx" ON "audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "beneficiaries_status_idx" ON "beneficiaries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "donations_donor_idx" ON "donations" USING btree ("donor_id");--> statement-breakpoint
CREATE INDEX "donations_status_idx" ON "donations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "donors_status_idx" ON "donors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "journal_entries_period_idx" ON "journal_entries" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");