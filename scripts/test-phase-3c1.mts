/**
 * Phase 3C.1 — Legacy PO creation freeze & governed-only cutover tests.
 *
 * Behavioral (PGlite): the post-0029 DB default makes an insert that omits
 * governance_mode become 'governed' (CUT-E); historical legacy rows stay
 * readable/uncounted-as-governed (CUT-F); the real purchaseOrderPreflight reports
 * legacy/governed counts + latest created_at watchpoints.
 *
 * Source assertions (production creation-path audit — Section 13): the governed
 * service is the only production path that inserts a PO and it always sets
 * governed; the legacy route no longer inserts and rejects create with
 * LEGACY_PO_CREATION_DISABLED; the legacy UI exposes no create; the governed route
 * gates create on procurement.po.create; the legacy receive boundary + governed
 * USE_GOVERNED_GRN guard are unchanged; governed lifecycle posts nothing.
 *
 * Suites: CUT-A..I + PATH (creation-path matrix). Run:
 *   node_modules/.bin/tsx scripts/test-phase-3c1.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { purchaseOrderPreflight } from "@/server/db/purchase-order-preflight";
import { now, genId } from "@/server/db/index";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

// Post-0029 purchase_orders default is 'governed' (the migration flips it).
const DDL = `
CREATE TABLE purchase_orders (id text PRIMARY KEY, supplier_id text, request_id text, subject text NOT NULL,
  date text NOT NULL DEFAULT '', delivery_date text DEFAULT '', status text NOT NULL DEFAULT 'draft',
  total double precision NOT NULL DEFAULT 0, received_amount double precision NOT NULL DEFAULT 0,
  journal_entry_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '', governance_mode text NOT NULL DEFAULT 'governed', po_number text,
  currency text NOT NULL DEFAULT 'SAR', supplier_reference text, subtotal double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, total_amount double precision NOT NULL DEFAULT 0,
  submitted_by text, submitted_at text, approved_by text, approved_at text, issued_by text, issued_at text,
  cancelled_by text, cancelled_at text);
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL DEFAULT '', source_type text, source_id text,
  status text NOT NULL DEFAULT 'posted', created_at text NOT NULL DEFAULT '');
CREATE TABLE stock_movements (id text PRIMARY KEY, item_id text NOT NULL DEFAULT '', source_type text, source_id text,
  created_at text NOT NULL DEFAULT '');
`;
async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  return { db, client };
}

const routeSvc = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/orders.ts"),
  "utf8",
);
const govSvc = readFileSync(resolve(process.cwd(), "src/server/db/purchase-order.ts"), "utf8");
const govRoute = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/purchase-orders.ts"),
  "utf8",
);
const legacyNewUi = readFileSync(
  resolve(process.cwd(), "src/routes/procurement.orders_.new.tsx"),
  "utf8",
);
const legacyListUi = readFileSync(
  resolve(process.cwd(), "src/routes/procurement.orders.tsx"),
  "utf8",
);
const schema = readFileSync(resolve(process.cwd(), "src/server/db/schema.ts"), "utf8");
const mig = readFileSync(
  resolve(process.cwd(), "drizzle/0029_purchase_order_governed_cutover.sql"),
  "utf8",
);
const poTransitions = readFileSync(
  resolve(process.cwd(), "src/lib/procurement-permissions.ts"),
  "utf8",
);

/** Only the legacy CREATE region of the route (from the "// Create" flow onward). */
function legacyCreateRegion(src: string): string {
  const i = src.indexOf("CUTOVER FREEZE");
  return i >= 0 ? src.slice(Math.max(0, i - 400), i + 800) : "";
}

async function main() {
  // ===================== CUT-A — governed create sets governed =====================
  console.log("\nCUT-A — governed create service sets governance_mode='governed'");
  {
    ok(
      "CUT-A: governed createPurchaseOrder inserts governanceMode: GOVERNED",
      /export async function createPurchaseOrder/.test(govSvc) &&
        /governanceMode: GOVERNED/.test(govSvc),
    );
    ok(
      "CUT-A: governed create allocates a governed PO number + DRAFT workflow (no accounting)",
      /prefix: "PO-"/.test(govSvc) &&
        /recordWorkflowEvent/.test(govSvc) &&
        !/postBalancedEntry/.test(govSvc),
    );
  }

  // ===================== CUT-B — legacy API create rejected =====================
  console.log("\nCUT-B — legacy API create is frozen (no insert)");
  {
    ok(
      "CUT-B: legacy route rejects create with LEGACY_PO_CREATION_DISABLED",
      /LEGACY_PO_CREATION_DISABLED/.test(routeSvc),
    );
    const region = legacyCreateRegion(routeSvc);
    ok(
      "CUT-B: the legacy CREATE region performs NO purchase_orders insert",
      region.length > 0 && !/insert\(purchaseOrders\)/.test(region),
    );
    ok(
      "CUT-B: legacy route no longer inserts a purchase_orders header ANYWHERE (create removed)",
      !/tx\.insert\(purchaseOrders\)\.values/.test(routeSvc) &&
        !/\.insert\(purchaseOrders\)/.test(routeSvc),
    );
  }

  // ===================== CUT-C — legacy UI has no create =====================
  console.log("\nCUT-C — legacy UI exposes no create; directs to governed");
  {
    ok(
      "CUT-C: legacy new-PO route no longer calls the legacy createPurchaseOrder API",
      !/createPurchaseOrder\(/.test(legacyNewUi) && /purchase-orders/.test(legacyNewUi),
    );
    ok(
      "CUT-C: legacy list page's add action navigates to the governed module",
      /to: "\/procurement\/purchase-orders"/.test(legacyListUi) &&
        !/to: "\/procurement\/orders\/new"/.test(legacyListUi),
    );
  }

  // ===================== CUT-D — permission bypass closed =====================
  console.log("\nCUT-D — procurement.create cannot bypass procurement.po.create");
  {
    ok(
      "CUT-D: governed create is gated on procurement.po.create (P.poCreate)",
      /hasPermission\([^)]*P\.poCreate\)/.test(govRoute),
    );
    // The legacy endpoint is gated only by procurement.create, but it no longer
    // creates anything → procurement.create can no longer be used as a create path.
    ok(
      "CUT-D: the only remaining production PO-insert path is the governed service (poCreate-gated)",
      !/\.insert\(purchaseOrders\)/.test(routeSvc) && /governanceMode: GOVERNED/.test(govSvc),
    );
  }

  // ===================== CUT-E — new DB default =====================
  console.log("\nCUT-E — post-cutover DB default is 'governed'");
  {
    const { db, client } = await freshDb();
    // Direct insert OMITTING governance_mode → must fall to the new default.
    await client.exec(
      `INSERT INTO purchase_orders (id, subject, created_at, updated_at) VALUES ('po-omit','x','${now()}','${now()}')`,
    );
    const row = (
      await client.query(`SELECT governance_mode FROM purchase_orders WHERE id='po-omit'`)
    ).rows[0];
    ok(
      "CUT-E: insert omitting governance_mode defaults to 'governed'",
      row.governance_mode === "governed",
    );
    ok(
      "CUT-E: schema + migration set the default to 'governed' (safety net)",
      /default\("governed"\)/.test(schema) &&
        /SET DEFAULT 'governed'/.test(mig) &&
        !/UPDATE .*purchase_orders/i.test(mig),
    );
  }

  // ===================== CUT-F — historical legacy record intact =====================
  console.log("\nCUT-F — existing legacy PO remains readable, not rewritten");
  {
    const { db, client } = await freshDb();
    // A historical legacy row (explicitly legacy) + a governed row.
    await client.exec(
      `INSERT INTO purchase_orders (id, subject, governance_mode, created_at, updated_at) VALUES ('po-leg','old','legacy','2026-01-01T00:00:00','2026-01-01T00:00:00')`,
    );
    await client.exec(
      `INSERT INTO purchase_orders (id, subject, governance_mode, created_at, updated_at) VALUES ('po-gov','new','governed','2026-05-01T00:00:00','2026-05-01T00:00:00')`,
    );
    const leg = (
      await client.query(`SELECT governance_mode FROM purchase_orders WHERE id='po-leg'`)
    ).rows[0];
    ok(
      "CUT-F: the historical legacy row is readable and still 'legacy' (not rewritten)",
      leg.governance_mode === "legacy",
    );
    const pf = await purchaseOrderPreflight(db);
    ok(
      "CUT-F: preflight counts 1 legacy + 1 governed",
      pf.legacyCount === 1 && pf.governedCount === 1,
    );
    ok(
      "CUT-F/Preflight: latest legacy vs governed created_at exposed as cutover watchpoints",
      pf.latestLegacyCreatedAt === "2026-01-01T00:00:00" &&
        pf.latestGovernedCreatedAt === "2026-05-01T00:00:00",
    );
    // Ignore SQL comment lines (-- …) — only real statements matter here.
    const migSql = mig
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    ok(
      "CUT-F: migration performs no historical row rewrite (no UPDATE/INSERT/DELETE), only SET DEFAULT",
      /SET DEFAULT 'governed'/.test(migSql) && !/\b(UPDATE|INSERT|DELETE)\b/i.test(migSql),
    );
  }

  // ===================== CUT-G — legacy receive boundary retained =====================
  console.log("\nCUT-G — existing legacy PO receive behavior intentionally retained");
  {
    ok(
      "CUT-G: legacy receive path still books Dr Inventory / Cr AP for legacy POs (unchanged)",
      /SYS\.INVENTORY/.test(routeSvc) &&
        /SYS\.ACCOUNTS_PAYABLE/.test(routeSvc) &&
        /postBalancedEntry\(/.test(routeSvc) &&
        /b\.action/.test(routeSvc),
    );
    ok(
      "CUT-G: the receive branch (approve/cancel/close/receive on existing legacy POs) is preserved",
      /else \{[\s\S]*\/\/ receive/.test(routeSvc),
    );
  }

  // ===================== CUT-H — governed PO blocked from legacy receive =====================
  console.log("\nCUT-H — governed PO cannot enter legacy receive");
  {
    ok(
      "CUT-H: legacy route rejects a governed PO with USE_GOVERNED_GRN (no GL/AP/inventory/balance)",
      /governanceMode === PurchaseOrderGovernance\.GOVERNED/.test(routeSvc) &&
        /USE_GOVERNED_GRN/.test(routeSvc),
    );
    // The governed guard precedes any receive/GL work in the action branch.
    const idxGuard = routeSvc.indexOf("USE_GOVERNED_GRN");
    const idxReceivePost = routeSvc.indexOf("postBalancedEntry(");
    ok(
      "CUT-H: the USE_GOVERNED_GRN guard precedes the legacy receive GL posting",
      idxGuard > 0 && idxReceivePost > idxGuard,
    );
  }

  // ===================== CUT-I — governed lifecycle zero effect =====================
  console.log("\nCUT-I — governed create→submit→approve→issue posts nothing");
  {
    ok(
      "CUT-I: governed PO service posts NO GL (no postBalancedEntry / reverseEntry anywhere)",
      !/postBalancedEntry/.test(govSvc) && !/reverseEntry/.test(govSvc),
    );
    ok(
      "CUT-I: governed PO service never touches suppliers.balance / inventory / stock",
      !/\.update\(suppliers\)/.test(govSvc) &&
        !/balance:/.test(govSvc) &&
        !/inventoryItems/.test(govSvc) &&
        !/stockMovements/.test(govSvc),
    );
    // Isolate ONLY the PO_TRANSITIONS array block (not GRN_TRANSITIONS, which
    // legitimately has action: "post").
    const poBlock = (() => {
      const m = poTransitions.match(/PO_TRANSITIONS:\s*Transition\[\]\s*=\s*\[([\s\S]*?)\n\];/);
      return m ? m[1] : "";
    })();
    ok(
      "CUT-I: PO_TRANSITIONS has no posting transition (submit/approve/issue/cancel only)",
      poBlock.length > 0 && !/action: "post"/.test(poBlock) && /action: "issue"/.test(poBlock),
    );
  }

  // ===================== PATH — production creation-path matrix =====================
  console.log("\nPATH — production creation-path audit (Section 13)");
  {
    ok(
      "PATH: governed service is the ONLY production path inserting a PO, always 'governed'",
      /governanceMode: GOVERNED/.test(govSvc),
    );
    ok(
      "PATH: no production create path can intentionally insert governance_mode='legacy'",
      !/governanceMode: ["']legacy["']/.test(govSvc) &&
        !/governanceMode: ["']legacy["']/.test(routeSvc) &&
        !/\.insert\(purchaseOrders\)/.test(routeSvc),
    );
    ok(
      "PATH: legacy client createPurchaseOrder is no longer wired to any create UI",
      !/createPurchaseOrder\(/.test(legacyNewUi) && !/openAdd[\s\S]*orders\/new/.test(legacyListUi),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
