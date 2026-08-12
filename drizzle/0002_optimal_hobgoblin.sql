CREATE TABLE "org_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '',
	"reg_no" text DEFAULT '',
	"tax_no" text DEFAULT '',
	"email" text DEFAULT '',
	"phone" text DEFAULT '',
	"ceo" text DEFAULT '',
	"fiscal_year" text DEFAULT '',
	"currency" text DEFAULT 'SAR',
	"updated_at" text DEFAULT '' NOT NULL
);
