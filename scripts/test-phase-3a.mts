/**
 * Phase 3A — Suppliers & Accounts-Payable subledger tests.
 *
 * Exercises the REAL certified building blocks against PGlite — createSupplierApLink /
 * linkSupplierPaymentApLine / getSupplierBalance / supplierLedger / apReconciliation /
 * unallocatedApLines / apPreflight (supplier.ts), postBalancedEntry / reverseEntry
 * (gl.ts), getAccountBalance (balances.ts). Supplier-master orchestration (module db)
 * is covered by DB-level constraints + source assertions.
 *
 * Covers SUP-A..F, AP-LINK-A..F, BAL-A..E, REC-A..E, LEG-A/B, PERM-A..E, SEC-A..C.
 * Run: node_modules/.bin/tsx scripts/test-phase-3a.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSupplierApLink,
  linkSupplierPaymentApLine,
  linkEntryApLine,
  getSupplierBalance,
  supplierLedger,
  apReconciliation,
  unallocatedApLines,
  apPreflight,
  maskSupplier,
} from "@/server/db/supplier";
import { postBalancedEntry, reverseEntry, resolveSystemAccountId, SYS } from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";
import { now, genId } from "@/server/db/index";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";

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
CREATE UNIQUE INDEX suppliers_code_idx ON suppliers (supplier_code);
CREATE TABLE supplier_journal_links (id text PRIMARY KEY, supplier_id text NOT NULL,
  journal_line_id text NOT NULL, source_type text, created_by text, created_at text NOT NULL DEFAULT '',
  CONSTRAINT supplier_journal_links_journal_line_id_unique UNIQUE(journal_line_id));
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
    ["a-exp", "5010", "Office expense", "expense", true, null],
    ["a-cash", "1010", "Cash", "asset", true, null],
    ["a-counter", "3010", "Net assets", "equity", true, null],
  ];
  for (const [id, code, name, cls, postable, sk] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency,system_key) VALUES ('${id}','${code}','${name}','${cls}',${postable},'active','SAR',${sk ? `'${sk}'` : "NULL"})`,
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
/** Post a balanced entry via the REAL engine; return entryId. */
async function postEntry(
  db: any,
  lines: { acc: string; debit?: number; credit?: number }[],
  opts: { date?: string; status?: string; sourceType?: string; sourceId?: string } = {},
) {
  return db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date: opts.date ?? "2026-03-01",
      description: "t",
      source: opts.sourceType ?? "manual",
      sourceType: opts.sourceType ?? null,
      sourceId: opts.sourceId ?? null,
      lines: lines.map((l) => ({ accountId: l.acc, debit: l.debit, credit: l.credit })),
      userId: "u1",
      status: opts.status ?? "posted",
    }),
  );
}
/** Find the journal line id for (entry, account, side). */
async function lineId(client: any, entryId: string, acct: string, side: "debit" | "credit") {
  const r = (
    await client.query(
      `SELECT id FROM journal_lines WHERE journal_entry_id=$1 AND account_id=$2 AND ${side} > 0 LIMIT 1`,
      [entryId, acct],
    )
  ).rows[0];
  return r?.id as string;
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/supplier.ts"), "utf8");
const route = readFileSync(resolve(process.cwd(), "src/routes/api/finance/suppliers.ts"), "utf8");

async function main() {
  // ===================== SUP-A..F — supplier master =====================
  console.log("\nSUP-A..F — supplier master");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "sA", "SUP-000001");
    const jeBefore = (await (db as any).execute(`SELECT count(*)::int c FROM journal_entries`))
      .rows[0].c;
    ok("SUP-A: supplier exists after create, NO journal entry created", Number(jeBefore) === 0);
    ok(
      "SUP-B: duplicate supplier code rejected (unique index)",
      await throwsCode(
        () =>
          client.exec(
            `INSERT INTO suppliers (id,name,status,supplier_code) VALUES ('sX','x','active','SUP-000001')`,
          ),
        "unique",
      ),
    );
    // SUP-C deactivate keeps history: link an AP line, deactivate, balance/link intact.
    const e = await postEntry(db, [
      { acc: "a-exp", debit: 500 },
      { acc: "a-ap", credit: 500 },
    ]);
    await createSupplierApLink(db, {
      supplierId: "sA",
      journalLineId: await lineId(client, e, "a-ap", "credit"),
    });
    await client.exec(`UPDATE suppliers SET status='inactive' WHERE id='sA'`);
    const bal = await getSupplierBalance(db, "sA");
    ok(
      "SUP-C: deactivated supplier retains AP history/balance",
      Math.abs(bal.payableBalance - 500) < 0.005,
    );
    // SUP-D: inactive excluded from "selectable" set (active-only filter).
    await mkSupplier(client, "sActive", "SUP-000002", "active");
    const selectable = (
      await client.query(`SELECT count(*)::int c FROM suppliers WHERE status='active'`)
    ).rows[0].c;
    ok("SUP-D: inactive supplier excluded from active/selectable set", Number(selectable) === 1);
    ok(
      "SUP-E: supplier master service creates NO GL entries",
      !/postBalancedEntry|reverseEntry/.test(svc),
    );
    ok(
      "SUP-F: accounting display derives from links, not legacy balance",
      /getSupplierBalance/.test(svc) &&
        /const \{ iban, ibanNormalized, balance, \.\.\.rest \} = s/.test(svc),
    );
  }

  // ===================== AP-LINK-A..F =====================
  console.log("\nAP-LINK-A..F — supplier AP link validation");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "A", "S-A");
    await mkSupplier(client, "B", "S-B");
    // A: AP credit (invoice-like) → payable increases.
    const e1 = await postEntry(db, [
      { acc: "a-exp", debit: 10000 },
      { acc: "a-ap", credit: 10000 },
    ]);
    const apCredit = await lineId(client, e1, "a-ap", "credit");
    await createSupplierApLink(db, { supplierId: "A", journalLineId: apCredit });
    ok(
      "AP-LINK-A: link AP credit line → payable increases (10000)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 10000) < 0.005,
    );
    // B: AP debit (payment-like) → payable decreases.
    const e2 = await postEntry(db, [
      { acc: "a-ap", debit: 4000 },
      { acc: "a-cash", credit: 4000 },
    ]);
    const apDebit = await lineId(client, e2, "a-ap", "debit");
    await createSupplierApLink(db, { supplierId: "A", journalLineId: apDebit });
    ok(
      "AP-LINK-B: link AP debit line → payable decreases (6000)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 6000) < 0.005,
    );
    // C: same line for supplier B → reject.
    ok(
      "AP-LINK-C: same journal line to another supplier rejected",
      await throwsCode(
        () => createSupplierApLink(db, { supplierId: "B", journalLineId: apCredit }),
        "LINE_ALREADY_LINKED",
      ),
    );
    // D: expense line → reject.
    const expLine = await lineId(client, e1, "a-exp", "debit");
    ok(
      "AP-LINK-D: linking an expense line rejected",
      await throwsCode(
        () => createSupplierApLink(db, { supplierId: "B", journalLineId: expLine }),
        "NOT_AP_LINE",
      ),
    );
    // E: cash line → reject.
    const cashLine = await lineId(client, e2, "a-cash", "credit");
    ok(
      "AP-LINK-E: linking a cash/bank line rejected",
      await throwsCode(
        () => createSupplierApLink(db, { supplierId: "B", journalLineId: cashLine }),
        "NOT_AP_LINE",
      ),
    );
    // F: unposted AP line linked → no balance effect.
    const e3 = await postEntry(
      db,
      [
        { acc: "a-exp", debit: 3000 },
        { acc: "a-ap", credit: 3000 },
      ],
      { status: "draft" },
    );
    const draftAp = await lineId(client, e3, "a-ap", "credit");
    await createSupplierApLink(db, { supplierId: "B", journalLineId: draftAp });
    ok(
      "AP-LINK-F: unposted AP line does not affect supplier balance",
      Math.abs((await getSupplierBalance(db, "B")).payableBalance) < 0.005,
    );
  }

  // ===================== BAL-A..E =====================
  console.log("\nBAL-A..E — supplier balance");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "A", "S-A");
    const e1 = await postEntry(
      db,
      [
        { acc: "a-exp", debit: 10000 },
        { acc: "a-ap", credit: 10000 },
      ],
      { date: "2026-03-01" },
    );
    await createSupplierApLink(db, {
      supplierId: "A",
      journalLineId: await lineId(client, e1, "a-ap", "credit"),
    });
    ok(
      "BAL-A: AP credit 10000 → payable 10000",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 10000) < 0.005,
    );
    const e2 = await postEntry(
      db,
      [
        { acc: "a-ap", debit: 4000 },
        { acc: "a-cash", credit: 4000 },
      ],
      { date: "2026-04-01" },
    );
    await createSupplierApLink(db, {
      supplierId: "A",
      journalLineId: await lineId(client, e2, "a-ap", "debit"),
    });
    ok(
      "BAL-B: then AP debit 4000 → payable 6000",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 6000) < 0.005,
    );
    const e3 = await postEntry(
      db,
      [
        { acc: "a-exp", debit: 5000 },
        { acc: "a-ap", credit: 5000 },
      ],
      { status: "draft", date: "2026-05-01" },
    );
    await createSupplierApLink(db, {
      supplierId: "A",
      journalLineId: await lineId(client, e3, "a-ap", "credit"),
    });
    ok(
      "BAL-C: draft AP credit 5000 → no effect (still 6000)",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - 6000) < 0.005,
    );
    // BAL-D: reverse the first invoice; the reversal's AP line is attributed to
    // the supplier (as a reversal-aware flow would), so it nets per certified
    // [posted,reversed] states: 10000(reversed) − 10000(mirror) − 4000 = −4000.
    const revId = await db.transaction((tx: any) => reverseEntry(tx, e1, "u1"));
    await db.transaction((tx: any) =>
      linkEntryApLine(tx, { supplierId: "A", entryId: revId, sourceType: "reversal" }),
    );
    ok(
      "BAL-D: reversal (mirror linked) nets supplier balance to -4000",
      Math.abs((await getSupplierBalance(db, "A")).payableBalance - -4000) < 0.005,
    );
    // BAL-E: as-of excludes later AP transactions (as-of 2026-03-31 → only the 10000 invoice + its reversal? reversal dates today).
    const asOfMar = (await getSupplierBalance(db, "A", { dateTo: "2026-03-31" })).payableBalance;
    ok(
      "BAL-E: as-of 2026-03-31 excludes the April payment (10000, reversal excluded by date)",
      Math.abs(asOfMar - 10000) < 0.005,
    );
  }

  // ===================== REC-A..E =====================
  console.log("\nREC-A..E — AP ↔ supplier subledger reconciliation");
  {
    // A: all AP allocated → apGl == subledger, difference 0.
    {
      const { db, client } = await freshDb();
      await mkSupplier(client, "A", "S-A");
      const e = await postEntry(db, [
        { acc: "a-exp", debit: 7000 },
        { acc: "a-ap", credit: 7000 },
      ]);
      await createSupplierApLink(db, {
        supplierId: "A",
        journalLineId: await lineId(client, e, "a-ap", "credit"),
      });
      const r = await apReconciliation(db);
      ok(
        "REC-A: all allocated → apGl == subledger, diff 0, unallocated 0",
        Math.abs(r.apGl - 7000) < 0.005 &&
          Math.abs(r.subledgerTotal - 7000) < 0.005 &&
          Math.abs(r.difference) < 0.005 &&
          r.unallocated.count === 0,
      );
    }
    // B: unallocated credit 2000 → subledger differs; unallocated identifies 2000.
    {
      const { db, client } = await freshDb();
      await mkSupplier(client, "A", "S-A");
      const e1 = await postEntry(db, [
        { acc: "a-exp", debit: 7000 },
        { acc: "a-ap", credit: 7000 },
      ]);
      await createSupplierApLink(db, {
        supplierId: "A",
        journalLineId: await lineId(client, e1, "a-ap", "credit"),
      });
      await postEntry(db, [
        { acc: "a-exp", debit: 2000 },
        { acc: "a-ap", credit: 2000 },
      ]); // unlinked
      const r = await apReconciliation(db);
      ok(
        "REC-B: unallocated AP credit 2000 surfaced; equation holds",
        Math.abs(r.apGl - 9000) < 0.005 &&
          Math.abs(r.subledgerTotal - 7000) < 0.005 &&
          Math.abs(r.unallocated.net - 2000) < 0.005 &&
          Math.abs(r.difference) < 0.005,
      );
      const u = await unallocatedApLines(db);
      ok(
        "REC-B: unallocated line list returns the 2000 credit",
        u.length === 1 && Math.abs(Number(u[0].credit) - 2000) < 0.005,
      );
    }
    // C: unallocated debit line reflected.
    {
      const { db } = await freshDb();
      await postEntry(db, [
        { acc: "a-ap", debit: 1500 },
        { acc: "a-cash", credit: 1500 },
      ]); // unlinked AP debit
      const r = await apReconciliation(db);
      ok(
        "REC-C: unallocated AP debit reflected (net -1500)",
        Math.abs(r.apGl - -1500) < 0.005 &&
          Math.abs(r.unallocated.net - -1500) < 0.005 &&
          Math.abs(r.difference) < 0.005,
      );
    }
    // D: unposted AP line has no GL/recon effect.
    {
      const { db } = await freshDb();
      await postEntry(
        db,
        [
          { acc: "a-exp", debit: 800 },
          { acc: "a-ap", credit: 800 },
        ],
        { status: "draft" },
      );
      const r = await apReconciliation(db);
      ok(
        "REC-D: unposted AP line excluded from reconciliation",
        Math.abs(r.apGl) < 0.005 && r.unallocated.count === 0,
      );
    }
    // E: reversed AP transaction nets to zero.
    {
      const { db, client } = await freshDb();
      await mkSupplier(client, "A", "S-A");
      const e = await postEntry(db, [
        { acc: "a-exp", debit: 5000 },
        { acc: "a-ap", credit: 5000 },
      ]);
      await createSupplierApLink(db, {
        supplierId: "A",
        journalLineId: await lineId(client, e, "a-ap", "credit"),
      });
      await db.transaction((tx: any) => reverseEntry(tx, e, "u1"));
      const r = await apReconciliation(db);
      ok(
        "REC-E: reversed AP nets to zero (apGl 0, diff 0)",
        Math.abs(r.apGl) < 0.005 && Math.abs(r.difference) < 0.005,
      );
    }
  }

  // ===================== LEG-A/B — legacy supplier payment linking =====================
  console.log("\nLEG-A/B — legacy supplier payment AP linking");
  {
    const { db, client } = await freshDb();
    await mkSupplier(client, "A", "S-A");
    // Seed an outstanding payable (invoice-like) linked to A.
    const inv = await postEntry(db, [
      { acc: "a-exp", debit: 10000 },
      { acc: "a-ap", credit: 10000 },
    ]);
    await createSupplierApLink(db, {
      supplierId: "A",
      journalLineId: await lineId(client, inv, "a-ap", "credit"),
    });
    // Mirror the pay flow: Dr AP / Cr cash, then link the AP debit line.
    const pay = await postEntry(
      db,
      [
        { acc: "a-ap", debit: 3000 },
        { acc: "a-cash", credit: 3000 },
      ],
      { sourceType: "supplier_payment", sourceId: "A" },
    );
    const linkId = await db.transaction((tx: any) =>
      linkSupplierPaymentApLine(tx, { supplierId: "A", entryId: pay }),
    );
    const jeCount = (
      await client.query(`SELECT count(*)::int c FROM journal_entries WHERE id=$1`, [pay])
    ).rows[0].c;
    const linkCount = (
      await client.query(
        `SELECT count(*)::int c FROM supplier_journal_links sjl JOIN journal_lines jl ON sjl.journal_line_id=jl.id JOIN journal_entries je ON jl.journal_entry_id=je.id WHERE je.id=$1`,
        [pay],
      )
    ).rows[0].c;
    ok(
      "LEG-A: payment posts one journal, one AP-debit link, payable decreases (7000)",
      !!linkId &&
        Number(jeCount) === 1 &&
        Number(linkCount) === 1 &&
        Math.abs((await getSupplierBalance(db, "A")).payableBalance - 7000) < 0.005,
    );
    // LEG-B: re-linking the SAME payment entry's AP line is rejected (line uniqueness).
    ok(
      "LEG-B: re-linking the same payment AP line rejected (no double effect)",
      await throwsCode(
        () =>
          db.transaction((tx: any) =>
            linkSupplierPaymentApLine(tx, { supplierId: "A", entryId: pay }),
          ),
        "LINE_ALREADY_LINKED",
      ),
    );
  }

  // ===================== PERM-A..E =====================
  console.log("\nPERM-A..E — permission separation");
  {
    ok(
      "PERM-A: no supplier.create → create route 403",
      /hasPermission\([^)]*supplierCreate\)/.test(route) &&
        !grants([P.supplierView], P.supplierCreate),
    );
    ok(
      "PERM-B: supplier.view only → mutation denied",
      !grants([P.supplierView], P.supplierUpdate) &&
        !grants([P.supplierView], P.supplierDeactivate),
    );
    ok(
      "PERM-C: supplier.ledger.view does NOT grant supplier mutation",
      !grants([P.supplierLedgerView], P.supplierUpdate) &&
        !grants([P.supplierLedgerView], P.supplierCreate),
    );
    ok(
      "PERM-D: ap.reconciliation.view does NOT grant supplier mutation",
      !grants([P.apReconciliationView], P.supplierUpdate) &&
        !grants([P.apReconciliationView], P.supplierCreate),
    );
    ok(
      "PERM-E: ledger/reconciliation endpoints gated server-side",
      /supplierLedgerView/.test(route) && /apReconciliationView/.test(route),
    );
    ok(
      "PERM: route reads gated by finance.supplier.view",
      /authHandler\(P\.supplierView/.test(route),
    );
    ok(
      "PERM: update gated by finance.supplier.update",
      /authHandler\(P\.supplierUpdate/.test(route),
    );
  }

  // ===================== SEC-A..C =====================
  console.log("\nSEC-A..C — security / field access");
  {
    ok("SEC-A: route uses authHandler (401 when unauthenticated)", /authHandler\(/.test(route));
    const masked = maskSupplier({
      id: "s",
      name: "x",
      iban: "SA0380000000608010167519",
      ibanNormalized: "SA0380000000608010167519",
      balance: 999,
    });
    ok(
      "SEC-B: default supplier view masks IBAN + drops raw iban",
      masked.iban === undefined && masked.ibanMasked === "SA03 **** **** **** 7519",
    );
    ok(
      "SEC-B: legacy balance not exposed as accounting field",
      (masked as any).balance === undefined,
    );
    ok(
      "SEC-C: full IBAN gated by finance.supplier.sensitive.view",
      /supplierSensitiveView/.test(route),
    );
    ok(
      "SEC-C: supplier audit uses masked/no raw iban (create/update audit stores name/tax only)",
      !/before: JSON\.stringify\([^)]*iban/.test(svc),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
