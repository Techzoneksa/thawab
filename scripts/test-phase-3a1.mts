/**
 * Phase 3A.1 — Supplier payment identity & AP-link idempotency tests.
 *
 * Exercises the REAL certified building blocks against PGlite — the paySupplier
 * transaction flow is mirrored here in the SAME order the service uses (event
 * upsert → FOR UPDATE → reuse-if-journaled → postBalancedEntry with
 * source_id=payment id → linkSupplierPaymentApLine → set journal_entry_id), on a
 * schema that INCLUDES the real 0011 source-unique index. Source assertions lock
 * down that the service uses source_id = payment id (not supplier id).
 *
 * Covers SPAY-A..H. Run: node_modules/.bin/tsx scripts/test-phase-3a1.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { suppliers, supplierPayments } from "@/server/db/schema";
import {
  createSupplierApLink,
  linkSupplierPaymentApLine,
  getSupplierBalance,
} from "@/server/db/supplier";
import {
  postBalancedEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  cashOrBankAccountId,
  SYS,
} from "@/server/db/gl";
import { now, genId } from "@/server/db/index";
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
-- The REAL Phase 1A (0011) source-uniqueness index — supplier_payment is protected.
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
    `INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES ('A','Supplier A','active','SAR','${now()}','${now()}')`,
  );
  return { db, client };
}

/** Seed an outstanding AP credit (invoice-like) linked to a supplier. */
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

/** MIRROR of paySupplier: idempotent event → post (source_id=payment id) → link. */
function paymentEventId(key?: string) {
  const k = (key ?? "").trim();
  if (!k) return genId("SPY");
  return k.startsWith("SPY-") ? k : `SPY-${k}`;
}
async function payTx(
  db: any,
  input: { supplierId: string; amount: number; method?: "cash" | "bank"; key?: string },
) {
  const method = input.method === "cash" ? "cash" : "bank";
  const paymentId = paymentEventId(input.key);
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
        paymentDate: "2026-03-01",
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
      date: "2026-03-01",
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
    await tx.execute(
      `UPDATE suppliers SET balance = balance - ${input.amount} WHERE id='${input.supplierId}'` as any,
    );
    return { entryId, reused: false, paymentId };
  });
}
async function countPaymentJournals(client: any, sourceId?: string) {
  const q = sourceId
    ? `SELECT count(*)::int c FROM journal_entries WHERE source_type='supplier_payment' AND source_id='${sourceId}'`
    : `SELECT count(*)::int c FROM journal_entries WHERE source_type='supplier_payment'`;
  return Number((await client.query(q)).rows[0].c);
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/supplier.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/procurement/suppliers.ts"),
  "utf8",
);

async function main() {
  console.log("\nSPAY-A..H — supplier payment identity & idempotency");

  // SPAY-A — first payment.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const r = await payTx(db, { supplierId: "A", amount: 1000, key: "P1" });
    const links = (
      await client.query(
        `SELECT count(*)::int c FROM supplier_journal_links sjl JOIN journal_lines jl ON sjl.journal_line_id=jl.id WHERE jl.journal_entry_id=$1`,
        [r.entryId],
      )
    ).rows[0].c;
    ok(
      "SPAY-A: first payment → 1 event, 1 journal, 1 AP link, payable 4000",
      (await countPaymentJournals(client)) === 1 &&
        Number(links) === 1 &&
        Math.abs((await getSupplierBalance(db, "A")).payableBalance - 4000) < 0.005,
    );
  }

  // SPAY-B — second legitimate payment, same supplier.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payTx(db, { supplierId: "A", amount: 1000, key: "P1" });
    await payTx(db, { supplierId: "A", amount: 500, key: "P2" });
    const events = (await client.query(`SELECT count(*)::int c FROM supplier_payments`)).rows[0].c;
    const links = (await client.query(`SELECT count(*)::int c FROM supplier_journal_links`)).rows[0]
      .c;
    ok(
      "SPAY-B: 2 distinct payments → 2 events, 2 journals, 2 AP links, no unique violation",
      Number(events) === 2 && (await countPaymentJournals(client)) === 2 && Number(links) === 3,
    );
    ok(
      "SPAY-B: payable 3500 after 1000+500",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 3500) < 0.005,
    );
  }

  // SPAY-C — retry same payment event.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payTx(db, { supplierId: "A", amount: 500, key: "P2" });
    const retry = await payTx(db, { supplierId: "A", amount: 500, key: "P2" });
    ok(
      "SPAY-C: retry same event → no second journal, reused",
      retry.reused === true && (await countPaymentJournals(client)) === 1,
    );
    ok(
      "SPAY-C: payable unchanged by retry (4500)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 4500) < 0.005,
    );
  }

  // SPAY-D — concurrent retry (same event).
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const res = await Promise.allSettled([
      payTx(db, { supplierId: "A", amount: 700, key: "PD" }),
      payTx(db, { supplierId: "A", amount: 700, key: "PD" }),
    ]);
    const settled = res
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean) as any[];
    const posted = settled.filter((s) => !s.reused).length;
    ok(
      "SPAY-D: concurrent retry → exactly one accounting effect",
      (await countPaymentJournals(client, "SPY-PD")) === 1 && posted === 1,
      JSON.stringify(res.map((r) => r.status)),
    );
    ok(
      "SPAY-D: payable reduced once (4300)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 4300) < 0.005,
    );
  }

  // SPAY-E — concurrent distinct payments.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const res = await Promise.allSettled([
      payTx(db, { supplierId: "A", amount: 300, key: "P3" }),
      payTx(db, { supplierId: "A", amount: 400, key: "P4" }),
    ]);
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    ok(
      "SPAY-E: concurrent distinct payments → both succeed, 2 journals",
      okCount === 2 && (await countPaymentJournals(client)) === 2,
    );
    ok(
      "SPAY-E: payable 4300 (5000 - 300 - 400)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 4300) < 0.005,
    );
  }

  // SPAY-F — supplier subledger derivation.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    await payTx(db, { supplierId: "A", amount: 1000, key: "P1" });
    await payTx(db, { supplierId: "A", amount: 500, key: "P2" });
    ok(
      "SPAY-F: payable 3500 derived entirely from linked AP lines",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 3500) < 0.005,
    );
  }

  // SPAY-G — source identity.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const r = await payTx(db, { supplierId: "A", amount: 900, key: "PG" });
    const entry = (
      await client.query(`SELECT source_type, source_id FROM journal_entries WHERE id=$1`, [
        r.entryId,
      ])
    ).rows[0];
    ok(
      "SPAY-G: source_type=supplier_payment, source_id=payment id (SPY-…), NOT supplierId",
      entry.source_type === "supplier_payment" &&
        entry.source_id === "SPY-PG" &&
        entry.source_id !== "A",
    );
    ok(
      "SPAY-G: service posts with source_id = payment id (not supplier id)",
      /sourceId: paymentId/.test(svc) && /NOT the supplier id/.test(svc),
    );
    ok(
      "SPAY-G: route delegates to idempotent paySupplier (no inline source_id: b.id)",
      /paySupplier\(ctx/.test(route) && !/sourceId: b\.id/.test(route),
    );
  }

  // SPAY-H — duplicate AP link.
  {
    const { db, client } = await freshDb();
    await seedInvoice(db, client, "A", 5000);
    const r = await payTx(db, { supplierId: "A", amount: 1000, key: "PH" });
    const apLine = (
      await client.query(
        `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id='a-ap' AND debit>0 LIMIT 1`,
        [r.entryId],
      )
    ).rows[0].id;
    ok(
      "SPAY-H: linking the same AP line twice rejected",
      await throwsCode(
        () => createSupplierApLink(db, { supplierId: "A", journalLineId: apLine }),
        "LINE_ALREADY_LINKED",
      ),
    );
  }

  // Extra — the 0011 index blocks a duplicate posted (supplier_payment, source_id).
  {
    const { client } = await freshDb();
    await client.exec(
      `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j1','J1','2026-03-01','purchase','supplier_payment','SPY-DUP','posted')`,
    );
    let e = "";
    try {
      await client.exec(
        `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j2','J2','2026-03-01','purchase','supplier_payment','SPY-DUP','posted')`,
      );
    } catch (err: any) {
      e = String(err?.message || err);
    }
    ok(
      "0011 index: duplicate posted (supplier_payment, source_id) rejected",
      /source_unique|unique/i.test(e),
      e,
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
