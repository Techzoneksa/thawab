/**
 * Phase 3D — governed Goods Receipt (GRN) + GRNI tests.
 *
 * Exercises the REAL parameterized building blocks against PGlite —
 * validateGrniMappingAccount / assignGrniAccount / resolveConfirmedGrniAccount
 * (account-mapping.ts), receivedByPoLine / receivablePoLines /
 * hasPostedGoodsReceipt (goods-receipt.ts), postBalancedEntry / reverseEntry
 * (gl.ts), getSupplierBalance / createSupplierApLink (supplier.ts). The atomic
 * GRN post/reverse sequence is mirrored in the SAME order the service uses, and
 * the accounting-isolation invariants are additionally locked down by source
 * assertions.
 *
 * Covers MAP-A..F, GRN-A..H, PART-A..D, REV-A..E, POC-A..B, PERM-A..F, AUD-A..E.
 * Run: node_modules/.bin/tsx scripts/test-phase-3d.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateGrniMappingAccount,
  assignGrniAccount,
  getGrniConfiguration,
  resolveConfirmedGrniAccount,
} from "@/server/db/account-mapping";
import {
  receivedByPoLine,
  receivablePoLines,
  hasPostedGoodsReceipt,
} from "@/server/db/goods-receipt";
import { getSupplierBalance, createSupplierApLink } from "@/server/db/supplier";
import { postBalancedEntry, reverseEntry, resolveSystemAccountId, SYS } from "@/server/db/gl";
import { nextCode } from "@/server/db/numbering";
import { now, genId } from "@/server/db/index";
import { PROCUREMENT_PERMISSIONS as PP } from "@/lib/procurement-permissions";
import { FINANCE_PERMISSIONS as FP } from "@/lib/finance-permissions";

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
async function throwsCode(fn: () => Promise<any>, code: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return e?.code === code || String(e?.message).includes(code);
  }
}
function grants(perms: string[], permission: string) {
  const set = new Set(perms);
  const [mod, action] = permission.split(".");
  return (
    set.has("*") ||
    set.has(permission) ||
    set.has(`${mod}.*`) ||
    (!!action && set.has(`*.${action}`))
  );
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const DDL = `
CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL DEFAULT '');
CREATE TABLE accounts (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL,
  classification text NOT NULL, level int NOT NULL DEFAULT 1, parent_id text, system_key text,
  currency text NOT NULL DEFAULT 'SAR', balance double precision NOT NULL DEFAULT 0,
  postable boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active',
  description text DEFAULT '', notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE cashboxes (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  linked_account_id text NOT NULL, currency text NOT NULL DEFAULT 'SAR', status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE bank_accounts (id text PRIMARY KEY, code text NOT NULL UNIQUE, bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '', account_number text, iban text, iban_normalized text,
  currency text NOT NULL DEFAULT 'SAR', linked_account_id text NOT NULL, status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR', period_id text,
  project_id text, source text NOT NULL DEFAULT 'manual', source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text, reversed_of text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX journal_entries_goods_receipt_source_idx ON journal_entries (source_id) WHERE source_type = 'goods_receipt';
CREATE TABLE journal_lines (id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '', debit double precision NOT NULL DEFAULT 0,
  credit double precision NOT NULL DEFAULT 0, fund text NOT NULL DEFAULT 'unrestricted',
  cost_center_id text, project_id text, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', closed_at text,
  closed_by_id text, closed_by_name text, reopened_at text, reopened_by_id text, reopened_by_name text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE suppliers (id text PRIMARY KEY, name text NOT NULL, activity text DEFAULT '', phone text, email text,
  tax_number text DEFAULT '', contact_person text DEFAULT '', address text DEFAULT '',
  building_no text DEFAULT '', street text DEFAULT '', district text DEFAULT '', city text DEFAULT '',
  postal_code text DEFAULT '', additional_no text DEFAULT '', rating double precision NOT NULL DEFAULT 0,
  balance double precision NOT NULL DEFAULT 0, notes text DEFAULT '', status text NOT NULL DEFAULT 'active',
  supplier_code text, legal_name text DEFAULT '', commercial_registration text, currency text NOT NULL DEFAULT 'SAR',
  payment_terms_days integer, bank_name text, iban text, iban_normalized text,
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE supplier_journal_links (id text PRIMARY KEY, supplier_id text NOT NULL,
  journal_line_id text NOT NULL, source_type text, created_by text, created_at text NOT NULL DEFAULT '',
  CONSTRAINT supplier_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
CREATE TABLE finance_account_mapping_confirmations (id text PRIMARY KEY, purpose text NOT NULL UNIQUE,
  account_id text NOT NULL, confirmed_by text, confirmed_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE inventory_items (id text PRIMARY KEY, name text NOT NULL, sku text DEFAULT '', unit text NOT NULL DEFAULT 'قطعة',
  category text DEFAULT '', warehouse_id text, quantity double precision NOT NULL DEFAULT 0,
  min_quantity double precision NOT NULL DEFAULT 0, price double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE stock_movements (id text PRIMARY KEY, item_id text NOT NULL, warehouse_id text, type text NOT NULL,
  quantity double precision NOT NULL DEFAULT 0, balance_after double precision NOT NULL DEFAULT 0,
  related_warehouse_id text, related_stocktake_id text, source_type text, source_id text,
  reference text DEFAULT '', date text NOT NULL DEFAULT '', notes text DEFAULT '',
  created_by text, created_at text NOT NULL DEFAULT '');
CREATE TABLE purchase_orders (id text PRIMARY KEY, supplier_id text, request_id text, subject text NOT NULL,
  date text NOT NULL DEFAULT '', delivery_date text DEFAULT '', status text NOT NULL DEFAULT 'draft',
  total double precision NOT NULL DEFAULT 0, received_amount double precision NOT NULL DEFAULT 0,
  journal_entry_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '', governance_mode text NOT NULL DEFAULT 'legacy', po_number text,
  currency text NOT NULL DEFAULT 'SAR', supplier_reference text, subtotal double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, total_amount double precision NOT NULL DEFAULT 0,
  submitted_by text, submitted_at text, approved_by text, approved_at text, issued_by text, issued_at text,
  cancelled_by text, cancelled_at text);
CREATE TABLE purchase_order_lines (id text PRIMARY KEY, order_id text NOT NULL, line_number int NOT NULL,
  item_id text, description text NOT NULL DEFAULT '', quantity double precision NOT NULL DEFAULT 0,
  unit_price double precision NOT NULL DEFAULT 0, received_quantity double precision NOT NULL DEFAULT 0,
  unit text DEFAULT '', notes text DEFAULT '', created_at text NOT NULL DEFAULT '',
  line_type text NOT NULL DEFAULT 'ITEM', account_id text, cost_center_id text,
  line_subtotal double precision NOT NULL DEFAULT 0, tax_rate double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, line_total double precision NOT NULL DEFAULT 0);
CREATE TABLE goods_receipts (id text PRIMARY KEY, grn_number text NOT NULL UNIQUE, purchase_order_id text NOT NULL,
  supplier_id text, receipt_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'posted',
  currency text NOT NULL DEFAULT 'SAR', total_value double precision NOT NULL DEFAULT 0,
  journal_entry_id text, reversal_journal_entry_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '', reversed_by text,
  reversed_at text, reversal_reason text);
CREATE TABLE goods_receipt_lines (id text PRIMARY KEY, goods_receipt_id text NOT NULL, po_line_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, line_type text NOT NULL DEFAULT 'ITEM', description text DEFAULT '',
  item_id text, account_id text, quantity_received double precision NOT NULL DEFAULT 0,
  unit_price double precision NOT NULL DEFAULT 0, line_value double precision NOT NULL DEFAULT 0,
  cost_center_id text, stock_movement_id text, created_at text NOT NULL DEFAULT '');
`;

async function freshDb(opts: { grni?: boolean } = {}) {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-ap", "210101", "AP", "liability", "accounts_payable"],
    ["a-grni", "210105", "GRNI", "liability", null],
    ["a-accrued", "210102", "Accrued", "liability", null],
    ["a-exp", "5301", "Expense", "expense", null],
    ["a-inv", "110503", "Inventory", "asset", "inventory"],
    ["a-vat", "110306", "Input VAT", "asset", "input_vat"],
    ["a-cashmapped", "110109", "Cash link", "asset", null],
  ];
  for (const [id, code, name, cls, sk] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',true,'active','SAR',${sk ? `'${sk}'` : "NULL"})`,
    );
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,currency,status) VALUES ('cb1','CB1','Petty','a-cashmapped','SAR','active')`,
  );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  // Confirmed GRNI mapping by default (a-grni). Skip with { grni:false }.
  if (opts.grni !== false) {
    await db.transaction((tx: any) => assignGrniAccount(tx, { accountId: "a-grni", userId: "u1" }));
  }
  return { db, client };
}
async function mkSupplier(client: any, id: string, status = "active") {
  await client.exec(
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('${id}','${id}','${status}','SAR','${now()}','${now()}')`,
  );
}
async function mkItem(client: any, id: string, qty = 0) {
  await client.exec(
    `INSERT INTO inventory_items (id,name,unit,quantity,status) VALUES ('${id}','${id}','قطعة',${qty},'active')`,
  );
}
/** Insert an ISSUED governed PO with lines. lines: {id,type,itemId?,accountId?,qty,price}. */
async function mkIssuedPO(client: any, poId: string, supplierId: string, lines: any[]) {
  await client.exec(
    `INSERT INTO purchase_orders (id,governance_mode,po_number,supplier_id,subject,date,status,currency,total_amount,total,created_at,updated_at) VALUES ('${poId}','governed','PO-2026-${poId}','${supplierId}','po','2026-03-01','issued','SAR',0,0,'${now()}','${now()}')`,
  );
  let n = 0;
  for (const l of lines) {
    await client.exec(
      `INSERT INTO purchase_order_lines (id,order_id,line_number,item_id,description,quantity,unit_price,line_type,account_id,created_at) VALUES ('${l.id}','${poId}',${++n},${l.itemId ? `'${l.itemId}'` : "NULL"},'${l.id}',${l.qty},${l.price},'${l.type}',${l.accountId ? `'${l.accountId}'` : "NULL"},'${now()}')`,
    );
  }
}
/** Faithful mirror of the service GRN post: Dr inventory(ITEM)/account(non-item) / Cr GRNI, + stock. */
async function postGrn(
  db: any,
  poId: string,
  receipts: { poLineId: string; qty: number }[],
  opts: { date?: string } = {},
) {
  const id = genId("GRN");
  const ts = now();
  const date = opts.date ?? "2026-03-10";
  await db.transaction(async (tx: any) => {
    const grniId = await resolveConfirmedGrniAccount(tx); // throws if not READY
    const inventoryId = await resolveSystemAccountId(tx, SYS.INVENTORY);
    const received = await receivedByPoLine(tx, poId);
    const jLines: any[] = [];
    const grnLines: any[] = [];
    let total = 0;
    let n = 0;
    for (const r of receipts) {
      const pl = (await tx.execute(sql`SELECT * FROM purchase_order_lines WHERE id=${r.poLineId}`))
        .rows[0];
      const alreadyReceived = received.get(r.poLineId) || 0;
      if (alreadyReceived + r.qty > Number(pl.quantity) + 0.0001)
        throw Object.assign(new Error("OVER_RECEIVE"), { code: "OVER_RECEIVE" });
      const price = Number(pl.unit_price);
      const value = Math.round(r.qty * price * 100) / 100;
      total = Math.round((total + value) * 100) / 100;
      let debit = pl.account_id;
      let mvId: string | null = null;
      if (pl.line_type === "ITEM") {
        debit = inventoryId;
        const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${pl.item_id}`))
          .rows[0];
        const nq = Number(item.quantity) + r.qty;
        await tx.execute(sql`UPDATE inventory_items SET quantity=${nq} WHERE id=${pl.item_id}`);
        mvId = genId("MV");
        await tx.execute(
          sql`INSERT INTO stock_movements (id,item_id,type,quantity,balance_after,source_type,source_id,date,created_at) VALUES (${mvId},${pl.item_id},'in',${r.qty},${nq},'goods_receipt',${id},${date},${ts})`,
        );
      }
      jLines.push({ accountId: debit, debit: value });
      grnLines.push({
        poLineId: r.poLineId,
        type: pl.line_type,
        itemId: pl.item_id,
        qty: r.qty,
        price,
        value,
        mvId,
      });
    }
    jLines.push({ accountId: grniId, credit: total });
    const entryId = await postBalancedEntry(tx, {
      date,
      description: "grn",
      source: "goods_receipt",
      sourceType: "goods_receipt",
      sourceId: id,
      lines: jLines,
      userId: "u1",
      status: "posted",
    });
    const num = await nextCode(tx, {
      table: "goods_receipts",
      column: "grn_number",
      prefix: "GRN-",
      year: true,
    });
    await tx.execute(
      sql`INSERT INTO goods_receipts (id,grn_number,purchase_order_id,supplier_id,receipt_date,status,currency,total_value,journal_entry_id,created_at,updated_at) VALUES (${id},${num},${poId},NULL,${date},'posted','SAR',${total},${entryId},${ts},${ts})`,
    );
    let ln = 0;
    for (const g of grnLines)
      await tx.execute(
        sql`INSERT INTO goods_receipt_lines (id,goods_receipt_id,po_line_id,line_number,line_type,item_id,quantity_received,unit_price,line_value,stock_movement_id,created_at) VALUES (${genId("GRL")},${id},${g.poLineId},${++ln},${g.type},${g.itemId},${g.qty},${g.price},${g.value},${g.mvId},${ts})`,
      );
  });
  return id;
}
async function acctBal(client: any, acct: string) {
  const r = (
    await client.query(
      `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE jl.account_id=$1 AND je.status IN ('posted','reversed')`,
      [acct],
    )
  ).rows[0];
  return { debit: Number(r.d), credit: Number(r.c), net: Number(r.d) - Number(r.c) };
}
async function counts(client: any) {
  const je = (await client.query(`SELECT count(*)::int n FROM journal_entries`)).rows[0].n;
  const sjl = (await client.query(`SELECT count(*)::int n FROM supplier_journal_links`)).rows[0].n;
  const mv = (await client.query(`SELECT count(*)::int n FROM stock_movements`)).rows[0].n;
  return { je: Number(je), sjl: Number(sjl), mv: Number(mv) };
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/goods-receipt.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/goods-receipts.ts"),
  "utf8",
);
const poSvc = readFileSync(resolve(process.cwd(), "src/server/db/purchase-order.ts"), "utf8");
const mig = readFileSync(resolve(process.cwd(), "drizzle/0026_goods_receipts.sql"), "utf8");

async function main() {
  // ===================== MAP-A..F — GRNI mapping (confirmed liability) =====================
  console.log("\nMAP-A..F — GRNI account mapping (admin-confirmed liability)");
  {
    const { db } = await freshDb({ grni: false });
    ok(
      "MAP-A: no GRNI mapping → resolve throws GRNI_ACCOUNT_MISSING",
      await throwsCode(() => resolveConfirmedGrniAccount(db), "GRNI_ACCOUNT_MISSING"),
    );
    ok(
      "MAP-B: expense account rejected as GRNI (must be liability)",
      await throwsCode(() => validateGrniMappingAccount(db, "a-exp"), "MAPPING_CLASS_INVALID"),
    );
    ok(
      "MAP-C: AP control account rejected as GRNI (GRNI ≠ Accounts Payable)",
      await throwsCode(() => validateGrniMappingAccount(db, "a-ap"), "MAPPING_IS_AP"),
    );
    ok(
      "MAP-C: cash/bank-mapped account rejected as GRNI",
      await throwsCode(
        () => validateGrniMappingAccount(db, "a-cashmapped"),
        "MAPPING_IS_CASH_BANK",
      ),
    );
    // D: mapping present but unconfirmed → resolve throws UNCONFIRMED.
    await db.execute(sql`UPDATE accounts SET system_key='grni' WHERE id='a-accrued'`);
    ok(
      "MAP-D: system_key mapping without confirmation → GRNI_MAPPING_UNCONFIRMED",
      await throwsCode(() => resolveConfirmedGrniAccount(db), "GRNI_MAPPING_UNCONFIRMED"),
    );
    // E: confirm a liability → READY, resolves to it.
    await db.transaction((tx: any) => assignGrniAccount(tx, { accountId: "a-grni", userId: "u1" }));
    const cfg = await getGrniConfiguration(db);
    ok(
      "MAP-E: confirming a liability → READY and resolves to the confirmed account",
      cfg.status === "READY" && (await resolveConfirmedGrniAccount(db)) === "a-grni",
    );
    // F: reassigning is atomic — exactly one grni mapping remains.
    const holders = (await db.execute(sql`SELECT id FROM accounts WHERE system_key='grni'`)).rows;
    ok(
      "MAP-F: exactly one GRNI system_key mapping (a-grni)",
      holders.length === 1 && holders[0].id === "a-grni",
    );
  }

  // ===================== GRN-A..H — posting Dr receipt / Cr GRNI + inventory =====================
  console.log("\nGRN-A..H — receipt posts Dr receipt/inventory / Cr GRNI, never AP");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    // Give the supplier an existing payable so we can prove GRN doesn't touch it.
    const inv = await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-02-01",
        description: "seed",
        source: "supplier_invoice",
        sourceType: "supplier_invoice",
        sourceId: "SEED",
        lines: [
          { accountId: "a-exp", debit: 5000 },
          { accountId: "a-ap", credit: 5000 },
        ],
        userId: "u1",
        status: "posted",
      }),
    );
    const apLine = (
      await client.query(
        `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-ap' AND credit>0`,
        [inv],
      )
    ).rows[0].id;
    await createSupplierApLink(db, { supplierId: "sup1", journalLineId: apLine });
    const payableBefore = (await getSupplierBalance(db, "sup1")).payableBalance;

    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 }, // 200 → inventory
      { id: "l2", type: "SERVICE", accountId: "a-exp", qty: 1, price: 300 }, // 300 → expense
    ]);
    const before = await counts(client);
    const grn = await postGrn(db, "PO1", [
      { poLineId: "l1", qty: 10 },
      { poLineId: "l2", qty: 1 },
    ]);

    const je = (
      await client.query(
        `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id=(SELECT journal_entry_id FROM goods_receipts WHERE id=$1)`,
        [grn],
      )
    ).rows[0];
    ok(
      "GRN-A: receipt journal balanced (500 = 500)",
      near(Number(je.d), 500) && near(Number(je.c), 500),
    );
    ok(
      "GRN-B: GRNI credited by total received (500)",
      near((await acctBal(client, "a-grni")).net, -500),
    );
    ok(
      "GRN-C: Accounts Payable NEVER touched by the receipt (still 5000 from the seed only)",
      near((await acctBal(client, "a-ap")).net, -5000),
    );
    ok(
      "GRN-D: inventory account debited for the ITEM line (200)",
      near((await acctBal(client, "a-inv")).net, 200),
    );
    // a-exp holds 5000 (seed invoice debit) + 300 (this GRN service line) = 5300.
    ok(
      "GRN-D: expense account debited for the SERVICE line (net 5300)",
      near((await acctBal(client, "a-exp")).net, 5300),
    );
    ok(
      "GRN-E: supplier payable UNCHANGED by the receipt",
      near((await getSupplierBalance(db, "sup1")).payableBalance, payableBefore),
    );
    ok(
      "GRN-E: supplier_journal_links unchanged (no AP subledger link from GRN)",
      (await counts(client)).sjl === before.sjl,
    );
    ok(
      "GRN-F: Input VAT NEVER recognized by the receipt (0)",
      near((await acctBal(client, "a-vat")).net, 0),
    );
    const itemQty = (await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`))
      .rows[0].quantity;
    const itemMoves = (
      await client.query(
        `SELECT count(*)::int n FROM stock_movements WHERE item_id='item1' AND source_type='goods_receipt'`,
      )
    ).rows[0].n;
    ok(
      "GRN-G: ITEM receipt increments inventory exactly once (qty 10, one movement)",
      near(Number(itemQty), 10) && Number(itemMoves) === 1,
    );
    const svcMoves = (await client.query(`SELECT count(*)::int n FROM stock_movements`)).rows[0].n;
    ok(
      "GRN-H: non-item (SERVICE) receipt creates NO stock movement (only the 1 ITEM movement)",
      Number(svcMoves) === 1,
    );
  }

  // ===================== GRN guards — issued/governed/confirmed only =====================
  console.log("\nGRN guards — issued + governed PO, confirmed GRNI only");
  {
    // No GRNI mapping → cannot post (mirror uses resolveConfirmedGrniAccount).
    const { db, client } = await freshDb({ grni: false });
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 5, price: 10 },
    ]);
    ok(
      "GUARD: no confirmed GRNI → receipt rejected (GRNI_ACCOUNT_MISSING), no journal",
      (await throwsCode(
        () => postGrn(db, "PO1", [{ poLineId: "l1", qty: 5 }]),
        "GRNI_ACCOUNT_MISSING",
      )) && (await counts(client)).je === 0,
    );
    // Service enforces PO must be governed + ISSUED (source assertions).
    ok(
      "GUARD: service requires governed + ISSUED PO",
      /PurchaseOrderGovernance\.GOVERNED|governanceMode !== GOVERNED/.test(svc) &&
        /POS\.ISSUED|PO_NOT_ISSUED/.test(svc),
    );
  }

  // ===================== PART-A..D — partial receiving + over-receive =====================
  console.log("\nPART-A..D — partial receiving, derived qty, over-receive guard");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 5 },
    ]);
    await postGrn(db, "PO1", [{ poLineId: "l1", qty: 4 }]);
    const rec1 = await receivedByPoLine(db, "PO1");
    ok(
      "PART-A: partial receipt of 4 recorded; received derived from posted GRNs",
      near(rec1.get("l1") || 0, 4),
    );
    await postGrn(db, "PO1", [{ poLineId: "l1", qty: 6 }], { date: "2026-03-12" });
    const rec2 = await receivedByPoLine(db, "PO1");
    ok(
      "PART-B: second receipt of 6 → derived received now 10 (fully)",
      near(rec2.get("l1") || 0, 10),
    );
    const lines = await receivablePoLines(db, "PO1");
    ok(
      "PART-C: receivable view shows remaining 0 after full receipt",
      near(lines[0].remainingQuantity, 0),
    );
    ok(
      "PART-D: over-receive rejected (11 > 10 ordered)",
      await throwsCode(() => postGrn(db, "PO1", [{ poLineId: "l1", qty: 1 }]), "OVER_RECEIVE"),
    );
    const itemQty = (await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`))
      .rows[0].quantity;
    ok(
      "PART-D: inventory reflects exactly 10 received (no over-receive leaked)",
      near(Number(itemQty), 10),
    );
  }

  // ===================== REV-A..E — reversal unwinds GL + inventory =====================
  console.log("\nREV-A..E — reversal reverses both GL and inventory");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
    ]);
    const grn = await postGrn(db, "PO1", [{ poLineId: "l1", qty: 10 }]);
    ok(
      "REV-A: posted → GRNI 200, inventory qty 10",
      near((await acctBal(client, "a-grni")).net, -200),
    );

    // Mirror service reverse: reverseEntry + reverse stock + status reversed.
    const entryId = (
      await client.query(`SELECT journal_entry_id FROM goods_receipts WHERE id=$1`, [grn])
    ).rows[0].journal_entry_id;
    const revId = await db.transaction((tx: any) => reverseEntry(tx, entryId, "u1"));
    await db.transaction(async (tx: any) => {
      const gl = (
        await tx.execute(sql`SELECT * FROM goods_receipt_lines WHERE goods_receipt_id=${grn}`)
      ).rows;
      for (const g of gl) {
        if (g.item_id && g.stock_movement_id) {
          const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${g.item_id}`))
            .rows[0];
          const nq = Number(item.quantity) - Number(g.quantity_received);
          await tx.execute(sql`UPDATE inventory_items SET quantity=${nq} WHERE id=${g.item_id}`);
          await tx.execute(
            sql`INSERT INTO stock_movements (id,item_id,type,quantity,balance_after,source_type,source_id,date,created_at) VALUES (${genId("MV")},${g.item_id},'out',${g.quantity_received},${nq},'goods_receipt_reversal',${grn},'2026-03-15',${now()})`,
          );
        }
      }
      await tx.execute(
        sql`UPDATE goods_receipts SET status='reversed', reversal_journal_entry_id=${revId} WHERE id=${grn}`,
      );
    });
    ok(
      "REV-B: GL nets to 0 after reversal (GRNI 0)",
      near((await acctBal(client, "a-grni")).net, 0),
    );
    ok(
      "REV-C: inventory account nets to 0 after reversal",
      near((await acctBal(client, "a-inv")).net, 0),
    );
    const itemQty = (await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`))
      .rows[0].quantity;
    ok("REV-D: inventory quantity unwound to 0", near(Number(itemQty), 0));
    ok(
      "REV-E: reversed receipt no longer counts toward received qty",
      near((await receivedByPoLine(db, "PO1")).get("l1") || 0, 0),
    );
  }

  // ===================== POC-A..B — PO cancel blocked by posted GRN =====================
  console.log("\nPOC-A..B — a PO with a posted GRN cannot be cancelled");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 5, price: 10 },
    ]);
    ok(
      "POC-A: no receipts yet → hasPostedGoodsReceipt false",
      (await hasPostedGoodsReceipt(db, "PO1")) === false,
    );
    await postGrn(db, "PO1", [{ poLineId: "l1", qty: 5 }]);
    ok(
      "POC-B: after posted GRN → hasPostedGoodsReceipt true (PO cancel would be blocked)",
      (await hasPostedGoodsReceipt(db, "PO1")) === true,
    );
    ok(
      "POC-B: PO transition service enforces PO_HAS_RECEIPTS on cancel",
      /hasPostedGoodsReceipt\(/.test(poSvc) && /PO_HAS_RECEIPTS/.test(poSvc),
    );
  }

  // ===================== PERM-A..F — permission separation =====================
  console.log("\nPERM-A..F — GRN permission separation");
  {
    ok(
      "PERM-A: create gated (route checks grnCreate); view does not grant create",
      /hasPermission\([^)]*grnCreate\)/.test(route) && !grants([PP.grnView], PP.grnCreate),
    );
    ok(
      "PERM-B: reverse gated (route checks grnReverse); view does not grant reverse",
      /hasPermission\([^)]*grnReverse\)/.test(route) && !grants([PP.grnView], PP.grnReverse),
    );
    ok("PERM-C: create does not imply reverse", !grants([PP.grnCreate], PP.grnReverse));
    ok(
      "PERM-D: GRN permissions do not grant PO mutation (submit/approve/issue/cancel)",
      !grants([PP.grnCreate, PP.grnReverse], PP.poApprove) &&
        !grants([PP.grnCreate], PP.poIssue) &&
        !grants([PP.grnCreate], PP.poCancel),
    );
    ok(
      "PERM-E: GRN permissions do not grant Supplier Invoice posting or supplier mutation",
      !grants([PP.grnCreate, PP.grnReverse], (FP as any).supplierInvoicePost) &&
        !grants([PP.grnCreate], (FP as any).supplierUpdate),
    );
    ok(
      "PERM-F: GRNI mapping change requires finance.account_mapping.update (high-authority)",
      !grants([PP.grnCreate], (FP as any).accountMappingUpdate),
    );
  }

  // ===================== AUD-A..E — accounting-isolation source guarantees =====================
  console.log("\nAUD-A..E — GRN never credits AP / payable / VAT; atomic; confirmed GRNI");
  {
    ok(
      "AUD-A: GRN service credits the CONFIRMED GRNI account, never Accounts Payable",
      /resolveConfirmedGrniAccount\(/.test(svc) &&
        !/SYS\.ACCOUNTS_PAYABLE[^)]*credit|credit[^;]*ACCOUNTS_PAYABLE/.test(svc) &&
        /credit: totalValue/.test(svc),
    );
    ok(
      "AUD-B: GRN service never writes suppliers.balance or supplier AP-subledger links",
      !/\.update\(suppliers\)/.test(svc) &&
        !/balance:/.test(svc) &&
        !/supplierJournalLinks|linkEntryApLine|createSupplierApLink/.test(svc),
    );
    ok(
      "AUD-C: GRN service never recognizes Input VAT (no VAT debit/credit leg posted)",
      !/resolveConfirmedInputVatAccount/.test(svc) &&
        !/debit:[^;]*INPUT_VAT|INPUT_VAT[^;]*debit/.test(svc),
    );
    ok(
      "AUD-D: journal + stock mutation are inside ONE db.transaction (atomic)",
      /db\.transaction\(async \(tx\) => \{/.test(svc) &&
        /postBalancedEntry\(/.test(svc) &&
        /stockMovements/.test(svc) &&
        /inventoryItems/.test(svc),
    );
    ok(
      "AUD-E: migration additive, scopes goods_receipt journal source, seeds GRNI candidate WITHOUT system_key",
      /CREATE TABLE IF NOT EXISTS "goods_receipts"/.test(mig) &&
        /source_type" = 'goods_receipt'/.test(mig) &&
        /'210105'[\s\S]*NULL,'SAR'/.test(mig) &&
        !/'grni'/.test(mig),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
