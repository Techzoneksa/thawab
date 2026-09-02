/**
 * Phase Sales-1 — Customers, AR subledger & Sales Invoices tests (PGlite).
 *
 * Exercises the REAL certified building blocks against PGlite — validateInvoice
 * (sales-invoice.ts), postBalancedEntry / reverseEntry / existingSourceEntryId /
 * resolveSystemAccountId (gl.ts), linkEntryArLine + getCustomerBalance +
 * arReconciliation (customer.ts), arAging / arAgingReconciliation (ar-aging.ts),
 * getAccountBalance (balances.ts), and evaluateTransition + SALES_INVOICE_TRANSITIONS.
 * The atomic post/reverse sequence is mirrored here in the SAME order the service
 * uses (revenue credits per line + AR debit; reversal re-links the mirror AR credit).
 *
 * Run: DATABASE_URL=postgres://dummy@127.0.0.1:5999/dummy \
 *      node_modules/.bin/tsx scripts/test-phase-sales1.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { journalLines } from "@/server/db/schema";
import { validateInvoice } from "@/server/db/sales-invoice";
import {
  linkEntryArLine,
  getCustomerBalance,
  arReconciliation,
  unallocatedArLines,
} from "@/server/db/customer";
import { arAging, arAgingReconciliation } from "@/server/db/ar-aging";
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
  SALES_INVOICE_TRANSITIONS,
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
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
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
  const t = findTransition(fromStatus, action, SALES_INVOICE_TRANSITIONS);
  const perm = t?.permission ?? null;
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: (p) => (perm ? p === perm && grants(perms, perm) : false),
    createdBy: opts.createdBy ?? "maker",
    currentUserId: opts.currentUserId ?? "checker",
    reason: opts.reason,
    transitions: SALES_INVOICE_TRANSITIONS,
  });
}

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
CREATE UNIQUE INDEX journal_entries_sales_invoice_source_idx ON journal_entries (source_id) WHERE source_type = 'sales_invoice';
CREATE TABLE journal_lines (id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '', debit double precision NOT NULL DEFAULT 0,
  credit double precision NOT NULL DEFAULT 0, fund text NOT NULL DEFAULT 'unrestricted',
  cost_center_id text, project_id text, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', closed_at text,
  closed_by_id text, closed_by_name text, reopened_at text, reopened_by_id text, reopened_by_name text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE customers (id text PRIMARY KEY, customer_code text, name text NOT NULL, legal_name text DEFAULT '',
  commercial_registration text, tax_number text DEFAULT '', phone text, email text, contact_person text DEFAULT '',
  address text DEFAULT '', building_no text DEFAULT '', street text DEFAULT '', district text DEFAULT '',
  city text DEFAULT '', postal_code text DEFAULT '', additional_no text DEFAULT '', currency text NOT NULL DEFAULT 'SAR',
  payment_terms_days integer, notes text DEFAULT '', status text NOT NULL DEFAULT 'active',
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE customer_journal_links (id text PRIMARY KEY, customer_id text NOT NULL,
  journal_line_id text NOT NULL, source_type text, created_by text, created_at text NOT NULL DEFAULT '',
  CONSTRAINT customer_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
CREATE TABLE sales_invoices (id text PRIMARY KEY, invoice_number text NOT NULL UNIQUE, customer_id text NOT NULL,
  invoice_date text NOT NULL DEFAULT '', due_date text, status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'SAR', subtotal double precision NOT NULL DEFAULT 0,
  tax_amount double precision NOT NULL DEFAULT 0, total_amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', project_id text, customer_reference text, description text DEFAULT '',
  notes text DEFAULT '', journal_entry_id text, created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text);
CREATE TABLE sales_invoice_lines (id text PRIMARY KEY, sales_invoice_id text NOT NULL, line_number int NOT NULL DEFAULT 1,
  description text DEFAULT '', account_id text NOT NULL, quantity double precision NOT NULL DEFAULT 1,
  unit_price double precision NOT NULL DEFAULT 0, line_subtotal double precision NOT NULL DEFAULT 0,
  tax_rate double precision NOT NULL DEFAULT 0, tax_amount double precision NOT NULL DEFAULT 0,
  line_total double precision NOT NULL DEFAULT 0, cost_center_id text, created_at text NOT NULL DEFAULT '');
CREATE TABLE customer_receipts (id text PRIMARY KEY, customer_id text NOT NULL, amount double precision NOT NULL DEFAULT 0,
  receipt_method text NOT NULL DEFAULT 'bank', reference text, receipt_date text NOT NULL DEFAULT '', note text DEFAULT '',
  journal_entry_id text, status text NOT NULL DEFAULT 'pending', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE customer_receipt_allocations (id text PRIMARY KEY, customer_receipt_id text NOT NULL,
  sales_invoice_id text NOT NULL, amount double precision NOT NULL, created_by text, created_at text NOT NULL DEFAULT '',
  updated_by text, updated_at text);
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs: any[] = [
    ["a-ar", "110307", "AR customers", "asset", true, "accounts_receivable"],
    ["a-rev", "4401", "Membership revenue", "revenue", true, null],
    ["a-rev2", "4402", "Events revenue", "revenue", true, null],
    ["a-cash", "110101", "Cash", "asset", true, "cash"],
    ["a-cashmapped", "110109", "Petty cash link", "asset", true, null],
    ["a-parent", "44", "Other revenue (header)", "revenue", false, null],
    ["a-inactive", "4499", "Old revenue", "revenue", true, null],
  ];
  for (const [id, code, name, cls, postable, sk] of accs) {
    const status = id === "a-inactive" ? "inactive" : "active";
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',${postable},'${status}','SAR',${sk ? `'${sk}'` : "NULL"})`,
    );
  }
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,currency,status) VALUES ('cb1','CB1','Petty','a-cashmapped','SAR','active')`,
  );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}
async function mkCustomer(client: any, id: string, code: string | null, status = "active") {
  await client.exec(
    `INSERT INTO customers (id,name,status,customer_code,currency,created_at,updated_at) VALUES ('${id}','${id}','${status}',${code ? `'${code}'` : "NULL"},'SAR','${now()}','${now()}')`,
  );
}
function inv(over: any = {}) {
  return {
    customerId: over.customerId ?? "cust1",
    invoiceDate: over.invoiceDate ?? "2026-03-10",
    dueDate: over.dueDate ?? null,
    currency: over.currency ?? "SAR",
    fund: over.fund ?? "unrestricted",
    lines: over.lines ?? [{ accountId: "a-rev", quantity: 2, unitPrice: 100 }],
    ...over,
  };
}

/** Mirror the service post sequence: Cr revenue per line + Dr AR (total), then link AR. */
async function postInvoice(db: any, input: any, sourceId: string, userId = "u1") {
  const computed = await validateInvoice(db, input);
  const arId = await resolveSystemAccountId(db, SYS.ACCOUNTS_RECEIVABLE);
  const jLines = computed.lines.map((l: any) => ({
    accountId: l.accountId,
    credit: l.lineSubtotal,
    description: l.description,
  }));
  jLines.push({ accountId: arId, debit: computed.totalAmount });
  const entryId = await postBalancedEntry(db, {
    date: input.invoiceDate,
    description: `Sales invoice ${sourceId}`,
    currency: input.currency,
    fund: input.fund,
    source: "sales_invoice",
    sourceType: "sales_invoice",
    sourceId,
    lines: jLines,
    userId,
    status: "posted",
  });
  await linkEntryArLine(db, {
    customerId: input.customerId,
    entryId,
    sourceType: "sales_invoice",
    userId,
  });
  return { entryId, computed };
}

async function run() {
  console.log("\n=== Phase Sales-1 — Customers, AR & Sales Invoices ===\n");

  // ---- Validation: customer ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    await mkCustomer(client, "custX", "CUST-9", "inactive");
    ok(
      "CUST-A customer not found → CUSTOMER_NOT_FOUND",
      await throwsCode(
        () => validateInvoice(db, inv({ customerId: "nope" })),
        "CUSTOMER_NOT_FOUND",
      ),
    );
    ok(
      "CUST-B inactive customer → CUSTOMER_INACTIVE",
      await throwsCode(
        () => validateInvoice(db, inv({ customerId: "custX" })),
        "CUSTOMER_INACTIVE",
      ),
    );
    ok(
      "CUST-C no lines → NO_LINES",
      await throwsCode(() => validateInvoice(db, inv({ lines: [] })), "NO_LINES"),
    );
    ok(
      "CUST-D due before invoice → DUE_BEFORE_INVOICE",
      await throwsCode(
        () => validateInvoice(db, inv({ dueDate: "2026-01-01", invoiceDate: "2026-03-10" })),
        "DUE_BEFORE_INVOICE",
      ),
    );
    ok(
      "CUST-E bad fund → FUND_INVALID",
      await throwsCode(() => validateInvoice(db, inv({ fund: "weird" })), "FUND_INVALID"),
    );
  }

  // ---- Validation: revenue line account ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    ok(
      "ACC-A missing account → REVENUE_ACCOUNT_REQUIRED",
      await throwsCode(
        () => validateInvoice(db, inv({ lines: [{ quantity: 1, unitPrice: 10 }] })),
        "REVENUE_ACCOUNT_REQUIRED",
      ),
    );
    ok(
      "ACC-B unknown account → REVENUE_ACCOUNT_NOT_FOUND",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "nope", quantity: 1, unitPrice: 10 }] })),
        "REVENUE_ACCOUNT_NOT_FOUND",
      ),
    );
    ok(
      "ACC-C inactive account → REVENUE_ACCOUNT_INACTIVE",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-inactive", quantity: 1, unitPrice: 10 }] }),
          ),
        "REVENUE_ACCOUNT_INACTIVE",
      ),
    );
    ok(
      "ACC-D parent account → REVENUE_ACCOUNT_NOT_POSTABLE",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-parent", quantity: 1, unitPrice: 10 }] }),
          ),
        "REVENUE_ACCOUNT_NOT_POSTABLE",
      ),
    );
    ok(
      "ACC-E AR control as line → LINE_IS_AR",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-ar", quantity: 1, unitPrice: 10 }] })),
        "LINE_IS_AR",
      ),
    );
    ok(
      "ACC-F cash/bank-mapped as line → LINE_IS_CASH_BANK",
      await throwsCode(
        () =>
          validateInvoice(
            db,
            inv({ lines: [{ accountId: "a-cashmapped", quantity: 1, unitPrice: 10 }] }),
          ),
        "LINE_IS_CASH_BANK",
      ),
    );
    ok(
      "ACC-G zero qty → QTY_INVALID",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-rev", quantity: 0, unitPrice: 10 }] })),
        "QTY_INVALID",
      ),
    );
    ok(
      "ACC-H zero price → PRICE_INVALID",
      await throwsCode(
        () =>
          validateInvoice(db, inv({ lines: [{ accountId: "a-rev", quantity: 1, unitPrice: 0 }] })),
        "PRICE_INVALID",
      ),
    );
  }

  // ---- Computation (no VAT: total == subtotal) ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    const c = await validateInvoice(
      db,
      inv({ lines: [{ accountId: "a-rev", quantity: 3, unitPrice: 33.33 }] }),
    );
    ok(
      "CALC-A line subtotal 3×33.33=99.99",
      near(c.lines[0].lineSubtotal, 99.99),
      String(c.lines[0].lineSubtotal),
    );
    ok("CALC-B line total == subtotal (no tax)", near(c.lines[0].lineTotal, 99.99));
    ok("CALC-C header total == subtotal", near(c.totalAmount, 99.99) && near(c.subtotal, 99.99));
    const c2 = await validateInvoice(
      db,
      inv({
        lines: [
          { accountId: "a-rev", quantity: 2, unitPrice: 100 },
          { accountId: "a-rev2", quantity: 1, unitPrice: 50 },
        ],
      }),
    );
    ok("CALC-D multi-line total 250", near(c2.totalAmount, 250));
  }

  // ---- Post: GL correctness + subledger ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    const { entryId, computed } = await postInvoice(
      db,
      inv({
        lines: [
          { accountId: "a-rev", quantity: 2, unitPrice: 100 },
          { accountId: "a-rev2", quantity: 1, unitPrice: 50 },
        ],
      }),
      "SINV-1",
    );
    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, entryId));
    const arId = await resolveSystemAccountId(db, SYS.ACCOUNTS_RECEIVABLE);
    const arLine = lines.find((l: any) => l.accountId === arId);
    const revLines = lines.filter((l: any) => l.accountId !== arId);
    ok("POST-A balanced total 250", near(computed.totalAmount, 250));
    ok(
      "POST-B AR debited full total",
      !!arLine && near(Number(arLine.debit), 250) && near(Number(arLine.credit), 0),
    );
    ok(
      "POST-C two revenue credit legs",
      revLines.length === 2 &&
        revLines.every((l: any) => Number(l.credit) > 0 && Number(l.debit) === 0),
    );
    ok(
      "POST-D revenue credits sum to total",
      near(
        revLines.reduce((s: number, l: any) => s + Number(l.credit), 0),
        250,
      ),
    );
    ok(
      "POST-E idempotency source recorded",
      !!(await existingSourceEntryId(db, "sales_invoice", "SINV-1")),
    );
    // Subledger: receivable = debit − credit (debit-natured)
    const bal = await getCustomerBalance(db, "cust1");
    ok(
      "POST-F customer receivable = 250 (debit-natured)",
      near(bal.receivableBalance, 250),
      String(bal.receivableBalance),
    );
    // Reconciliation
    const rec = await arReconciliation(db);
    ok("POST-G AR GL == subledger total", near(rec.arGl, 250) && near(rec.subledgerTotal, 250));
    ok("POST-H reconciliation difference 0", near(rec.difference, 0));
    ok("POST-I no unallocated AR lines", (await unallocatedArLines(db)).length === 0);
  }

  // ---- Reverse: nets receivable back to zero ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    const { entryId } = await postInvoice(
      db,
      inv({ lines: [{ accountId: "a-rev", quantity: 1, unitPrice: 400 }] }),
      "SINV-2",
    );
    const before = await getCustomerBalance(db, "cust1");
    const revId = await reverseEntry(db, entryId, "u1");
    await linkEntryArLine(db, {
      customerId: "cust1",
      entryId: revId,
      sourceType: "sales_invoice_reversal",
      userId: "u1",
    });
    const after = await getCustomerBalance(db, "cust1");
    ok("REV-A receivable was 400 before", near(before.receivableBalance, 400));
    ok(
      "REV-B receivable nets to 0 after reversal",
      near(after.receivableBalance, 0),
      String(after.receivableBalance),
    );
    const rec = await arReconciliation(db);
    ok("REV-C AR GL nets to 0", near(rec.arGl, 0) && near(rec.subledgerTotal, 0));
    const arId = await resolveSystemAccountId(db, SYS.ACCOUNTS_RECEIVABLE);
    ok("REV-D AR account balance 0", near((await getAccountBalance(db, arId, {})).closing, 0));
  }

  // ---- AR aging buckets ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    // Post a real invoice per bucket (aging derives outstanding from the posted AR
    // debit line), then reflect each as a posted sales_invoices row with its due date.
    const rows: [string, string, number][] = [
      ["si-cur", "2026-06-15", 100], // due after asOf → current
      ["si-30", "2026-05-20", 200], // ~26 days overdue
      ["si-60", "2026-04-20", 300], // ~56 days
      ["si-90", "2026-03-20", 400], // ~87 days
      ["si-old", "2026-01-10", 500], // >90
    ];
    for (const [id, due, amt] of rows) {
      const { entryId } = await postInvoice(
        db,
        inv({
          invoiceDate: "2026-01-01",
          lines: [{ accountId: "a-rev", quantity: 1, unitPrice: amt }],
        }),
        id,
      );
      await client.exec(
        `INSERT INTO sales_invoices (id,invoice_number,customer_id,invoice_date,due_date,status,total_amount,journal_entry_id,created_at,updated_at) VALUES ('${id}','${id}','cust1','2026-01-01','${due}','posted',${amt},'${entryId}','${now()}','${now()}')`,
      );
    }
    const aging = await arAging(db, { asOfDate: "2026-06-15" });
    ok("AGING-A total = 1500", near(aging.total, 1500), String(aging.total));
    ok(
      "AGING-B current bucket = 100",
      near(aging.buckets.current, 100),
      JSON.stringify(aging.buckets),
    );
    ok("AGING-C 1–30 bucket = 200", near(aging.buckets.d1_30, 200));
    ok("AGING-D 31–60 bucket = 300", near(aging.buckets.d31_60, 300));
    ok("AGING-E 61–90 bucket = 400", near(aging.buckets.d61_90, 400));
    ok("AGING-F 90+ bucket = 500", near(aging.buckets.d90plus, 500));
    ok(
      "AGING-G buckets sum to total",
      near(
        aging.buckets.current +
          aging.buckets.d1_30 +
          aging.buckets.d31_60 +
          aging.buckets.d61_90 +
          aging.buckets.d90plus,
        1500,
      ),
    );
  }

  // ---- Aging reconciliation to GL ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    const { entryId } = await postInvoice(
      db,
      inv({ lines: [{ accountId: "a-rev", quantity: 1, unitPrice: 600 }] }),
      "SINV-3",
    );
    // Reflect the posted invoice as a sales_invoices row so aging sees it.
    await client.exec(
      `INSERT INTO sales_invoices (id,invoice_number,customer_id,invoice_date,due_date,status,total_amount,journal_entry_id,created_at,updated_at) VALUES ('SINV-3','SV-3','cust1','2026-03-10','2026-04-10','posted',600,'${entryId}','${now()}','${now()}')`,
    );
    const recon = await arAgingReconciliation(db, {});
    ok(
      "RECON-A aging outstanding == AR GL",
      near(recon.agingOutstanding, 600) && near(recon.arGl, 600),
    );
    ok("RECON-B reconciliation difference 0", near(recon.difference, 0));
  }

  // ---- Workflow governance (evaluateTransition + SALES_INVOICE_TRANSITIONS) ----
  {
    ok("WF-A draft→submit with submit perm", decide("draft", "submit", [P.salesInvoiceSubmit]).ok);
    ok("WF-B draft→submit denied without perm", !decide("draft", "submit", []).ok);
    ok(
      "WF-C submitted→approve OK for different user",
      decide("submitted", "approve", [P.salesInvoiceApprove], {
        createdBy: "maker",
        currentUserId: "checker",
      }).ok,
    );
    ok(
      "WF-D maker cannot approve own (SELF_APPROVAL)",
      decide("submitted", "approve", [P.salesInvoiceApprove], {
        createdBy: "maker",
        currentUserId: "maker",
      }).code === "SELF_APPROVAL",
    );
    ok(
      "WF-E approve denied without perm",
      !decide("submitted", "approve", [], { currentUserId: "checker" }).ok,
    );
    ok(
      "WF-F reject requires reason (REASON_REQUIRED)",
      decide("submitted", "reject", [P.salesInvoiceReject], { reason: "" }).code ===
        "REASON_REQUIRED",
    );
    ok(
      "WF-G reject with reason OK",
      decide("submitted", "reject", [P.salesInvoiceReject], { reason: "bad" }).ok,
    );
    ok("WF-H approved→post with post perm", decide("approved", "post", [P.salesInvoicePost]).ok);
    ok(
      "WF-I posted→reverse with reason",
      decide("posted", "reverse", [P.salesInvoiceReverse], { reason: "correction" }).ok,
    );
    ok(
      "WF-J illegal draft→post (ILLEGAL_TRANSITION)",
      decide("draft", "post", [P.salesInvoicePost]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-K illegal draft→approve",
      decide("draft", "approve", [P.salesInvoiceApprove]).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-L cannot reverse a draft",
      decide("draft", "reverse", [P.salesInvoiceReverse], { reason: "x" }).code ===
        "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-M submitted→return to draft",
      decide("submitted", "return", [P.salesInvoiceReject], { reason: "fix" }).ok,
    );
  }

  // ---- Two customers, isolated subledgers ----
  {
    const { db, client } = await freshDb();
    await mkCustomer(client, "cust1", "CUST-1");
    await mkCustomer(client, "cust2", "CUST-2");
    await postInvoice(
      db,
      inv({ customerId: "cust1", lines: [{ accountId: "a-rev", quantity: 1, unitPrice: 100 }] }),
      "SINV-A",
    );
    await postInvoice(
      db,
      inv({ customerId: "cust2", lines: [{ accountId: "a-rev", quantity: 1, unitPrice: 250 }] }),
      "SINV-B",
    );
    const b1 = await getCustomerBalance(db, "cust1");
    const b2 = await getCustomerBalance(db, "cust2");
    ok("MULTI-A cust1 receivable 100", near(b1.receivableBalance, 100));
    ok("MULTI-B cust2 receivable 250", near(b2.receivableBalance, 250));
    const rec = await arReconciliation(db);
    ok(
      "MULTI-C AR GL == sum of both subledgers (350)",
      near(rec.arGl, 350) && near(rec.subledgerTotal, 350),
    );
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
