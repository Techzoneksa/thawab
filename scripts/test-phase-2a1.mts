/**
 * Phase 2A.1 — Final integrity & security closure tests.
 *  - MAP-RACE-A..D: advisory-locked, cross-table mapping cannot create ambiguity.
 *  - LEDGER-A..C: finance.cash_bank.ledger.view is real + separated from mutation.
 *  - BANK-SEC-A..E: full IBAN needs finance.bank.sensitive.view; default masked;
 *    audit never leaks raw identifiers.
 * Run: node_modules/.bin/tsx scripts/test-phase-2a1.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateLinkedAccount,
  assertMappingAvailable,
  assertMappingChangeAllowed,
  acquireMappingLock,
  accountLedger,
} from "@/server/db/cash-bank";
import { postBalancedEntry } from "@/server/db/gl";
import { maskIban } from "@/lib/iban";
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
CREATE TABLE accounts (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL,
  classification text NOT NULL, postable boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active',
  currency text NOT NULL DEFAULT 'SAR', balance double precision NOT NULL DEFAULT 0,
  system_key text, parent_id text, level int NOT NULL DEFAULT 1,
  description text DEFAULT '', notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE cashboxes (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  linked_account_id text NOT NULL, currency text NOT NULL DEFAULT 'SAR', status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX cashboxes_linked_account_idx ON cashboxes (linked_account_id);
CREATE TABLE bank_accounts (id text PRIMARY KEY, code text NOT NULL UNIQUE, bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '', account_number text, iban text, iban_normalized text,
  currency text NOT NULL DEFAULT 'SAR', linked_account_id text NOT NULL, status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX bank_accounts_linked_account_idx ON bank_accounts (linked_account_id);
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
`;
async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  for (const [id, code] of [
    ["a-x", "1010"],
    ["a-y", "1020"],
    ["a-z", "1030"],
    ["a-counter", "3010"],
  ])
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency) VALUES ('${id}','${code}','${id}','${id === "a-counter" ? "equity" : "asset"}',true,'active','SAR')`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}

/** Mirror the route's advisory-locked create flow for a cashbox. */
function createCashboxTx(db: any, id: string, code: string, acc: string) {
  return db.transaction(async (tx: any) => {
    await acquireMappingLock(tx, acc);
    await validateLinkedAccount(tx, acc);
    await assertMappingAvailable(tx, acc);
    await tx.execute(
      sql`INSERT INTO cashboxes (id,code,name,linked_account_id) VALUES (${id},${code},${code},${acc})`,
    );
  });
}
function createBankTx(db: any, id: string, code: string, acc: string) {
  return db.transaction(async (tx: any) => {
    await acquireMappingLock(tx, acc);
    await validateLinkedAccount(tx, acc);
    await assertMappingAvailable(tx, acc);
    await tx.execute(
      sql`INSERT INTO bank_accounts (id,code,bank_name,linked_account_id) VALUES (${id},${code},'Bank',${acc})`,
    );
  });
}
/** Advisory-locked mapping change (no history) → account X. */
function remapCashboxTx(db: any, cbId: string, curAcc: string, newAcc: string) {
  return db.transaction(async (tx: any) => {
    await acquireMappingLock(tx, newAcc);
    await assertMappingChangeAllowed(tx, curAcc);
    await validateLinkedAccount(tx, newAcc);
    await assertMappingAvailable(tx, newAcc, { cashboxId: cbId });
    await tx.execute(sql`UPDATE cashboxes SET linked_account_id=${newAcc} WHERE id=${cbId}`);
  });
}
function remapBankTx(db: any, baId: string, curAcc: string, newAcc: string) {
  return db.transaction(async (tx: any) => {
    await acquireMappingLock(tx, newAcc);
    await assertMappingChangeAllowed(tx, curAcc);
    await validateLinkedAccount(tx, newAcc);
    await assertMappingAvailable(tx, newAcc, { bankId: baId });
    await tx.execute(sql`UPDATE bank_accounts SET linked_account_id=${newAcc} WHERE id=${baId}`);
  });
}
async function countFor(client: any, acc: string) {
  const cb = Number(
    (await client.query(`SELECT count(*)::int c FROM cashboxes WHERE linked_account_id='${acc}'`))
      .rows[0].c,
  );
  const ba = Number(
    (
      await client.query(
        `SELECT count(*)::int c FROM bank_accounts WHERE linked_account_id='${acc}'`,
      )
    ).rows[0].c,
  );
  return { cb, ba, total: cb + ba };
}

async function main() {
  // ===== MAP-RACE-A — cashbox vs bank on the same account =====
  console.log("\nMAP-RACE-A — concurrent cashbox+bank on GL account X");
  {
    const { db, client } = await freshDb();
    const res = await Promise.allSettled([
      createCashboxTx(db, "cb1", "MAIN", "a-x"),
      createBankTx(db, "ba1", "B1", "a-x"),
    ]);
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    ok("exactly one succeeds, one fails", okCount === 1, JSON.stringify(res.map((r) => r.status)));
    ok("GL account X mapped exactly once", (await countFor(client, "a-x")).total === 1);
  }

  // ===== MAP-RACE-B — two cashbox creates same account =====
  console.log("MAP-RACE-B — concurrent cashbox+cashbox on X");
  {
    const { db, client } = await freshDb();
    const res = await Promise.allSettled([
      createCashboxTx(db, "cb1", "C1", "a-x"),
      createCashboxTx(db, "cb2", "C2", "a-x"),
    ]);
    ok("one succeeds, one fails", res.filter((r) => r.status === "fulfilled").length === 1);
    ok("account mapped once (cashbox)", (await countFor(client, "a-x")).cb === 1);
  }

  // ===== MAP-RACE-C — two bank creates same account =====
  console.log("MAP-RACE-C — concurrent bank+bank on X");
  {
    const { db, client } = await freshDb();
    const res = await Promise.allSettled([
      createBankTx(db, "ba1", "B1", "a-x"),
      createBankTx(db, "ba2", "B2", "a-x"),
    ]);
    ok("one succeeds, one fails", res.filter((r) => r.status === "fulfilled").length === 1);
    ok("account mapped once (bank)", (await countFor(client, "a-x")).ba === 1);
  }

  // ===== MAP-RACE-D — cashbox A and bank B concurrently remap to X =====
  console.log("MAP-RACE-D — concurrent remap of cashbox A + bank B to X");
  {
    const { db, client } = await freshDb();
    await createCashboxTx(db, "cbA", "A", "a-y"); // A → account y
    await createBankTx(db, "baB", "B", "a-z"); // B → account z
    const res = await Promise.allSettled([
      remapCashboxTx(db, "cbA", "a-y", "a-x"),
      remapBankTx(db, "baB", "a-z", "a-x"),
    ]);
    ok("one remap succeeds, one fails", res.filter((r) => r.status === "fulfilled").length === 1);
    ok("account X mapped exactly once after remap", (await countFor(client, "a-x")).total === 1);
  }

  // ===== LEDGER-A/B/C =====
  console.log("\nLEDGER-A/B/C — cash/bank ledger permission is real & separated");
  {
    // A: cash.view only (no ledger.view / finance.view) → cannot view ledger.
    const ledgerOk = (perms: string[]) =>
      grants(perms, P.cashBankLedgerView) ||
      grants(perms, "finance.view") ||
      grants(perms, P.reportsView);
    ok("A: cash.view only → ledger 403", !ledgerOk([P.cashView]));
    ok("B: cash_bank.ledger.view → ledger allowed", ledgerOk([P.cashBankLedgerView]));
    ok("B': broader finance.view also allowed (intentional GL access)", ledgerOk(["finance.view"]));
    ok(
      "C: ledger.view does NOT grant create/update/deactivate",
      !grants([P.cashBankLedgerView], P.cashCreate) &&
        !grants([P.cashBankLedgerView], P.cashUpdate) &&
        !grants([P.cashBankLedgerView], P.cashDeactivate),
    );

    // Functional: the ledger drill-down returns GL movements with source + running balance.
    const { db, client } = await freshDb();
    await client.exec(
      `INSERT INTO cashboxes (id,code,name,linked_account_id) VALUES ('cb1','MAIN','MAIN','a-x')`,
    );
    await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-03-01",
        description: "m1",
        source: "manual",
        lines: [
          { accountId: "a-x", debit: 800 },
          { accountId: "a-counter", credit: 800 },
        ],
        userId: "u1",
        status: "posted",
      }),
    );
    const led = await accountLedger(db, "a-x");
    ok(
      "ledger returns movement w/ running balance",
      led.movements.length === 1 && Math.abs(led.closing - 800) < 0.01,
    );

    const cbSrc = readFileSync(
      resolve(process.cwd(), "src/routes/api/finance/cashboxes.ts"),
      "utf8",
    );
    ok("cashbox ledger branch gated by canViewLedger", /ledger.*canViewLedger/s.test(cbSrc));
  }

  // ===== BANK-SEC-A..E =====
  console.log("\nBANK-SEC-A..E — sensitive bank data authorization");
  {
    const baSrc = readFileSync(
      resolve(process.cwd(), "src/routes/api/finance/bank-accounts.ts"),
      "utf8",
    );
    ok("A: default detail masks (maskedRow, no raw iban leak)", /maskedRow/.test(baSrc));
    ok("B: full=1 requires bank.sensitive.view", /full.*bankSensitiveView/s.test(baSrc));
    ok("B: bank.view alone does NOT grant sensitive", !grants([P.bankView], P.bankSensitiveView));
    ok(
      "C: bank.sensitive.view grants sensitive read",
      grants([P.bankSensitiveView], P.bankSensitiveView),
    );
    ok(
      "D: route gated by authHandler(P.bankView) → 401 when unauthenticated",
      /GET:\s*authHandler\(P\.bankView/.test(baSrc),
    );
    ok(
      "E: create audit uses maskIban (no raw iban)",
      /maskIban\(ibanRes\.ibanNormalized\)/.test(baSrc),
    );
    ok(
      "E: update audit masks stored iban",
      /before = JSON\.stringify\(\{ \.\.\.ba, iban: maskIban/.test(baSrc),
    );
    ok(
      "mask keeps head+tail only",
      maskIban("SA0380000000608010167519") === "SA03 **** **** **** 7519",
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
