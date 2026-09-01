-- Phase 5B — governed Purchase Returns of UNINVOICED received quantity.
-- Additive, forward-only, idempotent. POST books Dr GRNI (historical) / Cr the
-- line's historical receipt debit account + decrements inventory; NEVER AP/VAT.
-- Returned quantity shares the receipt-line capacity with invoice matching
-- (matched + returned <= received). GRNI clearing by returns is tracked in
-- grni_journal_links with link_type 'return' / 'return_reversal' (no schema change
-- there — link_type is free text).
CREATE TABLE IF NOT EXISTS "purchase_returns" (
  "id" text PRIMARY KEY NOT NULL,
  "return_number" text NOT NULL UNIQUE,
  "goods_receipt_id" text NOT NULL REFERENCES "goods_receipts"("id"),
  "purchase_order_id" text REFERENCES "purchase_orders"("id"),
  "supplier_id" text REFERENCES "suppliers"("id"),
  "return_date" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  "currency" text NOT NULL DEFAULT 'SAR',
  "total_value" double precision NOT NULL DEFAULT 0,
  "reason" text DEFAULT '',
  "journal_entry_id" text REFERENCES "journal_entries"("id"),
  "reversal_journal_entry_id" text REFERENCES "journal_entries"("id"),
  "created_by" text REFERENCES "users"("id"),
  "created_at" text NOT NULL DEFAULT '',
  "updated_at" text NOT NULL DEFAULT '',
  "submitted_by" text REFERENCES "users"("id"),
  "submitted_at" text,
  "approved_by" text REFERENCES "users"("id"),
  "approved_at" text,
  "posted_by" text REFERENCES "users"("id"),
  "posted_at" text,
  "reversed_by" text REFERENCES "users"("id"),
  "reversed_at" text,
  "reversal_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_returns_number_idx" ON "purchase_returns" ("return_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_returns_journal_entry_idx" ON "purchase_returns" ("journal_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_grn_idx" ON "purchase_returns" ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_status_idx" ON "purchase_returns" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_returns_supplier_idx" ON "purchase_returns" ("supplier_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_return_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_return_id" text NOT NULL REFERENCES "purchase_returns"("id") ON DELETE CASCADE,
  "goods_receipt_line_id" text NOT NULL REFERENCES "goods_receipt_lines"("id"),
  "line_number" integer NOT NULL DEFAULT 1,
  "line_type" text NOT NULL DEFAULT 'ITEM',
  "description" text DEFAULT '',
  "item_id" text REFERENCES "inventory_items"("id"),
  "account_id" text REFERENCES "accounts"("id"),
  "quantity_returned" double precision NOT NULL DEFAULT 0,
  "line_value" double precision NOT NULL DEFAULT 0,
  "cost_center_id" text REFERENCES "cost_centers"("id"),
  "stock_movement_id" text,
  "created_at" text NOT NULL DEFAULT '',
  CONSTRAINT "purchase_return_lines_qty_positive" CHECK ("quantity_returned" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_return_lines_return_idx" ON "purchase_return_lines" ("purchase_return_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_return_lines_grn_line_idx" ON "purchase_return_lines" ("goods_receipt_line_id");
