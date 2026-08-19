-- Phase 3E — Supplier Invoice ↔ GRN matching & GRNI clearing. Additive, non-
-- destructive, idempotent. No journal-history rewrite, no balance writes, no
-- inventory writes, no synthetic/inferred historical matches.

-- Line accounting mode: 'direct' (Phase 3B) | 'grn_matched' (clears GRNI).
ALTER TABLE "supplier_invoice_lines" ADD COLUMN IF NOT EXISTS "accounting_mode" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint

-- Line-level matching allocation. No amount column — the GRNI clearing amount is
-- derived from the receipt's posted line value under the exact-match rule.
CREATE TABLE IF NOT EXISTS "supplier_invoice_grn_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_invoice_id" text NOT NULL,
	"supplier_invoice_line_id" text NOT NULL,
	"goods_receipt_id" text NOT NULL,
	"goods_receipt_line_id" text NOT NULL,
	"purchase_order_id" text,
	"purchase_order_line_id" text,
	"matched_quantity" double precision DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_invoice_fk" FOREIGN KEY ("supplier_invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_invoice_line_fk" FOREIGN KEY ("supplier_invoice_line_id") REFERENCES "public"."supplier_invoice_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_grn_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_grn_line_fk" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "public"."goods_receipt_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_po_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoice_grn_allocations" ADD CONSTRAINT "si_grn_alloc_po_line_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "si_grn_alloc_invoice_idx" ON "supplier_invoice_grn_allocations" ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "si_grn_alloc_invoice_line_idx" ON "supplier_invoice_grn_allocations" ("supplier_invoice_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "si_grn_alloc_grn_line_idx" ON "supplier_invoice_grn_allocations" ("goods_receipt_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "si_grn_alloc_grn_idx" ON "supplier_invoice_grn_allocations" ("goods_receipt_id");
