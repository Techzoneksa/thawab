/**
 * Finance production preflight service — READ-ONLY diagnostics + certification.
 *
 * Reuses the production accounting engine (balances.ts, statements-core.ts) —
 * it never maintains a second GL, cached totals, or stored trial balance. Every
 * function takes a db handle so it runs against production `db` or a test tx.
 * No secrets, no sensitive narration: only ids, codes, numbers, classifications,
 * dates, amounts.
 */
import { sql } from "drizzle-orm";
import { accounts } from "./schema";
import { getAllAccountBalances } from "./balances";
import { trialBalance, financialPosition, incomeExpense } from "./statements-core";

type Db = { select: (...a: any[]) => any; execute: (q: any) => Promise<any> };

const WHITELIST = [
  "donation",
  "aid",
  "payroll",
  "supplier_payment",
  "inventory_issue",
  "inventory_adjust",
  "opening_balance",
];
const TOL = 0.01;

/** Normalize drizzle .execute() result across postgres-js (array) and pglite ({rows}). */
async function rows(dbh: Db, query: any): Promise<any[]> {
  const r = await dbh.execute(query);
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

export async function checkLegacyBalances(dbh: Db) {
  const accs = await dbh.select().from(accounts);
  const gl = await getAllAccountBalances(dbh);
  const nonzeroList = accs
    .filter((a: any) => Math.abs(Number(a.balance || 0)) > 0.005)
    .map((a: any) => {
      const legacy = Number(a.balance || 0);
      const glBal = gl.get(a.id)?.balance ?? 0;
      const difference = legacy - glBal;
      let classification_result: string;
      if (Math.abs(difference) < TOL) classification_result = "C_MATCHES_GL";
      else if (Math.abs(glBal) < TOL) classification_result = "B_POSSIBLE_OPENING_BALANCE";
      else classification_result = "D_POTENTIAL_INCONSISTENCY";
      return {
        account_code: a.code,
        account_name: a.name,
        classification: a.classification,
        legacy_balance: legacy,
        gl_balance: glBal,
        difference,
        classification_result,
      };
    });
  const nonzero = accs.filter((a: any) => Math.abs(Number(a.balance || 0)) > 0.005);
  return {
    total_accounts: accs.length,
    zero_legacy_balance: accs.length - nonzero.length,
    nonzero_legacy_balance: nonzero.length,
    sum_positive_legacy: nonzero
      .filter((a: any) => a.balance > 0)
      .reduce((s: number, a: any) => s + Number(a.balance), 0),
    sum_negative_legacy: nonzero
      .filter((a: any) => a.balance < 0)
      .reduce((s: number, a: any) => s + Number(a.balance), 0),
    accounts: nonzeroList,
  };
}

export async function checkSourceDuplicates(dbh: Db) {
  const list = `'${WHITELIST.join("','")}'`;
  const groups = await rows(
    dbh,
    sql.raw(`
      SELECT source_type, source_id, count(*)::int journal_count,
             array_agg(number ORDER BY number) journal_numbers,
             array_agg(id ORDER BY id) journal_ids,
             array_agg(date ORDER BY date) dates
      FROM journal_entries
      WHERE status='posted' AND source_id IS NOT NULL AND source_type IN (${list})
      GROUP BY source_type, source_id HAVING count(*) > 1`),
  );
  return { count: groups.length, groups };
}

export async function checkFiscalPeriods(dbh: Db) {
  const periods = await rows(
    dbh,
    sql.raw(`SELECT id,name,start_date,end_date,status FROM fiscal_periods ORDER BY start_date`),
  );
  const invalidRanges = periods.filter((p: any) => p.start_date > p.end_date);
  const overlaps: any[] = [];
  for (let i = 0; i < periods.length; i++)
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i],
        b = periods[j];
      if (a.start_date <= b.end_date && a.end_date >= b.start_date)
        overlaps.push({ a_id: a.id, a_name: a.name, b_id: b.id, b_name: b.name });
    }
  // Calendar gaps between consecutive periods (business dates with no period).
  const gaps: any[] = [];
  const sorted = [...periods].sort((x: any, y: any) => (x.start_date < y.start_date ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = new Date(sorted[i - 1].end_date + "T00:00:00Z").getTime();
    const nextStart = new Date(sorted[i].start_date + "T00:00:00Z").getTime();
    const gapDays = (nextStart - prevEnd) / 86400000;
    if (gapDays > 1)
      gaps.push({
        after: sorted[i - 1].name,
        before: sorted[i].name,
        gap_start: sorted[i - 1].end_date,
        gap_end: sorted[i].start_date,
      });
  }
  return {
    periods,
    invalid_ranges: invalidRanges,
    overlaps,
    gaps,
    invalid_range_count: invalidRanges.length,
    overlap_count: overlaps.length,
  };
}

export async function reconcileGL(dbh: Db) {
  const tb = await trialBalance(dbh);
  return {
    total_debit: tb.totals.totalDebit,
    total_credit: tb.totals.totalCredit,
    difference: tb.totals.difference,
    balanced: tb.totals.balanced,
  };
}

export async function reconcileTrialBalance(dbh: Db) {
  const tb = await trialBalance(dbh);
  return {
    account_count: tb.totals.accountCount,
    total_debit: tb.totals.totalDebit,
    total_credit: tb.totals.totalCredit,
    difference: tb.totals.difference,
    balanced: tb.totals.balanced,
  };
}

export async function reconcileFinancialPosition(dbh: Db) {
  const fp = await financialPosition(dbh);
  return {
    assets: fp.totals.totalAssets,
    liabilities: fp.totals.totalLiabilities,
    net_assets_equity: fp.totals.totalEquity,
    current_surplus_deficit: fp.periodSurplus,
    equation_difference: fp.totals.equationDifference,
    balanced: fp.totals.balanced,
  };
}

export async function reconcileIncomeExpense(dbh: Db) {
  const ie = await incomeExpense(dbh);
  return {
    revenue: ie.totals.totalRevenue,
    expenses: ie.totals.totalExpense,
    surplus_deficit: ie.totals.surplus,
  };
}

export async function checkReversals(dbh: Db) {
  const rev = (
    await rows(
      dbh,
      sql.raw(`SELECT id, number FROM journal_entries WHERE status='reversed' LIMIT 1`),
    )
  )[0];
  if (!rev) return { available: false };
  const mirror = (
    await rows(
      dbh,
      sql.raw(`SELECT id, number FROM journal_entries WHERE reversed_of='${rev.id}' LIMIT 1`),
    )
  )[0];
  const sums = async (jid: string) =>
    (
      await rows(
        dbh,
        sql.raw(
          `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id='${jid}'`,
        ),
      )
    )[0];
  const o = await sums(rev.id);
  const m = mirror ? await sums(mirror.id) : { d: 0, c: 0 };
  return {
    available: true,
    original_journal_number: rev.number,
    reversal_journal_number: mirror?.number ?? null,
    original_total_debit: Number(o.d),
    original_total_credit: Number(o.c),
    reversal_total_debit: Number(m.d),
    reversal_total_credit: Number(m.c),
    combined_net_effect: Number(o.d) + Number(m.d) - (Number(o.c) + Number(m.c)),
  };
}

export async function rowCounts(dbh: Db) {
  const one = async (t: string) => {
    const reg = (await rows(dbh, sql.raw(`SELECT to_regclass('public.${t}') r`)))[0]?.r;
    if (!reg) return { exists: false, count: null };
    const c = (await rows(dbh, sql.raw(`SELECT count(*)::int c FROM ${t}`)))[0]?.c ?? 0;
    return { exists: true, count: Number(c) };
  };
  return {
    accounts: (await one("accounts")).count,
    journal_entries: (await one("journal_entries")).count,
    journal_lines: (await one("journal_lines")).count,
    fiscal_periods: (await one("fiscal_periods")).count,
    budget_lines: (await one("budget_lines")).count,
    import_batches: await one("import_batches"),
  };
}

export async function checkMigrationObjects(dbh: Db) {
  const exists = async (q: string) => Boolean((await rows(dbh, sql.raw(q)))[0]?.ok);
  return {
    import_batches: await exists(`SELECT to_regclass('public.import_batches') IS NOT NULL ok`),
    import_batches_hash_idx: await exists(
      `SELECT count(*)>0 ok FROM pg_indexes WHERE indexname='import_batches_hash_idx'`,
    ),
    journal_entries_source_unique_idx: await exists(
      `SELECT count(*)>0 ok FROM pg_indexes WHERE indexname='journal_entries_source_unique_idx'`,
    ),
    fiscal_periods_valid_range: await exists(
      `SELECT count(*)>0 ok FROM pg_constraint WHERE conname='fiscal_periods_valid_range'`,
    ),
    fiscal_periods_no_overlap: await exists(
      `SELECT count(*)>0 ok FROM pg_proc WHERE proname='fiscal_periods_no_overlap'`,
    ),
    fiscal_periods_no_overlap_trg: await exists(
      `SELECT count(*)>0 ok FROM pg_trigger WHERE tgname='fiscal_periods_no_overlap_trg'`,
    ),
  };
}

export async function checkImportTraceability(dbh: Db) {
  const reg = (await rows(dbh, sql.raw(`SELECT to_regclass('public.import_batches') r`)))[0]?.r;
  if (!reg) return { available: false, reason: "import_batches not deployed yet" };
  const batch = (
    await rows(
      dbh,
      sql.raw(
        `SELECT id, file_name, imported_at, journal_count FROM import_batches WHERE status='success' LIMIT 1`,
      ),
    )
  )[0];
  if (!batch) return { available: false, reason: "No production journal import batch available." };
  const linked = await rows(
    dbh,
    sql.raw(
      `SELECT id, number FROM journal_entries WHERE source_type='journal_import' AND source_id='${batch.id}'`,
    ),
  );
  return {
    available: true,
    batch_id: batch.id,
    file_name: batch.file_name,
    imported_at: batch.imported_at,
    journal_count: Number(batch.journal_count),
    linked_journal_ids: linked.map((l: any) => l.id),
    linked_journal_numbers: linked.map((l: any) => l.number),
  };
}

/** Deterministic accounting-history fingerprint (no narration/PII). */
export async function accountingFingerprint(dbh: Db): Promise<string> {
  const r = await rows(
    dbh,
    sql.raw(`
      WITH agg AS (
        SELECT journal_entry_id, count(*) lc,
               COALESCE(SUM(debit),0) td, COALESCE(SUM(credit),0) tc
        FROM journal_lines GROUP BY journal_entry_id)
      SELECT md5(COALESCE(string_agg(
        je.id||'|'||je.number||'|'||je.date||'|'||je.status||'|'||
        COALESCE(a.lc,0)||'|'||COALESCE(a.td,0)||'|'||COALESCE(a.tc,0),
        E'\\n' ORDER BY je.id), '')) fp
      FROM journal_entries je LEFT JOIN agg a ON a.journal_entry_id=je.id`),
  );
  return r[0]?.fp ?? "";
}

/** The blocking checks that gate migration application. */
export async function preflightGate(dbh: Db) {
  const [dups, periods, gl, tb, fp] = await Promise.all([
    checkSourceDuplicates(dbh),
    checkFiscalPeriods(dbh),
    reconcileGL(dbh),
    reconcileTrialBalance(dbh),
    reconcileFinancialPosition(dbh),
  ]);
  const blockingIssues: { severity: string; message: string }[] = [];
  if (dups.count > 0)
    blockingIssues.push({
      severity: "P1",
      message: `${dups.count} duplicate accounting source(s) detected`,
    });
  if (periods.invalid_range_count > 0)
    blockingIssues.push({
      severity: "P1",
      message: `${periods.invalid_range_count} invalid fiscal-period range(s)`,
    });
  if (periods.overlap_count > 0)
    blockingIssues.push({
      severity: "P1",
      message: `${periods.overlap_count} overlapping fiscal period(s)`,
    });
  if (!gl.balanced)
    blockingIssues.push({
      severity: "P0",
      message: `General Ledger unbalanced (difference ${gl.difference})`,
    });
  if (!tb.balanced)
    blockingIssues.push({
      severity: "P0",
      message: `Trial Balance unbalanced (difference ${tb.difference})`,
    });
  if (!fp.balanced)
    blockingIssues.push({
      severity: "P0",
      message: `Financial Position unreconciled (difference ${fp.equation_difference})`,
    });
  return { pass: blockingIssues.length === 0, blockingIssues, dups, periods, gl, tb, fp };
}

/** Full read-only certification report. */
export async function runPreflight(dbh: Db) {
  const gate = await preflightGate(dbh);
  const [legacy, incomeExp, reversal, counts, objects, importTrace] = await Promise.all([
    checkLegacyBalances(dbh),
    reconcileIncomeExpense(dbh),
    checkReversals(dbh),
    rowCounts(dbh),
    checkMigrationObjects(dbh),
    checkImportTraceability(dbh),
  ]);
  const warnings: { severity: string; message: string }[] = [];
  const inconsistent = legacy.accounts.filter(
    (a: any) => a.classification_result === "D_POTENTIAL_INCONSISTENCY",
  );
  if (legacy.nonzero_legacy_balance > 0)
    warnings.push({
      severity: "P2",
      message: `${legacy.nonzero_legacy_balance} non-zero legacy accounts.balance value(s) — review (not a GL blocker)`,
    });
  return {
    mode: "READ_ONLY",
    overall: gate.pass ? "PASS" : "FAIL",
    migrationReady: gate.pass,
    migrationBlocked: !gate.pass,
    blockingIssues: gate.blockingIssues,
    warnings,
    checks: {
      legacyBalances: legacy,
      duplicates: gate.dups,
      fiscalPeriods: gate.periods,
      generalLedger: gate.gl,
      trialBalance: gate.tb,
      financialPosition: gate.fp,
      incomeExpense: incomeExp,
      reversal,
      rowCounts: counts,
      migrationObjects: objects,
      importTraceability: importTrace,
      legacyInconsistencies: inconsistent.length,
    },
  };
}
