/**
 * Shared PGlite matching harness for Phase 3E / 3E.1 supplier-invoice ↔ GRN tests.
 * Exercises the REAL building blocks (validateInvoice / createGrniLink /
 * linkEntryGrniLine / linkEntryApLine / postBalancedEntry / reverseEntry) and
 * mirrors the certified Supplier Invoice POST / REVERSE in the same order.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { assignGrniAccount, assignInputVatAccount } from "@/server/db/account-mapping";
import { validateInvoice } from "@/server/db/supplier-invoice";
import { createGrniLink, linkEntryGrniLine } from "@/server/db/grni-link";
import { linkEntryApLine } from "@/server/db/supplier";
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

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const DDL = `
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
  updated_at text NOT NULL DEFAULT '', governance_mode text NOT NULL DEFAULT 'governed', po_number text,
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

export async function freshDb() {
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
export async function mkSupplier(client: any, id: string) {
  await client.exec(
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('${id}','${id}','active','SAR','${now()}','${now()}')`,
  );
}
export async function mkItem(client: any, id: string, qty = 0) {
  await client.exec(
    `INSERT INTO inventory_items (id,name,unit,quantity,status) VALUES ('${id}','${id}','قطعة',${qty},'active')`,
  );
}

/** Post a governed GRN and link the receipt GRNI credit; returns grn line ids by po line. */
export async function postGrn(
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
export async function draftInvoice(
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
export async function postInvoice(db: any, id: string) {
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
export async function reverseInvoice(db: any, id: string) {
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

export async function acctBal(client: any, acct: string) {
  const r = (
    await client.query(
      `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE jl.account_id=$1 AND je.status IN ('posted','reversed')`,
      [acct],
    )
  ).rows[0];
  return { debit: Number(r.d), credit: Number(r.c), net: Number(r.d) - Number(r.c) };
}
export async function receiptGrniNet(client: any, grnId: string) {
  const r = (
    await client.query(
      `SELECT COALESCE(SUM(jl.credit),0) c, COALESCE(SUM(jl.debit),0) d FROM grni_journal_links g JOIN journal_lines jl ON g.journal_line_id=jl.id WHERE g.goods_receipt_id=$1`,
      [grnId],
    )
  ).rows[0];
  return Number(r.c) - Number(r.d);
}
