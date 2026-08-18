/**
 * Phase 3A.2 — Supplier-payment INTENT idempotency tests.
 *
 * Mirrors the real paySupplier flow (event upsert → FOR UPDATE → payload-mismatch
 * guard → reuse-if-journaled → post source_id=payment id → link → set journal) on
 * a schema that INCLUDES the real 0011 source-unique index. The interactive
 * endpoint's "intent key required" contract is verified by source assertion.
 *
 * Covers INTENT-A..I. Run: node_modules/.bin/tsx scripts/test-phase-3a2.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { suppliers, supplierPayments } from "@/server/db/schema";
import { createSupplierApLink, linkSupplierPaymentApLine } from "@/server/db/supplier";
import {
  postBalancedEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  cashOrBankAccountId,
  SYS,
} from "@/server/db/gl";
import { now } from "@/server/db/index";
import { AppError } from "@/server/db/errors";

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
CREATE UNIQUE INDEX journal_entries_source_unique_idx ON journal_entries (source_type, source_id)
  WHERE status = 'posted' AND source_id IS NOT NULL
  AND source_type IN ('donation','aid','payroll','supplier_payment','inventory_issue','inventory_adjust','opening_balance');
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
CREATE TABLE supplier_payments (id text PRIMARY KEY, supplier_id text NOT NULL,
  amount double precision NOT NULL DEFAULT 0, payment_method text NOT NULL DEFAULT 'bank', reference text,
  payment_date text NOT NULL DEFAULT '', note text DEFAULT '', journal_entry_id text,
  status text NOT NULL DEFAULT 'pending', created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '', CONSTRAINT supplier_payments_journal_entry_unique UNIQUE(journal_entry_id));
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-ap", "210101", "AP suppliers", "liability", true, "accounts_payable"],
    ["a-bank", "1020", "Bank", "asset", true, "bank_main"],
    ["a-cash", "1010", "Cash", "asset", true, "cash"],
    ["a-exp", "5010", "Expense", "expense", true, null],
  ];
  for (const [id, code, name, cls, postable, sk] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',${postable},'active','SAR',${sk ? `'${sk}'` : "NULL"})`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  await client.exec(
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('A','Supplier A','active','SAR','${now()}','${now()}'),('B','Supplier B','active','SAR','${now()}','${now()}')`,
  );
  return { db, client };
}

async function seedInvoice(db: any, client: any, supplierId: string, amount: number) {
  const e = await db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date: "2026-02-01",
      description: "invoice",
      source: "manual",
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
}

/** MIRROR of paySupplier including the intent payload-mismatch guard. */
async function payIntent(
  db: any,
  input: {
    supplierId: string;
    amount: number;
    method?: "cash" | "bank";
    intent: string;
    reference?: string;
    date?: string;
  },
) {
  const method = input.method === "cash" ? "cash" : "bank";
  const paymentId = input.intent.startsWith("SPY-") ? input.intent : `SPY-${input.intent}`;
  const date = input.date ?? "2026-03-01";
  return db.transaction(async (tx: any) => {
    const sup = (
      await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1)
    )[0];
    if (!sup) throw new AppError("supplier", 404, "SUPPLIER_NOT_FOUND");
    await tx
      .insert(supplierPayments)
      .values({
        id: paymentId,
        supplierId: input.supplierId,
        amount: input.amount,
        paymentMethod: method,
        reference: input.reference ?? null,
        paymentDate: date,
        status: "pending",
        createdBy: "u1",
        createdAt: now(),
        updatedAt: now(),
      })
      .onConflictDoNothing();
    const pay = (
      await tx
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, paymentId))
        .for("update")
        .limit(1)
    )[0];
    const mismatch =
      pay.supplierId !== input.supplierId ||
      Math.abs(Number(pay.amount) - input.amount) > 0.005 ||
      pay.paymentMethod !== method ||
      (pay.paymentDate || "") !== date ||
      (pay.reference || "") !== (input.reference ?? "");
    if (mismatch) throw new AppError("mismatch", 409, "IDEMPOTENCY_PAYLOAD_MISMATCH");
    if (pay.journalEntryId) return { entryId: pay.journalEntryId, reused: true, paymentId };
    const already = await existingSourceEntryId(tx, "supplier_payment", paymentId);
    if (already) {
      await tx
        .update(supplierPayments)
        .set({ journalEntryId: already, status: "posted" })
        .where(eq(supplierPayments.id, paymentId));
      return { entryId: already, reused: true, paymentId };
    }
    const payable = await resolveSystemAccountId(tx, SYS.ACCOUNTS_PAYABLE);
    const cashBank = await cashOrBankAccountId(tx, method);
    const entryId = await postBalancedEntry(tx, {
      date,
      description: `pay ${paymentId}`,
      source: "purchase",
      sourceType: "supplier_payment",
      sourceId: paymentId,
      lines: [
        { accountId: payable, debit: input.amount },
        { accountId: cashBank, credit: input.amount },
      ],
      userId: "u1",
      status: "posted",
    });
    await linkSupplierPaymentApLine(tx, { supplierId: input.supplierId, entryId, userId: "u1" });
    await tx
      .update(supplierPayments)
      .set({ journalEntryId: entryId, status: "posted" })
      .where(eq(supplierPayments.id, paymentId));
    return { entryId, reused: false, paymentId };
  });
}
const countJournals = async (client: any, sourceId?: string) =>
  Number(
    (
      await client.query(
        sourceId
          ? `SELECT count(*)::int c FROM journal_entries WHERE source_type='supplier_payment' AND source_id='${sourceId}'`
          : `SELECT count(*)::int c FROM journal_entries WHERE source_type='supplier_payment'`,
      )
    ).rows[0].c,
  );
const countEvents = async (client: any) =>
  Number((await client.query(`SELECT count(*)::int c FROM supplier_payments`)).rows[0].c);
const countLinks = async (client: any) =>
  Number((await client.query(`SELECT count(*)::int c FROM supplier_journal_links`)).rows[0].c);

const svc = readFileSync(resolve(process.cwd(), "src/server/db/supplier.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/suppliers.ts"),
  "utf8",
);
const ui = readFileSync(
  resolve(process.cwd(), "src/routes/procurement.suppliers_.$id_.edit.tsx"),
  "utf8",
);

async function main() {
  console.log("\nINTENT-A..I — supplier payment intent idempotency");

  // INTENT-A — normal UI payment.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payIntent(db, { supplierId: "A", amount: 1000, intent: "IA" });
    ok(
      "INTENT-A: normal payment → 1 event, 1 journal, 1 AP link (excl. invoice link)",
      (await countEvents(client)) === 1 &&
        (await countJournals(client)) === 1 &&
        (await countLinks(client)) === 2,
    );
  }

  // INTENT-B — double click (same intent, twice immediately).
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payIntent(db, { supplierId: "A", amount: 1000, intent: "IB" });
    const second = await payIntent(db, { supplierId: "A", amount: 1000, intent: "IB" });
    ok(
      "INTENT-B: double click → 1 event, 1 journal, 1 effect (reused)",
      second.reused === true &&
        (await countEvents(client)) === 1 &&
        (await countJournals(client)) === 1,
    );
  }

  // INTENT-C — network retry (first posts, client retries same intent).
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const first = await payIntent(db, { supplierId: "A", amount: 1000, intent: "IC" });
    const retry = await payIntent(db, { supplierId: "A", amount: 1000, intent: "IC" });
    ok(
      "INTENT-C: network retry → reused, same journal, no second effect",
      retry.reused === true &&
        retry.entryId === first.entryId &&
        (await countJournals(client)) === 1,
    );
  }

  // INTENT-D — concurrent same intent.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const res = await Promise.allSettled([
      payIntent(db, { supplierId: "A", amount: 700, intent: "ID" }),
      payIntent(db, { supplierId: "A", amount: 700, intent: "ID" }),
    ]);
    const posted = res
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((v: any) => v && !v.reused).length;
    ok(
      "INTENT-D: concurrent same intent → exactly one accounting effect",
      (await countJournals(client, "SPY-ID")) === 1 && posted === 1,
      JSON.stringify(res.map((r) => r.status)),
    );
  }

  // INTENT-E — new legitimate payments (two intents).
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payIntent(db, { supplierId: "A", amount: 1000, intent: "IE1" });
    await payIntent(db, { supplierId: "A", amount: 500, intent: "IE2" });
    ok(
      "INTENT-E: two intents → 2 events, 2 journals, 2 AP links",
      (await countEvents(client)) === 2 &&
        (await countJournals(client)) === 2 &&
        (await countLinks(client)) === 3,
    );
  }

  // INTENT-F — same key, different amount.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payIntent(db, { supplierId: "A", amount: 1000, intent: "IF" });
    ok(
      "INTENT-F: same key + different amount → 409 IDEMPOTENCY_PAYLOAD_MISMATCH",
      await throwsCode(
        () => payIntent(db, { supplierId: "A", amount: 1500, intent: "IF" }),
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
      ),
    );
    ok("INTENT-F: no second journal", (await countJournals(client)) === 1);
  }

  // INTENT-G — same key, different supplier.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await seedInvoice(db, client, "B", 5000);
    await payIntent(db, { supplierId: "A", amount: 1000, intent: "IG" });
    ok(
      "INTENT-G: same key + different supplier → 409",
      await throwsCode(
        () => payIntent(db, { supplierId: "B", amount: 1000, intent: "IG" }),
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
      ),
    );
    ok("INTENT-G: no accounting effect on B", (await countJournals(client)) === 1);
  }

  // INTENT-H — missing intent id on the interactive endpoint (source contract).
  {
    ok(
      "INTENT-H: route requires paymentId → 400 PAYMENT_ID_REQUIRED",
      /PAYMENT_ID_REQUIRED/.test(route) && /if \(!b\.paymentId\)/.test(route),
    );
    ok(
      "INTENT-H: route does not silently mint an id in the pay branch",
      !/idempotencyKey: b\.paymentId \|\|/.test(route) &&
        /idempotencyKey: b\.paymentId/.test(route),
    );
    ok(
      "INTENT-H: intent key format-validated (bounded)",
      /min\(8\)[\s\S]*max\(128\)[\s\S]*regex/.test(route),
    );
    ok(
      "UI: stable intent id generated once per pay dialog, reset on success",
      /setPayIntentId\(crypto\.randomUUID\(\)\)/.test(ui) &&
        /paymentId: payIntentId/.test(ui) &&
        /setPayIntentId\(""\)/.test(ui),
    );
  }

  // INTENT-I — failed first attempt (closed period) then retry.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await client.exec(`UPDATE fiscal_periods SET status='closed' WHERE id='p'`);
    ok(
      "INTENT-I: first attempt fails on closed period (no journal, rolled back)",
      await throwsCode(
        () => payIntent(db, { supplierId: "A", amount: 1000, intent: "II" }),
        "الفترة",
      ),
    );
    ok(
      "INTENT-I: failed attempt left no event and no journal (atomic rollback)",
      (await countEvents(client)) === 0 && (await countJournals(client)) === 0,
    );
    await client.exec(`UPDATE fiscal_periods SET status='open' WHERE id='p'`);
    const r = await payIntent(db, { supplierId: "A", amount: 1000, intent: "II" });
    ok(
      "INTENT-I: retry same intent → one event, one journal, deterministic id",
      r.paymentId === "SPY-II" &&
        (await countEvents(client)) === 1 &&
        (await countJournals(client)) === 1,
    );

    // Item 9: an event that exists WITHOUT a journal resumes on the same event.
    const { db: db2, client: c2 } = await freshDb();
    await seedInvoice(db2, c2, "A", 5000);
    await c2.exec(
      `INSERT INTO supplier_payments (id,supplier_id,amount,payment_method,payment_date,status,created_at,updated_at) VALUES ('SPY-IX','A',1000,'bank','2026-03-01','pending','${now()}','${now()}')`,
    );
    const resume = await payIntent(db2, { supplierId: "A", amount: 1000, intent: "IX" });
    ok(
      "INTENT-I: pre-existing incomplete event resumes (no second event)",
      resume.reused === false && (await countEvents(c2)) === 1 && (await countJournals(c2)) === 1,
    );

    ok(
      "SRC: service guards payload mismatch (IDEMPOTENCY_PAYLOAD_MISMATCH)",
      /IDEMPOTENCY_PAYLOAD_MISMATCH/.test(svc),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
