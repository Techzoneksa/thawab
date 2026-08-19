/**
 * Phase 3D / 3D.1 — governed Goods Receipt (GRN) governance, safe reversal &
 * GRNI subledger integrity tests.
 *
 * Exercises the REAL parameterized building blocks against PGlite:
 *  - GRNI mapping (validate/assign/resolveConfirmed) — account-mapping.ts
 *  - GRNI subledger (createGrniLink/linkEntryGrniLine/grniReconciliation/
 *    unallocatedGrniLines/receiptGrniLink) — grni-link.ts
 *  - governance decision engine (evaluateTransition + GRN_TRANSITIONS)
 *  - derived received qty / receivable / hasPostedGoodsReceipt — goods-receipt.ts
 *  - postBalancedEntry / reverseEntry — gl.ts
 * The atomic POST and the safe REVERSE sequences are mirrored in the SAME order
 * and with the SAME guards the service uses, and the real service file's
 * guarantees are additionally locked down by source assertions (ACC-GRN / REV
 * ordering / migration + seed).
 *
 * Suites: GRNI-MAP-A..F, WF-GRN-A..J, ACC-GRN-A..G, REV-STOCK-A..F,
 * GRNI-LINK-A..G, GRN-A..H, PART-A..D, POC-A..B, PERM-A..G, MIG-A..D.
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
  createGrniLink,
  linkEntryGrniLine,
  grniReconciliation,
  unallocatedGrniLines,
  receiptGrniLink,
} from "@/server/db/grni-link";
import {
  receivedByPoLine,
  receivablePoLines,
  hasPostedGoodsReceipt,
} from "@/server/db/goods-receipt";
import { getSupplierBalance, createSupplierApLink } from "@/server/db/supplier";
import { postBalancedEntry, reverseEntry, resolveSystemAccountId, SYS } from "@/server/db/gl";
import { nextCode } from "@/server/db/numbering";
import { now, genId } from "@/server/db/index";
import { evaluateTransition } from "@/lib/finance-permissions";
import { GRN_TRANSITIONS, PROCUREMENT_PERMISSIONS as PP } from "@/lib/procurement-permissions";
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
  supplier_id text, receipt_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'SAR', total_value double precision NOT NULL DEFAULT 0,
  journal_entry_id text, reversal_journal_entry_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '',
  submitted_by text, submitted_at text, approved_by text, approved_at text, posted_by text, posted_at text,
  reversed_by text, reversed_at text, reversal_reason text);
CREATE TABLE goods_receipt_lines (id text PRIMARY KEY, goods_receipt_id text NOT NULL, po_line_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, line_type text NOT NULL DEFAULT 'ITEM', description text DEFAULT '',
  item_id text, account_id text, quantity_received double precision NOT NULL DEFAULT 0,
  unit_price double precision NOT NULL DEFAULT 0, line_value double precision NOT NULL DEFAULT 0,
  cost_center_id text, stock_movement_id text, created_at text NOT NULL DEFAULT '');
CREATE TABLE grni_journal_links (id text PRIMARY KEY, goods_receipt_id text NOT NULL, goods_receipt_line_id text,
  journal_line_id text NOT NULL, link_type text NOT NULL DEFAULT 'receipt', created_by text,
  created_at text NOT NULL DEFAULT '', CONSTRAINT grni_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
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

/** Mirror of the service create(DRAFT): header + lines, NO GL / NO GRNI / NO stock. */
async function draftGrn(
  db: any,
  poId: string,
  receipts: { poLineId: string; qty: number }[],
): Promise<string> {
  const id = genId("GRN");
  const ts = now();
  await db.transaction(async (tx: any) => {
    const inventoryId = await resolveSystemAccountId(tx, SYS.INVENTORY);
    let total = 0;
    const rows: any[] = [];
    let n = 0;
    for (const r of receipts) {
      const pl = (await tx.execute(sql`SELECT * FROM purchase_order_lines WHERE id=${r.poLineId}`))
        .rows[0];
      const price = Number(pl.unit_price);
      const value = Math.round(r.qty * price * 100) / 100;
      total = Math.round((total + value) * 100) / 100;
      const debit = pl.line_type === "ITEM" ? inventoryId : pl.account_id;
      rows.push({
        poLineId: r.poLineId,
        type: pl.line_type,
        itemId: pl.item_id,
        qty: r.qty,
        price,
        value,
        debit,
        n: ++n,
      });
    }
    const num = await nextCode(tx, {
      table: "goods_receipts",
      column: "grn_number",
      prefix: "GRN-",
      year: true,
    });
    await tx.execute(
      sql`INSERT INTO goods_receipts (id,grn_number,purchase_order_id,receipt_date,status,currency,total_value,created_at,updated_at) VALUES (${id},${num},${poId},'2026-03-10','draft','SAR',${total},${ts},${ts})`,
    );
    for (const g of rows)
      await tx.execute(
        sql`INSERT INTO goods_receipt_lines (id,goods_receipt_id,po_line_id,line_number,line_type,item_id,account_id,quantity_received,unit_price,line_value,created_at) VALUES (${genId("GRL")},${id},${g.poLineId},${g.n},${g.type},${g.itemId},${g.debit},${g.qty},${g.price},${g.value},${ts})`,
      );
  });
  return id;
}
async function setStatus(db: any, id: string, status: string) {
  await db.execute(sql`UPDATE goods_receipts SET status=${status} WHERE id=${id}`);
}

/** Mirror of the service POST (APPROVED→POSTED): Dr targets / Cr GRNI + stock + GRNI credit link. */
async function postGrn(db: any, id: string, opts: { date?: string } = {}): Promise<string> {
  const ts = now();
  await db.transaction(async (tx: any) => {
    const grn = (await tx.execute(sql`SELECT * FROM goods_receipts WHERE id=${id}`)).rows[0];
    const grniId = await resolveConfirmedGrniAccount(tx); // throws if not READY
    const received = await receivedByPoLine(tx, grn.purchase_order_id);
    const glines = (
      await tx.execute(
        sql`SELECT * FROM goods_receipt_lines WHERE goods_receipt_id=${id} ORDER BY line_number`,
      )
    ).rows;
    const jLines: any[] = [];
    const perLine = new Map<string, number>();
    for (const gl of glines) {
      const pl = (
        await tx.execute(sql`SELECT * FROM purchase_order_lines WHERE id=${gl.po_line_id}`)
      ).rows[0];
      const already = received.get(gl.po_line_id) || 0;
      const prior = perLine.get(gl.po_line_id) || 0;
      if (already + prior + Number(gl.quantity_received) > Number(pl.quantity) + 0.0001)
        throw Object.assign(new Error("OVER_RECEIVE"), { code: "OVER_RECEIVE" });
      perLine.set(gl.po_line_id, prior + Number(gl.quantity_received));
      let mvId: string | null = null;
      if (gl.line_type === "ITEM") {
        const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${gl.item_id}`))
          .rows[0];
        const nq = Number(item.quantity) + Number(gl.quantity_received);
        await tx.execute(sql`UPDATE inventory_items SET quantity=${nq} WHERE id=${gl.item_id}`);
        mvId = genId("MV");
        await tx.execute(
          sql`INSERT INTO stock_movements (id,item_id,type,quantity,balance_after,source_type,source_id,date,created_at) VALUES (${mvId},${gl.item_id},'in',${gl.quantity_received},${nq},'goods_receipt',${id},${opts.date ?? grn.receipt_date},${ts})`,
        );
        await tx.execute(
          sql`UPDATE goods_receipt_lines SET stock_movement_id=${mvId} WHERE id=${gl.id}`,
        );
      }
      jLines.push({ accountId: gl.account_id, debit: Number(gl.line_value) });
    }
    jLines.push({ accountId: grniId, credit: Number(grn.total_value) });
    const entryId = await postBalancedEntry(tx, {
      date: opts.date ?? grn.receipt_date,
      description: "grn",
      source: "goods_receipt",
      sourceType: "goods_receipt",
      sourceId: id,
      lines: jLines,
      userId: "u1",
      status: "posted",
    });
    await tx.execute(
      sql`UPDATE goods_receipts SET status='posted', journal_entry_id=${entryId} WHERE id=${id}`,
    );
    // Link the GRNI CREDIT line to the receipt subledger (real service function).
    await linkEntryGrniLine(tx, {
      goodsReceiptId: id,
      entryId,
      accountId: grniId,
      linkType: "receipt",
      userId: "u1",
    });
  });
  return id;
}
async function receiveAndPost(
  db: any,
  poId: string,
  receipts: { poLineId: string; qty: number }[],
  opts: { date?: string } = {},
): Promise<string> {
  const id = await draftGrn(db, poId, receipts);
  await setStatus(db, id, "approved");
  return postGrn(db, id, opts);
}

/** Mirror of the service safe REVERSE: stock availability check BEFORE reverseEntry. */
async function reverseGrnSafe(db: any, id: string): Promise<string> {
  let reversalId = "";
  await db.transaction(async (tx: any) => {
    const grn = (await tx.execute(sql`SELECT * FROM goods_receipts WHERE id=${id}`)).rows[0];
    if (grn.status !== "posted")
      throw Object.assign(new Error("STATE_CONFLICT"), { code: "STATE_CONFLICT" });
    const glines = (
      await tx.execute(sql`SELECT * FROM goods_receipt_lines WHERE goods_receipt_id=${id}`)
    ).rows;
    const removeByItem = new Map<string, number>();
    for (const gl of glines)
      if (gl.item_id && gl.stock_movement_id)
        removeByItem.set(
          gl.item_id,
          (removeByItem.get(gl.item_id) || 0) + Number(gl.quantity_received),
        );
    const itemIds = [...removeByItem.keys()].sort();
    const have = new Map<string, number>();
    for (const itemId of itemIds) {
      const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${itemId}`))
        .rows[0];
      have.set(itemId, Number(item.quantity));
    }
    // ALL-OR-NOTHING availability check BEFORE any GL reversal.
    for (const itemId of itemIds)
      if (have.get(itemId)! + 0.0001 < removeByItem.get(itemId)!)
        throw Object.assign(new Error("GRN_STOCK_ALREADY_CONSUMED"), {
          code: "GRN_STOCK_ALREADY_CONSUMED",
        });
    reversalId = await reverseEntry(tx, grn.journal_entry_id, "u1");
    const orig = await receiptGrniLink(tx, id);
    if (orig)
      await linkEntryGrniLine(tx, {
        goodsReceiptId: id,
        entryId: reversalId,
        accountId: orig.accountId,
        linkType: "reversal",
        userId: "u1",
      });
    for (const gl of glines) {
      if (!(gl.item_id && gl.stock_movement_id)) continue;
      const nq = have.get(gl.item_id)! - Number(gl.quantity_received);
      have.set(gl.item_id, nq);
      await tx.execute(sql`UPDATE inventory_items SET quantity=${nq} WHERE id=${gl.item_id}`);
      await tx.execute(
        sql`INSERT INTO stock_movements (id,item_id,type,quantity,balance_after,source_type,source_id,date,created_at) VALUES (${genId("MV")},${gl.item_id},'out',${gl.quantity_received},${nq},'goods_receipt_reversal',${id},'2026-03-20',${now()})`,
      );
    }
    await tx.execute(
      sql`UPDATE goods_receipts SET status='reversed', reversal_journal_entry_id=${reversalId} WHERE id=${id}`,
    );
  });
  return reversalId;
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
  const gnl = (await client.query(`SELECT count(*)::int n FROM grni_journal_links`)).rows[0].n;
  return { je: Number(je), sjl: Number(sjl), mv: Number(mv), gnl: Number(gnl) };
}
/** Governed GRNI subledger balance for one receipt (credit − debit over its links). */
async function receiptGrniNet(client: any, grnId: string) {
  const r = (
    await client.query(
      `SELECT COALESCE(SUM(jl.credit),0) c, COALESCE(SUM(jl.debit),0) d FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE g.goods_receipt_id=$1`,
      [grnId],
    )
  ).rows[0];
  return Number(r.c) - Number(r.d);
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/goods-receipt.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/goods-receipts.ts"),
  "utf8",
);
const poSvc = readFileSync(resolve(process.cwd(), "src/server/db/purchase-order.ts"), "utf8");
const linkSvc = readFileSync(resolve(process.cwd(), "src/server/db/grni-link.ts"), "utf8");
const mig26 = readFileSync(resolve(process.cwd(), "drizzle/0026_goods_receipts.sql"), "utf8");
const mig27 = readFileSync(
  resolve(process.cwd(), "drizzle/0027_grn_governance_grni_links.sql"),
  "utf8",
);
const seed = readFileSync(resolve(process.cwd(), "scripts/seed.ts"), "utf8");

const U = (id: string) => ({ id, role: "r", name: id });

async function main() {
  // ===================== GRNI-MAP-A..F — GRNI mapping (confirmed liability) =====================
  console.log("\nGRNI-MAP-A..F — GRNI account mapping (admin-confirmed liability)");
  {
    const { db } = await freshDb({ grni: false });
    ok(
      "GRNI-MAP-A: no GRNI mapping → resolve throws GRNI_ACCOUNT_MISSING",
      await throwsCode(() => resolveConfirmedGrniAccount(db), "GRNI_ACCOUNT_MISSING"),
    );
    ok(
      "GRNI-MAP-B: expense account rejected as GRNI (must be liability)",
      await throwsCode(() => validateGrniMappingAccount(db, "a-exp"), "MAPPING_CLASS_INVALID"),
    );
    ok(
      "GRNI-MAP-C: AP control account rejected as GRNI (GRNI ≠ Accounts Payable)",
      await throwsCode(() => validateGrniMappingAccount(db, "a-ap"), "MAPPING_IS_AP"),
    );
    ok(
      "GRNI-MAP-C: cash/bank-mapped account rejected as GRNI",
      await throwsCode(
        () => validateGrniMappingAccount(db, "a-cashmapped"),
        "MAPPING_IS_CASH_BANK",
      ),
    );
    await db.execute(sql`UPDATE accounts SET system_key='grni' WHERE id='a-accrued'`);
    ok(
      "GRNI-MAP-D: system_key mapping without confirmation → GRNI_MAPPING_UNCONFIRMED",
      await throwsCode(() => resolveConfirmedGrniAccount(db), "GRNI_MAPPING_UNCONFIRMED"),
    );
    await db.transaction((tx: any) => assignGrniAccount(tx, { accountId: "a-grni", userId: "u1" }));
    const cfg = await getGrniConfiguration(db);
    ok(
      "GRNI-MAP-E: confirming a liability → READY and resolves to the confirmed account",
      cfg.status === "READY" && (await resolveConfirmedGrniAccount(db)) === "a-grni",
    );
    const holders = (await db.execute(sql`SELECT id FROM accounts WHERE system_key='grni'`)).rows;
    ok(
      "GRNI-MAP-F: exactly one GRNI system_key mapping (a-grni)",
      holders.length === 1 && holders[0].id === "a-grni",
    );
  }

  // ===================== WF-GRN-A..J — governance state machine =====================
  console.log("\nWF-GRN-A..J — DRAFT→SUBMITTED→APPROVED→POSTED, approve≠post, maker≠checker");
  {
    const T = GRN_TRANSITIONS;
    const dec = (from: string, action: any, o: any = {}) =>
      evaluateTransition({
        fromStatus: from,
        action,
        hasPerm: o.hasPerm ?? (() => true),
        createdBy: o.createdBy ?? "maker",
        currentUserId: o.currentUserId ?? "checker",
        reason: o.reason,
        transitions: T,
      });
    ok(
      "WF-GRN-A: DRAFT + submit → SUBMITTED (grnSubmit)",
      dec("draft", "submit").toStatus === "submitted",
    );
    ok(
      "WF-GRN-B: SUBMITTED + approve → APPROVED (grnApprove)",
      dec("submitted", "approve").toStatus === "approved",
    );
    ok(
      "WF-GRN-C: DRAFT + post is ILLEGAL (no direct posting)",
      dec("draft", "post").code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-GRN-D: SUBMITTED + post is ILLEGAL (approval required first)",
      dec("submitted", "post").code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-GRN-E: APPROVED + post → POSTED (grnPost)",
      dec("approved", "post").toStatus === "posted",
    );
    ok(
      "WF-GRN-F: maker == approver → SELF_APPROVAL even WITH permission/wildcard",
      dec("submitted", "approve", { createdBy: "same", currentUserId: "same", hasPerm: () => true })
        .code === "SELF_APPROVAL",
    );
    ok(
      "WF-GRN-G: approve without grnApprove permission → FORBIDDEN",
      dec("submitted", "approve", { hasPerm: (p: string) => p !== PP.grnApprove }).code ===
        "FORBIDDEN",
    );
    ok(
      "WF-GRN-H: SUBMITTED + return needs a reason (REASON_REQUIRED), then → DRAFT",
      dec("submitted", "return", { reason: "" }).code === "REASON_REQUIRED" &&
        dec("submitted", "return", { reason: "fix" }).toStatus === "draft",
    );
    ok(
      "WF-GRN-I: SUBMITTED + reject → REJECTED (with reason)",
      dec("submitted", "reject", { reason: "bad" }).toStatus === "rejected",
    );
    ok(
      "WF-GRN-J: POSTED + reverse → REVERSED; DRAFT + reverse is ILLEGAL",
      dec("posted", "reverse", { reason: "x" }).toStatus === "reversed" &&
        dec("draft", "reverse", { reason: "x" }).code === "ILLEGAL_TRANSITION",
    );
    // The approve permission is maker-checker-blocked in the matrix.
    ok(
      "WF-GRN: approve transition is flagged makerCheckerBlocked in GRN_TRANSITIONS",
      !!T.find((t) => t.action === "approve" && t.makerCheckerBlocked),
    );
  }

  // ===================== ACC-GRN-A..G — accounting isolation + approval zero-effect =====================
  console.log("\nACC-GRN-A..G — only POST books GL/GRNI/stock; approval has zero effect");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
      { id: "l2", type: "SERVICE", accountId: "a-exp", qty: 1, price: 300 },
    ]);
    const grn = await draftGrn(db, "PO1", [
      { poLineId: "l1", qty: 10 },
      { poLineId: "l2", qty: 1 },
    ]);
    ok(
      "ACC-GRN-A: create → DRAFT with ZERO GL, GRNI links, and stock",
      (await counts(client)).je === 0 &&
        (await counts(client)).gnl === 0 &&
        (await counts(client)).mv === 0,
    );
    await setStatus(db, grn, "submitted");
    await setStatus(db, grn, "approved");
    const afterApprove = await counts(client);
    ok(
      "ACC-GRN-B: APPROVED still has ZERO GL / GRNI links / stock effect",
      afterApprove.je === 0 && afterApprove.gnl === 0 && afterApprove.mv === 0,
    );
    const itemQtyApproved = (
      await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`)
    ).rows[0].quantity;
    ok("ACC-GRN-B: inventory untouched at APPROVED (qty 0)", near(Number(itemQtyApproved), 0));

    await postGrn(db, grn);
    ok(
      "ACC-GRN-C: only POST books GL (500=500), GRNI credit link, and inventory",
      near((await acctBal(client, "a-grni")).net, -500) &&
        near((await acctBal(client, "a-inv")).net, 200) &&
        (await counts(client)).gnl === 1 &&
        (await counts(client)).mv === 1,
    );
    ok(
      "ACC-GRN-D: Accounts Payable NEVER credited by the receipt",
      near((await acctBal(client, "a-ap")).net, 0),
    );
    ok(
      "ACC-GRN-D: Input VAT NEVER recognized by the receipt",
      near((await acctBal(client, "a-vat")).net, 0),
    );
    ok(
      "ACC-GRN-E: service never writes suppliers.balance / supplier AP links / Input VAT",
      !/\.update\(suppliers\)/.test(svc) &&
        !/supplierJournalLinks|linkEntryApLine|createSupplierApLink|resolveConfirmedInputVatAccount/.test(
          svc,
        ),
    );
    ok(
      "ACC-GRN-F: POST resolves the CONFIRMED GRNI, serializes on the PO lock, recomputes received-to-date",
      /resolveConfirmedGrniAccount\(/.test(svc) &&
        /pg_advisory_xact_lock\(\$\{LOCK_NS\.GRN_POSTING\}/.test(svc) &&
        /receivedByPoLine\(tx, locked\.purchaseOrderId\)/.test(svc),
    );
    ok(
      "ACC-GRN-F: only APPROVED can be posted (POST guards status APPROVED)",
      /locked\.status !== G\.APPROVED/.test(svc),
    );
    // ACC-GRN-G: non-item eligibility — a normal (non-AP) liability account is a
    // valid receipt debit; protected control/cash-bank accounts are rejected.
    ok(
      "ACC-GRN-G: non-item debit allows ANY non-protected account (no expense/asset-only rule)",
      /Section 17/.test(svc) &&
        /RECEIPT_ACCOUNT_IS_CONTROL/.test(svc) &&
        /RECEIPT_ACCOUNT_IS_CASH_BANK/.test(svc) &&
        !/classification !== AccountClassification\.(EXPENSE|ASSET)/.test(svc),
    );
    // Behavioral: a normal liability (a-accrued) as a SERVICE debit posts fine.
    const { db: db2, client: c2 } = await freshDb();
    await mkIssuedPO(c2, "PO2", "sup1", [
      { id: "s1", type: "SERVICE", accountId: "a-accrued", qty: 1, price: 100 },
    ]);
    const g2 = await receiveAndPost(db2, "PO2", [{ poLineId: "s1", qty: 1 }]);
    ok(
      "ACC-GRN-G: receipt onto a normal (non-AP) liability account posts (Dr accrued 100 / Cr GRNI 100)",
      near((await acctBal(c2, "a-accrued")).net, 100) &&
        near((await acctBal(c2, "a-grni")).net, -100) &&
        !!g2,
    );
  }

  // ===================== GRN-A..H — posting Dr receipt / Cr GRNI + inventory =====================
  console.log("\nGRN-A..H — receipt posts Dr receipt/inventory / Cr GRNI, never AP");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
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
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
      { id: "l2", type: "SERVICE", accountId: "a-exp", qty: 1, price: 300 },
    ]);
    const grn = await receiveAndPost(db, "PO1", [
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
      "GRN-C: Accounts Payable NEVER touched (still 5000 from seed only)",
      near((await acctBal(client, "a-ap")).net, -5000),
    );
    ok(
      "GRN-D: inventory account debited for the ITEM line (200)",
      near((await acctBal(client, "a-inv")).net, 200),
    );
    ok(
      "GRN-D: expense debited for the SERVICE line (net 5300)",
      near((await acctBal(client, "a-exp")).net, 5300),
    );
    ok(
      "GRN-E: supplier payable UNCHANGED by the receipt",
      near((await getSupplierBalance(db, "sup1")).payableBalance, payableBefore),
    );
    ok(
      "GRN-E: supplier_journal_links unchanged (no AP subledger link from GRN)",
      (await counts(client)).sjl === 1,
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
    ok(
      "GRN-H: non-item (SERVICE) receipt creates NO stock movement (only the 1 ITEM movement)",
      (await counts(client)).mv === 1,
    );
  }

  // ===================== GRN guards — issued/governed/confirmed only =====================
  console.log("\nGRN guards — issued + governed PO, confirmed GRNI only");
  {
    const { db, client } = await freshDb({ grni: false });
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 5, price: 10 },
    ]);
    const g = await draftGrn(db, "PO1", [{ poLineId: "l1", qty: 5 }]);
    await setStatus(db, g, "approved");
    ok(
      "GUARD: no confirmed GRNI → POST rejected (GRNI_ACCOUNT_MISSING), no journal",
      (await throwsCode(() => postGrn(db, g), "GRNI_ACCOUNT_MISSING")) &&
        (await counts(client)).je === 0,
    );
    ok(
      "GUARD: service requires governed + ISSUED PO",
      /governanceMode !== GOVERNED/.test(svc) && /PO_NOT_ISSUED/.test(svc),
    );
  }

  // ===================== PART-A..D — partial receiving + over-receive =====================
  console.log("\nPART-A..D — partial receiving, derived qty, over-receive guard at POST");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 5 },
    ]);
    await receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 4 }]);
    ok(
      "PART-A: partial receipt of 4 recorded; received derived from POSTED GRNs",
      near((await receivedByPoLine(db, "PO1")).get("l1") || 0, 4),
    );
    await receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 6 }], { date: "2026-03-12" });
    ok(
      "PART-B: second receipt of 6 → derived received now 10 (fully)",
      near((await receivedByPoLine(db, "PO1")).get("l1") || 0, 10),
    );
    const lines = await receivablePoLines(db, "PO1");
    ok(
      "PART-C: receivable view shows remaining 0 after full receipt",
      near(lines[0].remainingQuantity, 0),
    );
    ok(
      "PART-D: over-receive rejected at POST (11 > 10 ordered)",
      await throwsCode(
        () => receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 1 }]),
        "OVER_RECEIVE",
      ),
    );
    const itemQty = (await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`))
      .rows[0].quantity;
    ok(
      "PART-D: inventory reflects exactly 10 received (no over-receive leaked)",
      near(Number(itemQty), 10),
    );
  }

  // ===================== REV-STOCK-A..F — safe reversal (never negative) =====================
  console.log("\nREV-STOCK-A..F — reversal can NEVER drive inventory negative");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
    ]);
    const grn = await receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 10 }]);
    await reverseGrnSafe(db, grn);
    ok(
      "REV-STOCK-A: full reversal with stock intact → GRNI GL nets 0",
      near((await acctBal(client, "a-grni")).net, 0),
    );
    ok(
      "REV-STOCK-A: inventory account nets 0 and quantity unwound to 0",
      near((await acctBal(client, "a-inv")).net, 0) &&
        near(
          Number(
            (await client.query(`SELECT quantity FROM inventory_items WHERE id='item1'`)).rows[0]
              .quantity,
          ),
          0,
        ),
    );
    ok(
      "REV-STOCK-A: governed GRNI subledger for the receipt nets to 0 (credit + debit mirror)",
      near(await receiptGrniNet(client, grn), 0),
    );
    ok(
      "REV-STOCK-A: reversed receipt no longer counts toward received qty",
      near((await receivedByPoLine(db, "PO1")).get("l1") || 0, 0),
    );

    // B: stock partially consumed → reversal REJECTED, nothing changes.
    const { db: db2, client: c2 } = await freshDb();
    await mkItem(c2, "item1", 0);
    await mkIssuedPO(c2, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
    ]);
    const grn2 = await receiveAndPost(db2, "PO1", [{ poLineId: "l1", qty: 10 }]);
    await c2.query(`UPDATE inventory_items SET quantity=3 WHERE id='item1'`); // 7 consumed
    const before2 = await counts(c2);
    ok(
      "REV-STOCK-B: consumed stock → reversal rejected GRN_STOCK_ALREADY_CONSUMED",
      await throwsCode(() => reverseGrnSafe(db2, grn2), "GRN_STOCK_ALREADY_CONSUMED"),
    );
    const after2 = await counts(c2);
    const st2 = (await c2.query(`SELECT status FROM goods_receipts WHERE id=$1`, [grn2])).rows[0]
      .status;
    ok(
      "REV-STOCK-B: rejection leaves NO reversal journal, NO new stock movement, NO status change",
      after2.je === before2.je && after2.mv === before2.mv && st2 === "posted",
    );
    ok(
      "REV-STOCK-B: GRNI GL still 200 (nothing reversed)",
      near((await acctBal(c2, "a-grni")).net, -200),
    );

    // C: all-or-nothing — two ITEM lines, only one consumed → whole reversal fails.
    const { db: db3, client: c3 } = await freshDb();
    await mkItem(c3, "itA", 0);
    await mkItem(c3, "itB", 0);
    await mkIssuedPO(c3, "PO1", "sup1", [
      { id: "lA", type: "ITEM", itemId: "itA", qty: 5, price: 10 },
      { id: "lB", type: "ITEM", itemId: "itB", qty: 5, price: 10 },
    ]);
    const grn3 = await receiveAndPost(db3, "PO1", [
      { poLineId: "lA", qty: 5 },
      { poLineId: "lB", qty: 5 },
    ]);
    await c3.query(`UPDATE inventory_items SET quantity=1 WHERE id='itB'`); // itB consumed, itA intact
    ok(
      "REV-STOCK-C: one-of-two consumed → whole reversal rejected (all-or-nothing)",
      await throwsCode(() => reverseGrnSafe(db3, grn3), "GRN_STOCK_ALREADY_CONSUMED"),
    );
    ok(
      "REV-STOCK-C: intact item itA was NOT decremented (still 5) — nothing partially reversed",
      near(
        Number(
          (await c3.query(`SELECT quantity FROM inventory_items WHERE id='itA'`)).rows[0].quantity,
        ),
        5,
      ),
    );

    // D: second reverse blocked.
    ok(
      "REV-STOCK-D: reversing an already-reversed receipt is blocked (STATE_CONFLICT)",
      await throwsCode(() => reverseGrnSafe(db, grn), "STATE_CONFLICT"),
    );

    // E/F: source guarantees — stock check BEFORE reverseEntry.
    const idxConsumed = svc.indexOf("GRN_STOCK_ALREADY_CONSUMED");
    const idxReverse = svc.indexOf("reverseEntry(tx, locked.journalEntryId");
    ok(
      "REV-STOCK-E: service throws GRN_STOCK_ALREADY_CONSUMED BEFORE calling reverseEntry()",
      idxConsumed > 0 && idxReverse > 0 && idxConsumed < idxReverse,
    );
    ok(
      "REV-STOCK-F: reversal locks the GRN + inventory rows (FOR UPDATE) and links the GRNI DEBIT mirror",
      /\.for\("update"\)/.test(svc) &&
        /linkType: "reversal"/.test(svc) &&
        /receiptGrniLink\(/.test(svc),
    );
  }

  // ===================== GRNI-LINK-A..G — GRNI subledger integrity =====================
  console.log("\nGRNI-LINK-A..G — GRNI subledger links + reconciliation");
  {
    const { db, client } = await freshDb();
    await mkItem(client, "item1", 0);
    await mkIssuedPO(client, "PO1", "sup1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 10, price: 20 },
    ]);
    const grn = await receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 10 }]);
    ok(
      "GRNI-LINK-A: POST links exactly one GRNI credit line to the receipt",
      (await counts(client)).gnl === 1,
    );

    // B: linking a non-GRNI line rejected.
    const invLine = (
      await client.query(`SELECT jl.id FROM journal_lines jl WHERE jl.account_id='a-inv' LIMIT 1`)
    ).rows[0].id;
    ok(
      "GRNI-LINK-B: linking a non-GRNI (inventory) line → NOT_GRNI_LINE",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            createGrniLink(tx, {
              goodsReceiptId: grn,
              journalLineId: invLine,
              linkType: "receipt",
            }),
          ),
        "NOT_GRNI_LINE",
      ),
    );
    // C: double-link rejected.
    const grniLine = (
      await client.query(
        `SELECT jl.id FROM journal_lines jl WHERE jl.account_id='a-grni' AND jl.credit>0 LIMIT 1`,
      )
    ).rows[0].id;
    ok(
      "GRNI-LINK-C: re-linking an already-linked GRNI line → LINE_ALREADY_LINKED",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            createGrniLink(tx, {
              goodsReceiptId: grn,
              journalLineId: grniLine,
              linkType: "receipt",
            }),
          ),
        "LINE_ALREADY_LINKED",
      ),
    );
    // D: linking a GRNI line whose entry is unrelated → LINK_ENTRY_MISMATCH.
    const manual = await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-03-01",
        description: "manual grni",
        source: "manual",
        sourceType: "manual",
        sourceId: "MAN1",
        lines: [
          { accountId: "a-exp", debit: 50 },
          { accountId: "a-grni", credit: 50 },
        ],
        userId: "u1",
        status: "posted",
      }),
    );
    const manualGrniLine = (
      await client.query(
        `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-grni'`,
        [manual],
      )
    ).rows[0].id;
    ok(
      "GRNI-LINK-D: linking an unrelated (manual) GRNI line to the receipt → LINK_ENTRY_MISMATCH",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            createGrniLink(tx, {
              goodsReceiptId: grn,
              journalLineId: manualGrniLine,
              linkType: "receipt",
            }),
          ),
        "LINK_ENTRY_MISMATCH",
      ),
    );
    // E: reconciliation — GL = linked + unallocated, difference 0.
    const rec = await grniReconciliation(db);
    ok(
      "GRNI-LINK-E: reconciliation difference is 0 (GRNI GL = subledger + unallocated)",
      near(rec.difference, 0) && near(rec.grniGl, 250) && near(rec.subledgerTotal, 200),
    );
    // F: the manual GRNI line is UNALLOCATED.
    const un = await unallocatedGrniLines(db);
    ok(
      "GRNI-LINK-F: the manual GRNI line stays unallocated (visible in drill-down)",
      un.length === 1 && near(rec.unallocated.net, 50),
    );
    // G: after reversal, the governed subledger for the receipt nets to 0.
    await reverseGrnSafe(db, grn);
    ok(
      "GRNI-LINK-G: after reversal the receipt's GRNI links (credit + debit mirror) net to 0",
      near(await receiptGrniNet(client, grn), 0) && (await counts(client)).gnl === 2,
    );
    const rec2 = await grniReconciliation(db);
    ok(
      "GRNI-LINK-G: reconciliation still balances after reversal (difference 0)",
      near(rec2.difference, 0),
    );
    ok(
      "GRNI-LINK: subledger module stores NO amount column (money only in journal_lines)",
      !/amount/i.test(linkSvc.split("createGrniLink")[0]) || !/amount:/.test(linkSvc),
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
    // A draft receipt does NOT count as a posted receipt.
    await draftGrn(db, "PO1", [{ poLineId: "l1", qty: 2 }]);
    ok(
      "POC-A: a DRAFT receipt does not block PO cancel (hasPostedGoodsReceipt still false)",
      (await hasPostedGoodsReceipt(db, "PO1")) === false,
    );
    await receiveAndPost(db, "PO1", [{ poLineId: "l1", qty: 3 }]);
    ok(
      "POC-B: after posted GRN → hasPostedGoodsReceipt true (PO cancel would be blocked)",
      (await hasPostedGoodsReceipt(db, "PO1")) === true,
    );
    ok(
      "POC-B: PO transition service enforces PO_HAS_RECEIPTS on cancel",
      /hasPostedGoodsReceipt\(/.test(poSvc) && /PO_HAS_RECEIPTS/.test(poSvc),
    );
  }

  // ===================== PERM-A..G — permission separation =====================
  console.log("\nPERM-A..G — GRN governance permission separation");
  {
    ok(
      "PERM-A: create gated (route checks grnCreate); view does not grant create",
      /grnCreate\)/.test(route) && !grants([PP.grnView], PP.grnCreate),
    );
    ok(
      "PERM-B: view grants neither submit nor approve nor post nor reverse",
      !grants([PP.grnView], PP.grnSubmit) &&
        !grants([PP.grnView], PP.grnApprove) &&
        !grants([PP.grnView], PP.grnPost) &&
        !grants([PP.grnView], PP.grnReverse),
    );
    ok(
      "PERM-C: submit ≠ approve ≠ post (none implies another)",
      !grants([PP.grnSubmit], PP.grnApprove) &&
        !grants([PP.grnApprove], PP.grnPost) &&
        !grants([PP.grnCreate], PP.grnReverse),
    );
    ok(
      "PERM-D: GRN permissions do not grant PO mutation (approve/issue/cancel)",
      !grants([PP.grnPost, PP.grnReverse], PP.poApprove) &&
        !grants([PP.grnPost], PP.poIssue) &&
        !grants([PP.grnPost], PP.poCancel),
    );
    ok(
      "PERM-E: GRN permissions do not grant Supplier Invoice posting or supplier mutation",
      !grants([PP.grnPost, PP.grnReverse], (FP as any).supplierInvoicePost) &&
        !grants([PP.grnPost], (FP as any).supplierUpdate),
    );
    ok(
      "PERM-F: GRNI mapping change requires finance.account_mapping.update (high-authority)",
      !grants([PP.grnPost], (FP as any).accountMappingUpdate),
    );
    ok(
      "PERM-G: transitions carry the granular grn permissions",
      GRN_TRANSITIONS.find((t) => t.action === "submit")?.permission === PP.grnSubmit &&
        GRN_TRANSITIONS.find((t) => t.action === "approve")?.permission === PP.grnApprove &&
        GRN_TRANSITIONS.find((t) => t.action === "post")?.permission === PP.grnPost &&
        GRN_TRANSITIONS.find((t) => t.action === "reverse")?.permission === PP.grnReverse,
    );
  }

  // ===================== MIG-A..D — migration/seed create NO GRNI account, no hardcoded code =====================
  console.log("\nMIG-A..D — no GRNI account auto-created; no hardcoded code in posting");
  {
    ok(
      "MIG-A: forward migration 0027 creates grni_journal_links and NO account (no INSERT INTO accounts)",
      /CREATE TABLE IF NOT EXISTS "grni_journal_links"/.test(mig27) &&
        !/INSERT INTO "accounts"/.test(mig27) &&
        !/'210105'/.test(mig27),
    );
    ok(
      "MIG-A: 0027 adds GRN governance actor columns + draft default, no journal-history rewrite",
      /ADD COLUMN IF NOT EXISTS "posted_by"/.test(mig27) &&
        /SET DEFAULT 'draft'/.test(mig27) &&
        !/UPDATE journal_/.test(mig27),
    );
    ok(
      "MIG-B: seed no longer auto-creates a GRNI account (no 210105 row)",
      !/"210105"/.test(seed) && !/210105/.test(seed),
    );
    ok(
      "MIG-C: posting/service code contains NO hardcoded GRNI account code (210105) and never searches by it",
      !/210105/.test(svc) && !/210105/.test(linkSvc) && !/code.*210105|210105.*code/.test(svc),
    );
    // 0026 is historical (potentially applied) and is NOT rewritten; its 210105 row
    // is a plain UNMAPPED liability candidate (no system_key) — never authoritative.
    ok(
      "MIG-D: 0026 remains additive/unchanged and its 210105 candidate carries NO system_key ('grni' never set in a migration)",
      /CREATE TABLE IF NOT EXISTS "goods_receipts"/.test(mig26) &&
        !/'grni'/.test(mig26) &&
        !/'grni'/.test(mig27),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
