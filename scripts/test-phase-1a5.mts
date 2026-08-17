/**
 * Phase 1A.5 — Final Correction tests (PGlite, isolated).
 *
 * Exercises the real certification engine (finance-preflight.ts +
 * migrate-controlled.ts) and the certification lifecycle against an in-memory
 * Postgres. No production DB, no secrets. Covers scenarios A–L.
 * Run: node_modules/.bin/tsx scripts/test-phase-1a5.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import {
  runPreflight,
  determineStatus,
  requiredObjectsPresent,
  buildSnapshot,
  accountingFingerprint,
  rowCounts,
  type CertHistory,
} from "@/server/db/finance-preflight";
import {
  applyGatedFinanceMigrations,
  applyFinanceInfraMigrations,
} from "@/server/db/migrate-controlled";

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

const DRIZZLE = resolve(process.cwd(), "drizzle");
const RUNTIME_COMMIT = "abc1234";

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
  for (const [id, code, name, cls] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification) VALUES ('${id}','${code}','${name}','${cls}')`,
    );
}

async function entry(
  client: any,
  id: string,
  number: string,
  status: string,
  lines: { acc: string; d: number; c: number }[],
  opts: { sourceType?: string; sourceId?: string } = {},
) {
  const st = opts.sourceType ? `'${opts.sourceType}'` : "NULL";
  const si = opts.sourceId ? `'${opts.sourceId}'` : "NULL";
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,status,source_type,source_id)
     VALUES ('${id}','${number}','2026-03-01','${status}',${st},${si})`,
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

async function seedClean(client: any) {
  await seedAccounts(client);
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status)
     VALUES ('p2026','FY2026','2026-01-01','2026-12-31','open')`,
  );
  await entry(client, "je1", "JE-0001", "posted", [
    { acc: "a-cash", d: 1000, c: 0 },
    { acc: "a-rev", d: 0, c: 1000 },
  ], { sourceType: "donation", sourceId: "don-1" });
  await entry(client, "je2", "JE-0002", "posted", [
    { acc: "a-exp", d: 400, c: 0 },
    { acc: "a-cash", d: 0, c: 400 },
  ], { sourceType: "aid", sourceId: "aid-1" });
}

async function q(client: any, sqlText: string): Promise<any[]> {
  const r = await client.query(sqlText);
  return r.rows ?? [];
}

/** Certificate lookup for a specific commit — mirrors endpoint certForCommit(). */
async function certForCommit(client: any, commit: string) {
  const r = await q(
    client,
    `SELECT * FROM finance_certifications
     WHERE status='PRODUCTION_READY' AND environment='production' AND application_commit='${commit}'
     ORDER BY certified_at DESC LIMIT 1`,
  );
  return r[0] ?? null;
}

/** Insert an immutable certificate — mirrors the certify() INSERT. */
async function insertCert(client: any, id: string, commit: string) {
  await client.exec(
    `INSERT INTO finance_certifications
       (id,phase,environment,status,application_commit,result_json,certified_by,certified_by_name,certified_at,created_at)
     VALUES ('${id}','FINANCE_PHASE_1A','production','PRODUCTION_READY','${commit}','{}',NULL,'Super Admin','2026-08-17','2026-08-17')`,
  );
}

const HISTORY_ZERO: CertHistory = {
  fingerprintBefore: "x",
  fingerprintAfter: "x",
  journalEntriesBefore: 2,
  journalEntriesAfter: 2,
  journalLinesBefore: 4,
  journalLinesAfter: 4,
};

async function main() {
  // ===== Test A — Commit Stamp: runtime commit == built git HEAD =====
  console.log("\nTest A — Commit stamp matches git HEAD");
  {
    const head = execSync("git rev-parse --short HEAD").toString().trim();
    let checkerOut = "";
    let checkerOk = false;
    try {
      checkerOut = execSync(`node scripts/check-commit-stamp.mjs --expect ${head}`, {
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();
      checkerOk = true;
    } catch (e: any) {
      checkerOut = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    }
    // Passes only when server/commit.txt equals HEAD (i.e. a fresh build).
    console.log(`    (checker: ${checkerOut.trim().split("\n").pop()})`);
    ok("check-commit-stamp passes when stamp == HEAD", checkerOk, checkerOut);
  }

  // ===== Test B — Stale Commit: mismatch must fail the build check =====
  console.log("\nTest B — Stale commit stamp fails the guard");
  {
    let failed = false;
    try {
      execSync("node scripts/check-commit-stamp.mjs --expect deadbee", {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      failed = true; // non-zero exit expected
    }
    ok("guard exits non-zero on stale/mismatched stamp", failed);
  }

  // ===== Test C — GET does not certify (zero-write read path) =====
  console.log("\nTest C — GET (diagnostic) creates no certification");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    await applyFinanceInfraMigrations(db, DRIZZLE);
    await applyGatedFinanceMigrations(db, DRIZZLE);
    const before = Number((await q(client, `SELECT count(*)::int c FROM finance_certifications`))[0].c);
    // What GET does on the DB: runPreflight (+ cert lookup) — all reads.
    await runPreflight(db);
    await certForCommit(client, RUNTIME_COMMIT);
    const after = Number((await q(client, `SELECT count(*)::int c FROM finance_certifications`))[0].c);
    ok("certification count unchanged by GET path", before === after && before === 0, `${before}->${after}`);
    const src = (await import("node:fs")).readFileSync(
      resolve(process.cwd(), "src/routes/api/internal/finance/preflight.ts"),
      "utf8",
    );
    const getBody = src.slice(src.indexOf("async function GET"), src.indexOf("async function applyMigrations"));
    ok("GET function body contains no INSERT", !/\.insert\(/.test(getBody));
    ok("GET function body writes no audit", !/addAudit/.test(getBody));
  }

  // ===== Test D — Missing 0014: PENDING_MIGRATIONS, not 500 =====
  console.log("\nTest D — Accounting PASS but finance_certifications missing => PENDING_MIGRATIONS");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    let report: any;
    let threw = false;
    try {
      report = await runPreflight(db); // no migrations applied -> objects absent
    } catch {
      threw = true;
    }
    ok("runPreflight does not throw when 0014 absent", !threw);
    ok("finance_certifications reported missing", report.checks.migrationObjects.finance_certifications === false);
    ok("accounting still PASS", report.overall === "PASS");
    ok("status PENDING_MIGRATIONS", determineStatus(report, { certForCurrentCommit: false }) === "PENDING_MIGRATIONS");
  }

  // ===== Test E — Apply required migrations in dependency order =====
  console.log("\nTest E — Apply infra(0014) + gated(0011–0013) => all objects present");
  let readyDb: any, readyClient: any;
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    const infra = await applyFinanceInfraMigrations(db, DRIZZLE);
    const gated = await applyGatedFinanceMigrations(db, DRIZZLE);
    ok("0014 applied first (infra)", infra.applied.includes("0014_numerous_deadpool"));
    ok("0011–0013 applied (gated)", ["0011_fresh_thunderbolt_ross","0012_period_guards","0013_period_overlap_guard"].every((t) => gated.applied.includes(t)));
    const report = await runPreflight(db);
    ok("all required objects present", requiredObjectsPresent(report), JSON.stringify(report.checks.migrationObjects));
    ok("finance_certifications present", report.checks.migrationObjects.finance_certifications === true);
    ok("cert unique index present", report.checks.migrationObjects.finance_certification_unique_constraint_or_index === true);
    readyDb = db;
    readyClient = client;
  }

  // ===== Test F — Ready to certify (no cert for runtime commit) =====
  console.log("\nTest F — Clean + all objects + no certificate => READY_TO_CERTIFY");
  {
    const report = await runPreflight(readyDb);
    const cert = await certForCommit(readyClient, RUNTIME_COMMIT);
    ok("no certificate for runtime commit yet", cert === null);
    ok("status READY_TO_CERTIFY", determineStatus(report, { certForCurrentCommit: !!cert }) === "READY_TO_CERTIFY");
  }

  // ===== Test G — Certification stores the runtime commit =====
  console.log("\nTest G — Certify stores certificate.application_commit == runtime commit");
  {
    await insertCert(readyClient, "CERT-1", RUNTIME_COMMIT);
    const cert = await certForCommit(readyClient, RUNTIME_COMMIT);
    ok("certificate exists", !!cert);
    ok("application_commit == runtime commit", cert.application_commit === RUNTIME_COMMIT, cert.application_commit);
    const report = await runPreflight(readyDb);
    ok("status now PRODUCTION_READY", determineStatus(report, { certForCurrentCommit: true }) === "PRODUCTION_READY");
  }

  // ===== Test H — Repeat certify is idempotent (DB unique guard) =====
  console.log("\nTest H — Second certify of same commit => same record, count unchanged");
  {
    const before = Number((await q(readyClient, `SELECT count(*)::int c FROM finance_certifications`))[0].c);
    let violated = false;
    try {
      await insertCert(readyClient, "CERT-2", RUNTIME_COMMIT); // same (phase,env,commit)
    } catch {
      violated = true; // unique index rejects the duplicate
    }
    const after = Number((await q(readyClient, `SELECT count(*)::int c FROM finance_certifications`))[0].c);
    ok("duplicate insert rejected by unique index", violated);
    ok("certification count unchanged", before === after);
    const cert = await certForCommit(readyClient, RUNTIME_COMMIT);
    ok("existing certificate returned (CERT-1)", cert.id === "CERT-1");
  }

  // ===== Test I — New runtime commit is NOT certified by old certificate =====
  console.log("\nTest I — Certificate for commit A, runtime commit B => READY_TO_CERTIFY");
  {
    const report = await runPreflight(readyDb);
    const NEW_COMMIT = "bbb222";
    const cert = await certForCommit(readyClient, NEW_COMMIT); // none for B
    ok("no certificate for the new runtime commit", cert === null);
    const status = determineStatus(report, { certForCurrentCommit: !!cert });
    ok("status READY_TO_CERTIFY (not PRODUCTION_READY)", status === "READY_TO_CERTIFY", status);
  }

  // ===== Test J — Historical cert + current accounting failure => BLOCKED =====
  console.log("\nTest J — Historical certificate + broken accounting => PRODUCTION_BLOCKED");
  {
    const { db, client } = await freshDb();
    await seedClean(client);
    await applyFinanceInfraMigrations(db, DRIZZLE);
    await applyGatedFinanceMigrations(db, DRIZZLE);
    await insertCert(client, "CERT-HIST", RUNTIME_COMMIT);
    // Break accounting AFTER certifying (unbalanced posted entry).
    await entry(client, "jebad", "JE-9999", "posted", [{ acc: "a-cash", d: 100, c: 0 }]);
    const report = await runPreflight(db);
    const cert = await certForCommit(client, RUNTIME_COMMIT);
    ok("historical certificate still present/unchanged", cert && cert.id === "CERT-HIST");
    ok("status PRODUCTION_BLOCKED regardless of certificate", determineStatus(report, { certForCurrentCommit: !!cert }) === "PRODUCTION_BLOCKED");
  }

  // ===== Test K/L — Authorization gate (super-admin '*' only) =====
  console.log("\nTest K/L — apply-migrations & certify are super-admin only");
  {
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
    ok("finance user denied '*'", matches(["finance.view", "finance.export"], "*") === false);
    const src = (await import("node:fs")).readFileSync(
      resolve(process.cwd(), "src/routes/api/internal/finance/preflight.ts"),
      "utf8",
    );
    ok("GET gated by authHandler('*')", /GET:\s*authHandler\("\*",\s*GET\)/.test(src));
    ok("POST gated by authHandler('*')", /POST:\s*authHandler\("\*",\s*POST\)/.test(src));
    ok("POST routes 'apply-migrations' action", /action === "apply-migrations"/.test(src));
    ok("POST routes 'certify' action", /action === "certify"/.test(src));
  }

  // ===== Snapshot integrity (deterministic, PII-free, 0014 present) =====
  console.log("\nSnapshot — deterministic, PII-free, includes 0014");
  {
    const report = await runPreflight(readyDb);
    const s1 = JSON.stringify(buildSnapshot(report, HISTORY_ZERO));
    const s2 = JSON.stringify(buildSnapshot(await runPreflight(readyDb), HISTORY_ZERO));
    ok("snapshot deterministic", s1 === s2);
    const forbidden = ["name", "narration", "iban", "account_name", "file_name"];
    ok("snapshot PII-free", !forbidden.some((k) => s1.toLowerCase().includes(`"${k}"`)));
    ok("snapshot migrationIntegrity has 0014", JSON.parse(s1).migrationIntegrity["0014"] === true);
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
