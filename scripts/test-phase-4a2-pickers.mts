/**
 * Phase 4A.2 — high-volume selector REACHABILITY on REAL PostgreSQL.
 *
 * Proves the bounded PO / matchable-GRN lookups keep responses small yet make
 * ANY valid record reachable by server search (no silent "newest-N" cap), while
 * preserving every certified accounting/isolation filter.
 *
 *   PO-PICK-A..E   purchaseOrderLookup on 5,000 governed ISSUED POs
 *   GRN-PICK-A..G  matchableGrnLinesForSupplier on 2,100 matchable GRN lines
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx \
 *      scripts/test-phase-4a2-pickers.mts
 */
import { sql } from "drizzle-orm";
import { db, closeDb, now } from "@/server/db/index";
import { purchaseOrderLookup } from "@/server/db/purchase-order";
import { matchableGrnLinesForSupplier } from "@/server/db/invoice-matching";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
  process.exit(2);
}

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function seed() {
  await db.execute(sql`TRUNCATE
    suppliers, purchase_orders, purchase_order_lines,
    goods_receipts, goods_receipt_lines,
    supplier_invoices, supplier_invoice_lines, supplier_invoice_grn_allocations
    RESTART IDENTITY CASCADE`);
  const ts = now();
  await db.execute(sql`
    INSERT INTO suppliers (id, supplier_code, name, currency, status, created_at, updated_at)
    VALUES ('SUP-A','SUP-A','مورد الهدف','SAR','active',${ts},${ts}),
           ('SUP-B','SUP-B','مورد آخر','SAR','active',${ts},${ts})`);

  // 5,000 governed ISSUED POs for SUP-A; g=1 is the OLDEST (created_at monotonic
  // with g), so g in {1..~4800} lie outside the newest-200 window.
  await db.execute(sql`
    INSERT INTO purchase_orders
      (id, po_number, subject, supplier_id, supplier_reference, date, status,
       governance_mode, currency, subtotal, tax_amount, total, total_amount,
       received_amount, created_at, updated_at)
    SELECT 'PO-'||g, 'PO-2026-'||lpad(g::text,5,'0'), 'شراء رقم '||g, 'SUP-A',
           'REF-'||g, '2026-01-01', 'issued', 'governed', 'SAR', 100, 0, 100, 100, 0,
           to_char(timestamp '2026-01-01' + (g || ' seconds')::interval,'YYYY-MM-DD"T"HH24:MI:SS'),
           ${ts}
    FROM generate_series(1,5000) g`);
  // Governed but DRAFT (must be excluded), and LEGACY issued (must be excluded).
  await db.execute(sql`
    INSERT INTO purchase_orders
      (id, po_number, subject, supplier_id, date, status, governance_mode, currency,
       subtotal, tax_amount, total, total_amount, received_amount, created_at, updated_at)
    VALUES
      ('PO-DRAFT','PO-2026-90001','مسودة','SUP-A','2026-01-01','draft','governed','SAR',100,0,100,100,0,${ts},${ts}),
      ('PO-LEGACY','PO-2026-90002','قديم','SUP-A','2026-01-01','issued','legacy','SAR',100,0,100,100,0,${ts},${ts})`);

  // PO lines referenced by the GRN lines (FK goods_receipt_lines.po_line_id).
  await db.execute(sql`
    INSERT INTO purchase_order_lines
      (id, order_id, line_number, description, quantity, unit_price, received_quantity,
       line_type, line_subtotal, tax_rate, tax_amount, line_total, created_at)
    SELECT 'POL-'||g, 'PO-'||g, 1, 'بند '||g, 10, 5, 0, 'ITEM', 50, 0, 0, 50, ${ts}
    FROM generate_series(1,2100) g`);
  await db.execute(sql`
    INSERT INTO purchase_order_lines
      (id, order_id, line_number, description, quantity, unit_price, received_quantity, line_type, line_subtotal, tax_rate, tax_amount, line_total, created_at)
    VALUES
      ('POL-F','PO-1',2,'F',10,5,0,'ITEM',50,0,0,50,${ts}),
      ('POL-R','PO-2',2,'R',10,5,0,'ITEM',50,0,0,50,${ts}),
      ('POL-D','PO-3',2,'D',10,5,0,'ITEM',50,0,0,50,${ts}),
      ('POL-B','PO-1',3,'B',10,5,0,'ITEM',50,0,0,50,${ts})`);

  // 2,100 POSTED GRNs for SUP-A, each ONE line, fully remaining (no allocations).
  // receipt_date monotonic with g so g=1 is the OLDEST (outside newest window).
  await db.execute(sql`
    INSERT INTO goods_receipts
      (id, grn_number, purchase_order_id, supplier_id, receipt_date, status,
       currency, total_value, created_at, updated_at)
    SELECT 'GRN-'||g, 'GRN-2026-'||lpad(g::text,5,'0'), 'PO-'||g, 'SUP-A',
           to_char(date '2020-01-01' + g, 'YYYY-MM-DD'), 'posted', 'SAR', 50,
           to_char(timestamp '2026-01-01' + (g || ' seconds')::interval,'YYYY-MM-DD"T"HH24:MI:SS'),
           ${ts}
    FROM generate_series(1,2100) g`);
  await db.execute(sql`
    INSERT INTO goods_receipt_lines
      (id, goods_receipt_id, po_line_id, line_number, line_type, quantity_received,
       unit_price, line_value, created_at)
    SELECT 'GRL-'||g, 'GRN-'||g, 'POL-'||g, 1, 'ITEM', 10, 5, 50, ${ts}
    FROM generate_series(1,2100) g`);

  // Exclusion fixtures:
  // (F) fully-invoiced GRN line — a POSTED invoice allocation covers the full qty.
  await db.execute(sql`
    INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, status, currency, total_value, created_at, updated_at)
    VALUES ('GRN-FULL','GRN-2026-FULL','PO-1','SUP-A','2026-06-01','posted','SAR',50,${ts},${ts})`);
  await db.execute(sql`
    INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, line_number, line_type, quantity_received, unit_price, line_value, created_at)
    VALUES ('GRL-FULL','GRN-FULL','POL-F',1,'ITEM',10,5,50,${ts})`);
  await db.execute(sql`
    INSERT INTO supplier_invoices (id, invoice_number, supplier_invoice_number, supplier_invoice_number_normalized, supplier_id, invoice_date, status, currency, subtotal, tax_amount, total_amount, created_at, updated_at)
    VALUES ('INV-FULL','SINV-FULL','EXT-FULL','ext-full','SUP-A','2026-06-01','posted','SAR',50,0,50,${ts},${ts})`);
  await db.execute(sql`
    INSERT INTO supplier_invoice_lines (id, supplier_invoice_id, line_number, account_id, quantity, unit_price, line_subtotal, tax_rate, tax_amount, line_total, accounting_mode, created_at)
    SELECT 'SIL-FULL','INV-FULL',1, (SELECT id FROM accounts ORDER BY code LIMIT 1), 10,5,50,0,0,50,'grn_matched',${ts}`);
  await db.execute(sql`
    INSERT INTO supplier_invoice_grn_allocations (id, supplier_invoice_id, supplier_invoice_line_id, goods_receipt_id, goods_receipt_line_id, purchase_order_id, matched_quantity, created_at)
    VALUES ('ALC-FULL','INV-FULL','SIL-FULL','GRN-FULL','GRL-FULL','PO-1',10,${ts})`);
  // (G) reversed + draft GRNs (must be excluded).
  await db.execute(sql`
    INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, status, currency, total_value, created_at, updated_at)
    VALUES ('GRN-REV','GRN-2026-REV','PO-2','SUP-A','2026-06-02','reversed','SAR',50,${ts},${ts}),
           ('GRN-DRAFT','GRN-2026-DRAFT','PO-3','SUP-A','2026-06-03','draft','SAR',50,${ts},${ts})`);
  await db.execute(sql`
    INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, line_number, line_type, quantity_received, unit_price, line_value, created_at)
    VALUES ('GRL-REV','GRN-REV','POL-R',1,'ITEM',10,5,50,${ts}),
           ('GRL-DRAFT','GRN-DRAFT','POL-D',1,'ITEM',10,5,50,${ts})`);
  // (E) another supplier's posted GRN with a remaining line.
  await db.execute(sql`
    INSERT INTO goods_receipts (id, grn_number, purchase_order_id, supplier_id, receipt_date, status, currency, total_value, created_at, updated_at)
    VALUES ('GRN-B','GRN-2026-BBBBB','PO-1','SUP-B','2026-06-04','posted','SAR',50,${ts},${ts})`);
  await db.execute(sql`
    INSERT INTO goods_receipt_lines (id, goods_receipt_id, po_line_id, line_number, line_type, quantity_received, unit_price, line_value, created_at)
    VALUES ('GRL-B','GRN-B','POL-B',1,'ITEM',10,5,50,${ts})`);
}

async function main() {
  await seed();

  // ================= PO-PICK =================
  console.log("\nPO-PICK-A — open GRN form: default lookup is bounded, not 5,000");
  {
    const def = await purchaseOrderLookup(db as any, {});
    ok("default lookup ≤ 20 rows", def.items.length <= 20, `${def.items.length}`);
    ok("not the whole 5,000-PO set", def.items.length < 5000);
    ok(
      "every default row is governed ISSUED",
      def.items.every((p: any) => p.status === "issued"),
    );
  }

  console.log("\nPO-PICK-B — find a PO NOT in the newest 200 (by number)");
  {
    const r = await purchaseOrderLookup(db as any, { q: "PO-2026-00100" });
    ok(
      "old PO #100 found by search",
      r.items.some((p: any) => p.poNumber === "PO-2026-00100"),
      `${r.items.length} hits`,
    );
    ok("response still bounded", r.items.length <= 50);
  }

  console.log("\nPO-PICK-C — find a PO near the OLDEST end without fetching all 5,000");
  {
    const r = await purchaseOrderLookup(db as any, { q: "PO-2026-00001" });
    ok(
      "oldest PO #1 found",
      r.items.some((p: any) => p.poNumber === "PO-2026-00001"),
    );
    ok("bounded response", r.items.length <= 50, `${r.items.length}`);
    // Search by supplier name also reaches it (bounded).
    const byName = await purchaseOrderLookup(db as any, { q: "مورد الهدف" });
    ok(
      "supplier-name search returns bounded governed-issued set",
      byName.items.length <= 50 && byName.items.length > 0,
    );
  }

  console.log("\nPO-PICK-D — a non-ISSUED (draft) governed PO is never returned");
  {
    const r = await purchaseOrderLookup(db as any, { q: "PO-2026-90001" });
    ok(
      "draft PO excluded from lookup",
      !r.items.some((p: any) => p.id === "PO-DRAFT"),
      `${r.items.length} hits`,
    );
  }

  console.log("\nPO-PICK-E — a LEGACY PO is never returned for governed GRN creation");
  {
    const r = await purchaseOrderLookup(db as any, { q: "PO-2026-90002" });
    ok(
      "legacy PO excluded from lookup",
      !r.items.some((p: any) => p.id === "PO-LEGACY"),
      `${r.items.length} hits`,
    );
  }

  // ================= GRN-PICK =================
  console.log("\nGRN-PICK-A — initial open: small bounded matchable response");
  {
    const def = await matchableGrnLinesForSupplier(db as any, "SUP-A");
    ok("default matchable ≤ 20 rows", def.length <= 20, `${def.length}`);
    ok("not the whole 2,100-line set", def.length < 2100);
  }

  console.log("\nGRN-PICK-B — CRITICAL: find a valid candidate older than the previous 1000 cap");
  {
    // GRN-2026-00007 is g=7: oldest receipt_date ⇒ well beyond the newest 1000.
    const r = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-00007" });
    ok(
      "old GRN line (#7) reachable by search",
      r.some((m: any) => m.grnNumber === "GRN-2026-00007"),
      `${r.length} hits`,
    );
    ok("bounded response", r.length <= 20);
  }

  console.log("\nGRN-PICK-C — find candidate by GRN number");
  {
    const r = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-01234" });
    ok(
      "GRN #1234 found by number",
      r.some((m: any) => m.grnNumber === "GRN-2026-01234"),
    );
  }

  console.log("\nGRN-PICK-D — find candidate by PO number");
  {
    // GRN-42 is linked to PO-42 (po_number PO-2026-00042).
    const r = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "PO-2026-00042" });
    ok(
      "candidate found via its PO number",
      r.some((m: any) => m.poNumber === "PO-2026-00042"),
      `${r.length} hits`,
    );
  }

  console.log("\nGRN-PICK-E — supplier isolation: another supplier's GRN never returned");
  {
    const r = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-BBBBB" });
    ok(
      "SUP-B's GRN not returned for SUP-A",
      !r.some((m: any) => m.grnNumber === "GRN-2026-BBBBB"),
      `${r.length} hits`,
    );
  }

  console.log("\nGRN-PICK-F — fully-invoiced GRN line is excluded");
  {
    const r = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-FULL" });
    ok(
      "fully-invoiced line excluded (remaining = 0)",
      !r.some((m: any) => m.grnNumber === "GRN-2026-FULL"),
      `${r.length} hits`,
    );
  }

  console.log("\nGRN-PICK-G — reversed / non-posted GRNs are excluded");
  {
    const rev = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-REV" });
    const draft = await matchableGrnLinesForSupplier(db as any, "SUP-A", { q: "GRN-2026-DRAFT" });
    ok("reversed GRN excluded", rev.length === 0, `${rev.length}`);
    ok("draft GRN excluded", draft.length === 0, `${draft.length}`);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Phase 4A.2 pickers: ${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
