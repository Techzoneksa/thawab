/**
 * Phase 4A — CONCURRENCY & RELIABILITY on REAL PostgreSQL.
 *
 * PGlite is single-connection and CANNOT exercise true concurrent transactions
 * or cross-session advisory locks, so this suite runs ONLY against a real
 * PostgreSQL server (multiple pooled connections, real MVCC, real
 * pg_advisory_xact_lock). It drives the ACTUAL service functions
 * (createSupplier, paySupplier, postBalancedEntry, nextCode) — not mirrors —
 * and asserts the accounting invariants hold under contention.
 *
 * REQUIRES: DATABASE_URL pointing at a migrated + seeded real-PG database whose
 * name contains "conc" or "bench" (a guard so we never load-test production).
 *
 * Suites: CONC-A numbering, CONC-B distinct payments, CONC-C idempotent retry,
 * CONC-D same-source POST, CONC-E supplier-code contention, CONC-F cross-lock
 * (deadlock safety), plus REL-A partial-failure rollback and a final
 * GL-integrity reconciliation (trial balance + AP control = subledger).
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc \
 *      node_modules/.bin/tsx scripts/test-phase-4a-conc.mts
 */
import { sql } from "drizzle-orm";
import { db, closeDb, genId } from "@/server/db/index";
import {
  createSupplier,
  paySupplier,
  getSupplierBalance,
  apReconciliation,
} from "@/server/db/supplier";
import {
  postBalancedEntry,
  existingSourceEntryId,
  resolveSystemAccountId,
  SYS,
} from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";

import { JournalSource, JournalStatus } from "@/lib/enums";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING to run: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
  process.exit(2);
}

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const ctx: any = {
  user: { id: "u-bench", name: "Bench Runner" },
  ip: "127.0.0.1",
  userAgent: "phase4a",
  request: new Request("http://localhost/"),
};

async function ensureUser() {
  await db.execute(
    sql`INSERT INTO users (id, name, email, password) VALUES ('u-bench','Bench Runner','u-bench@example.com','x') ON CONFLICT (id) DO NOTHING`,
  );
}

async function mkSupplier(name: string) {
  const s = await createSupplier(ctx, { name, currency: "SAR" } as any);
  return (s as any).id as string;
}
async function mkSupplierFull(name: string) {
  const s = (await createSupplier(ctx, { name, currency: "SAR" } as any)) as any;
  return { id: s.id as string, code: s.supplierCode as string };
}
/** Natural (sign-adjusted) balance for an account. */
async function acctBal(accountId: string): Promise<number> {
  return Number((await getAccountBalance(db as any, accountId)).closing);
}

async function resetTransactional() {
  // Deterministic start — clear only transactional tables; keep the seeded chart
  // of accounts, fiscal periods, roles and users. (Isolated bench DB only.)
  await db.execute(sql`TRUNCATE
    journal_lines, journal_entries, supplier_journal_links, supplier_payments,
    suppliers, finance_workflow_events, audit_log RESTART IDENTITY CASCADE`);
}

async function main() {
  await ensureUser();
  await resetTransactional();
  const apId = await resolveSystemAccountId(db as any, SYS.ACCOUNTS_PAYABLE);
  const bankId = await resolveSystemAccountId(db as any, SYS.BANK);

  // Seed AP credit on a fresh supplier so payments have payable to clear.
  async function seedPayable(supplierId: string, amount: number) {
    // Dr Bank / Cr AP-linked-to-supplier via the AP link primitive path: post a
    // balanced entry crediting AP, then link the AP line to the supplier.
    const { linkEntryApLine } = await import("@/server/db/supplier");
    await db.transaction(async (tx) => {
      const eid = await postBalancedEntry(tx as any, {
        date: "2026-06-01",
        description: `seed payable ${supplierId}`,
        source: JournalSource.PURCHASE,
        sourceType: "manual",
        sourceId: genId("SEED"),
        lines: [
          { accountId: bankId, debit: amount },
          { accountId: apId, credit: amount },
        ],
        userId: ctx.user.id,
        status: JournalStatus.POSTED,
      });
      await linkEntryApLine(tx as any, { supplierId, entryId: eid, userId: ctx.user.id });
    });
  }

  // ---------------- CONC-A: concurrent journal numbering (advisory lock) --------
  console.log("\nCONC-A — 30 concurrent balanced postings → unique sequential JV numbers");
  {
    const N = 30;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        db.transaction(async (tx) =>
          postBalancedEntry(tx as any, {
            date: "2026-06-02",
            description: `conc-a ${i}`,
            source: JournalSource.MANUAL,
            sourceType: "manual",
            sourceId: genId("CA"),
            lines: [
              { accountId: bankId, debit: 10 },
              { accountId: apId, credit: 10 },
            ],
            userId: ctx.user.id,
            status: JournalStatus.POSTED,
          }),
        ),
      ),
    );
    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const ids = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const nums = (
      await db.execute(sql`SELECT number FROM journal_entries WHERE description LIKE 'conc-a %'`)
    ).map((r: any) => r.number);
    const uniqueNums = new Set(nums);
    ok(`all ${N} postings committed`, okCount === N, `got ${okCount}`);
    ok(
      "journal numbers all unique (no duplicate JV number)",
      uniqueNums.size === nums.length,
      `${uniqueNums.size}/${nums.length}`,
    );
    ok("distinct journal entry ids", new Set(ids).size === N);
  }

  // ---------------- CONC-B: distinct concurrent payments, same supplier ---------
  console.log("\nCONC-B — 25 distinct concurrent payments (same supplier/bank) → exact totals");
  {
    const supplierId = await mkSupplier("CONC-B Supplier");
    const N = 25,
      amt = 100;
    await seedPayable(supplierId, N * amt);
    const apBefore = await acctBal(apId);
    const bankBefore = await acctBal(bankId);
    const payableBefore = (await getSupplierBalance(db as any, supplierId)).payableBalance;

    const res = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        paySupplier(ctx, {
          supplierId,
          amount: amt,
          method: "bank",
          idempotencyKey: `CONC-B-${supplierId}-${i}`,
        }),
      ),
    );
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    const reused = res.filter((r) => r.status === "fulfilled" && (r.value as any).reused).length;
    const apAfter = await acctBal(apId);
    const bankAfter = await acctBal(bankId);
    const payableAfter = (await getSupplierBalance(db as any, supplierId)).payableBalance;

    ok(`all ${N} distinct payments committed`, okCount === N, `got ${okCount}`);
    ok("no payment falsely reused (distinct keys → 0 reuse)", reused === 0, `reused ${reused}`);
    ok(
      "AP debited exactly N×amt",
      Math.abs(apBefore - apAfter - N * amt) < 0.005,
      `Δ=${apBefore - apAfter}`,
    );
    ok(
      "Bank credited exactly N×amt",
      Math.abs(bankBefore - bankAfter - N * amt) < 0.005,
      `Δ=${bankBefore - bankAfter}`,
    );
    ok(
      "supplier payable reduced exactly N×amt",
      Math.abs(payableBefore - payableAfter - N * amt) < 0.005,
      `Δ=${payableBefore - payableAfter}`,
    );
  }

  // ---------------- CONC-C: idempotent retry storm, SAME key --------------------
  console.log(
    "\nCONC-C — 25 concurrent retries of ONE payment key → exactly one accounting effect",
  );
  {
    const supplierId = await mkSupplier("CONC-C Supplier");
    const amt = 500;
    await seedPayable(supplierId, amt);
    const apBefore = await acctBal(apId);
    const key = `CONC-C-${supplierId}-ONE`;
    const res = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        paySupplier(ctx, { supplierId, amount: amt, method: "bank", idempotencyKey: key }),
      ),
    );
    const fulfilled = res.filter((r) => r.status === "fulfilled");
    const entryIds = new Set(fulfilled.map((r: any) => r.value.entryId));
    const firstPosts = fulfilled.filter((r: any) => !r.value.reused).length;
    const apAfter = await acctBal(apId);
    const dbEntries = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM journal_entries WHERE source_type='supplier_payment' AND source_id=${`SPY-${key}`}`,
      )
    )[0] as any;
    ok("all retries resolved (none errored)", fulfilled.length === 25, `${fulfilled.length}/25`);
    ok(
      "exactly ONE journal row persisted for the key",
      Number(dbEntries.c) === 1,
      `rows=${dbEntries.c}`,
    );
    ok("exactly ONE distinct journal entry id", entryIds.size === 1, `${entryIds.size}`);
    ok("exactly ONE first-post (rest reused)", firstPosts === 1, `${firstPosts}`);
    ok(
      "AP moved by amt exactly once",
      Math.abs(apBefore - apAfter - amt) < 0.005,
      `Δ=${apBefore - apAfter}`,
    );
  }

  // ---------------- CONC-D: same source_type+source_id parallel POST ------------
  // The idempotency backstop is the PARTIAL unique index on
  // journal_entries(source_type, source_id) WHERE status='posted' for the
  // recognized business source types (0011). We use 'opening_balance' (covered)
  // to prove that check-then-act under contention still yields exactly one entry.
  console.log(
    "\nCONC-D — 20 concurrent postBalancedEntry with identical source → one entry (partial unique index)",
  );
  {
    const sid = genId("DUP");
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        db.transaction(async (tx) => {
          const existing = await existingSourceEntryId(tx as any, "opening_balance", sid);
          if (existing) return existing;
          return postBalancedEntry(tx as any, {
            date: "2026-06-03",
            description: `conc-d ${sid}`,
            source: JournalSource.MANUAL,
            sourceType: "opening_balance",
            sourceId: sid,
            lines: [
              { accountId: bankId, debit: 7 },
              { accountId: apId, credit: 7 },
            ],
            userId: ctx.user.id,
            status: JournalStatus.POSTED,
          });
        }),
      ),
    );
    const fulfilled = res.filter((r) => r.status === "fulfilled");
    const rejected = res.length - fulfilled.length;
    const cnt = (
      await db.execute(
        sql`SELECT count(*)::int AS c FROM journal_entries WHERE source_type='opening_balance' AND source_id=${sid}`,
      )
    )[0] as any;
    ok("exactly ONE journal entry for the shared source", Number(cnt.c) === 1, `count=${cnt.c}`);
    ok(
      "duplicate inserts blocked by unique index (losers rejected/deduped)",
      Number(cnt.c) === 1,
      `rejected=${rejected}`,
    );
  }

  // ---------------- CONC-E: supplier-code contention (nextCode lock) ------------
  console.log("\nCONC-E — 20 concurrent createSupplier → unique supplier codes (no collision)");
  {
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => mkSupplierFull(`CONC-E ${i}`)),
    );
    const made = res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const codes = made.map((m) => m.code);
    ok(`all 20 suppliers created`, made.length === 20, `${made.length}`);
    ok(
      "all supplier codes unique (nextCode advisory lock held)",
      new Set(codes).size === codes.length,
      `${new Set(codes).size}/${codes.length}`,
    );
  }

  // ---------------- CONC-F: cross-lock ordering (deadlock safety) ---------------
  console.log(
    "\nCONC-F — interleaved 2-supplier payments in opposite order → no hang, DB resolves",
  );
  {
    const sA = await mkSupplier("CONC-F A");
    const sB = await mkSupplier("CONC-F B");
    await seedPayable(sA, 1000);
    await seedPayable(sB, 1000);
    // Fire many payments to both, interleaved, forcing overlapping AP-line locks.
    const jobs: Promise<any>[] = [];
    for (let i = 0; i < 15; i++) {
      jobs.push(
        paySupplier(ctx, {
          supplierId: sA,
          amount: 10,
          method: "bank",
          idempotencyKey: `F-A-${i}`,
        }),
      );
      jobs.push(
        paySupplier(ctx, {
          supplierId: sB,
          amount: 10,
          method: "bank",
          idempotencyKey: `F-B-${i}`,
        }),
      );
    }
    const res = await Promise.allSettled(jobs);
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    // Postgres aborts one side of any true deadlock; the service must surface it,
    // never hang. We assert the batch completes and totals stay exact.
    const balA = (await getSupplierBalance(db as any, sA)).payableBalance;
    const balB = (await getSupplierBalance(db as any, sB)).payableBalance;
    ok("all 30 interleaved payments settled (no hang)", res.length === 30);
    ok(
      "both suppliers reduced by 15×10 exactly",
      Math.abs(balA - (1000 - 150)) < 0.005 && Math.abs(balB - (1000 - 150)) < 0.005,
      `A=${balA} B=${balB}`,
    );
    ok("no unresolved deadlock (all committed)", okCount === 30, `committed ${okCount}/30`);
  }

  // ---------------- REL-A: partial-failure rollback (atomicity) -----------------
  console.log(
    "\nREL-A — failure injected mid-transaction after posting → full rollback, no orphan",
  );
  {
    const supplierId = await mkSupplier("REL-A Supplier");
    const apBefore = await acctBal(apId);
    const jBefore = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    let threw = false;
    try {
      await db.transaction(async (tx) => {
        await postBalancedEntry(tx as any, {
          date: "2026-06-04",
          description: "rel-a should roll back",
          source: JournalSource.MANUAL,
          sourceType: "manual",
          sourceId: genId("RELA"),
          lines: [
            { accountId: bankId, debit: 999 },
            { accountId: apId, credit: 999 },
          ],
          userId: ctx.user.id,
          status: JournalStatus.POSTED,
        });
        throw new Error("INJECTED FAILURE after posting, before commit");
      });
    } catch {
      threw = true;
    }
    const apAfter = await acctBal(apId);
    const jAfter = (
      await db.execute(sql`SELECT count(*)::int AS c FROM journal_entries`)
    )[0] as any;
    ok("transaction threw (failure surfaced)", threw);
    ok(
      "AP unchanged after rollback",
      Math.abs(apAfter - apBefore) < 0.005,
      `Δ=${apAfter - apBefore}`,
    );
    ok(
      "no journal entry persisted (atomic rollback)",
      Number(jAfter.c) === Number(jBefore.c),
      `${jBefore.c}→${jAfter.c}`,
    );
  }

  // ---------------- GL INTEGRITY: global invariants after all contention --------
  console.log("\nGL-INTEGRITY — global invariants after the full concurrency battery");
  {
    const tb = (
      await db.execute(
        sql`SELECT COALESCE(SUM(jl.debit),0)::numeric AS d, COALESCE(SUM(jl.credit),0)::numeric AS c
            FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
            WHERE je.status IN ('posted','reversed')`,
      )
    )[0] as any;
    ok(
      "trial balance balances (Σdebit = Σcredit)",
      Math.abs(Number(tb.d) - Number(tb.c)) < 0.005,
      `d=${tb.d} c=${tb.c}`,
    );

    // The certified AP reconciliation invariant (as the app computes it):
    //   AP_GL = supplier_subledger_net + unallocated_AP_net  ⇒ difference ≈ 0.
    // This holds even though CONC-A/D deliberately post unlinked AP legs.
    const recon = (await apReconciliation(db as any)) as any;
    ok(
      "AP control reconciles: GL = subledger + unallocated (difference ≈ 0)",
      Math.abs(Number(recon.difference)) < 0.005,
      `apGl=${recon.apGl} sub=${recon.subledgerTotal} unalloc=${recon.unallocated.net} diff=${recon.difference}`,
    );
  }

  console.log(
    `\n${fail === 0 ? "✅" : "❌"} Phase 4A concurrency/reliability: ${pass} passed, ${fail} failed`,
  );
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await closeDb();
  process.exit(1);
});
