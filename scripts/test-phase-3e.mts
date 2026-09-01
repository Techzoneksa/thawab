/**
 * Phase 3E — Supplier Invoice ↔ GRN matching & GRNI clearing tests.
 *
 * Exercises the REAL parameterized building blocks against PGlite:
 *  - validateInvoice (direct + grn_matched resolution, exact-match, over-invoice,
 *    supplier + posted-GRN guards, historical GRNI resolution) — supplier-invoice.ts
 *  - matchedQtyByGrnLine / grnHasActivePostedInvoice — invoice-matching.ts
 *  - createGrniLink (invoice / invoice_reversal) + receiptGrniLink + grniReconciliation
 *  - postBalancedEntry / reverseEntry / existingSourceEntryId — gl.ts
 *  - getSupplierBalance / linkEntryApLine / apReconciliation — supplier.ts
 * The invoice POST / REVERSE journal construction + linking is mirrored in the
 * SAME order the service uses, and the service's guarantees are additionally
 * locked down by source assertions (DUP / GRN-guard).
 *
 * Suites: MATCH-A..H, ACC-MATCH-A..G, HIST-A, PRICE-A..B, RACE-MATCH-A..C,
 * REV-MATCH-A..E, IDEM-MATCH-A..C, DUP-A..D.
 * Run: node_modules/.bin/tsx scripts/test-phase-3e.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assignGrniAccount, assignInputVatAccount } from "@/server/db/account-mapping";
import { validateInvoice } from "@/server/db/supplier-invoice";
import {
  matchedQtyByGrnLine,
  grnHasActivePostedInvoice,
  matchableGrnLinesForSupplier,
  receiptMatchSummary,
} from "@/server/db/invoice-matching";
import {
  createGrniLink,
  linkEntryGrniLine,
  receiptGrniLink,
  grniReconciliation,
} from "@/server/db/grni-link";
import { getSupplierBalance, linkEntryApLine, apReconciliation } from "@/server/db/supplier";
import {
  postBalancedEntry,
  reverseEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "@/server/db/gl";
import {
  resolveConfirmedGrniAccount,
  resolveConfirmedInputVatAccount,
} from "@/server/db/account-mapping";
import { nextCode } from "@/server/db/numbering";
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
async function throwsCode(fn: () => Promise<any>, code: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return e?.code === code || String(e?.message).includes(code);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

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
CREATE UNIQUE INDEX je_gr_src_idx ON journal_entries (source_id) WHERE source_type = 'goods_receipt';
CREATE UNIQUE INDEX je_si_src_idx ON journal_entries (source_id) WHERE source_type = 'supplier_invoice';
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
  postal_code text DEFAULT '', additional_no text DEFAULT '',
  rating double precision NOT NULL DEFAULT 0, balance double precision NOT NULL DEFAULT 0, notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active', supplier_code text, legal_name text DEFAULT '', commercial_registration text,
  currency text NOT NULL DEFAULT 'SAR', payment_terms_days integer, bank_name text, iban text, iban_normalized text,
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE supplier_journal_links (id text PRIMARY KEY, supplier_id text NOT NULL,
  journal_line_id text NOT NULL, source_type text, created_by text, created_at text NOT NULL DEFAULT '',
  CONSTRAINT supplier_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
CREATE TABLE purchase_returns (id text PRIMARY KEY, return_number text NOT NULL, goods_receipt_id text NOT NULL, purchase_order_id text, supplier_id text, return_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', currency text NOT NULL DEFAULT 'SAR', total_value double precision NOT NULL DEFAULT 0, reason text DEFAULT '', journal_entry_id text, reversal_journal_entry_id text, created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '', submitted_by text, submitted_at text, approved_by text, approved_at text, posted_by text, posted_at text, reversed_by text, reversed_at text, reversal_reason text);
CREATE TABLE purchase_return_lines (id text PRIMARY KEY, purchase_return_id text NOT NULL, goods_receipt_line_id text NOT NULL, line_number integer NOT NULL DEFAULT 1, line_type text NOT NULL DEFAULT 'ITEM', description text DEFAULT '', item_id text, account_id text, quantity_returned double precision NOT NULL DEFAULT 0, line_value double precision NOT NULL DEFAULT 0, cost_center_id text, stock_movement_id text, created_at text NOT NULL DEFAULT '');
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
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '', submitted_by text, submitted_at text,
  approved_by text, approved_at text, posted_by text, posted_at text, reversed_by text,
  reversed_at text, reversal_reason text);
CREATE TABLE goods_receipt_lines (id text PRIMARY KEY, goods_receipt_id text NOT NULL, po_line_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, line_type text NOT NULL DEFAULT 'ITEM', description text DEFAULT '',
  item_id text, account_id text, quantity_received double precision NOT NULL DEFAULT 0,
  unit_price double precision NOT NULL DEFAULT 0, line_value double precision NOT NULL DEFAULT 0,
  cost_center_id text, stock_movement_id text, created_at text NOT NULL DEFAULT '');
CREATE TABLE grni_journal_links (id text PRIMARY KEY, goods_receipt_id text NOT NULL, goods_receipt_line_id text,
  journal_line_id text NOT NULL, link_type text NOT NULL DEFAULT 'receipt', created_by text,
  created_at text NOT NULL DEFAULT '', CONSTRAINT grni_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
CREATE TABLE supplier_invoices (id text PRIMARY KEY, invoice_number text NOT NULL UNIQUE,
  supplier_invoice_number text DEFAULT '', supplier_invoice_number_normalized text DEFAULT '',
  supplier_id text NOT NULL, invoice_date text NOT NULL DEFAULT '', due_date text, status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'SAR', subtotal double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, total_amount double precision NOT NULL DEFAULT 0,
  external_reference text, description text DEFAULT '', notes text DEFAULT '', journal_entry_id text,
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '',
  submitted_by text, submitted_at text, approved_by text, approved_at text, posted_by text, posted_at text,
  reversed_by text, reversed_at text);
CREATE TABLE supplier_invoice_lines (id text PRIMARY KEY, supplier_invoice_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, description text DEFAULT '', accounting_mode text NOT NULL DEFAULT 'direct',
  account_id text NOT NULL, quantity double precision NOT NULL DEFAULT 1, unit_price double precision NOT NULL DEFAULT 0,
  line_subtotal double precision NOT NULL DEFAULT 0, tax_rate double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, line_total double precision NOT NULL DEFAULT 0,
  cost_center_id text, created_at text NOT NULL DEFAULT '');
CREATE TABLE supplier_invoice_grn_allocations (id text PRIMARY KEY, supplier_invoice_id text NOT NULL,
  supplier_invoice_line_id text NOT NULL, goods_receipt_id text NOT NULL, goods_receipt_line_id text NOT NULL,
  purchase_order_id text, purchase_order_line_id text, matched_quantity double precision NOT NULL DEFAULT 0,
  created_by text, created_at text NOT NULL DEFAULT '');
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-ap", "210101", "AP", "liability", "accounts_payable"],
    ["a-grni", "210105", "GRNI", "liability", "grni"],
    ["a-grni2", "210106", "GRNI-2", "liability", null],
    ["a-exp", "5301", "Expense", "expense", null],
    ["a-freight", "5302", "Freight", "expense", null],
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
  await db.transaction((tx: any) => assignGrniAccount(tx, { accountId: "a-grni", userId: "u1" }));
  await db.transaction((tx: any) =>
    assignInputVatAccount(tx, { accountId: "a-vat", userId: "u1" }),
  );
  return { db, client };
}
async function mkSupplier(client: any, id: string) {
  await client.exec(
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('${id}','${id}','active','SAR','${now()}','${now()}')`,
  );
}
async function mkItem(client: any, id: string, qty = 0) {
  await client.exec(
    `INSERT INTO inventory_items (id,name,unit,quantity,status) VALUES ('${id}','${id}','قطعة',${qty},'active')`,
  );
}

/**
 * Post a governed GRN (Dr targets / Cr today's confirmed GRNI + inventory) and link
 * the receipt GRNI credit. Returns { grnId, grnLineByPoLine } — a map po line id →
 * grn line id. Mirrors the certified Phase 3D POST + GRNI receipt link.
 */
async function postGrn(
  db: any,
  client: any,
  supplierId: string,
  poId: string,
  lines: {
    id: string;
    type: string;
    itemId?: string;
    accountId?: string;
    qty: number;
    price: number;
  }[],
) {
  await client.exec(
    `INSERT INTO purchase_orders (id,governance_mode,po_number,supplier_id,subject,date,status,currency,created_at,updated_at) VALUES ('${poId}','governed','PO-${poId}','${supplierId}','po','2026-03-01','issued','SAR','${now()}','${now()}')`,
  );
  let n = 0;
  for (const l of lines)
    await client.exec(
      `INSERT INTO purchase_order_lines (id,order_id,line_number,item_id,description,quantity,unit_price,line_type,account_id,created_at) VALUES ('${l.id}','${poId}',${++n},${l.itemId ? `'${l.itemId}'` : "NULL"},'${l.id}',${l.qty},${l.price},'${l.type}',${l.accountId ? `'${l.accountId}'` : "NULL"},'${now()}')`,
    );
  const grnId = genId("GRN");
  const grnLineByPoLine = new Map<string, string>();
  const ts = now();
  await db.transaction(async (tx: any) => {
    const grniId = await resolveConfirmedGrniAccount(tx);
    const inventoryId = await resolveSystemAccountId(tx, SYS.INVENTORY);
    const jLines: any[] = [];
    const grnLines: any[] = [];
    let total = 0;
    let ln = 0;
    for (const l of lines) {
      const value = r2(l.qty * l.price);
      total = r2(total + value);
      let debit = l.accountId!;
      let mvId: string | null = null;
      if (l.type === "ITEM") {
        debit = inventoryId;
        const item = (await tx.execute(sql`SELECT * FROM inventory_items WHERE id=${l.itemId}`))
          .rows[0];
        const nq = Number(item.quantity) + l.qty;
        await tx.execute(sql`UPDATE inventory_items SET quantity=${nq} WHERE id=${l.itemId}`);
        mvId = genId("MV");
        await tx.execute(
          sql`INSERT INTO stock_movements (id,item_id,type,quantity,balance_after,source_type,source_id,date,created_at) VALUES (${mvId},${l.itemId},'in',${l.qty},${nq},'goods_receipt',${grnId},'2026-03-10',${ts})`,
        );
      }
      jLines.push({ accountId: debit, debit: value });
      grnLines.push({
        poLineId: l.id,
        type: l.type,
        itemId: l.itemId ?? null,
        qty: l.qty,
        price: l.price,
        value,
        debit,
        mvId,
      });
    }
    jLines.push({ accountId: grniId, credit: total });
    const entryId = await postBalancedEntry(tx, {
      date: "2026-03-10",
      description: "grn",
      source: "goods_receipt",
      sourceType: "goods_receipt",
      sourceId: grnId,
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
      sql`INSERT INTO goods_receipts (id,grn_number,purchase_order_id,supplier_id,receipt_date,status,currency,total_value,journal_entry_id,created_at,updated_at) VALUES (${grnId},${num},${poId},${supplierId},'2026-03-10','posted','SAR',${total},${entryId},${ts},${ts})`,
    );
    let li = 0;
    for (const g of grnLines) {
      const glId = genId("GRL");
      grnLineByPoLine.set(g.poLineId, glId);
      await tx.execute(
        sql`INSERT INTO goods_receipt_lines (id,goods_receipt_id,po_line_id,line_number,line_type,item_id,account_id,quantity_received,unit_price,line_value,stock_movement_id,created_at) VALUES (${glId},${grnId},${g.poLineId},${++li},${g.type},${g.itemId},${g.debit},${g.qty},${g.price},${g.value},${g.mvId},${ts})`,
      );
    }
    await linkEntryGrniLine(tx, {
      goodsReceiptId: grnId,
      entryId,
      accountId: grniId,
      linkType: "receipt",
      userId: "u1",
    });
  });
  return { grnId, grnLineByPoLine };
}

let sinvSeq = 0;
/** Draft an invoice via the REAL validateInvoice, persisting lines + allocations. */
async function draftInvoice(
  db: any,
  input: { supplierId: string; lines: any[]; invoiceDate?: string },
): Promise<string> {
  const computed = await validateInvoice(db, {
    supplierId: input.supplierId,
    supplierInvoiceNumber: `DOC-${++sinvSeq}`,
    invoiceDate: input.invoiceDate ?? "2026-03-15",
    lines: input.lines,
  });
  const id = genId("SINV");
  const ts = now();
  await db.transaction(async (tx: any) => {
    const num = await nextCode(tx, {
      table: "supplier_invoices",
      column: "invoice_number",
      prefix: "SI-",
      year: true,
    });
    await tx.execute(
      sql`INSERT INTO supplier_invoices (id,invoice_number,supplier_invoice_number,supplier_invoice_number_normalized,supplier_id,invoice_date,status,currency,subtotal,tax_amount,total_amount,created_by,created_at,updated_at) VALUES (${id},${num},${"DOC-" + sinvSeq},${"DOC-" + sinvSeq},${input.supplierId},'2026-03-15','draft','SAR',${computed.subtotal},${computed.taxAmount},${computed.totalAmount},'u1',${ts},${ts})`,
    );
    let n = 0;
    for (const l of computed.lines) {
      const lineId = genId("SIL");
      await tx.execute(
        sql`INSERT INTO supplier_invoice_lines (id,supplier_invoice_id,line_number,description,accounting_mode,account_id,quantity,unit_price,line_subtotal,tax_rate,tax_amount,line_total,created_at) VALUES (${lineId},${id},${++n},${l.description},${l.accountingMode},${l.accountId},${l.quantity},${l.unitPrice},${l.lineSubtotal},${l.taxRate},${l.taxAmount},${l.lineTotal},${ts})`,
      );
      if (l.allocation)
        await tx.execute(
          sql`INSERT INTO supplier_invoice_grn_allocations (id,supplier_invoice_id,supplier_invoice_line_id,goods_receipt_id,goods_receipt_line_id,purchase_order_id,purchase_order_line_id,matched_quantity,created_by,created_at) VALUES (${genId("SIGA")},${id},${lineId},${l.allocation.goodsReceiptId},${l.allocation.goodsReceiptLineId},${l.allocation.purchaseOrderId},${l.allocation.purchaseOrderLineId},${l.allocation.matchedQuantity},'u1',${ts})`,
        );
    }
  });
  return id;
}
async function toInput(tx: any, id: string) {
  const inv = (await tx.execute(sql`SELECT * FROM supplier_invoices WHERE id=${id}`)).rows[0];
  const lines = (
    await tx.execute(
      sql`SELECT * FROM supplier_invoice_lines WHERE supplier_invoice_id=${id} ORDER BY line_number`,
    )
  ).rows;
  const allocs = (
    await tx.execute(
      sql`SELECT * FROM supplier_invoice_grn_allocations WHERE supplier_invoice_id=${id}`,
    )
  ).rows;
  const allocByLine = new Map<string, any>();
  for (const a of allocs) allocByLine.set(a.supplier_invoice_line_id, a);
  return {
    inv,
    lines,
    input: {
      supplierId: inv.supplier_id,
      supplierInvoiceNumber: inv.supplier_invoice_number,
      invoiceDate: inv.invoice_date,
      lines: lines.map((l: any) => {
        const matched = l.accounting_mode === "grn_matched";
        const a = allocByLine.get(l.id);
        return {
          accountingMode: matched ? "grn_matched" : "direct",
          accountId: matched ? undefined : l.account_id,
          goodsReceiptLineId: matched ? a?.goods_receipt_line_id : undefined,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          taxRate: Number(l.tax_rate),
        };
      }),
    },
    allocByLine,
  };
}
/** Mirror of the certified Supplier Invoice POST (matched-aware). */
async function postInvoice(db: any, id: string) {
  await db.transaction(async (tx: any) => {
    if (await existingSourceEntryId(tx, "supplier_invoice", id))
      throw Object.assign(new Error("ALREADY_POSTED"), { code: "ALREADY_POSTED" });
    const { inv, lines, input, allocByLine } = await toInput(tx, id);
    const computed = await validateInvoice(tx, input as any, { invoiceId: id });
    const apId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_PAYABLE);
    const jLines: any[] = computed.lines.map((l: any) => ({
      accountId: l.accountId,
      debit: l.lineSubtotal,
    }));
    if (computed.taxAmount > 0.005) {
      const vatId = await resolveConfirmedInputVatAccount(tx);
      jLines.push({ accountId: vatId, debit: computed.taxAmount });
    }
    jLines.push({ accountId: apId, credit: computed.totalAmount });
    const entryId = await postBalancedEntry(tx, {
      date: inv.invoice_date,
      description: "si",
      source: "supplier_invoice",
      sourceType: "supplier_invoice",
      sourceId: id,
      lines: jLines,
      userId: "u1",
      status: "posted",
    });
    await linkEntryApLine(tx, {
      supplierId: inv.supplier_id,
      entryId,
      sourceType: "supplier_invoice",
      userId: "u1",
    });
    const posted = (
      await tx.execute(
        sql`SELECT * FROM journal_lines WHERE journal_entry_id=${entryId} ORDER BY line_number`,
      )
    ).rows;
    for (let i = 0; i < computed.lines.length; i++) {
      if (computed.lines[i].accountingMode !== "grn_matched") continue;
      const a = allocByLine.get(lines[i].id);
      await createGrniLink(tx, {
        goodsReceiptId: a.goods_receipt_id,
        goodsReceiptLineId: a.goods_receipt_line_id,
        journalLineId: posted[i].id,
        linkType: "invoice",
        expectedAccountId: computed.lines[i].accountId,
        userId: "u1",
      });
    }
    await tx.execute(
      sql`UPDATE supplier_invoices SET status='posted', journal_entry_id=${entryId} WHERE id=${id}`,
    );
  });
}
/** Mirror of the certified Supplier Invoice REVERSE (matched-aware). */
async function reverseInvoice(db: any, id: string) {
  await db.transaction(async (tx: any) => {
    const inv = (await tx.execute(sql`SELECT * FROM supplier_invoices WHERE id=${id}`)).rows[0];
    const reversalId = await reverseEntry(tx, inv.journal_entry_id, "u1");
    await linkEntryApLine(tx, {
      supplierId: inv.supplier_id,
      entryId: reversalId,
      sourceType: "supplier_invoice_reversal",
      userId: "u1",
    });
    const origLinks = (
      await tx.execute(
        sql`SELECT g.goods_receipt_id, g.goods_receipt_line_id, jl.account_id, jl.line_number FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE jl.journal_entry_id=${inv.journal_entry_id} AND g.link_type='invoice'`,
      )
    ).rows;
    const revLines = (
      await tx.execute(
        sql`SELECT * FROM journal_lines WHERE journal_entry_id=${reversalId} ORDER BY line_number`,
      )
    ).rows;
    const byNum = new Map<number, any>();
    for (const rl of revLines) byNum.set(Number(rl.line_number), rl);
    for (const link of origLinks) {
      const mirror = byNum.get(Number(link.line_number));
      await createGrniLink(tx, {
        goodsReceiptId: link.goods_receipt_id,
        goodsReceiptLineId: link.goods_receipt_line_id,
        journalLineId: mirror.id,
        linkType: "invoice_reversal",
        expectedAccountId: link.account_id,
        expectedReversedOf: inv.journal_entry_id,
        userId: "u1",
      });
    }
    await tx.execute(sql`UPDATE supplier_invoices SET status='reversed' WHERE id=${id}`);
  });
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
async function receiptGrniNet(client: any, grnId: string) {
  const r = (
    await client.query(
      `SELECT COALESCE(SUM(jl.credit),0) c, COALESCE(SUM(jl.debit),0) d FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE g.goods_receipt_id=$1`,
      [grnId],
    )
  ).rows[0];
  return Number(r.c) - Number(r.d);
}
async function stockMoves(client: any) {
  return Number((await client.query(`SELECT count(*)::int n FROM stock_movements`)).rows[0].n);
}

const invSvc = readFileSync(resolve(process.cwd(), "src/server/db/supplier-invoice.ts"), "utf8");
const grnSvc = readFileSync(resolve(process.cwd(), "src/server/db/goods-receipt.ts"), "utf8");

async function main() {
  // ===================== MATCH-A..H — matching cardinality & guards =====================
  console.log("\nMATCH-A..H — matching cardinality, supplier & posted-GRN guards");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkSupplier(client, "sup2");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;

    // A: full match 100×10.
    const invA = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 100, unitPrice: 10 },
      ],
    });
    await postInvoice(db, invA);
    ok(
      "MATCH-A: full match 100×10 posts; remaining invoiceable = 0",
      near((await matchedQtyByGrnLine(db, [gl])).get(gl) || 0, 100),
    );

    // Fresh GRN for the partial-sequence sub-tests.
    const { grnLineByPoLine: m2 } = await postGrn(db, client, "sup1", "PO2", [
      { id: "l2", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl2 = m2.get("l2")!;
    const invB = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl2, quantity: 40, unitPrice: 10 },
      ],
    });
    await postInvoice(db, invB);
    ok(
      "MATCH-B: partial 40 → matched 40, remaining 60",
      near((await matchedQtyByGrnLine(db, [gl2])).get(gl2) || 0, 40),
    );
    const invC = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl2, quantity: 60, unitPrice: 10 },
      ],
    });
    await postInvoice(db, invC);
    ok(
      "MATCH-C: second invoice 60 → total matched 100, remaining 0",
      near((await matchedQtyByGrnLine(db, [gl2])).get(gl2) || 0, 100),
    );

    // D: over-invoice 1 more → reject.
    ok(
      "MATCH-D: matching 1 more beyond received → OVER_INVOICED_RECEIPT",
      await throwsCode(
        () =>
          draftInvoice(db, {
            supplierId: "sup1",
            lines: [
              {
                accountingMode: "grn_matched",
                goodsReceiptLineId: gl2,
                quantity: 1,
                unitPrice: 10,
              },
            ],
          }),
        "OVER_INVOICED_RECEIPT",
      ),
    );

    // E: different supplier → reject.
    ok(
      "MATCH-E: matching a GRN of another supplier → SUPPLIER_MISMATCH",
      await throwsCode(
        () =>
          draftInvoice(db, {
            supplierId: "sup2",
            lines: [
              {
                accountingMode: "grn_matched",
                goodsReceiptLineId: grnLineByPoLine.get("l1")!,
                quantity: 1,
                unitPrice: 10,
              },
            ],
          }),
        "SUPPLIER_MISMATCH",
      ),
    );

    // F: GRN not posted (draft) → reject. Build a draft GRN line directly.
    await client.exec(
      `INSERT INTO purchase_orders (id,governance_mode,po_number,supplier_id,subject,date,status,currency,created_at,updated_at) VALUES ('POD','governed','PO-POD','sup1','po','2026-03-01','issued','SAR','${now()}','${now()}')`,
    );
    await client.exec(
      `INSERT INTO purchase_order_lines (id,order_id,line_number,item_id,description,quantity,unit_price,line_type,created_at) VALUES ('ld','POD',1,'item1','ld',5,10,'ITEM','${now()}')`,
    );
    await client.exec(
      `INSERT INTO goods_receipts (id,grn_number,purchase_order_id,supplier_id,receipt_date,status,currency,total_value,created_at,updated_at) VALUES ('GRND','GRN-D','POD','sup1','2026-03-10','draft','SAR',50,'${now()}','${now()}')`,
    );
    await client.exec(
      `INSERT INTO goods_receipt_lines (id,goods_receipt_id,po_line_id,line_number,line_type,item_id,quantity_received,unit_price,line_value,created_at) VALUES ('gld','GRND','ld',1,'ITEM','item1',5,10,50,'${now()}')`,
    );
    ok(
      "MATCH-F: matching a DRAFT GRN → GRN_NOT_POSTED",
      await throwsCode(
        () =>
          draftInvoice(db, {
            supplierId: "sup1",
            lines: [
              {
                accountingMode: "grn_matched",
                goodsReceiptLineId: "gld",
                quantity: 5,
                unitPrice: 10,
              },
            ],
          }),
        "GRN_NOT_POSTED",
      ),
    );

    // G: reversed GRN → reject.
    await client.exec(`UPDATE goods_receipts SET status='reversed' WHERE id='GRND'`);
    ok(
      "MATCH-G: matching a REVERSED GRN → GRN_REVERSED",
      await throwsCode(
        () =>
          draftInvoice(db, {
            supplierId: "sup1",
            lines: [
              {
                accountingMode: "grn_matched",
                goodsReceiptLineId: "gld",
                quantity: 5,
                unitPrice: 10,
              },
            ],
          }),
        "GRN_REVERSED",
      ),
    );

    // H: one invoice matches two GRNs.
    const { grnLineByPoLine: mA } = await postGrn(db, client, "sup1", "POA", [
      { id: "la", type: "ITEM", itemId: "item1", qty: 40, price: 10 },
    ]);
    const { grnLineByPoLine: mB } = await postGrn(db, client, "sup1", "POB", [
      { id: "lb", type: "ITEM", itemId: "item1", qty: 60, price: 10 },
    ]);
    const invH = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: mA.get("la")!,
          quantity: 40,
          unitPrice: 10,
        },
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: mB.get("lb")!,
          quantity: 60,
          unitPrice: 10,
        },
      ],
    });
    await postInvoice(db, invH);
    ok(
      "MATCH-H: one invoice matches two GRNs (40 + 60) → both fully matched",
      near((await matchedQtyByGrnLine(db, [mA.get("la")!])).get(mA.get("la")!) || 0, 40) &&
        near((await matchedQtyByGrnLine(db, [mB.get("lb")!])).get(mB.get("lb")!) || 0, 60),
    );
  }

  // ===================== ACC-MATCH-A..G — matched invoice accounting =====================
  console.log("\nACC-MATCH-A..G — matched invoice clears GRNI, never re-debits receipt");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    const invGl0 = (await acctBal(client, "a-inv")).net;
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: gl,
          quantity: 100,
          unitPrice: 10,
          taxRate: 15,
        },
      ],
    });
    await postInvoice(db, inv);
    const jid = (
      await client.query(`SELECT journal_entry_id j FROM supplier_invoices WHERE id=$1`, [inv])
    ).rows[0].j;
    const rows = (
      await client.query(
        `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id=$1 ORDER BY line_number`,
        [jid],
      )
    ).rows;
    const grniDr = rows.find((r: any) => r.account_id === "a-grni" && Number(r.debit) > 0);
    const vatDr = rows.find((r: any) => r.account_id === "a-vat" && Number(r.debit) > 0);
    const apCr = rows.find((r: any) => r.account_id === "a-ap" && Number(r.credit) > 0);
    ok(
      "ACC-MATCH-A: matched invoice journal = Dr GRNI 1000 / Dr VAT 150 / Cr AP 1150",
      !!grniDr &&
        near(Number(grniDr.debit), 1000) &&
        !!vatDr &&
        near(Number(vatDr.debit), 150) &&
        !!apCr &&
        near(Number(apCr.credit), 1150),
    );
    ok(
      "ACC-MATCH-A: NO second inventory debit from the invoice (a-inv net unchanged at 1000)",
      near((await acctBal(client, "a-inv")).net, invGl0) && near(invGl0, 1000),
    );
    ok(
      "ACC-MATCH-B: supplier payable increased by gross 1150",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 1150),
    );
    ok(
      "ACC-MATCH-C: GRNI for the matched receipt nets to 0",
      near(await receiptGrniNet(client, grnId), 0) &&
        near((await acctBal(client, "a-grni")).net, 0),
    );
    const ap = await apReconciliation(db);
    ok(
      "ACC-MATCH-D: AP reconciliation difference 0 (subledger = GL)",
      near(ap.difference, 0) && near(ap.subledgerTotal, 1150),
    );
    const grec = await grniReconciliation(db);
    ok(
      "ACC-MATCH-E: GRNI reconciliation difference 0 (GL 0 = subledger + unallocated)",
      near(grec.difference, 0) && near(grec.grniGl, 0),
    );

    // F: DIRECT line keeps Phase 3B behavior.
    const invD = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [{ accountingMode: "direct", accountId: "a-exp", quantity: 1, unitPrice: 200 }],
    });
    await postInvoice(db, invD);
    ok(
      "ACC-MATCH-F: DIRECT line debits the chosen expense (a-exp 200), not GRNI",
      near((await acctBal(client, "a-exp")).net, 200),
    );

    // G: mixed matched + direct in ONE balanced invoice.
    const { grnLineByPoLine: m2 } = await postGrn(db, client, "sup1", "PO2", [
      { id: "l2", type: "ITEM", itemId: "item1", qty: 50, price: 10 },
    ]);
    const expBefore = (await acctBal(client, "a-freight")).net;
    const invMix = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: m2.get("l2")!,
          quantity: 50,
          unitPrice: 10,
        },
        { accountingMode: "direct", accountId: "a-freight", quantity: 1, unitPrice: 100 },
      ],
    });
    await postInvoice(db, invMix);
    const jid2 = (
      await client.query(`SELECT journal_entry_id j FROM supplier_invoices WHERE id=$1`, [invMix])
    ).rows[0].j;
    const jb = (
      await client.query(
        `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id=$1`,
        [jid2],
      )
    ).rows[0];
    const grn2Id = (
      await client.query(`SELECT goods_receipt_id g FROM goods_receipt_lines WHERE id=$1`, [
        m2.get("l2"),
      ])
    ).rows[0].g;
    ok(
      "ACC-MATCH-G: mixed invoice = Dr GRNI 500 + Dr Freight 100 / Cr AP 600, balanced",
      near(Number(jb.d), 600) &&
        near(Number(jb.c), 600) &&
        near((await acctBal(client, "a-freight")).net, expBefore + 100) &&
        near(await receiptGrniNet(client, grn2Id), 0),
    );
    // UI-derivation helpers reflect the matching state (no stored balance).
    const summary = await receiptMatchSummary(db, grn2Id);
    ok(
      "ACC-MATCH-G: receiptMatchSummary shows the receipt fully invoiced (remaining 0)",
      near(summary.remainingValue, 0) && summary.fullyInvoiced === true,
    );
    const stillMatchable = await matchableGrnLinesForSupplier(db, "sup1");
    ok(
      "ACC-MATCH-G: a fully-invoiced receipt line drops out of matchable list",
      !stillMatchable.some((r) => r.goodsReceiptLineId === m2.get("l2")),
    );
  }

  // ===================== HIST-A — historical GRNI account =====================
  console.log("\nHIST-A — invoice clears the GRN's ACTUAL historical GRNI account");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    // GRN posted while GRNI = account A (a-grni).
    const { grnId, grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    ok(
      "HIST-A: GRN credited GRNI account A (a-grni −1000)",
      near((await acctBal(client, "a-grni")).net, -1000),
    );
    // Admin later changes the configured GRNI to account B (a-grni2).
    await db.transaction((tx: any) =>
      assignGrniAccount(tx, { accountId: "a-grni2", userId: "u1" }),
    );
    ok(
      "HIST-A: today's confirmed GRNI is now account B (a-grni2)",
      (await resolveConfirmedGrniAccount(db)) === "a-grni2",
    );
    // Invoice matches the OLD receipt.
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 100, unitPrice: 10 },
      ],
    });
    await postInvoice(db, inv);
    ok(
      "HIST-A: invoice cleared account A (a-grni back to 0), NOT account B",
      near((await acctBal(client, "a-grni")).net, 0),
    );
    ok(
      "HIST-A: account B (a-grni2) was never touched by the clearing invoice",
      near((await acctBal(client, "a-grni2")).net, 0),
    );
  }

  // ===================== PRICE-A..B — exact-match policy =====================
  console.log("\nPRICE-A..B — price variance unsupported; exact within rounding ok");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    ok(
      "PRICE-A: invoice 100×11 vs receipt 100×10 → PURCHASE_PRICE_VARIANCE_UNSUPPORTED (no journal)",
      await throwsCode(
        () =>
          draftInvoice(db, {
            supplierId: "sup1",
            lines: [
              {
                accountingMode: "grn_matched",
                goodsReceiptLineId: gl,
                quantity: 100,
                unitPrice: 11,
              },
            ],
          }),
        "PURCHASE_PRICE_VARIANCE_UNSUPPORTED",
      ),
    );
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 100, unitPrice: 10 },
      ],
    });
    await postInvoice(db, inv);
    ok(
      "PRICE-B: exact price 100×10 posts and clears GRNI to 0",
      near((await acctBal(client, "a-grni")).net, 0),
    );
  }

  // ===================== RACE-MATCH-A..C — concurrency (serialized outcome) =====================
  console.log("\nRACE-MATCH-A..C — post-time recompute prevents over-invoicing");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    // Two drafts of 70 each are created against remaining 100 (both pass draft
    // snapshot). At POST the remaining is recomputed under the lock: only one posts.
    const a = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 70, unitPrice: 10 },
      ],
    });
    const b = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 70, unitPrice: 10 },
      ],
    });
    await postInvoice(db, a);
    ok(
      "RACE-MATCH-A: first 70 posts; the second 70 is rejected at POST (remaining 30) — never 140",
      await throwsCode(() => postInvoice(db, b), "OVER_INVOICED_RECEIPT"),
    );
    ok(
      "RACE-MATCH-A: total matched capped at 70 (≤ received 100)",
      near((await matchedQtyByGrnLine(db, [gl])).get(gl) || 0, 70),
    );

    // B: 60 + 40 both post, remaining 0.
    const { grnLineByPoLine: m2 } = await postGrn(db, client, "sup1", "PO2", [
      { id: "l2", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl2 = m2.get("l2")!;
    const c = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl2, quantity: 60, unitPrice: 10 },
      ],
    });
    const d = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl2, quantity: 40, unitPrice: 10 },
      ],
    });
    await postInvoice(db, c);
    await postInvoice(db, d);
    ok(
      "RACE-MATCH-B: 60 + 40 both post → remaining 0",
      near((await matchedQtyByGrnLine(db, [gl2])).get(gl2) || 0, 100),
    );

    // C: same invoice posted twice → one accounting effect.
    ok(
      "RACE-MATCH-C: re-posting the same invoice is idempotent (ALREADY_POSTED)",
      await throwsCode(() => postInvoice(db, c), "ALREADY_POSTED"),
    );
    const cJe = (
      await client.query(`SELECT journal_entry_id j FROM supplier_invoices WHERE id=$1`, [c])
    ).rows[0].j;
    const links = (
      await client.query(
        `SELECT count(*)::int n FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE g.link_type='invoice' AND jl.journal_entry_id=$1`,
        [cJe],
      )
    ).rows[0].n;
    ok(
      "RACE-MATCH-C: exactly one GRNI invoice-link for the retried invoice (no duplicate)",
      Number(links) === 1,
    );
  }

  // ===================== REV-MATCH-A..E — reversal =====================
  console.log("\nREV-MATCH-A..E — reversal restores GRNI, releases quantity, guards GRN");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnId, grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: gl,
          quantity: 100,
          unitPrice: 10,
          taxRate: 15,
        },
      ],
    });
    await postInvoice(db, inv);
    ok(
      "REV-MATCH: (setup) GRNI cleared to 0, AP 1150",
      near((await acctBal(client, "a-grni")).net, 0) &&
        near((await getSupplierBalance(db, "sup1")).payableBalance, 1150),
    );

    // D: cannot reverse GRN while active posted invoice matches it.
    ok(
      "REV-MATCH-D: reversing GRN while active posted invoice matches → grnHasActivePostedInvoice true",
      (await grnHasActivePostedInvoice(db, grnId)) === true,
    );

    await reverseInvoice(db, inv);
    ok(
      "REV-MATCH-A: reversing invoice re-establishes GRNI (a-grni back to −1000)",
      near((await acctBal(client, "a-grni")).net, -1000),
    );
    ok(
      "REV-MATCH-A: supplier AP nets to 0, Input VAT nets to 0",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 0) &&
        near((await acctBal(client, "a-vat")).net, 0),
    );
    // receiptGrniNet = credit − debit over the receipt's links = receipt credit
    // (1000) − invoice debit (1000) + invoice-reversal credit (1000) = +1000.
    ok(
      "REV-MATCH-B: reversal GRNI CREDIT mirror linked to the same receipt (subledger credit restored to 1000)",
      near(await receiptGrniNet(client, grnId), 1000),
    );
    ok(
      "REV-MATCH-C: matched quantity released — invoiceable again (matched now 0)",
      near((await matchedQtyByGrnLine(db, [gl])).get(gl) || 0, 0),
    );

    // E: after invoice reversed, GRN no longer blocked.
    ok(
      "REV-MATCH-E: after invoice reversal, grnHasActivePostedInvoice false → GRN may be reversed",
      (await grnHasActivePostedInvoice(db, grnId)) === false,
    );
    ok(
      "REV-MATCH: GRNI reconciliation still balances after reversal (difference 0)",
      near((await grniReconciliation(db)).difference, 0),
    );
    ok(
      "REV-MATCH-D: GRN service enforces GRN_HAS_POSTED_SUPPLIER_INVOICE on reverse",
      /grnHasActivePostedInvoice\(/.test(grnSvc) && /GRN_HAS_POSTED_SUPPLIER_INVOICE/.test(grnSvc),
    );
  }

  // ===================== IDEM-MATCH-A..C — idempotency =====================
  console.log("\nIDEM-MATCH-A..C — one journal, one AP link, one GRNI link set");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
    ]);
    const gl = grnLineByPoLine.get("l1")!;
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        { accountingMode: "grn_matched", goodsReceiptLineId: gl, quantity: 100, unitPrice: 10 },
      ],
    });
    await postInvoice(db, inv);
    ok(
      "IDEM-MATCH-A: sequential re-post is rejected (ALREADY_POSTED) — one journal",
      await throwsCode(() => postInvoice(db, inv), "ALREADY_POSTED"),
    );
    const je = (
      await client.query(
        `SELECT count(*)::int n FROM journal_entries WHERE source_type='supplier_invoice' AND source_id=$1 AND status='posted'`,
        [inv],
      )
    ).rows[0].n;
    ok(
      "IDEM-MATCH-B: exactly one posted supplier_invoice journal for the source",
      Number(je) === 1,
    );
    const apl = (
      await client.query(
        `SELECT count(*)::int n FROM supplier_journal_links WHERE source_type='supplier_invoice'`,
      )
    ).rows[0].n;
    ok("IDEM-MATCH-B: exactly one AP subledger link", Number(apl) === 1);
    // C: the GRNI debit line cannot be double-linked (UNIQUE journal_line_id).
    const grniLine = (
      await client.query(
        `SELECT jl.id FROM journal_lines jl WHERE jl.journal_entry_id=(SELECT journal_entry_id FROM supplier_invoices WHERE id=$1) AND jl.account_id='a-grni' AND jl.debit>0`,
        [inv],
      )
    ).rows[0].id;
    const grnIdC = (
      await client.query(`SELECT goods_receipt_id g FROM goods_receipt_lines WHERE id=$1`, [gl])
    ).rows[0].g;
    ok(
      "IDEM-MATCH-C: re-linking the same GRNI debit line → LINE_ALREADY_LINKED",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            createGrniLink(tx, {
              goodsReceiptId: grnIdC,
              journalLineId: grniLine,
              linkType: "invoice",
              expectedAccountId: "a-grni",
            }),
          ),
        "LINE_ALREADY_LINKED",
      ),
    );
  }

  // ===================== DUP-A..D — zero duplication =====================
  console.log("\nDUP-A..D — matched invoice never re-books receipt cost / stock / balance");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkItem(client, "item1", 0);
    const { grnLineByPoLine } = await postGrn(db, client, "sup1", "PO1", [
      { id: "l1", type: "ITEM", itemId: "item1", qty: 100, price: 10 },
      { id: "l2", type: "SERVICE", accountId: "a-exp", qty: 1, price: 300 },
    ]);
    const invNet = (await acctBal(client, "a-inv")).net;
    const expNet = (await acctBal(client, "a-exp")).net;
    const balBefore = (await client.query(`SELECT balance b FROM suppliers WHERE id='sup1'`))
      .rows[0].b;
    const movesBefore = await stockMoves(client);
    const inv = await draftInvoice(db, {
      supplierId: "sup1",
      lines: [
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: grnLineByPoLine.get("l1")!,
          quantity: 100,
          unitPrice: 10,
        },
        {
          accountingMode: "grn_matched",
          goodsReceiptLineId: grnLineByPoLine.get("l2")!,
          quantity: 1,
          unitPrice: 300,
        },
      ],
    });
    await postInvoice(db, inv);
    ok(
      "DUP-A: matched invoice does NOT debit Inventory again (a-inv net unchanged)",
      near((await acctBal(client, "a-inv")).net, invNet),
    );
    ok(
      "DUP-B: matched invoice does NOT debit the original receipt expense again (a-exp net unchanged)",
      near((await acctBal(client, "a-exp")).net, expNet),
    );
    ok(
      "DUP-C: matched invoice does NOT write suppliers.balance (legacy column untouched)",
      near(
        Number((await client.query(`SELECT balance b FROM suppliers WHERE id='sup1'`)).rows[0].b),
        Number(balBefore),
      ),
    );
    ok(
      "DUP-D: matched invoice creates NO stock movement",
      (await stockMoves(client)) === movesBefore,
    );
    ok(
      "DUP: service maps GRN_MATCHED lines to the receipt's GRNI account (no re-debit of inventory/expense)",
      /GRN_MATCHED → the receipt's ACTUAL/.test(invSvc) &&
        /linkType: "invoice"/.test(invSvc) &&
        !/\.update\(suppliers\)/.test(invSvc),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
