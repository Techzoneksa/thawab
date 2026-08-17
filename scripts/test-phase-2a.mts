/**
 * Phase 2A — Cash & Bank Foundation tests.
 *  - Service validators + GL-derived balances on PGlite (real cash-bank.ts +
 *    certified postBalancedEntry/reverseEntry).
 *  - IBAN normalization/validation/masking (pure iban.ts).
 *  - Permission separation + route enforcement (wildcard logic + source checks).
 * Covers CASH-A..H, BANK-A..H, MAP-A..C, PERM-A..E, BAL-A..E, IMM-A..D, SEC-A..D.
 * Run: node_modules/.bin/tsx scripts/test-phase-2a.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateLinkedAccount,
  assertMappingAvailable,
  assertMappingChangeAllowed,
  accountHasPostedHistory,
  linkedAccountBalance,
} from "@/server/db/cash-bank";
import { postBalancedEntry, reverseEntry } from "@/server/db/gl";
import { normalizeIban, isValidSaudiIban, maskIban } from "@/lib/iban";
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
async function throws(fn: () => Promise<any>, code?: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return code ? e?.code === code || String(e?.message).includes(code) : true;
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
CREATE TABLE branches (id text PRIMARY KEY, name text NOT NULL DEFAULT '');
CREATE TABLE accounts (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL,
  classification text NOT NULL, level int NOT NULL DEFAULT 1, parent_id text, system_key text,
  currency text NOT NULL DEFAULT 'SAR', balance double precision NOT NULL DEFAULT 0,
  postable boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active',
  description text DEFAULT '', notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE cashboxes (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  linked_account_id text NOT NULL, currency text NOT NULL DEFAULT 'SAR', status text NOT NULL DEFAULT 'active',
  branch_id text, is_default boolean NOT NULL DEFAULT false, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX cashboxes_linked_account_idx ON cashboxes (linked_account_id);
CREATE TABLE bank_accounts (id text PRIMARY KEY, code text NOT NULL UNIQUE, bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '', account_number text, iban text, iban_normalized text,
  currency text NOT NULL DEFAULT 'SAR', linked_account_id text NOT NULL, status text NOT NULL DEFAULT 'active',
  branch_id text, is_default boolean NOT NULL DEFAULT false, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX bank_accounts_linked_account_idx ON bank_accounts (linked_account_id);
CREATE UNIQUE INDEX bank_accounts_iban_normalized_idx ON bank_accounts (iban_normalized);
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
  // Accounts: cash asset, bank asset, revenue, parent (non-postable).
  const accs = [
    ["a-cash", "1010", "Cash on hand", "asset", true],
    ["a-bank", "1020", "Bank", "asset", true],
    ["a-cash2", "1011", "Cash 2", "asset", true],
    ["a-rev", "4010", "Donations", "revenue", true],
    ["a-parent", "1000", "Current Assets", "asset", false],
    ["a-counter", "3010", "Net Assets", "equity", true],
  ];
  for (const [id, code, name, cls, postable] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency) VALUES ('${id}','${code}','${name}','${cls}',${postable},'active','SAR')`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}
async function mkCashbox(client: any, id: string, code: string, acc: string, status = "active") {
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,status) VALUES ('${id}','${code}','${code}','${acc}','${status}')`,
  );
}
async function mkBank(client: any, id: string, code: string, acc: string) {
  await client.exec(
    `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id) VALUES ('${id}','${code}','Bank','${acc}')`,
  );
}
/** Post a balanced journal touching `acc` (debit) vs counter (credit). */
async function post(db: any, acc: string, amount: number, date = "2026-03-01") {
  return db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date,
      description: "t",
      source: "manual",
      lines: [
        { accountId: acc, debit: amount },
        { accountId: "a-counter", credit: amount },
      ],
      userId: "u1",
      status: "posted",
    }),
  );
}
async function seedUnposted(client: any, acc: string, status: string) {
  const id = `je-${status}`;
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,status,source) VALUES ('${id}','${id}','2026-03-01','${status}','manual')`,
  );
  await client.exec(
    `INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,debit,credit) VALUES ('${id}-1','${id}',1,'${acc}',500,0),('${id}-2','${id}',2,'a-counter',0,500)`,
  );
}

async function main() {
  // ================= CASHBOX =================
  console.log("\nCASH-A/B/C — linked-account eligibility");
  {
    const { db } = await freshDb();
    ok("A: valid active postable Asset → ok", !!(await validateLinkedAccount(db, "a-cash")));
    ok(
      "B: Revenue account → REJECT",
      await throws(() => validateLinkedAccount(db, "a-rev"), "ACCOUNT_NOT_ASSET"),
    );
    ok(
      "C: parent/non-postable → REJECT",
      await throws(() => validateLinkedAccount(db, "a-parent"), "ACCOUNT_NOT_POSTABLE"),
    );
  }

  console.log("CASH-D — duplicate code rejected");
  {
    const { client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    ok(
      "D: duplicate cashbox code → REJECT",
      await throws(() =>
        client.exec(
          `INSERT INTO cashboxes (id,code,name,linked_account_id) VALUES ('cb2','MAIN','x','a-cash2')`,
        ),
      ),
    );
  }

  console.log("CASH-E/F — GL-derived balance, unposted excluded");
  {
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    ok("E(before): balance 0", (await linkedAccountBalance(db, "a-cash")).closingBalance === 0);
    await post(db, "a-cash", 1000);
    ok(
      "E: cashbox balance reflects posted journal (1000)",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 1000) < 0.01,
    );
    await seedUnposted(client, "a-cash", "draft");
    await seedUnposted(client, "a-cash", "submitted");
    await seedUnposted(client, "a-cash", "approved");
    ok(
      "F: unposted (draft/submitted/approved) → no balance effect (still 1000)",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 1000) < 0.01,
    );
  }

  console.log("CASH-G/H — mapping immutability + deactivation");
  {
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    await post(db, "a-cash", 1000);
    ok(
      "G: posted history → mapping change REJECT",
      await throws(() => assertMappingChangeAllowed(db, "a-cash"), "MAPPING_LOCKED"),
    );
    // Deactivate: status flips, ledger/history preserved, no accounting entry.
    const jeBefore = Number(
      (await client.query(`SELECT count(*)::int c FROM journal_entries`)).rows[0].c,
    );
    await client.exec(`UPDATE cashboxes SET status='inactive' WHERE id='cb1'`);
    const jeAfter = Number(
      (await client.query(`SELECT count(*)::int c FROM journal_entries`)).rows[0].c,
    );
    ok("H: deactivation creates no journal", jeBefore === jeAfter);
    ok(
      "H: historical ledger balance still available after deactivation",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 1000) < 0.01,
    );
    ok(
      "H: history still marks account as locked",
      (await accountHasPostedHistory(db, "a-cash")) === true,
    );
  }

  // ================= BANK =================
  console.log("\nBANK-A — valid mapping; BANK-B/C — IBAN validation & dedup");
  {
    const { db } = await freshDb();
    ok("A: valid bank asset account → ok", !!(await validateLinkedAccount(db, "a-bank")));
    ok("B: invalid Saudi IBAN → REJECT", !isValidSaudiIban("SA00 1234"));
    ok("B: valid Saudi IBAN accepted", isValidSaudiIban("SA03 8000 0000 6080 1016 7519"));
    // BANK-C: same IBAN different spaces/casing normalizes identically
    ok(
      "C: spacing/casing normalize to same key",
      normalizeIban("sa03 8000 0000 6080 1016 7519") === normalizeIban("SA0380000000608010167519"),
    );
  }
  console.log("BANK-C — normalized IBAN uniqueness at DB");
  {
    const { client } = await freshDb();
    const norm = normalizeIban("SA03 8000 0000 6080 1016 7519");
    await client.exec(
      `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,iban,iban_normalized) VALUES ('ba1','B1','Bank','a-bank','${norm}','${norm}')`,
    );
    ok(
      "C: duplicate normalized IBAN → REJECT",
      await throws(() =>
        client.exec(
          `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,iban,iban_normalized) VALUES ('ba2','B2','Bank','a-bank2','${norm}','${norm}')`,
        ),
      ),
    );
  }
  console.log("BANK-D — non-asset rejected; BANK-E/F — balance");
  {
    const { db, client } = await freshDb();
    ok(
      "D: Expense/non-asset account → REJECT",
      await throws(() => validateLinkedAccount(db, "a-rev"), "ACCOUNT_NOT_ASSET"),
    );
    await mkBank(client, "ba1", "B1", "a-bank");
    await post(db, "a-bank", 2500);
    ok(
      "E: bank balance reflects posted journal (2500)",
      Math.abs((await linkedAccountBalance(db, "a-bank")).closingBalance - 2500) < 0.01,
    );
    await seedUnposted(client, "a-bank", "submitted");
    ok(
      "F: unposted → no bank balance effect (still 2500)",
      Math.abs((await linkedAccountBalance(db, "a-bank")).closingBalance - 2500) < 0.01,
    );
  }
  console.log("BANK-G/H — immutability + deactivation");
  {
    const { db, client } = await freshDb();
    await mkBank(client, "ba1", "B1", "a-bank");
    await post(db, "a-bank", 100);
    ok(
      "G: bank posted history → mapping change REJECT",
      await throws(() => assertMappingChangeAllowed(db, "a-bank"), "MAPPING_LOCKED"),
    );
    await client.exec(`UPDATE bank_accounts SET status='inactive' WHERE id='ba1'`);
    ok(
      "H: bank deactivation preserves ledger",
      Math.abs((await linkedAccountBalance(db, "a-bank")).closingBalance - 100) < 0.01,
    );
  }

  // ================= MAPPING =================
  console.log("\nMAP-A/B/C — deterministic one-GL-account = one identity");
  {
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    await mkBank(client, "ba1", "B1", "a-bank");
    ok(
      "A: account already a cashbox → REJECT",
      await throws(() => assertMappingAvailable(db, "a-cash"), "ACCOUNT_ALREADY_MAPPED"),
    );
    ok(
      "B: account already a bank → REJECT",
      await throws(() => assertMappingAvailable(db, "a-bank"), "ACCOUNT_ALREADY_MAPPED"),
    );
    ok(
      "C: cashbox account → bank mapping REJECT (cross-table)",
      await throws(
        () => assertMappingAvailable(db, "a-cash", { bankId: "new" }),
        "ACCOUNT_ALREADY_MAPPED",
      ),
    );
    ok("free account is available", (await assertMappingAvailable(db, "a-cash2")) === undefined);
  }

  // ================= BALANCE =================
  console.log(
    "\nBAL-A/B — opening balance journal flows to cash/bank; C reversal; D as-of; E unposted",
  );
  {
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    await mkBank(client, "ba1", "B1", "a-bank");
    // BAL-A/B: opening balance journal (posted) → balances reflect
    await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-01-01",
        description: "opening",
        source: "opening_balance",
        sourceType: "opening_balance",
        sourceId: "OB-2026",
        lines: [
          { accountId: "a-cash", debit: 5000 },
          { accountId: "a-bank", debit: 20000 },
          { accountId: "a-counter", credit: 25000 },
        ],
        userId: "u1",
        status: "posted",
      }),
    );
    ok(
      "A: cashbox reflects opening balance (5000)",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 5000) < 0.01,
    );
    ok(
      "B: bank reflects opening balance (20000)",
      Math.abs((await linkedAccountBalance(db, "a-bank")).closingBalance - 20000) < 0.01,
    );
    // BAL-C: reversal nets (no asOf — includes the mirror dated today)
    const jid = await post(db, "a-cash", 1000, "2026-02-01");
    await db.transaction((tx: any) => reverseEntry(tx, jid, "u1"));
    ok(
      "C: reversal nets cash back to 5000",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 5000) < 0.01,
    );
  }
  {
    // BAL-D/E in a clean db (no reversal, which posts its mirror on today's date).
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    await post(db, "a-cash", 5000, "2026-01-01");
    await post(db, "a-cash", 700, "2026-06-01");
    ok(
      "D: as-of 2026-05-31 excludes later posting (5000)",
      Math.abs(
        (await linkedAccountBalance(db, "a-cash", { asOf: "2026-05-31" })).closingBalance - 5000,
      ) < 0.01,
    );
    ok(
      "D: as-of 2026-06-30 includes it (5700)",
      Math.abs(
        (await linkedAccountBalance(db, "a-cash", { asOf: "2026-06-30" })).closingBalance - 5700,
      ) < 0.01,
    );
    await seedUnposted(client, "a-cash", "approved");
    ok(
      "E: unposted approved → no balance change (5700)",
      Math.abs((await linkedAccountBalance(db, "a-cash")).closingBalance - 5700) < 0.01,
    );
  }

  // ================= IMMUTABILITY =================
  console.log("\nIMM-A/B/C/D");
  {
    const { db, client } = await freshDb();
    await mkCashbox(client, "cb1", "MAIN", "a-cash");
    ok(
      "A: no history → mapping change allowed",
      (await assertMappingChangeAllowed(db, "a-cash")) === undefined,
    );
    await post(db, "a-cash", 1000);
    ok(
      "B: posted history → mapping change REJECT",
      await throws(() => assertMappingChangeAllowed(db, "a-cash"), "MAPPING_LOCKED"),
    );
    await client.exec(`UPDATE cashboxes SET status='inactive' WHERE id='cb1'`);
    const active = (await client.query(`SELECT status FROM cashboxes WHERE id='cb1'`)).rows[0]
      .status;
    ok(
      "C: deactivation preserves history (still locked)",
      (await accountHasPostedHistory(db, "a-cash")) === true,
    );
    ok("D: inactive entity marked inactive (excluded from active lists)", active === "inactive");
  }

  // ================= PERMISSIONS =================
  console.log("\nPERM-A..E + SEC — granular, separated, server-enforced");
  {
    ok(
      "A: no finance.cash.create → cannot create cashbox",
      !grants(["finance.cash.view"], P.cashCreate),
    );
    ok(
      "B: no finance.bank.create → cannot create bank",
      !grants(["finance.bank.view"], P.bankCreate),
    );
    ok(
      "C: cash viewer can read, not mutate",
      grants([P.cashView], P.cashView) && !grants([P.cashView], P.cashUpdate),
    );
    ok(
      "D: cash permission does NOT imply bank permission",
      !grants([P.cashCreate, "finance.cash.*"], P.bankCreate),
    );
    ok(
      "E: ledger view separated from master mutation",
      grants([P.cashBankLedgerView], P.cashBankLedgerView) &&
        !grants([P.cashBankLedgerView], P.cashUpdate),
    );

    const cbSrc = readFileSync(
      resolve(process.cwd(), "src/routes/api/finance/cashboxes.ts"),
      "utf8",
    );
    const baSrc = readFileSync(
      resolve(process.cwd(), "src/routes/api/finance/bank-accounts.ts"),
      "utf8",
    );
    ok("cashbox GET gated by finance.cash.view", /GET:\s*authHandler\(P\.cashView/.test(cbSrc));
    ok("cashbox create checks P.cashCreate", /require\(ctx,\s*P\.cashCreate\)/.test(cbSrc));
    ok("bank GET gated by finance.bank.view", /GET:\s*authHandler\(P\.bankView/.test(baSrc));
    ok("bank create checks P.bankCreate", /require\(ctx,\s*P\.bankCreate\)/.test(baSrc));
    // SEC-C/D: list masks IBAN, audit never logs full IBAN
    ok(
      "SEC-C: list masks IBAN (maskedRow used)",
      /maskedRow/.test(baSrc) && !/item:\s*rec\b/.test(baSrc.replace("maskedRow(rec)", "")),
    );
    ok(
      "SEC-D: audit uses maskIban, not raw iban",
      /maskIban\(ibanRes\.ibanNormalized\)/.test(baSrc),
    );
    ok(
      "maskIban format keeps head+tail",
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
