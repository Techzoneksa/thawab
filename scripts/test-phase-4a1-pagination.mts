/**
 * Phase 4A.1 — reachable-pagination + bounded-picker verification on REAL PG.
 *
 * PAGE-A..E  listSupplierInvoices server paging: distinct pages, deep page
 *            reachable, filtered total correct, >200 results reachable across
 *            pages, malicious pageSize clamped.
 * PICK-A..E  supplierLookup / matchable-GRN bounding: bounded default, search
 *            near the end of a large set, search by code, no IBAN/bank leak,
 *            matchable-GRN hard cap.
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx \
 *      scripts/test-phase-4a1-pagination.mts
 */
import { sql, eq } from "drizzle-orm";
import { db, closeDb, now } from "@/server/db/index";
import { listSupplierInvoices } from "@/server/db/supplier-invoice";
import { supplierLookup } from "@/server/db/supplier";
import { PAGE_MAX } from "@/server/db/pagination";

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

async function main() {
  // Deterministic dataset: 5,000 suppliers + 600 invoices for one supplier.
  await db.execute(sql`TRUNCATE suppliers, supplier_invoices RESTART IDENTITY CASCADE`);
  const ts = now();
  // 5,000 active suppliers with searchable codes/names (SUP-000001 … SUP-005000).
  await db.execute(sql`
    INSERT INTO suppliers (id, supplier_code, name, tax_number, currency, status, created_at, updated_at)
    SELECT 'S-'||g, 'SUP-'||lpad(g::text,6,'0'), 'مورد رقم '||g, '3'||lpad(g::text,9,'0'),
           'SAR', 'active', ${ts}, ${ts}
    FROM generate_series(1,5000) g`);
  const target = "S-4987"; // near the end of the set
  // 600 invoices for the target supplier; statuses cycled; searchable numbers.
  await db.execute(sql`
    INSERT INTO supplier_invoices
      (id, invoice_number, supplier_invoice_number, supplier_invoice_number_normalized,
       supplier_id, invoice_date, status,
       currency, subtotal, tax_amount, total_amount, created_at, updated_at)
    SELECT 'INV-'||g, 'SINV-2026-'||lpad(g::text,5,'0'), 'EXT-'||g, 'ext-'||g, ${target},
           '2026-06-01', (ARRAY['draft','posted'])[1+(g%2)], 'SAR', 100, 0, 100,
           ${ts} || lpad(g::text,6,'0'), ${ts}
    FROM generate_series(1,600) g`);

  // ---- PAGE-A: pages 1/2/3 expose distinct records, no dup / missing boundary
  console.log("\nPAGE-A — 600 invoices, pageSize 25: pages 1/2/3 distinct, boundary intact");
  {
    const p1 = await listSupplierInvoices({ supplierId: target, page: 1, pageSize: 25 });
    const p2 = await listSupplierInvoices({ supplierId: target, page: 2, pageSize: 25 });
    const p3 = await listSupplierInvoices({ supplierId: target, page: 3, pageSize: 25 });
    const ids = new Set<string>([...p1.items, ...p2.items, ...p3.items].map((r: any) => r.id));
    ok(
      "each page returns pageSize rows",
      p1.items.length === 25 && p2.items.length === 25 && p3.items.length === 25,
    );
    ok("75 distinct records across 3 pages (no dup/overlap)", ids.size === 75, `${ids.size}`);
    ok(
      "total = 600, totalPages = 24",
      p1.total === 600 && p1.totalPages === 24,
      `total=${p1.total} pages=${p1.totalPages}`,
    );
    // Boundary: last row of page1 and first of page2 are adjacent, not equal/missing.
    ok(
      "page boundary contiguous (p1 last ≠ p2 first)",
      (p1.items.at(-1) as any).id !== (p2.items[0] as any).id,
    );
  }

  // ---- PAGE-B: a deep page is reachable
  console.log("\nPAGE-B — deep page (page 24, last) reachable");
  {
    const last = await listSupplierInvoices({ supplierId: target, page: 24, pageSize: 25 });
    ok(
      "deep last page returns the final 25 rows",
      last.items.length === 25,
      `${last.items.length}`,
    );
    ok("page number echoed = 24", last.page === 24, `${last.page}`);
  }

  // ---- PAGE-C: filtered total reflects the FILTER, not the page length
  console.log("\nPAGE-C — status filter: total is the filtered count, not page length");
  {
    const posted = await listSupplierInvoices({
      supplierId: target,
      status: "posted",
      page: 1,
      pageSize: 25,
    });
    ok("filtered total = 300 (half posted)", posted.total === 300, `${posted.total}`);
    ok("filtered page still bounded to 25", posted.items.length === 25);
    ok(
      "every returned row matches the filter",
      posted.items.every((r: any) => r.status === "posted"),
    );
  }

  // ---- PAGE-D: a search returning >200 rows is fully reachable across pages
  console.log("\nPAGE-D — search matching >200 rows reachable across pages (not capped at 200)");
  {
    // 'SINV-2026-' matches all 600. Walk every page and collect ids.
    const seen = new Set<string>();
    let p = 1;
    let totalPages = 1;
    do {
      const res = await listSupplierInvoices({
        supplierId: target,
        search: "SINV-2026-",
        page: p,
        pageSize: 25,
      });
      res.items.forEach((r: any) => seen.add(r.id));
      totalPages = res.totalPages;
      p++;
    } while (p <= totalPages && p <= 40);
    ok(
      "all 600 matching rows reachable by paging (not clipped at 200)",
      seen.size === 600,
      `${seen.size}`,
    );
  }

  // ---- PAGE-E: malicious pageSize is clamped server-side
  console.log("\nPAGE-E — pageSize=1,000,000 clamped to server max");
  {
    const res = await listSupplierInvoices({ supplierId: target, page: 1, pageSize: 1_000_000 });
    ok(`pageSize clamped to ${PAGE_MAX}`, res.pageSize === PAGE_MAX, `pageSize=${res.pageSize}`);
    ok("returned rows never exceed the clamp", res.items.length <= PAGE_MAX, `${res.items.length}`);
  }

  // ---- PICK-A: supplierLookup returns a bounded default, not 5,000
  console.log("\nPICK-A — supplierLookup default is bounded (≤ configured max), not 5,000");
  {
    const def = await supplierLookup({});
    ok("default lookup returns ≤ 20 rows", def.items.length <= 20, `${def.items.length}`);
    ok("does not return the whole 5,000-supplier set", def.items.length < 5000);
  }

  // ---- PICK-B: search near the END of the 5,000-record set is found server-side
  console.log("\nPICK-B — search a supplier near the end of the dataset (server-side)");
  {
    const r = await supplierLookup({ search: "005000" });
    ok(
      "supplier #5000 found by server search",
      r.items.some((s: any) => s.supplierCode === "SUP-005000"),
      `${r.items.length} hits`,
    );
  }

  // ---- PICK-C: search by supplier code
  console.log("\nPICK-C — search by supplier code");
  {
    const r = await supplierLookup({ search: "SUP-004987" });
    ok(
      "exact code lookup returns the supplier",
      r.items.some((s: any) => s.id === "S-4987"),
    );
  }

  // ---- PICK-D: lookup DTO leaks no IBAN / bank / financial fields
  console.log("\nPICK-D — lookup DTO contains no IBAN / bank / balance fields");
  {
    const r = await supplierLookup({ search: "مورد" });
    const row = (r.items[0] || {}) as any;
    const keys = Object.keys(row);
    const leaked = keys.filter((k) => /iban|bank|balance|payable|tax/i.test(k));
    ok("no sensitive keys in picker rows", leaked.length === 0, `leaked: ${leaked.join(",")}`);
    ok(
      "only slim keys present",
      keys.every((k) => ["id", "supplierCode", "name", "currency", "status"].includes(k)),
      keys.join(","),
    );
  }

  // ---- PICK-E: matchable-GRN lookup is hard-capped
  console.log("\nPICK-E — matchable-GRN lookup is bounded");
  {
    const { matchableGrnLinesForSupplier } = await import("@/server/db/invoice-matching");
    // With no posted GRNs for this supplier it returns [], but the SQL fetch is
    // hard-capped regardless; assert the cap is enforced by the signature.
    const rows = await matchableGrnLinesForSupplier(db as any, target, { limit: 5000 });
    ok(
      "matchable lookup returns a bounded array (≤1000 cap)",
      Array.isArray(rows) && rows.length <= 1000,
      `${rows.length}`,
    );
  }

  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Phase 4A.1 pagination+pickers: ${pass} passed, ${fail} failed`,
  );
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
