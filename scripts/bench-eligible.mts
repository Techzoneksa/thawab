/**
 * Phase 5B.2 — controlled benchmark of the eligible-GRN lookup on real PG.
 * ANALYZE + warm-up, then 50 timed runs each of default / old-GRN-search /
 * PO-search. Reports min/p50/p95/p99/max. Also runs EXPLAIN (ANALYZE, BUFFERS)
 * on the default path. Uses the REAL service (eligibleGrnsForReturn).
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/index";
import { eligibleGrnsForReturn } from "@/server/db/purchase-return";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: need conc/bench DB. Got ${url}`);
  process.exit(2);
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[i];
}
function stats(label: string, t: number[]) {
  const s = [...t].sort((a, b) => a - b);
  const f = (n: number) => n.toFixed(1);
  console.log(
    `  ${label.padEnd(30)} min=${f(s[0])} p50=${f(pct(s, 0.5))} p95=${f(pct(s, 0.95))} p99=${f(pct(s, 0.99))} max=${f(s[s.length - 1])} ms  (n=${s.length})`,
  );
  return pct(s, 0.95);
}
async function timeIt(fn: () => Promise<any>, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    out.push(performance.now() - t0);
  }
  return out;
}

async function main() {
  // Representative search terms drawn from the live dataset.
  const g = (await db.execute(sql`
    SELECT gr.grn_number, po.po_number
    FROM goods_receipts gr JOIN purchase_orders po ON po.id = gr.purchase_order_id AND po.governance_mode='governed'
    WHERE gr.status='posted'
    ORDER BY gr.receipt_date ASC, gr.grn_number ASC LIMIT 1
  `)) as any;
  const oldGrn = (g.rows ?? g)[0]?.grn_number as string;
  const oldPo = (g.rows ?? g)[0]?.po_number as string;
  console.log(`\nControlled run — oldest eligible GRN=${oldGrn} PO=${oldPo}`);

  await db.execute(sql`ANALYZE goods_receipts`);
  await db.execute(sql`ANALYZE goods_receipt_lines`);
  await db.execute(sql`ANALYZE purchase_return_lines`);
  await db.execute(sql`ANALYZE supplier_invoice_grn_allocations`);
  await db.execute(sql`ANALYZE purchase_orders`);
  console.log("ANALYZE done");

  // Warm-up (not measured).
  for (let i = 0; i < 8; i++) {
    await eligibleGrnsForReturn(db as any, {});
    await eligibleGrnsForReturn(db as any, { q: oldGrn });
    await eligibleGrnsForReturn(db as any, { q: oldPo });
  }
  console.log("warm-up done\n");

  const N = 50;
  console.log("Eligible-GRN lookup — controlled p50/p95/p99:");
  const p95def = stats(
    "A. default (no filter)",
    await timeIt(() => eligibleGrnsForReturn(db as any, {}), N),
  );
  const p95grn = stats(
    "B. old GRN number search",
    await timeIt(() => eligibleGrnsForReturn(db as any, { q: oldGrn }), N),
  );
  const p95po = stats(
    "C. PO number search",
    await timeIt(() => eligibleGrnsForReturn(db as any, { q: oldPo }), N),
  );

  console.log("\nTargets: p95 ≤ 500 ms");
  const verdict = (l: string, v: number) =>
    console.log(`  ${v <= 500 ? "✓" : "✗"} ${l} p95=${v.toFixed(1)}ms`);
  verdict("default", p95def);
  verdict("old GRN search", p95grn);
  verdict("PO search", p95po);

  // EXPLAIN (ANALYZE, BUFFERS) on the default path (mirror of the service query).
  console.log("\nEXPLAIN (ANALYZE, BUFFERS) — default eligible lookup:");
  const plan = (await db.execute(sql`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH cand AS (
      SELECT gr.id, gr.grn_number, gr.receipt_date, gr.supplier_id, po.po_number
      FROM goods_receipts gr
      JOIN purchase_orders po ON po.id = gr.purchase_order_id AND po.governance_mode='governed'
      WHERE gr.status='posted'
      ORDER BY gr.receipt_date DESC, gr.grn_number DESC LIMIT 120
    ),
    line AS (
      SELECT gl.goods_receipt_id AS grn,
        (gl.quantity_received
          - COALESCE((SELECT SUM(a.matched_quantity) FROM supplier_invoice_grn_allocations a
               JOIN supplier_invoices si ON a.supplier_invoice_id=si.id
               WHERE a.goods_receipt_line_id=gl.id AND si.status='posted'),0)
          - COALESCE((SELECT SUM(prl.quantity_returned) FROM purchase_return_lines prl
               JOIN purchase_returns pr ON prl.purchase_return_id=pr.id
               WHERE prl.goods_receipt_line_id=gl.id AND pr.status='posted'),0)
        ) AS remaining
      FROM goods_receipt_lines gl WHERE gl.goods_receipt_id IN (SELECT id FROM cand)
    ),
    ret AS (
      SELECT grn, COUNT(*) FILTER (WHERE remaining > 0.0001) AS returnable_lines
      FROM line GROUP BY grn HAVING COUNT(*) FILTER (WHERE remaining > 0.0001) > 0
    )
    SELECT c.id, c.grn_number, c.receipt_date, c.supplier_id, c.po_number, r.returnable_lines
    FROM cand c JOIN ret r ON r.grn=c.id
    ORDER BY c.receipt_date DESC, c.grn_number DESC LIMIT 20
  `)) as any;
  for (const row of plan.rows ?? plan ?? [])
    console.log("   " + (row["QUERY PLAN"] ?? Object.values(row)[0]));

  process.exit(p95def <= 500 && p95grn <= 500 && p95po <= 500 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
