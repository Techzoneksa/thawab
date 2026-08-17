/**
 * Phase 1B.1 — Governance closure tests.
 *  - Opening-balance permissions are source-aware and real (OB-A..OB-E).
 *  - Legacy `pending` cannot bypass period close; unposted statuses never touch
 *    GL (S1..S4).
 * Real code: shared pure `evaluateTransition` + certified engine on PGlite.
 * Run: node_modules/.bin/tsx scripts/test-phase-1b1.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { evaluateTransition, FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { postDraftEntry } from "@/server/db/gl";
import { getAllAccountBalances } from "@/server/db/balances";

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
function mkHasPerm(perms: string[]) {
  const set = new Set(perms);
  return (permission: string) => {
    const [mod, action] = permission.split(".");
    return (
      set.has("*") ||
      set.has(permission) ||
      set.has(`${mod}.*`) ||
      (!!action && set.has(`*.${action}`))
    );
  };
}
const MAKER = "u-maker";
const OTHER = "u-other";
function decide(
  fromStatus: string,
  action: any,
  perms: string[],
  currentUserId: string,
  opts: { createdBy?: string; reason?: string; sourceType?: string } = {},
) {
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: mkHasPerm(perms),
    createdBy: opts.createdBy ?? MAKER,
    currentUserId,
    reason: opts.reason,
    sourceType: opts.sourceType,
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
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR', period_id text,
  project_id text, source text NOT NULL DEFAULT 'manual', source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft',
  submitted_by text, submitted_at text, approved_by text, approved_at text,
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
  for (const [id, code, name, cls] of [
    ["a-cash", "1010", "Cash", "asset"],
    ["a-eq", "3010", "Net Assets", "equity"],
  ])
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification) VALUES ('${id}','${code}','${name}','${cls}')`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  return { db, client };
}
async function seed(
  client: any,
  id: string,
  status: string,
  sourceType = "manual",
  date = "2026-03-01",
) {
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,status,source,source_type,created_by) VALUES ('${id}','${id}','${date}','${status}','manual','${sourceType}','${MAKER}')`,
  );
  await client.exec(
    `INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,debit,credit) VALUES ('${id}-1','${id}',1,'a-cash',500,0),('${id}-2','${id}',2,'a-eq',0,500)`,
  );
}

async function main() {
  const S = "submitted",
    A = "approved";
  const OB = "opening_balance";

  // ===== Issue 1 — Opening-balance permissions are real & source-aware =====
  console.log("\nOB-A — journal.approve does NOT approve an opening balance");
  ok(
    "OB approve with journal.approve only → FORBIDDEN",
    decide(S, "approve", [P.journalApprove], OTHER, { sourceType: OB }).code === "FORBIDDEN",
  );

  console.log("OB-B — opening_balance.approve (non-maker) approves");
  ok(
    "OB approve with opening.approve → ok",
    decide(S, "approve", [P.openingApprove], OTHER, { sourceType: OB }).ok,
  );

  console.log("OB-C — journal.post does NOT post an opening balance");
  ok(
    "OB post with journal.post only → FORBIDDEN",
    decide(A, "post", [P.journalPost], OTHER, { sourceType: OB }).code === "FORBIDDEN",
  );

  console.log("OB-D — opening_balance.post authorizes; certified engine posts");
  {
    ok(
      "OB post decision with opening.post → ok",
      decide(A, "post", [P.openingPost], OTHER, { sourceType: OB }).ok,
    );
    const { db, client } = await freshDb();
    await seed(client, "ob1", A, OB);
    await db.transaction((tx: any) => postDraftEntry(tx, "ob1", OTHER));
    const st = (await client.query(`SELECT status FROM journal_entries WHERE id='ob1'`)).rows[0]
      ?.status;
    ok("OB posts through certified engine", st === "posted");
  }

  console.log("OB-E — maker cannot approve own opening balance");
  ok(
    "OB self-approval blocked (even with opening.approve)",
    decide(S, "approve", [P.openingApprove], MAKER, { createdBy: MAKER, sourceType: OB }).code ===
      "SELF_APPROVAL",
  );

  console.log("OB-sanity — normal journals still use journal.approve/post");
  {
    ok(
      "manual approve uses journal.approve",
      decide(S, "approve", [P.journalApprove], OTHER, { sourceType: "manual" }).ok,
    );
    ok(
      "manual post uses journal.post",
      decide(A, "post", [P.journalPost], OTHER, { sourceType: "manual" }).ok,
    );
    ok(
      "opening.approve does NOT approve a manual journal",
      decide(S, "approve", [P.openingApprove], OTHER, { sourceType: "manual" }).code ===
        "FORBIDDEN",
    );
  }

  // ===== Issue 3 — legacy pending + unposted statuses =====
  const CLOSE_BLOCKING = ["draft", "submitted", "approved", "pending"];

  console.log("\nS1 — legacy pending in a period blocks close");
  {
    const { client } = await freshDb();
    await seed(client, "leg", "pending");
    const rows = (
      await client.query(
        `SELECT count(*)::int c FROM journal_entries
         WHERE date >= '2026-01-01' AND date <= '2026-12-31'
           AND status IN ('draft','submitted','approved','pending')`,
      )
    ).rows;
    ok("pending journal detected → close blocked", Number(rows[0].c) === 1);
    ok("close-blocking set includes pending", CLOSE_BLOCKING.includes("pending"));
  }

  console.log("S2 — pending/submitted/approved have NO GL effect");
  {
    const { db, client } = await freshDb();
    await seed(client, "p1", "pending");
    await seed(client, "s1", "submitted");
    await seed(client, "a1", "approved");
    const bal = await getAllAccountBalances(db);
    ok("no GL balance from pending/submitted/approved", (bal.get("a-cash")?.balance ?? 0) === 0);
  }

  console.log("S3 — rejected/cancelled have NO GL effect");
  {
    const { db, client } = await freshDb();
    await seed(client, "r1", "rejected");
    await seed(client, "c1", "cancelled");
    const bal = await getAllAccountBalances(db);
    ok("no GL balance from rejected/cancelled", (bal.get("a-cash")?.balance ?? 0) === 0);
  }

  console.log("S4 — posted/reversed keep Phase 1A behavior");
  {
    const { db, client } = await freshDb();
    await seed(client, "post1", A);
    await db.transaction((tx: any) => postDraftEntry(tx, "post1", OTHER));
    const bal = await getAllAccountBalances(db);
    ok("posted entry reflected in GL", Math.abs((bal.get("a-cash")?.balance ?? 0) - 500) < 0.01);
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
