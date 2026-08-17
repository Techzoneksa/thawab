/**
 * Finance Phase 1A production preflight — READ-ONLY.
 *
 * Runs server-side in the deployment environment (no secrets in code, none
 * printed). Reads DATABASE_URL from process.env, else from a .env file
 * (ENV_FILE=/path, default the Hostinger config path). Executes ONLY SELECTs.
 *
 * Usage on the server:
 *   node scripts/finance-preflight.mjs
 * or explicitly:
 *   ENV_FILE=~/domains/thawab.jaadpro.com/hbuilds/config/.env \
 *     /opt/alt/alt-nodejs24/root/usr/bin/node scripts/finance-preflight.mjs
 */
import postgres from "postgres";
import fs from "node:fs";
import os from "node:os";

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const path = (
    process.env.ENV_FILE || `${os.homedir()}/domains/thawab.jaadpro.com/hbuilds/config/.env`
  ).replace(/^~/, os.homedir());
  const txt = fs.readFileSync(path, "utf8");
  const m = txt.match(/DATABASE_URL\s*=\s*['"]?([^'"\n]+?)['"]?\s*$/m);
  if (!m) throw new Error("DATABASE_URL not found in env or " + path);
  return m[1];
}

const WHITELIST = [
  "donation",
  "aid",
  "payroll",
  "supplier_payment",
  "inventory_issue",
  "inventory_adjust",
  "opening_balance",
];

const sql = postgres(resolveUrl(), { prepare: false, max: 1 });
const out = (label, data) => console.log(`\n### ${label}\n` + JSON.stringify(data, null, 2));

async function main() {
  // ---- 15. Row counts ----
  const counts = (
    await sql`SELECT
      (SELECT count(*) FROM journal_entries)::int je,
      (SELECT count(*) FROM journal_lines)::int jl,
      (SELECT count(*) FROM fiscal_periods)::int fp,
      (SELECT count(*) FROM accounts)::int acc`
  )[0];
  out("15. ROW COUNTS", counts);

  // ---- 1. Legacy accounts.balance inventory ----
  out(
    "1. LEGACY accounts.balance INVENTORY",
    (
      await sql`SELECT count(*)::int total_accounts,
        count(*) FILTER (WHERE balance = 0)::int zero_balance,
        count(*) FILTER (WHERE balance <> 0)::int nonzero_balance,
        COALESCE(SUM(balance) FILTER (WHERE balance > 0),0) sum_positive,
        COALESCE(SUM(balance) FILTER (WHERE balance < 0),0) sum_negative
      FROM accounts`
    )[0],
  );

  // ---- 2. Legacy vs GL (same formula as balances.ts) ----
  out(
    "2. LEGACY vs GL (non-zero legacy only)",
    await sql`
      WITH gl AS (
        SELECT jl.account_id,
          SUM(CASE WHEN a.classification IN ('asset','expense')
                   THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END) gl_balance
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.status IN ('posted','reversed')
        GROUP BY jl.account_id)
      SELECT a.code, a.name, a.classification,
             a.balance legacy_balance,
             COALESCE(gl.gl_balance,0) gl_balance,
             (a.balance - COALESCE(gl.gl_balance,0)) difference
      FROM accounts a LEFT JOIN gl ON gl.account_id = a.id
      WHERE a.balance <> 0
      ORDER BY abs(a.balance) DESC`,
  );

  // ---- 4. Duplicate source groups (whitelist) ----
  out(
    "4. DUPLICATE SOURCE GROUPS (whitelist, posted)",
    await sql`
      SELECT source_type, source_id, count(*)::int journal_count,
             array_agg(id) journal_ids, array_agg(number) numbers,
             array_agg(status) statuses, array_agg(date) dates
      FROM journal_entries
      WHERE status='posted' AND source_id IS NOT NULL
        AND source_type IN ${sql(WHITELIST)}
      GROUP BY source_type, source_id HAVING count(*) > 1`,
  );

  // ---- 6. Fiscal period data ----
  out(
    "6a. FISCAL PERIODS",
    await sql`SELECT id,name,start_date,end_date,status FROM fiscal_periods ORDER BY start_date`,
  );
  out(
    "6b. INVALID RANGES (start>end)",
    await sql`SELECT id,name,start_date,end_date FROM fiscal_periods WHERE start_date > end_date`,
  );
  out(
    "6c. OVERLAPPING PERIOD PAIRS",
    await sql`
      SELECT a.id a_id, a.name a_name, a.status a_status,
             b.id b_id, b.name b_name, b.status b_status,
             greatest(a.start_date,b.start_date) overlap_start,
             least(a.end_date,b.end_date) overlap_end
      FROM fiscal_periods a JOIN fiscal_periods b
        ON a.id < b.id AND a.start_date <= b.end_date AND a.end_date >= b.start_date`,
  );

  // ---- 18/19. GL + Trial Balance reconciliation ----
  const gl = (
    await sql`SELECT COALESCE(SUM(jl.debit),0) total_debit, COALESCE(SUM(jl.credit),0) total_credit
      FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
      WHERE je.status IN ('posted','reversed')`
  )[0];
  out("18/19. GL + TRIAL BALANCE RECONCILIATION", {
    total_debit: gl.total_debit,
    total_credit: gl.total_credit,
    difference: Number(gl.total_debit) - Number(gl.total_credit),
    accounts_with_activity: (
      await sql`SELECT count(DISTINCT jl.account_id)::int c FROM journal_lines jl
        JOIN journal_entries je ON je.id=jl.journal_entry_id WHERE je.status IN ('posted','reversed')`
    )[0].c,
  });

  // ---- 20/21. Financial position + Income/Expense ----
  const cls = await sql`
    SELECT a.classification,
      COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    JOIN accounts a ON a.id=jl.account_id
    WHERE je.status IN ('posted','reversed')
    GROUP BY a.classification`;
  const by = Object.fromEntries(
    cls.map((r) => [r.classification, { d: Number(r.d), c: Number(r.c) }]),
  );
  const assets = (by.asset?.d || 0) - (by.asset?.c || 0);
  const liabilities = (by.liability?.c || 0) - (by.liability?.d || 0);
  const equity = (by.equity?.c || 0) - (by.equity?.d || 0);
  const revenue = (by.revenue?.c || 0) - (by.revenue?.d || 0);
  const expense = (by.expense?.d || 0) - (by.expense?.c || 0);
  const surplus = revenue - expense;
  out("20. FINANCIAL POSITION", {
    assets,
    liabilities,
    equity,
    period_surplus: surplus,
    liabilities_plus_equity_plus_surplus: liabilities + equity + surplus,
    equation_difference: assets - (liabilities + equity + surplus),
  });
  out("21. INCOME / EXPENSE", { revenue, expense, surplus_or_deficit: surplus });

  // ---- 22. Reversal example (read-only) ----
  const rev = (
    await sql`SELECT id, number FROM journal_entries WHERE status='reversed' LIMIT 1`
  )[0];
  if (!rev) {
    out(
      "22. REVERSAL VERIFICATION",
      "No production reversed journal available for read-only verification.",
    );
  } else {
    const mirror = (
      await sql`SELECT id, number FROM journal_entries WHERE reversed_of = ${rev.id} LIMIT 1`
    )[0];
    const sums = async (jid) =>
      (
        await sql`SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id=${jid}`
      )[0];
    const o = await sums(rev.id);
    const m = mirror ? await sums(mirror.id) : { d: 0, c: 0 };
    out("22. REVERSAL VERIFICATION", {
      original_number: rev.number,
      reversal_number: mirror?.number ?? null,
      original_debit: o.d,
      original_credit: o.c,
      reversal_debit: m.d,
      reversal_credit: m.c,
      net_debit: Number(o.d) + Number(m.d) - (Number(o.c) + Number(m.c)),
    });
  }

  // ---- 17. DB objects present? (post-deploy) ----
  out("17. DB OBJECTS PRESENT", {
    import_batches: !!(await sql`SELECT to_regclass('public.import_batches') r`)[0].r,
    source_unique_index:
      (
        await sql`SELECT count(*)::int c FROM pg_indexes WHERE indexname='journal_entries_source_unique_idx'`
      )[0].c > 0,
    fiscal_valid_range_check:
      (
        await sql`SELECT count(*)::int c FROM pg_constraint WHERE conname='fiscal_periods_valid_range'`
      )[0].c > 0,
    fiscal_overlap_trigger:
      (
        await sql`SELECT count(*)::int c FROM pg_trigger WHERE tgname='fiscal_periods_no_overlap_trg'`
      )[0].c > 0,
  });

  // ---- 23. Import batch example (post-deploy) ----
  const ib = (await sql`SELECT to_regclass('public.import_batches') r`)[0].r;
  if (ib) {
    const batch = (
      await sql`SELECT id, file_name, file_hash, status, journal_count, imported_at FROM import_batches WHERE status='success' LIMIT 1`
    )[0];
    if (batch) {
      const linked = (
        await sql`SELECT count(*)::int c FROM journal_entries WHERE source_type='journal_import' AND source_id=${batch.id}`
      )[0].c;
      out("23. IMPORT BATCH TRACEABILITY", {
        ...batch,
        file_hash: batch.file_hash?.slice(0, 12) + "…",
        linked_journals: linked,
      });
    } else {
      out("23. IMPORT BATCH TRACEABILITY", "No production import batch available yet.");
    }
  } else {
    out("23. IMPORT BATCH TRACEABILITY", "import_batches not deployed yet.");
  }

  console.log("\n### DONE (read-only preflight complete)");
  await sql.end();
}
main().catch((e) => {
  console.error("PREFLIGHT ERROR:", e.message);
  process.exit(1);
});
