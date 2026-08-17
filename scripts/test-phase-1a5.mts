/**
 * Phase 1A.5 — Automatic Production Certification tests (PGlite, isolated).
 *
 * Exercises the real certification engine (finance-preflight.ts +
 * migrate-controlled.ts) against an in-memory Postgres. No production DB, no
 * secrets. Run: node_modules/.bin/tsx scripts/test-phase-1a5.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { resolve } from "node:path";
import {
  runPreflight,
  determineStatus,
  buildSnapshot,
  accountingFingerprint,
  rowCounts,
  type CertHistory,
} from "@/server/db/finance-preflight";
import { applyGatedFinanceMigrations } from "@/server/db/migrate-controlled";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const BASE_DDL = `
CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL DEFAULT '');
CREATE TABLE accounts (
  id text PRIMARY KEY, code text NOT NULL, name text NOT NULL,
  classification text NOT NULL, level int NOT NULL DEFAULT 1, parent_id text,
  system_key text, currency text NOT NULL DEFAULT 'SAR',
  balance double precision NOT NULL DEFAULT 0, postable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active', description text DEFAULT '', notes text DEFAULT '',
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_entries (
  id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR',
  period_id text, project_id text, source text NOT NULL DEFAULT 'manual',
  source_type text, source_id text, status text NOT NULL DEFAULT 'draft',
  posted_by text, posted_at text, reversed_by text, reversed_at text, reversed_of text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_lines (
  id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '',
  debit double precision NOT NULL DEFAULT 0, credit double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', cost_center_id text, project_id text,
  notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (
  id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open',
  closed_at text, closed_by_id text, closed_by_name text, reopened_at text,
  reopened_by_id text, reopened_by_name text, notes text DEFAULT '',
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE budget_lines (
  id text PRIMARY KEY, budget_id text NOT NULL, line_number int NOT NULL,
  account_id text, cost_center_id text, project_id text,
  planned_amount double precision NOT NULL DEFAULT 0,
  actual_amount double precision NOT NULL DEFAULT 0,
  notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const stmt of BASE_DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await client.exec(stmt);
  }
  return { db, client };
}

async function seedAccounts(client: any) {
  const accs = [
    ["a-cash", "1010", "Cash", "asset"],
    ["a-bank", "1020", "Bank", "asset"],
    ["a-liab", "2010", "Payables", "liability"],
    ["a-eq", "3010", "Net Assets", "equity"],
    ["a-rev", "4010", "Donations", "revenue"],
    ["a-exp", "5010", "Aid Expense", "expense"],
  ];
  for (const [id, code, name, cls] of accs) {
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification) VALUES ('${id}','${code}','${name}','${cls}')`,
    );
  }
}

async function entry(
  client: any,
  id: string,
  number: string,
  status: string,
  lines: { acc: string; d: number; c: number }[],
  opts: { sourceType?: string; sourceId?: string; reversedOf?: string; date?: string } = {},
) {
  const st = opts.sourceType ? `'${opts.sourceType}'` : "NULL";
  const si = opts.sourceId ? `'${opts.sourceId}'` : "NULL";
  const ro = opts.reversedOf ? `'${opts.reversedOf}'` : "NULL";
  const date = opts.date ?? "2026-03-01";
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,status,source_type,source_id,reversed_of)
     VALUES ('${id}','${number}','${date}','${status}',${st},${si},${ro})`,
  );
  let n = 1;
  for (const l of lines) {
    await client.exec(
      `INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,debit,credit)
       VALUES ('${id}-l${n}','${id}',${n},'${l.acc}',${l.d},${l.c})`,
    );
    n++;
  }
}

/** Balanced clean production: revenue funded cash, aid paid from cash. */
async function seedClean(client: any) {
  await seedAccounts(client);
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status)
     VALUES ('p2026','FY2026','2026-01-01','2026-12-31','open')`,
  );
  // Donation 1000: Dr Cash 1000 / Cr Revenue 1000
  await entry(client, "je1", "JE-0001", "posted", [
    { acc: "a-cash", d: 1000, c: 0 },
    { acc: "a-rev", d: 0, c: 1000 },
  ], { sourceType: "donation", sourceId: "don-1" });
  // Aid 400: Dr Expense 400 / Cr Cash 400
  await entry(client, "je2", "JE-0002", "posted", [
    { acc: "a-exp", d: 400, c: 0 },
    { acc: "a-cash", d: 0, c: 400 },
  ], { sourceType: "aid", sourceId: "aid-1" });
}

const HISTORY_ZERO: CertHistory = {
  fingerprintBefore: "x",
  fingerprintAfter: "x",
  journalEntriesBefore: 2,
  journalEntriesAfter: 2,
  journalLinesBefore: 4,
  journalLinesAfter: 4,
};

const DRIZZLE = resolve(process.cwd(), "drizzle");

async function main() {
  // ---- TEST 6 (run first): clean but migration objects absent -> PENDING_MIGRATIONS
  console.log("\nTEST 6 — PASS but objects missing => PENDING_MIGRATIONS");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    const report = await runPreflight(db);
    ok("accounting PASS", report.overall === "PASS", `overall=${report.overall}`);
    ok("migrationReady true", report.migrationReady === true);
    ok(
      "status PENDING_MIGRATIONS",
      determineStatus(report) === "PENDING_MIGRATIONS",
      determineStatus(report),
    );
  }

  // ---- TEST 7: apply gated migrations => SUCCESS + fingerprint/counts unchanged
  console.log("\nTEST 7 — apply migrations => SUCCESS, accounting history unchanged");
  let readyDb: any;
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    const beforeFp = await accountingFingerprint(db);
    const beforeCounts = await rowCounts(db);
    const result = await applyGatedFinanceMigrations(db, DRIZZLE);
    ok("not blocked", result.blocked === false);
    ok(
      "applied 0011-0013",
      ["0011_fresh_thunderbolt_ross", "0012_period_guards", "0013_period_overlap_guard"].every(
        (t) => result.applied.includes(t),
      ),
      result.applied.join(","),
    );
    const afterFp = await accountingFingerprint(db);
    const afterCounts = await rowCounts(db);
    ok("fingerprint unchanged", beforeFp === afterFp && beforeFp.length > 0);
    ok(
      "journal counts unchanged",
      beforeCounts.journal_entries === afterCounts.journal_entries &&
        beforeCounts.journal_lines === afterCounts.journal_lines,
    );
    const report = await runPreflight(db);
    ok(
      "all migration objects present",
      Object.values(report.checks.migrationObjects).every(Boolean),
      JSON.stringify(report.checks.migrationObjects),
    );
    const status = determineStatus(report);
    ok("status PRODUCTION_READY after apply", status === "PRODUCTION_READY", status);
    const snap = buildSnapshot(report, {
      fingerprintBefore: beforeFp,
      fingerprintAfter: afterFp,
      journalEntriesBefore: beforeCounts.journal_entries,
      journalEntriesAfter: afterCounts.journal_entries,
      journalLinesBefore: beforeCounts.journal_lines,
      journalLinesAfter: afterCounts.journal_lines,
    });
    ok("snapshot migration 0011/0012/0013 true", snap.migrationIntegrity["0011"] && snap.migrationIntegrity["0012"] && snap.migrationIntegrity["0013"]);
    ok("snapshot history fingerprint_match", snap.historyIntegrity.fingerprint_match === true);
    readyDb = db;
  }

  // ---- TEST 1: clean + migrations applied => PRODUCTION_READY (reuse readyDb)
  console.log("\nTEST 1 — clean + migrated => PRODUCTION_READY");
  {
    const report = await runPreflight(readyDb);
    ok("status PRODUCTION_READY", determineStatus(report) === "PRODUCTION_READY");
    ok("GL balanced", report.checks.generalLedger.balanced === true);
    ok("TB balanced", report.checks.trialBalance.balanced === true);
    ok("Financial position balanced", report.checks.financialPosition.balanced === true);
  }

  // ---- TEST 2: GL imbalance => PRODUCTION_BLOCKED
  console.log("\nTEST 2 — GL imbalance => PRODUCTION_BLOCKED");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    // Unbalanced entry: debit 100, no matching credit.
    await entry(client, "jebad", "JE-9999", "posted", [{ acc: "a-cash", d: 100, c: 0 }]);
    const report = await runPreflight(db);
    ok("GL unbalanced", report.checks.generalLedger.balanced === false);
    ok("status PRODUCTION_BLOCKED", determineStatus(report) === "PRODUCTION_BLOCKED");
    ok("blocking issue present", report.blockingIssues.length > 0);
  }

  // ---- TEST 3: Trial Balance mismatch => PRODUCTION_BLOCKED
  console.log("\nTEST 3 — Trial Balance mismatch => PRODUCTION_BLOCKED");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    // One-sided credit with no debit anywhere -> TB debit != credit.
    await entry(client, "jetb", "JE-8888", "posted", [{ acc: "a-rev", d: 0, c: 250 }]);
    const report = await runPreflight(db);
    ok("TB unbalanced", report.checks.trialBalance.balanced === false);
    ok("status PRODUCTION_BLOCKED", determineStatus(report) === "PRODUCTION_BLOCKED");
  }

  // ---- TEST 4: fiscal-period overlap => PRODUCTION_BLOCKED
  console.log("\nTEST 4 — period overlap => PRODUCTION_BLOCKED");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    await client.exec(
      `INSERT INTO fiscal_periods (id,name,start_date,end_date,status)
       VALUES ('p2026b','FY2026-overlap','2026-06-01','2027-01-31','open')`,
    );
    const report = await runPreflight(db);
    ok("overlap detected", report.checks.fiscalPeriods.overlap_count > 0);
    ok("status PRODUCTION_BLOCKED", determineStatus(report) === "PRODUCTION_BLOCKED");
  }

  // ---- TEST 5: duplicate protected source => PRODUCTION_BLOCKED
  console.log("\nTEST 5 — duplicate accounting source => PRODUCTION_BLOCKED");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    // Second posted journal for the SAME donation source (don-1) — a duplicate.
    await entry(client, "jedup", "JE-7777", "posted", [
      { acc: "a-cash", d: 1000, c: 0 },
      { acc: "a-rev", d: 0, c: 1000 },
    ], { sourceType: "donation", sourceId: "don-1" });
    const report = await runPreflight(db);
    ok("duplicate detected", report.checks.duplicates.count > 0);
    ok("status PRODUCTION_BLOCKED", determineStatus(report) === "PRODUCTION_BLOCKED");
  }

  // ---- TEST 8: certification snapshot is immutable/deterministic + no PII keys
  console.log("\nTEST 8 — snapshot deterministic & PII-free");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    const r1 = await runPreflight(db);
    const r2 = await runPreflight(db);
    const s1 = JSON.stringify(buildSnapshot(r1, HISTORY_ZERO));
    const s2 = JSON.stringify(buildSnapshot(r2, HISTORY_ZERO));
    ok("snapshot deterministic across runs", s1 === s2);
    const forbidden = ["name", "description", "narration", "iban", "account_name", "file_name"];
    ok(
      "snapshot has no PII/narration keys",
      !forbidden.some((k) => s1.toLowerCase().includes(`"${k}"`)),
      forbidden.filter((k) => s1.toLowerCase().includes(`"${k}"`)).join(","),
    );
    ok("source of truth = GENERAL_LEDGER", JSON.parse(s1).legacyBalance.accounting_source_of_truth === "GENERAL_LEDGER");
  }

  // ---- TEST 9 & 10: authorization gate semantics (super-admin only)
  console.log("\nTEST 9/10 — authorization gate (super-admin '*' only)");
  {
    // Mirrors hasPermission()'s matching logic (see api-utils authHandler('*')).
    const matches = (perms: string[], permission: string) => {
      const [mod, action] = permission.split(".");
      return (
        perms.includes("*") ||
        perms.includes(permission) ||
        perms.includes(`${mod}.*`) ||
        (!!action && perms.includes(`*.${action}`))
      );
    };
    ok("super-admin ['*'] passes '*'", matches(["*"], "*") === true);
    ok(
      "finance user ['finance.view','finance.export'] denied '*'",
      matches(["finance.view", "finance.export"], "*") === false,
    );
    // Source-level: both handlers wired to authHandler('*').
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      resolve(process.cwd(), "src/routes/api/internal/finance/preflight.ts"),
      "utf8",
    );
    ok("GET gated by authHandler('*')", /GET:\s*authHandler\("\*",\s*GET\)/.test(src));
    ok("POST gated by authHandler('*')", /POST:\s*authHandler\("\*",\s*POST\)/.test(src));
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
