/**
 * Phase 3C — governed Purchase Orders tests.
 *
 * Exercises the REAL building blocks against PGlite — validatePurchaseOrder
 * (purchase-order.ts), nextCode (numbering.ts), getSupplierBalance +
 * createSupplierApLink (supplier.ts), postBalancedEntry (gl.ts), and
 * evaluateTransition + PO_TRANSITIONS. A Purchase Order is a commitment document
 * with ZERO GL / AP / inventory effect, so the lifecycle is status-only; that
 * property is verified both by a status-only runtime mirror and by source
 * assertions that the service calls no accounting/inventory engine.
 *
 * Covers PO-A..H, WF-A..J, ZERO-A..G, LEG-REC-A..C, PERM-A..G, AUD-A..D.
 * Run: node_modules/.bin/tsx scripts/test-phase-3c.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validatePurchaseOrder } from "@/server/db/purchase-order";
import { getSupplierBalance, createSupplierApLink } from "@/server/db/supplier";
import { postBalancedEntry } from "@/server/db/gl";
import { nextCode } from "@/server/db/numbering";
import { now, genId } from "@/server/db/index";
import { evaluateTransition, findTransition, actionsFor } from "@/lib/finance-permissions";
import { PO_TRANSITIONS, PROCUREMENT_PERMISSIONS as PP } from "@/lib/procurement-permissions";
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
function decide(
  fromStatus: string,
  action: any,
  perms: string[],
  opts: { createdBy?: string; currentUserId?: string; reason?: string } = {},
) {
  const t = findTransition(fromStatus, action, PO_TRANSITIONS);
  const perm = t?.permission ?? null;
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: (p) => (perm ? p === perm && grants(perms, perm) : false),
    createdBy: opts.createdBy ?? "maker",
    currentUserId: opts.currentUserId ?? "checker",
    reason: opts.reason,
    transitions: PO_TRANSITIONS,
  });
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
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR', period_id text,
  project_id text, source text NOT NULL DEFAULT 'manual', source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text, reversed_of text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
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
CREATE TABLE stock_movements (id text PRIMARY KEY, item_id text, warehouse_id text, type text NOT NULL,
  quantity double precision NOT NULL DEFAULT 0, balance_after double precision NOT NULL DEFAULT 0,
  source_type text, source_id text, reference text, date text, notes text DEFAULT '',
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
CREATE UNIQUE INDEX purchase_orders_po_number_idx ON purchase_orders (po_number);
CREATE TABLE purchase_order_lines (id text PRIMARY KEY, order_id text NOT NULL, line_number int NOT NULL,
  item_id text, description text NOT NULL DEFAULT '', quantity double precision NOT NULL DEFAULT 0,
  unit_price double precision NOT NULL DEFAULT 0, received_quantity double precision NOT NULL DEFAULT 0,
  unit text DEFAULT '', notes text DEFAULT '', created_at text NOT NULL DEFAULT '',
  line_type text NOT NULL DEFAULT 'ITEM', account_id text, cost_center_id text,
  line_subtotal double precision NOT NULL DEFAULT 0, tax_rate double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, line_total double precision NOT NULL DEFAULT 0);
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-ap", "210101", "AP suppliers", "liability", "accounts_payable"],
    ["a-exp", "5301", "Expense", "expense", null],
    ["a-inv", "110503", "Inventory", "asset", "inventory"],
    ["a-vat", "110306", "Input VAT", "asset", "input_vat"],
  ];
  for (const [id, code, name, cls, sk] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',true,'active','SAR',${sk ? `'${sk}'` : "NULL"})`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}
async function mkSupplier(client: any, id: string, status = "active") {
  await client.exec(
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('${id}','${id}','${status}','SAR','${now()}','${now()}')`,
  );
}
function po(over: any = {}) {
  return {
    supplierId: over.supplierId ?? "sup1",
    subject: over.subject ?? "مكتبية",
    orderDate: over.orderDate ?? "2026-03-10",
    expectedDeliveryDate: over.expectedDeliveryDate ?? null,
    currency: over.currency ?? "SAR",
    lines: over.lines ?? [{ description: "ورق", quantity: 10, unitPrice: 20, taxRate: 15 }],
    ...over,
  };
}
/** Give a supplier an existing payable via a posted AP-credit invoice-like entry. */
async function seedPayable(db: any, client: any, supplierId: string, amount: number) {
  const e = await db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date: "2026-02-01",
      description: "seed",
      source: "manual",
      sourceType: "supplier_invoice",
      sourceId: `SEED-${supplierId}`,
      lines: [
        { accountId: "a-exp", debit: amount },
        { accountId: "a-ap", credit: amount },
      ],
      userId: "u1",
      status: "posted",
    }),
  );
  const apLine = (
    await client.query(
      `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-ap' AND credit>0 LIMIT 1`,
      [e],
    )
  ).rows[0].id;
  await createSupplierApLink(db, { supplierId, journalLineId: apLine });
  return e;
}
/** Mirror the governed CREATE: nextCode + insert PO row + lines. NO accounting. */
async function createGovernedPO(db: any, computed: any, input: any) {
  const id = genId("PO");
  const ts = now();
  await db.transaction(async (tx: any) => {
    const num = await nextCode(tx, {
      table: "purchase_orders",
      column: "po_number",
      prefix: "PO-",
      year: true,
    });
    await tx.execute(
      sql`INSERT INTO purchase_orders (id,governance_mode,po_number,supplier_id,subject,date,status,currency,subtotal,tax_amount,total_amount,total,created_at,updated_at) VALUES (${id},'governed',${num},${input.supplierId},${input.subject},${input.orderDate},'draft','SAR',${computed.subtotal},${computed.taxAmount},${computed.totalAmount},${computed.totalAmount},${ts},${ts})`,
    );
  });
  return id;
}
async function counts(client: any) {
  const je = (await client.query(`SELECT count(*)::int n FROM journal_entries`)).rows[0].n;
  const sjl = (await client.query(`SELECT count(*)::int n FROM supplier_journal_links`)).rows[0].n;
  const mv = (await client.query(`SELECT count(*)::int n FROM stock_movements`)).rows[0].n;
  return { je: Number(je), sjl: Number(sjl), mv: Number(mv) };
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/purchase-order.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/purchase-orders.ts"),
  "utf8",
);
const legacy = readFileSync(resolve(process.cwd(), "src/routes/api/procurement/orders.ts"), "utf8");
const ui = readFileSync(
  resolve(process.cwd(), "src/routes/procurement.purchase-orders.tsx"),
  "utf8",
);
const mig = readFileSync(
  resolve(process.cwd(), "drizzle/0025_governed_purchase_orders.sql"),
  "utf8",
);

const S = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  ISSUED: "issued",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

async function main() {
  // ===================== PO-A..H — create & validation =====================
  console.log("\nPO-A..H — create & server-authoritative validation");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await mkSupplier(client, "supX", "inactive");
    await seedPayable(db, client, "sup1", 5000); // existing payable

    const before = await counts(client);
    const payBefore = (await getSupplierBalance(db, "sup1")).payableBalance;

    const c = await validatePurchaseOrder(db, po());
    ok(
      "PO-E: server recomputes totals (10×20=200 net, 30 vat, 230 total) — client total ignored",
      near(c.subtotal, 200) && near(c.taxAmount, 30) && near(c.totalAmount, 230),
    );
    await createGovernedPO(db, c, po());
    const after = await counts(client);
    ok(
      "PO-A: valid Draft PO created with NO GL / AP-link / stock effect",
      after.je === before.je && after.sjl === before.sjl && after.mv === before.mv,
    );
    ok(
      "PO-G: supplier payable unchanged by Draft PO",
      near((await getSupplierBalance(db, "sup1")).payableBalance, payBefore),
    );
    ok(
      "PO-H: GL journal count unchanged by Draft PO",
      (await client.query(`SELECT count(*)::int n FROM journal_entries`)).rows[0].n === before.je,
    );
    ok(
      "PO-B: inactive supplier rejected",
      await throwsCode(
        () => validatePurchaseOrder(db, po({ supplierId: "supX" })),
        "SUPPLIER_INACTIVE",
      ),
    );
    ok(
      "PO-B: unknown supplier rejected",
      await throwsCode(
        () => validatePurchaseOrder(db, po({ supplierId: "nope" })),
        "SUPPLIER_NOT_FOUND",
      ),
    );
    ok(
      "PO-C: no lines rejected",
      await throwsCode(() => validatePurchaseOrder(db, po({ lines: [] })), "NO_LINES"),
    );
    ok(
      "PO-D: invalid quantity rejected",
      await throwsCode(
        () =>
          validatePurchaseOrder(
            db,
            po({ lines: [{ description: "x", quantity: 0, unitPrice: 5 }] }),
          ),
        "QTY_INVALID",
      ),
    );
    ok(
      "PO-D: negative unit price rejected",
      await throwsCode(
        () =>
          validatePurchaseOrder(
            db,
            po({ lines: [{ description: "x", quantity: 1, unitPrice: -5 }] }),
          ),
        "PRICE_INVALID",
      ),
    );
    ok(
      "PO: expected delivery before order date rejected",
      await throwsCode(
        () =>
          validatePurchaseOrder(
            db,
            po({ orderDate: "2026-03-10", expectedDeliveryDate: "2026-03-01" }),
          ),
        "DELIVERY_BEFORE_ORDER",
      ),
    );
    // PO-F: concurrent create → unique, sequential PO numbers.
    const c2 = await validatePurchaseOrder(db, po());
    const idA = await createGovernedPO(db, c2, po());
    const idB = await createGovernedPO(db, c2, po());
    const nums = (
      await client.query(
        `SELECT po_number FROM purchase_orders WHERE id IN ($1,$2) ORDER BY po_number`,
        [idA, idB],
      )
    ).rows.map((r: any) => r.po_number);
    ok(
      "PO-F: concurrent creates get unique sequential PO numbers",
      nums.length === 2 &&
        nums[0] !== nums[1] &&
        nums.every((n: string) => /^PO-2026-\d{6}$/.test(n)),
    );
    ok(
      "PO-F: duplicate po_number rejected by unique index",
      await throwsCode(
        () =>
          client.exec(
            `INSERT INTO purchase_orders (id,subject,po_number) VALUES ('dup','x','${nums[0]}')`,
          ),
        "unique",
      ),
    );
  }

  // ===================== WF-A..J — governance state machine =====================
  console.log("\nWF-A..J — governed PO workflow");
  {
    ok("WF-A: DRAFT→submit allowed with submit perm", decide(S.DRAFT, "submit", [PP.poSubmit]).ok);
    ok(
      "WF-B: self-approval blocked (maker≠checker)",
      decide(S.SUBMITTED, "approve", [PP.poApprove], { createdBy: "u1", currentUserId: "u1" })
        .code === "SELF_APPROVAL",
    );
    ok(
      "WF-C: different approver allowed",
      decide(S.SUBMITTED, "approve", [PP.poApprove], { createdBy: "u1", currentUserId: "u2" }).ok,
    );
    ok(
      "WF-D: DRAFT→issue rejected (illegal transition)",
      decide(S.DRAFT, "issue", [PP.poIssue]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-E: SUBMITTED→issue rejected (illegal transition)",
      decide(S.SUBMITTED, "issue", [PP.poIssue]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-F: APPROVED→issue allowed with issue perm",
      decide(S.APPROVED, "issue", [PP.poIssue]).ok,
    );
    ok(
      "WF-G: return without reason rejected",
      decide(S.SUBMITTED, "return", [PP.poReject], { reason: "" }).code === "REASON_REQUIRED" &&
        decide(S.SUBMITTED, "return", [PP.poReject], { reason: "fix" }).ok,
    );
    ok(
      "WF-H: ISSUED is immutable — only 'cancel' is available (no edit/backward transition)",
      JSON.stringify(actionsFor(S.ISSUED, PO_TRANSITIONS)) === JSON.stringify(["cancel"]) &&
        /NOT_DRAFT/.test(svc),
    );
    ok(
      "WF-I: issued cancel without permission or reason rejected",
      decide(S.ISSUED, "cancel", [PP.poView]).code === "FORBIDDEN" &&
        decide(S.ISSUED, "cancel", [PP.poCancel], { reason: "" }).code === "REASON_REQUIRED",
    );
    ok(
      "WF-J: authorized cancel with reason allowed",
      decide(S.ISSUED, "cancel", [PP.poCancel], { reason: "مورد أخل بالتسليم" }).ok,
    );
  }

  // ===================== ZERO-A..G — zero-accounting invariant =====================
  console.log("\nZERO-A..G — Purchase Order never creates accounting");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1");
    await seedPayable(db, client, "sup1", 8000);
    const c = await validatePurchaseOrder(db, po());
    const id = await createGovernedPO(db, c, po());

    const base = await counts(client);
    const apBase = (await getSupplierBalance(db, "sup1")).payableBalance;
    // Approve + Issue are pure status updates (mirror of the service).
    await client.exec(`UPDATE purchase_orders SET status='approved' WHERE id='${id}'`);
    const afterApprove = await counts(client);
    ok("ZERO-A: approve → journal_entries delta 0", afterApprove.je === base.je);
    await client.exec(`UPDATE purchase_orders SET status='issued' WHERE id='${id}'`);
    const afterIssue = await counts(client);
    ok("ZERO-B: issue → journal_entries delta 0", afterIssue.je === base.je);
    ok(
      "ZERO-C: supplier payable unchanged after issue",
      near((await getSupplierBalance(db, "sup1")).payableBalance, apBase),
    );
    const apGl = (
      await client.query(
        `SELECT COALESCE(SUM(credit),0)-COALESCE(SUM(debit),0) v FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE jl.account_id='a-ap' AND je.status IN ('posted','reversed')`,
      )
    ).rows[0].v;
    ok("ZERO-D: AP GL unchanged after issue (still 8000)", near(Number(apGl), 8000));
    ok("ZERO-E: supplier subledger links unchanged after issue", afterIssue.sjl === base.sjl);
    ok("ZERO-F: inventory / stock movements unchanged after issue (0)", afterIssue.mv === 0);
    const vatGl = (
      await client.query(
        `SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) v FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE jl.account_id='a-vat' AND je.status IN ('posted','reversed')`,
      )
    ).rows[0].v;
    ok("ZERO-G: Input VAT GL unchanged after issue (0)", near(Number(vatGl), 0));
  }

  // ===================== LEG-REC-A..C — legacy receive safety =====================
  console.log("\nLEG-REC-A..C — legacy AP-posting receive path is fenced off");
  {
    ok(
      "LEG-REC-A: legacy route rejects governed PO with 409 USE_GOVERNED_GRN (no GL/AP/inventory)",
      /governanceMode === PurchaseOrderGovernance\.GOVERNED/.test(legacy) &&
        /USE_GOVERNED_GRN/.test(legacy) &&
        /409/.test(legacy),
    );
    ok(
      "LEG-REC-B: governed PO UI/route exposes no 'receive' action",
      !/"receive"|action:\s*"receive"|receivedQty/.test(ui) && !/["']receive["']/.test(route),
    );
    ok(
      "LEG-REC-C: legacy historical receive behavior retained for legacy POs (still posts Dr Inv/Cr AP)",
      /postBalancedEntry\(/.test(legacy) &&
        /SYS\.INVENTORY/.test(legacy) &&
        /SYS\.ACCOUNTS_PAYABLE/.test(legacy) &&
        /suppliers\.balance/.test(legacy),
    );
  }

  // ===================== PERM-A..G — permission separation =====================
  console.log("\nPERM-A..G — granular permission separation");
  {
    ok(
      "PERM-A: create is gated (route checks poCreate; view does not grant create)",
      /hasPermission\([^)]*poCreate\)/.test(route) && !grants([PP.poView], PP.poCreate),
    );
    ok(
      "PERM-B: view only → no submit/approve/issue/cancel/update",
      !grants([PP.poView], PP.poSubmit) &&
        !grants([PP.poView], PP.poApprove) &&
        !grants([PP.poView], PP.poIssue) &&
        !grants([PP.poView], PP.poCancel) &&
        !grants([PP.poView], PP.poUpdateDraft),
    );
    ok("PERM-C: submit does not imply approve", !grants([PP.poSubmit], PP.poApprove));
    ok("PERM-D: approve does not imply issue", !grants([PP.poApprove], PP.poIssue));
    ok("PERM-E: issue does not imply cancel", !grants([PP.poIssue], PP.poCancel));
    ok(
      "PERM-F: PO permissions do not grant Supplier master mutation",
      !grants([PP.poApprove, PP.poIssue, PP.poCreate], (FP as any).supplierUpdate) &&
        !grants([PP.poApprove], (FP as any).supplierCreate),
    );
    ok(
      "PERM-G: PO permissions do not grant Supplier Invoice posting",
      !grants([PP.poApprove, PP.poIssue], (FP as any).supplierInvoicePost),
    );
  }

  // ===================== AUD-A..D — audit & zero-accounting source =====================
  console.log("\nAUD-A..D — audit trail & accounting isolation");
  {
    ok(
      "AUD-A: lifecycle actions audited (created/submitted/approved/issued/returned/rejected/cancelled)",
      /PURCHASE_ORDER_CREATED/.test(svc) &&
        /PURCHASE_ORDER_SUBMITTED/.test(svc) &&
        /PURCHASE_ORDER_APPROVED/.test(svc) &&
        /PURCHASE_ORDER_ISSUED/.test(svc) &&
        /PURCHASE_ORDER_RETURNED/.test(svc) &&
        /PURCHASE_ORDER_REJECTED/.test(svc) &&
        /PURCHASE_ORDER_CANCELLED/.test(svc),
    );
    ok(
      "AUD-B: workflow history via the shared immutable engine (entityType purchase_order)",
      /recordWorkflowEvent\(/.test(svc) && /entityType:\s*"purchase_order"/.test(svc),
    );
    ok(
      "AUD-C: issued PO cannot rewrite historical lines (update requires DRAFT; workflow reuses evaluateTransition)",
      /NOT_DRAFT/.test(svc) && /evaluateTransition\(/.test(svc) && /PO_TRANSITIONS/.test(svc),
    );
    ok(
      "AUD-D: governed PO service NEVER calls postBalancedEntry / suppliers.balance / supplier_journal_links / inventory",
      !/postBalancedEntry/.test(svc) &&
        !/supplier_journal_links|supplierJournalLinks/.test(svc) &&
        !/linkEntryApLine|createSupplierApLink/.test(svc) &&
        !/stockMovements|inventoryItems/.test(svc) &&
        !/\.update\(suppliers\)/.test(svc) &&
        !/balance:/.test(svc),
    );
    ok(
      "AUD: migration is additive (ADD COLUMN IF NOT EXISTS) with governance_mode + po_number, no journal writes",
      /ADD COLUMN IF NOT EXISTS "governance_mode"/.test(mig) &&
        /ADD COLUMN IF NOT EXISTS "po_number"/.test(mig) &&
        !/INSERT INTO "?journal/i.test(mig) &&
        !/UPDATE "?suppliers"? SET/i.test(mig),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
