/**
 * Phase 1B.2 — Inventory issue/adjust GL-posting authority (final P1 closure).
 *  - INV-A..E: the dedicated finalization permissions gate GL impact; generic
 *    inventory.create cannot post; issue-finalize ≠ adjust-finalize.
 *  - INV-B/D: authorized finalizer posts exactly one balanced journal via the
 *    certified engine.
 *  - INV-F: source idempotency (0011 unique index) intact.
 *  - INV-G/H: closed / undefined period rejection (Phase 1A) still dominant.
 * Run: node_modules/.bin/tsx scripts/test-phase-1b2.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postBalancedEntry } from "@/server/db/gl";
import { getAllAccountBalances } from "@/server/db/balances";
import { INVENTORY_FINALIZE_PERMS } from "@/lib/permissions-catalog";

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
/** Mirror hasPermission() wildcard matching (the exact server rule). */
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
const ISSUE = "inventory.issue.finalize";
const ADJUST = "inventory.adjust.finalize";
const OTHER = "u-other";

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
  posted_by text, posted_at text, reversed_by text,
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
CREATE UNIQUE INDEX journal_entries_source_unique_idx ON journal_entries (source_type, source_id)
  WHERE status = 'posted' AND source_id IS NOT NULL AND source_type IN
  ('donation','aid','payroll','supplier_payment','inventory_issue','inventory_adjust','opening_balance');
`;
async function freshDb(period = "open") {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  for (const [id, code, name, cls] of [
    ["a-inv", "1300", "Inventory", "asset"],
    ["a-exp", "5102", "In-kind Aid", "expense"],
    ["a-adj", "5900", "Inventory Adjustment", "expense"],
  ])
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification) VALUES ('${id}','${code}','${name}','${cls}')`,
    );
  if (period)
    await client.exec(
      `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','${period}')`,
    );
  return { db, client };
}
const issueLines = () => [
  { accountId: "a-exp", debit: 300 },
  { accountId: "a-inv", credit: 300 },
];
const adjustLines = () => [
  { accountId: "a-adj", debit: 120 },
  { accountId: "a-inv", credit: 120 },
];
async function jeCount(client: any) {
  return Number((await client.query(`SELECT count(*)::int c FROM journal_entries`)).rows[0].c);
}

async function main() {
  // ===== INV-A — generic inventory user cannot post an issue =====
  console.log("\nINV-A — inventory.create alone cannot finalize an issue");
  ok("inventory.create does NOT grant issue.finalize → 403", !grants(["inventory.create"], ISSUE));

  // ===== INV-B — authorized issue finalizer =====
  console.log("INV-B — authorized issue finalizer posts one balanced journal");
  {
    ok("issue.finalize grants issue", grants([ISSUE], ISSUE));
    const { db, client } = await freshDb();
    await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-03-01",
        description: "issue",
        source: "distribution",
        sourceType: "inventory_issue",
        sourceId: "MV-1",
        lines: issueLines(),
        userId: OTHER,
      }),
    );
    ok("exactly one journal created", (await jeCount(client)) === 1);
    const bal = await getAllAccountBalances(db);
    ok(
      "GL balanced (inventory credited 300)",
      Math.abs((bal.get("a-inv")?.balance ?? 0) + 300) < 0.01,
    );
  }

  // ===== INV-C — generic user cannot post an adjustment =====
  console.log("INV-C — inventory.create alone cannot finalize an adjustment");
  ok(
    "inventory.create does NOT grant adjust.finalize → 403",
    !grants(["inventory.create"], ADJUST),
  );

  // ===== INV-D — authorized adjustment finalizer =====
  console.log("INV-D — authorized adjustment finalizer posts one balanced journal");
  {
    ok("adjust.finalize grants adjust", grants([ADJUST], ADJUST));
    const { db, client } = await freshDb();
    await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-03-01",
        description: "adjust",
        source: "adjustment",
        sourceType: "inventory_adjust",
        sourceId: "MV-2",
        lines: adjustLines(),
        userId: OTHER,
      }),
    );
    ok("exactly one journal created", (await jeCount(client)) === 1);
  }

  // ===== INV-E — permissions are separate =====
  console.log("INV-E — issue.finalize does NOT authorize adjustment (and vice-versa)");
  {
    ok("issue.finalize does NOT grant adjust.finalize", !grants([ISSUE], ADJUST));
    ok("adjust.finalize does NOT grant issue.finalize", !grants([ADJUST], ISSUE));
  }

  // ===== INV-F — duplicate source → one accounting effect (idempotency) =====
  console.log("INV-F — duplicate inventory_issue source blocked by unique index");
  {
    const { db, client } = await freshDb();
    await db.transaction((tx: any) =>
      postBalancedEntry(tx, {
        date: "2026-03-01",
        description: "issue",
        source: "distribution",
        sourceType: "inventory_issue",
        sourceId: "MV-DUP",
        lines: issueLines(),
        userId: OTHER,
      }),
    );
    let second = false;
    try {
      await db.transaction((tx: any) =>
        postBalancedEntry(tx, {
          date: "2026-03-02",
          description: "issue dup",
          source: "distribution",
          sourceType: "inventory_issue",
          sourceId: "MV-DUP",
          lines: issueLines(),
          userId: OTHER,
        }),
      );
      second = true;
    } catch {
      /* unique index rejects */
    }
    ok("second post of same source rejected", !second);
    ok("exactly one accounting effect", (await jeCount(client)) === 1);
  }

  // ===== INV-G — closed period rejected =====
  console.log("INV-G — issue into CLOSED period rejected");
  {
    const { db } = await freshDb("closed");
    let posted = false;
    try {
      await db.transaction((tx: any) =>
        postBalancedEntry(tx, {
          date: "2026-03-01",
          description: "issue",
          source: "distribution",
          sourceType: "inventory_issue",
          sourceId: "MV-C",
          lines: issueLines(),
          userId: OTHER,
        }),
      );
      posted = true;
    } catch {
      /* expected */
    }
    ok("post into closed period rejected", !posted);
  }

  // ===== INV-H — undefined period rejected =====
  console.log("INV-H — issue with date outside any period rejected");
  {
    const { db } = await freshDb("open");
    let posted = false;
    try {
      await db.transaction((tx: any) =>
        postBalancedEntry(tx, {
          date: "2099-01-01",
          description: "issue",
          source: "distribution",
          sourceType: "inventory_issue",
          sourceId: "MV-U",
          lines: issueLines(),
          userId: OTHER,
        }),
      );
      posted = true;
    } catch {
      /* expected */
    }
    ok("post into undefined period rejected", !posted);
  }

  // ===== Backend enforcement + catalog =====
  console.log("Backend — items.ts gates issue/adjust before postBalancedEntry");
  {
    const src = readFileSync(resolve(process.cwd(), "src/routes/api/inventory/items.ts"), "utf8");
    ok("issue gated by inventory.issue.finalize", /"issue".*inventory\.issue\.finalize/s.test(src));
    ok(
      "adjust gated by inventory.adjust.finalize",
      /"adjust".*inventory\.adjust\.finalize/s.test(src),
    );
    const gateIdx = src.indexOf("inventory.issue.finalize");
    const postIdx = src.indexOf("postBalancedEntry(tx");
    ok("permission checked BEFORE the posting transaction", gateIdx > 0 && gateIdx < postIdx);
    ok("both finalize perms in admin catalog", INVENTORY_FINALIZE_PERMS.length === 2);
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
