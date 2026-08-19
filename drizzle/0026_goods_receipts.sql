-- Phase 3D — governed Goods Receipts (GRN) + GRNI. Additive, non-destructive.
-- A governed GRN books Dr receipt/inventory/expense/asset / Cr GRNI accrual; it
-- never credits Accounts Payable, never writes suppliers.balance, never creates
-- supplier journal links, never recognizes Input VAT.
CREATE TABLE IF NOT EXISTS "goods_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"grn_number" text NOT NULL,
	"purchase_order_id" text NOT NULL,
	"supplier_id" text,
	"receipt_date" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"journal_entry_id" text,
	"reversal_journal_entry_id" text,
	"notes" text DEFAULT '',
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT '' NOT NULL,
	"reversed_by" text,
	"reversed_at" text,
	"reversal_reason" text,
	CONSTRAINT "goods_receipts_grn_number_unique" UNIQUE("grn_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"goods_receipt_id" text NOT NULL,
	"po_line_id" text NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"line_type" text DEFAULT 'ITEM' NOT NULL,
	"description" text DEFAULT '',
	"item_id" text,
	"account_id" text,
	"quantity_received" double precision DEFAULT 0 NOT NULL,
	"unit_price" double precision DEFAULT 0 NOT NULL,
	"line_value" double precision DEFAULT 0 NOT NULL,
	"cost_center_id" text,
	"stock_movement_id" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_number_idx" ON "goods_receipts" ("grn_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_journal_entry_idx" ON "goods_receipts" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_po_idx" ON "goods_receipts" ("purchase_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_status_idx" ON "goods_receipts" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_date_idx" ON "goods_receipts" ("receipt_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_grn_idx" ON "goods_receipt_lines" ("goods_receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_po_line_idx" ON "goods_receipt_lines" ("po_line_id");--> statement-breakpoint
-- Idempotency backstop: at most one journal per goods-receipt source, scoped so
-- existing sources/constraints are never touched.
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_goods_receipt_source_idx" ON "journal_entries" ("source_id") WHERE "source_type" = 'goods_receipt';--> statement-breakpoint
-- Candidate GRNI accrual account (liability). Seeded WITHOUT a system_key so the
-- application never silently declares it authoritative — an administrator must
-- explicitly confirm the GRNI mapping (finance.account_mapping.update). Idempotent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "accounts" WHERE "code" = '210105') THEN
    INSERT INTO "accounts" ("id","code","name","classification","level","parent_id","system_key","currency","balance","postable","status","created_at","updated_at")
    VALUES ('ACC-210105','210105','بضاعة مستلمة لم تُفوتر (GRNI)','liability',4,
            (SELECT "id" FROM "accounts" WHERE "code" = '2101' LIMIT 1),
            NULL,'SAR',0,true,'active','','');
  END IF;
END $$;
