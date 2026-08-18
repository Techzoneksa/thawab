/**
 * Phase 3B — Supplier Invoices (فواتير الموردين) tests.
 *
 * Exercises the REAL certified building blocks against PGlite — validateInvoice /
 * computeTotals (supplier-invoice.ts), postBalancedEntry / reverseEntry /
 * existingSourceEntryId / resolveSystemAccountId (gl.ts), linkEntryApLine +
 * getSupplierBalance + apReconciliation (supplier.ts), getAccountBalance
 * (balances.ts), and evaluateTransition + SUPPLIER_INVOICE_TRANSITIONS. The
 * atomic post/reverse sequence is mirrored here in the SAME order the service
 * uses, and the thin orchestration is additionally locked down by source
 * assertions on the service/route files.
 *
 * Covers SI-A..I, TAX-A..E, WF-A..H, POST-A..H, IDEM-A..E, REV-A..H, PERM-A..F,
 * AUD-A..E, and (Phase 3B.1) VAT-MAP-A..I (explicit Input VAT mapping) +
 * DEBIT-A..H (allocation-account eligibility).
 * Run: node_modules/.bin/tsx scripts/test-phase-3b.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateInvoice } from "@/server/db/supplier-invoice";
import {
  validateInputVatMappingAccount,
  assignInputVatAccount,
  getInputVatMapping,
  inputVatPreflight,
} from "@/server/db/account-mapping";
import {
  linkEntryApLine,
  createSupplierApLink,
  getSupplierBalance,
  apReconciliation,
} from "@/server/db/supplier";
import {
  postBalancedEntry,
  reverseEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";
import { now } from "@/server/db/index";
import {
  evaluateTransition,
  findTransition,
  SUPPLIER_INVOICE_TRANSITIONS,
  FINANCE_PERMISSIONS as P,
} from "@/lib/finance-permissions";

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
  const t = findTransition(fromStatus, action, SUPPLIER_INVOICE_TRANSITIONS);
  const perm = t?.permission ?? null;
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: (p) => (perm ? p === perm && grants(perms, perm) : false),
    createdBy: opts.createdBy ?? "maker",
    currentUserId: opts.currentUserId ?? "checker",
    reason: opts.reason,
    transitions: SUPPLIER_INVOICE_TRANSITIONS,
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
CREATE TABLE cashboxes (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  linked_account_id text NOT NULL, currency text NOT NULL DEFAULT 'SAR', status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE bank_accounts (id text PRIMARY KEY, code text NOT NULL UNIQUE, bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '', account_number text, iban text, iban_normalized text,
  currency text NOT NULL DEFAULT 'SAR', linked_account_id text NOT NULL, status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR', period_id text,
  project_id text, source text NOT NULL DEFAULT 'manual', source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text, reversed_of text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX journal_entries_supplier_invoice_source_idx ON journal_entries (source_id) WHERE source_type = 'supplier_invoice';
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
CREATE TABLE supplier_invoices (id text PRIMARY KEY, invoice_number text NOT NULL UNIQUE,
  supplier_invoice_number text DEFAULT '', supplier_invoice_number_normalized text DEFAULT '',
  supplier_id text NOT NULL, invoice_date text NOT NULL DEFAULT '', due_date text,
  status text NOT NULL DEFAULT 'draft', currency text NOT NULL DEFAULT 'SAR',
  subtotal double precision NOT NULL DEFAULT 0, tax_amount double precision NOT NULL DEFAULT 0,
  total_amount double precision NOT NULL DEFAULT 0, external_reference text, description text DEFAULT '',
  notes text DEFAULT '', journal_entry_id text, created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text);
CREATE UNIQUE INDEX supplier_invoices_supplier_doc_idx ON supplier_invoices (supplier_id, supplier_invoice_number_normalized);
CREATE TABLE supplier_invoice_lines (id text PRIMARY KEY, supplier_invoice_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, description text DEFAULT '', account_id text NOT NULL,
  quantity double precision NOT NULL DEFAULT 1, unit_price double precision NOT NULL DEFAULT 0,
  line_subtotal double precision NOT NULL DEFAULT 0, tax_rate double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, line_total double precision NOT NULL DEFAULT 0,
  cost_center_id text, created_at text NOT NULL DEFAULT '');
`;

async function freshDb(opts: { withVat?: boolean } = {}) {
  const withVat = opts.withVat !== false; // default: VAT account seeded
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs: any[] = [
    ["a-ap", "210101", "AP suppliers", "liability", true, "accounts_payable"],
    ["a-exp", "5301", "Rent expense", "expense", true, null],
    ["a-exp2", "5304", "Office supplies", "expense", true, null],
    ["a-asset", "120103", "Furniture", "asset", true, null],
    ["a-cash", "110101", "Cash", "asset", true, "cash"],
    ["a-counter", "3101", "Net assets", "equity", true, null],
    ["a-parent", "53", "Admin expenses (header)", "expense", false, null],
    ["a-inactive", "5399", "Old expense", "expense", true, null],
    ["a-cashmapped", "110109", "Petty cash link", "asset", true, null],
    ["a-bankmapped", "110209", "Bank link", "asset", true, null],
    // A NORMAL liability that is NOT the AP control account (e.g. accrued liability).
    ["a-accrued", "210102", "Accrued liabilities", "liability", true, null],
    // A spare asset account used as an Input VAT mapping candidate.
    ["a-vatcand", "110307", "VAT candidate", "asset", true, null],
  ];
  if (withVat) accs.push(["a-vat", "110306", "Input VAT", "asset", true, "input_vat"]);
  for (const [id, code, name, cls, postable, sk] of accs) {
    const status = id === "a-inactive" ? "inactive" : "active";
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',${postable},'${status}','SAR',${sk ? `'${sk}'` : "NULL"})`,
    );
  }
  // A cashbox mapping a-cashmapped, and a bank account mapping a-bankmapped, so
  // both read as cash/bank-mapped.
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,currency,status) VALUES ('cb1','CB1','Petty','a-cashmapped','SAR','active')`,
  );
  await client.exec(
    `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,currency,status) VALUES ('ba1','BA1','Bank','a-bankmapped','SAR','active')`,
  );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}
async function mkSupplier(client: any, id: string, code: string | null, status = "active") {
  await client.exec(
    `INSERT INTO suppliers (id,name,status,supplier_code,currency,created_at,updated_at) VALUES ('${id}','${id}','${status}',${code ? `'${code}'` : "NULL"},'SAR','${now()}','${now()}')`,
  );
}
function inv(over: any = {}) {
  return {
    supplierId: over.supplierId ?? "sup1",
    supplierInvoiceNumber: over.supplierInvoiceNumber ?? "INV-777",
    invoiceDate: over.invoiceDate ?? "2026-03-10",
    dueDate: over.dueDate ?? null,
    currency: over.currency ?? "SAR",
    lines: over.lines ?? [{ accountId: "a-exp", quantity: 2, unitPrice: 100, taxRate: 15 }],
    ...over,
  };
}
async function lineId(client: any, entryId: string, acct: string, side: "debit" | "credit") {
  const r = (
    await client.query(
      `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id=$2 AND ${side} > 0 LIMIT 1`,
      [entryId, acct],
    )
  ).rows[0];
  return r?.id as string;
}

/**
 * Mirror the service's atomic post: recompute → Dr expense/asset per line, Dr
 * input VAT (aggregated) if tax>0, Cr AP (gross); then attribute the AP credit to
 * the supplier subledger. Returns entryId.
 */
async function postInvoiceEntry(
  db: any,
  computed: { lines: any[]; taxAmount: number; totalAmount: number },
  opts: { supplierId: string; sourceId: string; date?: string; status?: string },
) {
  return db.transaction(async (tx: any) => {
    const jLines: any[] = computed.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.lineSubtotal,
    }));
    if (computed.taxAmount > 0.005) {
      const vatId = await resolveSystemAccountId(tx, SYS.INPUT_VAT);
      jLines.push({ accountId: vatId, debit: computed.taxAmount });
    }
    const apId = await resolveSystemAccountId(tx, SYS.ACCOUNTS_PAYABLE);
    jLines.push({ accountId: apId, credit: computed.totalAmount });
    const entryId = await postBalancedEntry(tx, {
      date: opts.date ?? "2026-03-10",
      description: "supplier invoice",
      source: "supplier_invoice",
      sourceType: "supplier_invoice",
      sourceId: opts.sourceId,
      lines: jLines,
      userId: "u1",
      status: opts.status ?? "posted",
    });
    if ((opts.status ?? "posted") === "posted")
      await linkEntryApLine(tx, {
        supplierId: opts.supplierId,
        entryId,
        sourceType: "supplier_invoice",
      });
    return entryId;
  });
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/supplier-invoice.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/finance/supplier-invoices.ts"),
  "utf8",
);
const mig = readFileSync(resolve(process.cwd(), "drizzle/0022_supplier_invoices.sql"), "utf8");
const mig23 = readFileSync(
  resolve(process.cwd(), "drizzle/0023_input_vat_mapping_safety.sql"),
  "utf8",
);
const mapSvc = readFileSync(resolve(process.cwd(), "src/server/db/account-mapping.ts"), "utf8");
const seedSrc = readFileSync(resolve(process.cwd(), "scripts/seed.ts"), "utf8");

async function main() {
  // ===================== SI-A..I — validation =====================
  console.log("\nSI-A..I — invoice validation (server-authoritative)");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1", "S-1");
    await mkSupplier(client, "supX", "S-X", "inactive");

    const c = await validateInvoice(db, inv());
    ok(
      "SI-A: valid invoice recomputes totals (200 net + 30 vat = 230)",
      near(c.subtotal, 200) && near(c.taxAmount, 30) && near(c.totalAmount, 230),
    );
    ok(
      "SI-B: inactive supplier rejected",
      await throwsCode(() => validateInvoice(db, inv({ supplierId: "supX" })), "SUPPLIER_INACTIVE"),
    );
    ok(
      "SI-B: unknown supplier rejected",
      await throwsCode(
        () => validateInvoice(db, inv({ supplierId: "nope" })),
        "SUPPLIER_NOT_FOUND",
      ),
    );
    ok(
      "SI-C: missing supplier document number rejected",
      await throwsCode(
        () => validateInvoice(db, inv({ supplierInvoiceNumber: "  " })),
        "SUPPLIER_INVOICE_NUMBER_REQUIRED",
      ),
    );
    ok(
      "SI-D: no lines rejected",
      await throwsCode(() => validateInvoice(db, inv({ lines: [] })), "NO_LINES"),
    );
    ok(
      "SI-E: AP control account as a line rejected",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-ap", quantity: 1, unitPrice: 50 }] })),
        "DEBIT_IS_AP",
      ),
    );
    ok(
      "SI-E: input-VAT control account as a line rejected",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-vat", quantity: 1, unitPrice: 50 }] })),
        "DEBIT_IS_INPUT_VAT",
      ),
    );
    ok(
      "SI-F: cash/bank-mapped account as a line rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-cashmapped", quantity: 1, unitPrice: 50 }] }),
          ),
        "DEBIT_IS_CASH_BANK",
      ),
    );
    ok(
      "SI-G: non-postable parent account rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-parent", quantity: 1, unitPrice: 50 }] }),
          ),
        "DEBIT_ACCOUNT_NOT_POSTABLE",
      ),
    );
    ok(
      "SI-G: inactive account rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-inactive", quantity: 1, unitPrice: 50 }] }),
          ),
        "DEBIT_ACCOUNT_INACTIVE",
      ),
    );
    ok(
      "SI-H: a normal non-AP liability account is accepted (accrual clearing allowed)",
      near(
        (
          await validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-accrued", quantity: 1, unitPrice: 300, taxRate: 0 }] }),
          )
        ).totalAmount,
        300,
      ),
    );
    ok(
      "SI-H: asset account accepted as a debit line",
      near(
        (
          await validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-asset", quantity: 1, unitPrice: 400, taxRate: 0 }] }),
          )
        ).totalAmount,
        400,
      ),
    );
    ok(
      "SI-I: zero / negative quantity rejected",
      (await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-exp", quantity: 0, unitPrice: 50 }] })),
        "QTY_INVALID",
      )) &&
        (await throwsCode(
          () =>
            validateInvoice(
              db,
              inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 0 }] }),
            ),
          "PRICE_INVALID",
        )),
    );
    ok(
      "SI-I: due date before invoice date rejected",
      await throwsCode(
        () => validateInvoice(db, inv({ invoiceDate: "2026-03-10", dueDate: "2026-03-01" })),
        "DUE_BEFORE_INVOICE",
      ),
    );
  }

  // ===================== TAX-A..E — tax + Input VAT =====================
  console.log("\nTAX-A..E — tax computation + Input VAT account");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1", "S-1");
    const c1 = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 3, unitPrice: 100, taxRate: 15 }] }),
    );
    ok(
      "TAX-A: 3×100 @15% → net 300, vat 45, total 345",
      near(c1.subtotal, 300) && near(c1.taxAmount, 45) && near(c1.totalAmount, 345),
    );
    const c2 = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 1000, taxRate: 0 }] }),
    );
    ok(
      "TAX-B: zero-rated line → vat 0, total = net",
      near(c2.taxAmount, 0) && near(c2.totalAmount, 1000),
    );
    const c3 = await validateInvoice(
      db,
      inv({
        lines: [
          { accountId: "a-exp", quantity: 2, unitPrice: 100, taxRate: 15 }, // 200 + 30
          { accountId: "a-exp2", quantity: 1, unitPrice: 100, taxRate: 5 }, // 100 + 5
          { accountId: "a-asset", quantity: 1, unitPrice: 50, taxRate: 0 }, // 50 + 0
        ],
      }),
    );
    ok(
      "TAX-C: mixed rates aggregate (net 350, vat 35, total 385)",
      near(c3.subtotal, 350) && near(c3.taxAmount, 35) && near(c3.totalAmount, 385),
    );
    const c4 = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 3, unitPrice: 33.33, taxRate: 15 }] }),
    );
    // line_subtotal = round(99.99) = 99.99 ; tax = round(14.9985)=15.00 ; total 114.99
    ok(
      "TAX-D: halala rounding is exact and balanced (99.99 + 15.00 = 114.99)",
      near(c4.subtotal, 99.99) &&
        near(c4.taxAmount, 15.0) &&
        near(c4.totalAmount, 114.99) &&
        near(c4.subtotal + c4.taxAmount, c4.totalAmount),
    );
    // TAX-E: tax>0 but NO input-VAT account configured → rejected.
    const nv = await freshDb({ withVat: false });
    await mkSupplier(nv.client, "sup1", "S-1");
    ok(
      "TAX-E: tax>0 without Input VAT account → INPUT_VAT_ACCOUNT_MISSING",
      await throwsCode(
        () =>
          validateInvoice(
            nv.db,
            inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 100, taxRate: 15 }] }),
          ),
        "INPUT_VAT_ACCOUNT_MISSING",
      ),
    );
    ok(
      "TAX-E: zero-tax invoice still allowed without Input VAT account",
      near(
        (
          await validateInvoice(
            nv.db,
            inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 100, taxRate: 0 }] }),
          )
        ).totalAmount,
        100,
      ),
    );
  }

  // ===================== WF-A..H — governance state machine =====================
  console.log("\nWF-A..H — supplier-invoice workflow governance");
  {
    ok(
      "WF-A: DRAFT→submit allowed with submit perm",
      decide("draft", "submit", [P.supplierInvoiceSubmit]).ok,
    );
    ok(
      "WF-B: no direct DRAFT→post (illegal transition)",
      decide("draft", "post", [P.supplierInvoicePost]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-B: no direct SUBMITTED→post either",
      decide("submitted", "post", [P.supplierInvoicePost]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-C: approve blocked for the creator (maker≠checker)",
      decide("submitted", "approve", [P.supplierInvoiceApprove], {
        createdBy: "u1",
        currentUserId: "u1",
      }).code === "SELF_APPROVAL",
    );
    ok(
      "WF-C: approve allowed for a different approver",
      decide("submitted", "approve", [P.supplierInvoiceApprove], {
        createdBy: "u1",
        currentUserId: "u2",
      }).ok,
    );
    ok(
      "WF-D: submit without permission forbidden",
      decide("draft", "submit", [P.supplierInvoiceView]).code === "FORBIDDEN",
    );
    ok(
      "WF-E: return requires a reason",
      decide("submitted", "return", [P.supplierInvoiceReject], { reason: "" }).code ===
        "REASON_REQUIRED" &&
        decide("submitted", "return", [P.supplierInvoiceReject], { reason: "fix" }).ok,
    );
    ok(
      "WF-F: reject requires a reason and its own permission",
      decide("submitted", "reject", [P.supplierInvoiceReject], { reason: "bad" }).ok &&
        decide("submitted", "reject", [P.supplierInvoiceApprove], { reason: "bad" }).code ===
          "FORBIDDEN",
    );
    ok(
      "WF-G: APPROVED→post allowed with post perm",
      decide("approved", "post", [P.supplierInvoicePost]).ok,
    );
    ok(
      "WF-H: POSTED→reverse allowed with reason + reverse perm; no reverse from draft",
      decide("posted", "reverse", [P.supplierInvoiceReverse], { reason: "err" }).ok &&
        decide("draft", "reverse", [P.supplierInvoiceReverse], { reason: "err" }).code ===
          "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-H: reversal without reason blocked",
      decide("posted", "reverse", [P.supplierInvoiceReverse], { reason: "" }).code ===
        "REASON_REQUIRED",
    );
  }

  // ===================== POST-A..H — posting builds correct accrual =====================
  console.log("\nPOST-A..H — accrual posting (Dr exp/asset + Dr VAT / Cr AP)");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1", "S-1");
    const c = await validateInvoice(
      db,
      inv({
        lines: [
          { accountId: "a-exp", quantity: 2, unitPrice: 100, taxRate: 15 },
          { accountId: "a-asset", quantity: 1, unitPrice: 500, taxRate: 15 },
        ],
      }),
    ); // net 700, vat 105, total 805
    const e = await postInvoiceEntry(db, c, { supplierId: "sup1", sourceId: "SINV-1" });

    const dr = (
      await client.query(
        `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id=$1`,
        [e],
      )
    ).rows[0];
    ok(
      "POST-A: journal is balanced (debits == credits == 805)",
      near(Number(dr.d), 805) && near(Number(dr.c), 805),
    );

    const apBal = (await getAccountBalance(db, "a-ap", {})).closing;
    ok("POST-B: AP control credited by gross total (805)", near(apBal, 805));
    const vatBal = (await getAccountBalance(db, "a-vat", {})).closing;
    ok("POST-C: Input VAT (asset) debited by the tax (105)", near(vatBal, 105));
    const expBal = (await getAccountBalance(db, "a-exp", {})).closing;
    ok("POST-D: expense line debited by its NET (200, tax excluded)", near(expBal, 200));

    ok(
      "POST-E: supplier payable rises by gross total (AP credit attributed → 805)",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 805),
    );
    const rec = await apReconciliation(db);
    ok(
      "POST-E: AP GL == supplier subledger (reconciled, diff 0)",
      near(rec.difference, 0) && near(rec.subledgerTotal, 805),
    );

    // POST-F: zero-tax invoice creates NO VAT leg.
    const c0 = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 300, taxRate: 0 }] }),
    );
    const e0 = await postInvoiceEntry(db, c0, {
      supplierId: "sup1",
      sourceId: "SINV-0",
      date: "2026-04-01",
    });
    const vatLines = (
      await client.query(
        `SELECT count(*)::int n FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-vat'`,
        [e0],
      )
    ).rows[0].n;
    ok("POST-F: zero-tax invoice posts no Input VAT line", Number(vatLines) === 0);

    // POST-G: exactly one AP line per invoice journal, and it is the credit.
    const apLines = (
      await client.query(
        `SELECT debit, credit FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-ap'`,
        [e],
      )
    ).rows;
    ok(
      "POST-G: invoice journal has exactly one AP line, on the credit side",
      apLines.length === 1 &&
        near(Number(apLines[0].credit), 805) &&
        near(Number(apLines[0].debit), 0),
    );

    // POST-H: draft invoice does NOT affect GL/subledger.
    const cD = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 999, taxRate: 15 }] }),
    );
    await postInvoiceEntry(db, cD, {
      supplierId: "sup1",
      sourceId: "SINV-DRAFT",
      status: "draft",
      date: "2026-05-01",
    });
    ok(
      "POST-H: unposted (draft) invoice journal has no payable effect (still 805+300=1105)",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 1105),
    );
  }

  // ===================== IDEM-A..E — idempotency =====================
  console.log("\nIDEM-A..E — posting idempotency backstops");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1", "S-1");
    const c = await validateInvoice(db, inv());
    const e1 = await postInvoiceEntry(db, c, { supplierId: "sup1", sourceId: "SINV-9" });
    ok(
      "IDEM-A: existingSourceEntryId finds the posted invoice journal",
      (await db.transaction((tx: any) =>
        existingSourceEntryId(tx, "supplier_invoice", "SINV-9"),
      )) === e1,
    );
    let secondThrew = false;
    try {
      await postInvoiceEntry(db, c, { supplierId: "sup1", sourceId: "SINV-9", date: "2026-06-01" });
    } catch {
      secondThrew = true;
    }
    const dupCount = (
      await client.query(
        `SELECT count(*)::int n FROM journal_entries WHERE source_id='SINV-9' AND source_type='supplier_invoice'`,
      )
    ).rows[0].n;
    ok(
      "IDEM-B: a second journal for the same supplier_invoice source is rejected (partial unique index)",
      secondThrew && Number(dupCount) === 1,
    );
    ok(
      "IDEM-C: distinct source_id posts a separate journal (different invoice)",
      !!(await postInvoiceEntry(db, c, {
        supplierId: "sup1",
        sourceId: "SINV-10",
        date: "2026-06-02",
      })),
    );
    // IDEM-D: the partial index only scopes supplier_invoice — a same source_id under
    // a different source_type is untouched.
    const other = await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-06-03",
        description: "x",
        source: "manual",
        sourceType: "manual",
        sourceId: "SINV-9",
        lines: [
          { accountId: "a-exp", debit: 10 },
          { accountId: "a-counter", credit: 10 },
        ],
        userId: "u1",
        status: "posted",
      }),
    );
    ok("IDEM-D: same source_id with a different source_type is allowed", !!other);
    ok(
      "IDEM-E: re-linking the same AP credit line is rejected (no double subledger effect)",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            linkEntryApLine(tx, {
              supplierId: "sup1",
              entryId: e1,
              sourceType: "supplier_invoice",
            }),
          ),
        "LINE_ALREADY_LINKED",
      ),
    );
  }

  // ===================== REV-A..H — reversal nets the subledger =====================
  console.log("\nREV-A..H — reversal (mirror AP debit re-linked to same supplier)");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sup1", "S-1");
    const c = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 1000, taxRate: 15 }] }),
    ); // net 1000, vat 150, total 1150
    const e = await postInvoiceEntry(db, c, { supplierId: "sup1", sourceId: "SINV-R" });
    ok(
      "REV-A: posted payable is 1150",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 1150),
    );

    const revId = await db.transaction((tx: any) => reverseEntry(tx, e, "u1"));
    ok(
      "REV-B: reversal mirror exists and is posted (reversed_of set)",
      !!(
        await client.query(
          `SELECT id FROM journal_entries WHERE reversed_of=$1 AND status='posted'`,
          [e],
        )
      ).rows[0],
    );
    // REV-C (critical): WITHOUT linking the mirror AP debit, the subledger would NOT
    // net (certified [posted,reversed] keeps the reversed original counted).
    ok(
      "REV-C: before linking mirror, payable still 1150 (reversed original still counted)",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 1150),
    );
    await db.transaction((tx: any) =>
      linkEntryApLine(tx, {
        supplierId: "sup1",
        entryId: revId,
        sourceType: "supplier_invoice_reversal",
      }),
    );
    ok(
      "REV-C: after linking mirror AP debit, subledger nets to 0",
      near((await getSupplierBalance(db, "sup1")).payableBalance, 0),
    );
    const apBal = (await getAccountBalance(db, "a-ap", {})).closing;
    ok("REV-D: AP control account nets to 0", near(apBal, 0));
    const vatBal = (await getAccountBalance(db, "a-vat", {})).closing;
    ok("REV-E: Input VAT nets to 0", near(vatBal, 0));
    const rec = await apReconciliation(db);
    ok(
      "REV-F: reconciliation holds after reversal (diff 0, subledger 0)",
      near(rec.difference, 0) && near(rec.subledgerTotal, 0),
    );
    // REV-G: the mirror's AP line is a DEBIT, and it is the one linked.
    const apDebitLine = await lineId(client, revId, "a-ap", "debit");
    const linked = (
      await client.query(
        `SELECT count(*)::int n FROM supplier_journal_links WHERE journal_line_id=$1`,
        [apDebitLine],
      )
    ).rows[0].n;
    ok(
      "REV-G: the reversal mirror AP DEBIT line is the linked one",
      !!apDebitLine && Number(linked) === 1,
    );
    // REV-H: re-linking the mirror again is rejected (idempotent).
    ok(
      "REV-H: re-linking the mirror AP line again rejected",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            linkEntryApLine(tx, {
              supplierId: "sup1",
              entryId: revId,
              sourceType: "supplier_invoice_reversal",
            }),
          ),
        "LINE_ALREADY_LINKED",
      ),
    );
  }

  // ===================== PERM-A..F — granular permission separation =====================
  console.log("\nPERM-A..F — permission separation");
  {
    ok(
      "PERM-A: view does not imply create/post/approve/reverse",
      !grants([P.supplierInvoiceView], P.supplierInvoiceCreate) &&
        !grants([P.supplierInvoiceView], P.supplierInvoicePost) &&
        !grants([P.supplierInvoiceView], P.supplierInvoiceApprove) &&
        !grants([P.supplierInvoiceView], P.supplierInvoiceReverse),
    );
    ok(
      "PERM-B: create does not imply submit/approve/post",
      !grants([P.supplierInvoiceCreate], P.supplierInvoiceSubmit) &&
        !grants([P.supplierInvoiceCreate], P.supplierInvoiceApprove) &&
        !grants([P.supplierInvoiceCreate], P.supplierInvoicePost),
    );
    ok(
      "PERM-C: approve does not imply post (approval ≠ posting)",
      !grants([P.supplierInvoiceApprove], P.supplierInvoicePost),
    );
    ok(
      "PERM-D: post does not imply reverse (posting ≠ reversal)",
      !grants([P.supplierInvoicePost], P.supplierInvoiceReverse),
    );
    ok(
      "PERM-E: reads gated by finance.supplier_invoice.view; create checked inside; draft edit by update_draft",
      /authHandler\(P\.supplierInvoiceView, GET\)/.test(route) &&
        /authHandler\(P\.supplierInvoiceView, POST\)/.test(route) &&
        /hasPermission\([^)]*supplierInvoiceCreate\)/.test(route) &&
        /authHandler\(P\.supplierInvoiceUpdateDraft, PUT\)/.test(route),
    );
    ok(
      "PERM-F: supplier-invoice perms are separate from supplier-master and payment perms",
      P.supplierInvoicePost !== P.supplierInvoiceApprove &&
        P.supplierInvoicePost !== (P as any).supplierUpdate &&
        P.supplierInvoicePost !== (P as any).paymentPost,
    );
  }

  // ===================== AUD-A..E — orchestration guarantees (source) =====================
  console.log("\nAUD-A..E — orchestration & audit guarantees");
  {
    ok(
      "AUD-A: workflow decisions reuse evaluateTransition + SUPPLIER_INVOICE_TRANSITIONS (no bespoke matrix)",
      /evaluateTransition\(/.test(svc) &&
        /SUPPLIER_INVOICE_TRANSITIONS/.test(svc) &&
        !/from:\s*JournalStatus\./.test(svc),
    );
    ok(
      "AUD-B: workflow history recorded via recordWorkflowEvent with entityType supplier_invoice",
      /recordWorkflowEvent\(/.test(svc) && /entityType:\s*"supplier_invoice"/.test(svc),
    );
    ok(
      "AUD-C: posting attributes the AP credit AND reversal re-links the mirror to the same supplier",
      (svc.match(/linkEntryApLine\(/g) || []).length >= 2 &&
        /reverseEntry\(/.test(svc) &&
        /existingSourceEntryId\(tx as any, "supplier_invoice", id\)/.test(svc),
    );
    ok(
      "AUD-D: posting/reversal go through the certified GL engine; never writes suppliers.balance or raw journals",
      /postBalancedEntry\(/.test(svc) &&
        !/INSERT INTO journal/i.test(svc) &&
        !/\.update\(suppliers\)/.test(svc) &&
        !/balance:/.test(svc),
    );
    ok(
      "AUD-E: migration is additive/idempotent, scopes its journal source index, and seeds Input VAT by systemKey (no hardcoded posting account)",
      /CREATE TABLE IF NOT EXISTS "supplier_invoices"/.test(mig) &&
        /source_type' = 'supplier_invoice'|source_type" = 'supplier_invoice'/.test(mig) &&
        /system_key' = 'input_vat'|'input_vat'/.test(mig) &&
        /IF NOT EXISTS \(SELECT 1 FROM "accounts" WHERE "system_key" = 'input_vat'\)/.test(mig),
    );
  }

  // ===================== VAT-MAP-A..I — Input VAT mapping (3B.1) =====================
  console.log("\nVAT-MAP-A..I — explicit Input VAT account mapping");
  {
    // A: no mapping + zero-tax invoice → allowed.
    {
      const { db, client } = await freshDb({ withVat: false });
      await mkSupplier(client, "sup1", "S-1");
      ok(
        "VAT-MAP-A: no Input VAT mapping + zero-tax invoice → POST-eligible (validates)",
        near(
          (
            await validateInvoice(
              db,
              inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 100, taxRate: 0 }] }),
            )
          ).totalAmount,
          100,
        ),
      );
      // B: no mapping + taxable invoice → INPUT_VAT_ACCOUNT_MISSING, no journal.
      ok(
        "VAT-MAP-B: no Input VAT mapping + taxable invoice → INPUT_VAT_ACCOUNT_MISSING",
        await throwsCode(
          () =>
            validateInvoice(
              db,
              inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 100, taxRate: 15 }] }),
            ),
          "INPUT_VAT_ACCOUNT_MISSING",
        ),
      );
    }
    // C: map a valid asset account, then taxable invoice posts with VAT on that exact account.
    {
      const { db, client } = await freshDb({ withVat: false });
      await mkSupplier(client, "sup1", "S-1");
      await db.transaction((tx: any) => assignInputVatAccount(tx, { accountId: "a-vatcand" }));
      const mapping = await getInputVatMapping(db);
      const c = await validateInvoice(
        db,
        inv({ lines: [{ accountId: "a-exp", quantity: 1, unitPrice: 1000, taxRate: 15 }] }),
      );
      const e = await postInvoiceEntry(db, c, { supplierId: "sup1", sourceId: "SINV-VAT" });
      const vatLine = await lineId(client, e, "a-vatcand", "debit");
      ok(
        "VAT-MAP-C: mapped asset account → taxable posts, VAT debit uses exactly the mapped account id",
        mapping?.id === "a-vatcand" && !!vatLine && near(c.taxAmount, 150),
      );
    }
    // D: expense account rejected as Input VAT mapping.
    {
      const { db, client } = await freshDb({ withVat: false });
      await mkSupplier(client, "sup1", "S-1");
      ok(
        "VAT-MAP-D: mapping an Expense account rejected (must be asset)",
        await throwsCode(
          () => validateInputVatMappingAccount(db, "a-exp"),
          "MAPPING_CLASS_INVALID",
        ),
      );
      // E: liability account rejected.
      ok(
        "VAT-MAP-E: mapping a Liability account rejected (must be asset)",
        await throwsCode(
          () => validateInputVatMappingAccount(db, "a-accrued"),
          "MAPPING_CLASS_INVALID",
        ),
      );
      // F: parent/non-postable account rejected.
      ok(
        "VAT-MAP-F: mapping a parent/non-postable account rejected",
        await throwsCode(
          () => validateInputVatMappingAccount(db, "a-parent"),
          "ACCOUNT_NOT_POSTABLE",
        ),
      );
      // G: cashbox/bank-linked account rejected.
      ok(
        "VAT-MAP-G: mapping a Cashbox-linked account rejected",
        await throwsCode(
          () => validateInputVatMappingAccount(db, "a-cashmapped"),
          "MAPPING_IS_CASH_BANK",
        ),
      );
      ok(
        "VAT-MAP-G: mapping a Bank-linked account rejected",
        await throwsCode(
          () => validateInputVatMappingAccount(db, "a-bankmapped"),
          "MAPPING_IS_CASH_BANK",
        ),
      );
      ok(
        "VAT-MAP-G: mapping the AP control account rejected",
        await throwsCode(() => validateInputVatMappingAccount(db, "a-ap"), "MAPPING_IS_AP"),
      );
    }
    // H: changing the mapping is atomic — exactly one Input VAT mapping remains.
    {
      const { db, client } = await freshDb({ withVat: true }); // a-vat pre-mapped
      await mkSupplier(client, "sup1", "S-1");
      await db.transaction((tx: any) => assignInputVatAccount(tx, { accountId: "a-vatcand" }));
      const holders = (await client.query(`SELECT id FROM accounts WHERE system_key='input_vat'`))
        .rows;
      const mapping = await getInputVatMapping(db);
      ok(
        "VAT-MAP-H: reassigning is atomic — old cleared, exactly one mapping (a-vatcand)",
        holders.length === 1 && holders[0].id === "a-vatcand" && mapping?.id === "a-vatcand",
      );
      const pf = await inputVatPreflight(db);
      ok(
        "VAT-MAP-H: preflight reports single mapping + configured account",
        pf.duplicateMappingCount === 1 && pf.configured?.accountId === "a-vatcand",
      );
    }
    // I: posting service + seed carry no hardcoded VAT account code; 0023 clears the auto-map.
    ok(
      "VAT-MAP-I: supplier-invoice posting service contains no hardcoded 110306",
      !/110306/.test(svc),
    );
    ok(
      "VAT-MAP-I: mapping service resolves/sets by system_key (SYS.INPUT_VAT), never inserts a 110306 account",
      /SYS\.INPUT_VAT/.test(mapSvc) &&
        /systemKey/.test(mapSvc) &&
        !/INSERT INTO|\.insert\(/i.test(mapSvc),
    );
    ok(
      "VAT-MAP-I: seed no longer auto-assigns input_vat to a CoA code",
      !/"input_vat"/.test(seedSrc),
    );
    ok(
      "VAT-MAP-I: forward migration 0023 clears the 0022 auto-map (non-destructive)",
      /UPDATE "accounts"/.test(mig23) &&
        /"system_key" = NULL/.test(mig23) &&
        /"code" = '110306'/.test(mig23) &&
        /"system_key" = 'input_vat'/.test(mig23) &&
        !/DELETE|DROP/.test(mig23),
    );
  }

  // ===================== DEBIT-A..H — allocation account eligibility (3B.1) =====================
  console.log("\nDEBIT-A..H — supplier-invoice allocation account eligibility");
  {
    const { db, client } = await freshDb({ withVat: true });
    await mkSupplier(client, "sup1", "S-1");
    const allowed = async (acc: string) =>
      near(
        (
          await validateInvoice(
            db,
            inv({ lines: [{ accountId: acc, quantity: 1, unitPrice: 100, taxRate: 0 }] }),
          )
        ).totalAmount,
        100,
      );
    ok("DEBIT-A: active/postable Expense account allowed", await allowed("a-exp"));
    ok("DEBIT-B: active/postable Asset account allowed", await allowed("a-asset"));
    ok("DEBIT-C: normal (non-AP) Liability account allowed", await allowed("a-accrued"));
    ok(
      "DEBIT-D: AP control account rejected",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-ap", quantity: 1, unitPrice: 100 }] })),
        "DEBIT_IS_AP",
      ),
    );
    ok(
      "DEBIT-E: configured Input VAT account rejected as an allocation line",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-vat", quantity: 1, unitPrice: 100 }] }),
          ),
        "DEBIT_IS_INPUT_VAT",
      ),
    );
    ok(
      "DEBIT-F: Cashbox-linked account rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-cashmapped", quantity: 1, unitPrice: 100 }] }),
          ),
        "DEBIT_IS_CASH_BANK",
      ),
    );
    ok(
      "DEBIT-G: Bank-linked account rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-bankmapped", quantity: 1, unitPrice: 100 }] }),
          ),
        "DEBIT_IS_CASH_BANK",
      ),
    );
    ok(
      "DEBIT-H: parent/non-postable account rejected",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-parent", quantity: 1, unitPrice: 100 }] }),
          ),
        "DEBIT_ACCOUNT_NOT_POSTABLE",
      ),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
