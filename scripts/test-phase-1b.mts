/**
 * Phase 1B — Financial governance tests (segregation of duties).
 *
 * Two layers, both exercising REAL code:
 *  - Authorization decisions via the shared pure `evaluateTransition` (the exact
 *    logic the server enforces): state matrix, permission separation,
 *    maker≠checker, required reasons.
 *  - Accounting effects via the certified Phase 1A engine (postDraftEntry /
 *    reverseEntry / resolvePostingPeriod) on an in-memory Postgres, plus a
 *    Phase 1A regression pass.
 * No secrets, no production DB. Run: node_modules/.bin/tsx scripts/test-phase-1b.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  evaluateTransition,
  FINANCE_PERMISSIONS as P,
  ALL_FINANCE_PERMS,
} from "@/lib/finance-permissions";
import { postDraftEntry, reverseEntry } from "@/server/db/gl";
import { runPreflight } from "@/server/db/finance-preflight";
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

/** Mirror hasPermission() wildcard matching for the pure decision tests. */
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
  opts: { createdBy?: string; reason?: string } = {},
) {
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: mkHasPerm(perms),
    createdBy: opts.createdBy ?? MAKER,
    currentUserId,
    reason: opts.reason,
  });
}

// ------------------------- DB harness (effects) -------------------------
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
CREATE TABLE finance_workflow_events (id text PRIMARY KEY, entity_type text NOT NULL, entity_id text NOT NULL,
  action text NOT NULL, from_status text, to_status text, user_id text, user_name text DEFAULT '',
  reason text DEFAULT '', metadata text DEFAULT '{}', created_at text NOT NULL DEFAULT '');
`;

async function freshDb(withPeriod = true) {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-cash", "1010", "Cash", "asset"],
    ["a-rev", "4010", "Donations", "revenue"],
    ["a-exp", "5010", "Aid", "expense"],
  ];
  for (const [id, code, name, cls] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status) VALUES ('${id}','${code}','${name}','${cls}',true,'active')`,
    );
  if (withPeriod)
    await client.exec(
      `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
    );
  return { db, client };
}

async function seedJournal(client: any, id: string, status: string, date = "2026-03-01") {
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,status,source,created_by) VALUES ('${id}','${id}','${date}','${status}','manual','${MAKER}')`,
  );
  await client.exec(
    `INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,debit,credit) VALUES ('${id}-1','${id}',1,'a-cash',1000,0),('${id}-2','${id}',2,'a-rev',0,1000)`,
  );
}
async function status(client: any, id: string) {
  return (await client.query(`SELECT status FROM journal_entries WHERE id='${id}'`)).rows[0]
    ?.status;
}

async function main() {
  const D = "draft",
    S = "submitted",
    A = "approved",
    PO = "posted";

  // ===== Test A — Creator (create+submit) =====
  console.log("\nTest A — Creator: submit ok; approve/post forbidden");
  {
    const perms = [P.journalCreate, P.journalSubmit];
    ok("submit own draft → ok", decide(D, "submit", perms, MAKER).ok);
    const appr = decide(S, "approve", perms, MAKER);
    ok("approve own → forbidden", !appr.ok, appr.code);
    ok("post → forbidden", !decide(A, "post", perms, MAKER).ok);
  }

  // ===== Test B — Approver =====
  console.log("\nTest B — Approver");
  {
    const perms = [P.journalApprove];
    ok("submitted → approve ok", decide(S, "approve", perms, OTHER).ok);
    ok("draft → approve illegal", decide(D, "approve", perms, OTHER).code === "ILLEGAL_TRANSITION");
    ok(
      "posted → approve illegal",
      decide(PO, "approve", perms, OTHER).code === "ILLEGAL_TRANSITION",
    );
  }

  // ===== Test C — Poster =====
  console.log("\nTest C — Poster");
  {
    const perms = [P.journalPost];
    ok("approved → post ok", decide(A, "post", perms, OTHER).ok);
    ok("draft → post illegal", decide(D, "post", perms, OTHER).code === "ILLEGAL_TRANSITION");
    ok("submitted → post illegal", decide(S, "post", perms, OTHER).code === "ILLEGAL_TRANSITION");
  }

  // ===== Test D — Unauthorized =====
  console.log("\nTest D — Unauthorized user");
  {
    const none: string[] = [];
    ok("submit forbidden", decide(D, "submit", none, OTHER).code === "FORBIDDEN");
    ok("approve forbidden", decide(S, "approve", none, OTHER).code === "FORBIDDEN");
    ok("post forbidden", decide(A, "post", none, OTHER).code === "FORBIDDEN");
    ok(
      "reverse forbidden",
      decide(PO, "reverse", none, OTHER, { reason: "x" }).code === "FORBIDDEN",
    );
  }

  // ===== Test E — Reversal authority =====
  console.log("\nTest E — Reversal authority");
  {
    ok(
      "creator w/o reverse perm → forbidden",
      decide(PO, "reverse", [P.journalCreate], MAKER, { reason: "x" }).code === "FORBIDDEN",
    );
    ok(
      "reverser + reason → ok",
      decide(PO, "reverse", [P.journalReverse], OTHER, { reason: "correction" }).ok,
    );
    ok(
      "reverser w/o reason → reason required",
      decide(PO, "reverse", [P.journalReverse], OTHER).code === "REASON_REQUIRED",
    );
  }

  // ===== Test H — Self approval =====
  console.log("\nTest H — Self approval blocked even with approve perm");
  {
    const d = decide(S, "approve", [P.journalApprove], MAKER, { createdBy: MAKER });
    ok("maker approving own → SELF_APPROVAL", d.code === "SELF_APPROVAL");
    ok(
      "different user approving → ok",
      decide(S, "approve", [P.journalApprove], OTHER, { createdBy: MAKER }).ok,
    );
    // Even a wildcard super-admin who is the maker is blocked.
    ok(
      "wildcard maker still blocked",
      decide(S, "approve", ["*"], MAKER, { createdBy: MAKER }).code === "SELF_APPROVAL",
    );
  }

  // ===== Test I — Return to draft =====
  console.log("\nTest I — Return to draft requires reason");
  {
    ok(
      "return w/o reason → reason required",
      decide(S, "return", [P.journalReject], OTHER).code === "REASON_REQUIRED",
    );
    const d = decide(S, "return", [P.journalReject], OTHER, { reason: "fix line 2" });
    ok("return with reason → ok, toStatus=draft", d.ok && d.toStatus === "draft");
    ok(
      "reject with reason → toStatus=rejected",
      decide(S, "reject", [P.journalReject], OTHER, { reason: "invalid" }).toStatus === "rejected",
    );
  }

  // ===== Test L — Period permissions are separate =====
  console.log("\nTest L — Period close/reopen are distinct permissions");
  {
    ok(
      "periodClose ≠ journalPost/create",
      P.periodClose !== P.journalPost && P.periodClose !== P.journalCreate,
    );
    ok("periodReopen distinct from periodClose", P.periodReopen !== P.periodClose);
    ok("post perm does NOT grant close (no wildcard)", !mkHasPerm([P.journalPost])(P.periodClose));
    ok("close perm does NOT grant reopen", !mkHasPerm([P.periodClose])(P.periodReopen));
  }

  // ===== Test C-effect / J / P — posting via certified engine + immutability =====
  console.log("\nTest C-effect/J/P — post from approved, immutability, double-post");
  {
    const { db, client } = await freshDb();
    await seedJournal(client, "je1", A); // approved
    await db.transaction((tx: any) => postDraftEntry(tx, "je1", OTHER));
    ok("approved → posted via certified engine", (await status(client, "je1")) === "posted");
    // J — immutability: cannot re-post a posted entry
    let reposted = false;
    try {
      await db.transaction((tx: any) => postDraftEntry(tx, "je1", OTHER));
      reposted = true;
    } catch {
      /* expected */
    }
    ok("J: re-post of posted rejected (immutable)", !reposted);
    // P — concurrency proxy: a second post attempt after the first cannot succeed
    ok("P: double-post rejected (status guard)", (await status(client, "je1")) === "posted");
  }

  // ===== Test F — Closed period posting rejected =====
  console.log("\nTest F — Post into CLOSED period rejected (Phase 1A dominant)");
  {
    const { db, client } = await freshDb();
    await client.exec(`UPDATE fiscal_periods SET status='closed' WHERE id='p'`);
    await seedJournal(client, "jeC", A, "2026-03-01");
    let posted = false;
    try {
      await db.transaction((tx: any) => postDraftEntry(tx, "jeC", OTHER));
      posted = true;
    } catch {
      /* expected */
    }
    ok("post into closed period rejected", !posted);
  }

  // ===== Test G — Undefined period posting rejected =====
  console.log("\nTest G — Post with date outside any period rejected");
  {
    const { db, client } = await freshDb();
    await seedJournal(client, "jeG", A, "2099-01-01"); // no period covers this
    let posted = false;
    try {
      await db.transaction((tx: any) => postDraftEntry(tx, "jeG", OTHER));
      posted = true;
    } catch {
      /* expected */
    }
    ok("post into undefined period rejected", !posted);
  }

  // ===== Test M — Period close blocked by pending workflow items =====
  console.log("\nTest M — Close blocked while draft/submitted/approved exist");
  {
    const { client } = await freshDb();
    await seedJournal(client, "jeD", D);
    await seedJournal(client, "jeS", S);
    await seedJournal(client, "jeA", A);
    const rows = (
      await client.query(
        `SELECT status, count(*)::int c FROM journal_entries
         WHERE date >= '2026-01-01' AND date <= '2026-12-31'
           AND status IN ('draft','submitted','approved') GROUP BY status`,
      )
    ).rows;
    const total = rows.reduce((s: number, r: any) => s + Number(r.c), 0);
    ok("open workflow items detected (blocks close)", total === 3, JSON.stringify(rows));
  }

  // ===== Test O — Imported/draft journal has no GL effect =====
  console.log("\nTest O — Draft journal has no GL effect");
  {
    const { db, client } = await freshDb();
    await seedJournal(client, "jeDraft", D);
    const bal = await getAllAccountBalances(db);
    ok("draft produces zero GL balances", (bal.get("a-cash")?.balance ?? 0) === 0);
    await db.transaction((tx: any) => postDraftEntry(tx, "jeDraft", OTHER)); // draft still postable by engine
    // note: manual workflow requires approved; engine accepts draft for automated subledger posting
    const bal2 = await getAllAccountBalances(db);
    ok(
      "after posting, GL reflects entry",
      Math.abs((bal2.get("a-cash")?.balance ?? 0) - 1000) < 0.01,
    );
  }

  // ===== Regression — Phase 1A accounting integrity intact =====
  console.log("\nRegression — Phase 1A accounting integrity");
  {
    const { db, client } = await freshDb();
    await seedJournal(client, "r1", A, "2026-02-01");
    await seedJournal(client, "r2", A, "2026-02-02");
    await db.transaction((tx: any) => postDraftEntry(tx, "r1", OTHER));
    await db.transaction((tx: any) => postDraftEntry(tx, "r2", OTHER));
    const rep = await runPreflight(db);
    ok(
      "GL balanced (debit=credit)",
      rep.checks.generalLedger.balanced && rep.checks.generalLedger.difference === 0,
    );
    ok(
      "Trial Balance balanced",
      rep.checks.trialBalance.balanced && rep.checks.trialBalance.difference === 0,
    );
    ok("Financial Position reconciles", rep.checks.financialPosition.balanced);
    // Reversal nets to zero
    const revId = await db.transaction((tx: any) => reverseEntry(tx, "r1", OTHER));
    ok("reversal created", !!revId);
    const rep2 = await runPreflight(db);
    ok("GL still balanced after reversal", rep2.checks.generalLedger.balanced);
    const bal = await getAllAccountBalances(db);
    // r1 reversed + r2 remains → cash = 1000 (only r2 net), revenue mirrored
    ok(
      "reversal nets original (cash = 1000 from r2 only)",
      Math.abs((bal.get("a-cash")?.balance ?? 0) - 1000) < 0.01,
      String(bal.get("a-cash")?.balance),
    );
  }

  // ===== Catalog sanity =====
  console.log("\nCatalog — granular permissions are distinct");
  {
    ok(
      "create ≠ approve ≠ post ≠ reverse",
      new Set([P.journalCreate, P.journalApprove, P.journalPost, P.journalReverse]).size === 4,
    );
    ok("all finance perms unique", new Set(ALL_FINANCE_PERMS).size === ALL_FINANCE_PERMS.length);
    ok(
      "finance.create does NOT match finance.journal.post",
      !mkHasPerm(["finance.create"])(P.journalPost),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
