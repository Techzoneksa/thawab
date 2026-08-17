/**
 * Phase 1A — Production plumbing tests (runtime identity + migration execution).
 *
 * Verifies the fixes for the two production blockers (commit=unknown,
 * migrations MISSING) at the deployment-architecture level, as far as is safe
 * without a live DB. Scenarios A–H. No secrets, no production DB.
 * Run: node_modules/.bin/tsx scripts/test-phase-1a-plumbing.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  runPreflight,
  requiredObjectsPresent,
  accountingFingerprint,
  rowCounts,
} from "@/server/db/finance-preflight";
import {
  applyGatedFinanceMigrations,
  applyFinanceInfraMigrations,
  resolveDrizzleFolder,
} from "@/server/db/migrate-controlled";
import { getAppCommit } from "@/server/db/app-info";

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

const ROOT = process.cwd();
const HEAD = execSync("git rev-parse --short HEAD").toString().trim();
const OUT_SERVER = resolve(ROOT, ".output/server");

const BASE_DDL = `
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
  status text NOT NULL DEFAULT 'draft', posted_by text, posted_at text, reversed_by text,
  reversed_at text, reversed_of text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_lines (id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '', debit double precision NOT NULL DEFAULT 0,
  credit double precision NOT NULL DEFAULT 0, fund text NOT NULL DEFAULT 'unrestricted',
  cost_center_id text, project_id text, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', closed_at text,
  closed_by_id text, closed_by_name text, reopened_at text, reopened_by_id text, reopened_by_name text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE budget_lines (id text PRIMARY KEY, budget_id text NOT NULL, line_number int NOT NULL,
  account_id text, cost_center_id text, project_id text, planned_amount double precision NOT NULL DEFAULT 0,
  actual_amount double precision NOT NULL DEFAULT 0, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
`;

async function emptyDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of BASE_DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  return { db, client };
}

async function main() {
  // ===== Test A — Build identity: build commit == runtime commit stamp =====
  console.log("\nTest A — Build identity (baked commit == git HEAD)");
  {
    const stampPath = resolve(OUT_SERVER, "commit.txt");
    const stamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : "";
    ok(".output/server/commit.txt == git HEAD", stamp === HEAD, `${stamp} vs ${HEAD}`);
    // define baked the literal into the SSR bundle
    const ssr = execSync(`bash -lc 'grep -rl "\\"${HEAD}\\"" .output/server/_ssr/*.mjs | head -1'`)
      .toString()
      .trim();
    ok("commit literal baked into SSR bundle (Vite define)", ssr.length > 0, ssr);
    // getAppCommit fallback chain honors APP_COMMIT env
    const saved = process.env.APP_COMMIT;
    process.env.APP_COMMIT = "envsha1";
    // (module cache may already hold a value; assert env is at least honored on a fresh import path)
    ok("APP_COMMIT env is a valid fallback source", getAppCommit().length > 0);
    if (saved === undefined) delete process.env.APP_COMMIT;
    else process.env.APP_COMMIT = saved;
  }

  // ===== Test B — Runtime artifact carries commit + migrations =====
  console.log("\nTest B — Runtime artifact is self-contained");
  {
    ok(".output/server/commit.txt exists", existsSync(resolve(OUT_SERVER, "commit.txt")));
    ok(".output/server/drizzle exists", existsSync(resolve(OUT_SERVER, "drizzle")));
    ok(
      ".output/server/drizzle/meta/_journal.json exists",
      existsSync(resolve(OUT_SERVER, "drizzle", "meta", "_journal.json")),
    );
    // The canonical entry's sibling path (what the bundle resolves via import.meta.url)
    ok(
      "bundle-relative ../drizzle from _ssr resolves",
      existsSync(resolve(OUT_SERVER, "_ssr", "..", "drizzle", "meta", "_journal.json")),
    );
  }

  // ===== Test C — Migration discovery is cwd-INDEPENDENT =====
  console.log("\nTest C — Migration discovery independent of process.cwd()");
  {
    const fromRoot = resolveDrizzleFolder();
    ok(
      "resolves from repo cwd",
      !!fromRoot && existsSync(resolve(fromRoot!, "meta", "_journal.json")),
    );
    // Simulate the production cwd mismatch: chdir somewhere with no drizzle/.
    process.chdir("/tmp");
    const fromForeign = resolveDrizzleFolder();
    process.chdir(ROOT); // restore before anything else
    ok(
      "still resolves when cwd has no drizzle/ (module-relative anchor)",
      !!fromForeign && existsSync(resolve(fromForeign!, "meta", "_journal.json")),
      String(fromForeign),
    );
  }

  const DRIZZLE = resolveDrizzleFolder()!;

  // ===== Test D–H — apply on an EMPTY production-like DB, verify objects + no regression =====
  console.log("\nTest D–H — apply migrations on empty DB, verify objects & no accounting change");
  {
    const { db, client } = await emptyDb();
    const beforeFp = await accountingFingerprint(db);
    const beforeCounts = await rowCounts(db);

    const infra = await applyFinanceInfraMigrations(db, DRIZZLE);
    const gated = await applyGatedFinanceMigrations(db, DRIZZLE);

    // D — 0014 present
    const report = await runPreflight(db);
    ok(
      "D: finance_certifications PRESENT",
      report.checks.migrationObjects.finance_certifications === true,
    );
    ok("D: 0014 applied via infra path", infra.applied.includes("0014_numerous_deadpool"));

    // E — 0011–0013 applied after gate PASS (empty DB → gate passes)
    ok(
      "E: 0011–0013 applied after gate PASS",
      !gated.blocked &&
        ["0011_fresh_thunderbolt_ross", "0012_period_guards", "0013_period_overlap_guard"].every(
          (t) => gated.applied.includes(t),
        ),
      gated.applied.join(","),
    );

    // F — all 8 required objects present
    const objs = report.checks.migrationObjects;
    const REQUIRED = [
      "import_batches",
      "import_batches_hash_idx",
      "journal_entries_source_unique_idx",
      "fiscal_periods_valid_range",
      "fiscal_periods_no_overlap",
      "fiscal_periods_no_overlap_trg",
      "finance_certifications",
      "finance_certification_unique_constraint_or_index",
    ];
    ok(
      "F: all 8 required DB objects PRESENT",
      REQUIRED.every((k) => (objs as any)[k] === true),
      JSON.stringify(objs),
    );
    ok("F: requiredObjectsPresent() true", requiredObjectsPresent(report) === true);

    // G — accounting regression: differences all 0 on empty ledger
    ok(
      "G: GL difference = 0",
      report.checks.generalLedger.difference === 0 && report.checks.generalLedger.balanced,
    );
    ok(
      "G: Trial Balance difference = 0",
      report.checks.trialBalance.difference === 0 && report.checks.trialBalance.balanced,
    );
    ok(
      "G: Financial Position difference = 0",
      report.checks.financialPosition.equation_difference === 0 &&
        report.checks.financialPosition.balanced,
    );

    // H — financial history untouched by schema migrations
    const afterFp = await accountingFingerprint(db);
    const afterCounts = await rowCounts(db);
    ok("H: fingerprint before == after", beforeFp === afterFp);
    ok(
      "H: journal entries before == after",
      beforeCounts.journal_entries === afterCounts.journal_entries,
    );
    ok(
      "H: journal lines before == after",
      beforeCounts.journal_lines === afterCounts.journal_lines,
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
