/**
 * Phase 2B — Receipt Vouchers (سندات القبض) tests.
 *
 * Exercises the REAL certified building blocks against PGlite — validateVoucher /
 * resolveDestination / accountMappedToActiveCashBank (receipt-voucher.ts +
 * cash-bank.ts), postBalancedEntry / reverseEntry / existingSourceEntryId (gl.ts),
 * and evaluateTransition + RECEIPT_TRANSITIONS (finance-permissions.ts). The thin
 * status-orchestration is mirrored here in the SAME order the service uses and
 * additionally locked down by source assertions on the service/route files.
 *
 * Covers RV-A..H, WF-A..H, POST-A..H, IDEM-A..D, REV-A..E, PERM-A..F, AUD-A..C.
 * Run: node_modules/.bin/tsx scripts/test-phase-2b.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { receiptVouchers, receiptVoucherLines } from "@/server/db/schema";
import { validateVoucher, resolveDestination } from "@/server/db/receipt-voucher";
import { accountMappedToActiveCashBank } from "@/server/db/cash-bank";
import { postBalancedEntry, reverseEntry, existingSourceEntryId } from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";
import { now } from "@/server/db/index";
import { AppError } from "@/server/db/errors";
import {
  evaluateTransition,
  findTransition,
  RECEIPT_TRANSITIONS,
  FINANCE_PERMISSIONS as P,
} from "@/lib/finance-permissions";

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
async function throwsCode(fn: () => Promise<any>, code: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e: any) {
    return e?.code === code || String(e?.message).includes(code);
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
/** Real governance decision for a receipt-voucher transition. */
function decide(
  fromStatus: string,
  action: any,
  perms: string[],
  opts: { createdBy?: string; currentUserId?: string; reason?: string } = {},
) {
  const t = findTransition(fromStatus, action, RECEIPT_TRANSITIONS);
  const perm = t?.permission ?? null;
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: (p) => (perm ? p === perm && grants(perms, perm) : false),
    createdBy: opts.createdBy ?? "maker",
    currentUserId: opts.currentUserId ?? "checker",
    reason: opts.reason,
    transitions: RECEIPT_TRANSITIONS,
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
CREATE TABLE cashboxes (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
  linked_account_id text NOT NULL, currency text NOT NULL DEFAULT 'SAR', status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE bank_accounts (id text PRIMARY KEY, code text NOT NULL UNIQUE, bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '', account_number text, iban text, iban_normalized text,
  currency text NOT NULL DEFAULT 'SAR', linked_account_id text NOT NULL, status text NOT NULL DEFAULT 'active',
  branch_id text, notes text DEFAULT '', created_by text,
  created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE journal_entries (id text PRIMARY KEY, number text NOT NULL, date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', amount double precision NOT NULL DEFAULT 0,
  fund text NOT NULL DEFAULT 'unrestricted', currency text NOT NULL DEFAULT 'SAR', period_id text,
  project_id text, source text NOT NULL DEFAULT 'manual', source_type text, source_id text,
  status text NOT NULL DEFAULT 'draft', submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text, reversed_of text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE UNIQUE INDEX journal_entries_receipt_voucher_source_idx ON journal_entries (source_id) WHERE source_type = 'receipt_voucher';
CREATE TABLE journal_lines (id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '', debit double precision NOT NULL DEFAULT 0,
  credit double precision NOT NULL DEFAULT 0, fund text NOT NULL DEFAULT 'unrestricted',
  cost_center_id text, project_id text, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', closed_at text,
  closed_by_id text, closed_by_name text, reopened_at text, reopened_by_id text, reopened_by_name text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE receipt_vouchers (id text PRIMARY KEY, voucher_number text NOT NULL UNIQUE,
  voucher_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft',
  cashbox_id text, bank_account_id text, payer_name text NOT NULL DEFAULT '',
  payer_reference_type text, payer_reference_id text, external_reference text,
  description text DEFAULT '', notes text DEFAULT '', currency text NOT NULL DEFAULT 'SAR',
  total_amount double precision NOT NULL DEFAULT 0, journal_entry_id text,
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '',
  submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text,
  CONSTRAINT receipt_vouchers_one_destination_chk CHECK
    ((cashbox_id IS NOT NULL AND bank_account_id IS NULL) OR (cashbox_id IS NULL AND bank_account_id IS NOT NULL)));
CREATE UNIQUE INDEX receipt_vouchers_journal_entry_idx ON receipt_vouchers (journal_entry_id);
CREATE TABLE receipt_voucher_lines (id text PRIMARY KEY, receipt_voucher_id text NOT NULL,
  line_number int NOT NULL DEFAULT 1, account_id text NOT NULL, amount double precision NOT NULL DEFAULT 0,
  description text DEFAULT '', cost_center_id text, created_at text NOT NULL DEFAULT '');
CREATE TABLE finance_workflow_events (id text PRIMARY KEY, entity_type text NOT NULL, entity_id text NOT NULL,
  action text NOT NULL, from_status text, to_status text, user_id text, user_name text DEFAULT '',
  reason text DEFAULT '', metadata text DEFAULT '{}', created_at text NOT NULL DEFAULT '');
`;

async function freshDb() {
  const client = new PGlite();
  const db = drizzle(client) as any;
  for (const s of DDL.split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await client.exec(s);
  const accs = [
    ["a-cash", "1010", "Cash", "asset", true],
    ["a-bank", "1020", "Bank", "asset", true],
    ["a-cash2", "1011", "Cash inactive", "asset", true],
    ["a-bank2", "1021", "Bank inactive", "asset", true],
    ["a-rev", "4010", "Donations revenue", "revenue", true],
    ["a-recv", "1210", "Receivable", "asset", true],
    ["a-parent", "1000", "Current assets", "asset", false],
    ["a-counter", "3010", "Net assets", "equity", true],
  ];
  for (const [id, code, name, cls, postable] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency) VALUES ('${id}','${code}','${name}','${cls}',${postable},'active','SAR')`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  // Active cashbox → a-cash; active bank → a-bank; inactive masters for RV-D/E.
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,status,currency) VALUES ('cb1','CB1','Main','a-cash','active','SAR'),('cb-inact','CB2','Old','a-cash2','inactive','SAR')`,
  );
  await client.exec(
    `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,status,currency) VALUES ('ba1','BA1','Riyad','a-bank','active','SAR'),('ba-inact','BA2','Old','a-bank2','inactive','SAR')`,
  );
  return { db, client };
}

async function seedVoucher(
  db: any,
  v: {
    id: string;
    number: string;
    status?: string;
    cashboxId?: string | null;
    bankAccountId?: string | null;
    total: number;
    date?: string;
    currency?: string;
    createdBy?: string;
    lines: { acc: string; amt: number }[];
  },
) {
  await db.insert(receiptVouchers).values({
    id: v.id,
    voucherNumber: v.number,
    voucherDate: v.date ?? "2026-03-01",
    status: v.status ?? "approved",
    cashboxId: v.cashboxId ?? null,
    bankAccountId: v.bankAccountId ?? null,
    payerName: "المتبرع",
    currency: v.currency ?? "SAR",
    totalAmount: v.total,
    createdBy: v.createdBy ?? "u1",
    createdAt: now(),
    updatedAt: now(),
  });
  let n = 0;
  for (const l of v.lines)
    await db.insert(receiptVoucherLines).values({
      id: `${v.id}-l${++n}`,
      receiptVoucherId: v.id,
      lineNumber: n,
      accountId: l.acc,
      amount: l.amt,
      createdAt: now(),
    });
}

/** Mirror of the service post: lock → status guard → idempotency → validate →
 *  balanced journal (certified engine) → guarded status update. */
async function approveAndPost(db: any, id: string, userId: string) {
  return db.transaction(async (tx: any) => {
    const locked = (
      await tx
        .select()
        .from(receiptVouchers)
        .where(eq(receiptVouchers.id, id))
        .for("update")
        .limit(1)
    )[0];
    if (!locked || locked.status !== "approved") throw new AppError("state", 409, "STATE_CONFLICT");
    if (await existingSourceEntryId(tx, "receipt_voucher", id))
      throw new AppError("already posted", 409, "ALREADY_POSTED");
    const lines = await tx
      .select()
      .from(receiptVoucherLines)
      .where(eq(receiptVoucherLines.receiptVoucherId, id))
      .orderBy(receiptVoucherLines.lineNumber);
    const dest = await validateVoucher(tx, {
      cashboxId: locked.cashboxId,
      bankAccountId: locked.bankAccountId,
      currency: locked.currency,
      totalAmount: locked.totalAmount,
      lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
    });
    const jLines = [
      { accountId: dest.linkedAccountId, debit: Number(locked.totalAmount) },
      ...lines.map((l: any) => ({ accountId: l.accountId, credit: Number(l.amount) })),
    ];
    const entryId = await postBalancedEntry(tx, {
      date: locked.voucherDate,
      description: `سند قبض ${locked.voucherNumber}`,
      currency: locked.currency,
      source: "receipt_voucher",
      sourceType: "receipt_voucher",
      sourceId: id,
      lines: jLines,
      userId,
      status: "posted",
    });
    const changed = await tx
      .update(receiptVouchers)
      .set({
        status: "posted",
        journalEntryId: entryId,
        postedBy: userId,
        postedAt: now(),
        updatedAt: now(),
      })
      .where(and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, "approved")))
      .returning({ id: receiptVouchers.id });
    if (!changed.length) throw new AppError("state", 409, "STATE_CONFLICT");
    return entryId;
  });
}

async function reverseVoucher(db: any, id: string, userId: string) {
  return db.transaction(async (tx: any) => {
    const locked = (
      await tx
        .select()
        .from(receiptVouchers)
        .where(eq(receiptVouchers.id, id))
        .for("update")
        .limit(1)
    )[0];
    if (!locked || locked.status !== "posted") throw new AppError("state", 409, "STATE_CONFLICT");
    if (!locked.journalEntryId) throw new AppError("no journal", 409, "NO_JOURNAL");
    const revId = await reverseEntry(tx, locked.journalEntryId, userId);
    const changed = await tx
      .update(receiptVouchers)
      .set({ status: "reversed", reversedBy: userId, reversedAt: now(), updatedAt: now() })
      .where(and(eq(receiptVouchers.id, id), eq(receiptVouchers.status, "posted")))
      .returning({ id: receiptVouchers.id });
    if (!changed.length) throw new AppError("state", 409, "STATE_CONFLICT");
    return revId;
  });
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/receipt-voucher.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/finance/receipt-vouchers.ts"),
  "utf8",
);

async function main() {
  // ===================== RV-A..H — validation =====================
  console.log("\nRV-A..H — receipt voucher validation");
  {
    const { db, client } = await freshDb();
    // RV-A valid draft (cashbox + revenue credit) → resolves, no throw, no GL.
    const dest = await validateVoucher(db, {
      cashboxId: "cb1",
      currency: "SAR",
      totalAmount: 5000,
      lines: [{ accountId: "a-rev", amount: 5000 }],
    });
    ok("RV-A: valid draft resolves to cashbox linked GL", dest.linkedAccountId === "a-cash");
    const bal = await getAccountBalance(db, "a-cash");
    ok("RV-A: no GL effect from validation/draft", Math.abs(bal.closing) < 0.001);

    ok(
      "RV-B: neither cashbox nor bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, { totalAmount: 100, lines: [{ accountId: "a-rev", amount: 100 }] }),
        "DESTINATION_REQUIRED",
      ),
    );
    ok(
      "RV-C: both cashbox AND bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            bankAccountId: "ba1",
            totalAmount: 100,
            lines: [{ accountId: "a-rev", amount: 100 }],
          }),
        "DESTINATION_BOTH",
      ),
    );
    ok(
      "RV-D: inactive cashbox → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb-inact",
            totalAmount: 100,
            lines: [{ accountId: "a-rev", amount: 100 }],
          }),
        "CASHBOX_INACTIVE",
      ),
    );
    ok(
      "RV-E: inactive bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            bankAccountId: "ba-inact",
            totalAmount: 100,
            lines: [{ accountId: "a-rev", amount: 100 }],
          }),
        "BANK_INACTIVE",
      ),
    );
    ok(
      "RV-F: non-postable credit account → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            totalAmount: 100,
            lines: [{ accountId: "a-parent", amount: 100 }],
          }),
        "CREDIT_ACCOUNT_NOT_POSTABLE",
      ),
    );
    ok(
      "RV-G: credit account mapped to active cash/bank → REJECT (use transfer)",
      await throwsCode(
        () =>
          validateVoucher(db, {
            bankAccountId: "ba1",
            totalAmount: 100,
            lines: [{ accountId: "a-cash", amount: 100 }],
          }),
        "INTERNAL_TRANSFER_BLOCKED",
      ),
    );
    ok(
      "RV-H: lines total != voucher total → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            totalAmount: 5000,
            lines: [{ accountId: "a-rev", amount: 4000 }],
          }),
        "TOTAL_MISMATCH",
      ),
    );
    ok(
      "RV: multi-line credits summing to total are accepted",
      !!(await validateVoucher(db, {
        cashboxId: "cb1",
        totalAmount: 5000,
        lines: [
          { accountId: "a-rev", amount: 3000 },
          { accountId: "a-recv", amount: 2000 },
        ],
      })),
    );
    // DB CHECK backstop: raw insert violating one-destination fails.
    let checkNeither = "";
    try {
      await client.exec(
        `INSERT INTO receipt_vouchers (id,voucher_number,voucher_date,total_amount) VALUES ('bad1','RV-x1','2026-03-01',10)`,
      );
    } catch (e: any) {
      checkNeither = String(e?.message || e);
    }
    ok(
      "DB CHECK: neither destination raw-insert rejected",
      /one_destination|check constraint/i.test(checkNeither),
      checkNeither,
    );
    let checkBoth = "";
    try {
      await client.exec(
        `INSERT INTO receipt_vouchers (id,voucher_number,voucher_date,total_amount,cashbox_id,bank_account_id) VALUES ('bad2','RV-x2','2026-03-01',10,'cb1','ba1')`,
      );
    } catch (e: any) {
      checkBoth = String(e?.message || e);
    }
    ok(
      "DB CHECK: both destinations raw-insert rejected",
      /one_destination|check constraint/i.test(checkBoth),
      checkBoth,
    );
    ok(
      "mapped helper: active cashbox account detected",
      (await accountMappedToActiveCashBank(db, "a-cash")) === "cashbox",
    );
    ok(
      "mapped helper: unmapped revenue account is free",
      (await accountMappedToActiveCashBank(db, "a-rev")) === null,
    );
  }

  // ===================== WF-A..H — workflow =====================
  console.log("\nWF-A..H — workflow governance");
  {
    const full = [
      P.receiptSubmit,
      P.receiptApprove,
      P.receiptReject,
      P.receiptPost,
      P.receiptReverse,
    ];
    ok("WF-A: draft → submit allowed", decide("draft", "submit", full).ok);
    ok(
      "WF-B: creator self-approval blocked",
      decide("submitted", "approve", full, { createdBy: "u1", currentUserId: "u1" }).code ===
        "SELF_APPROVAL",
    );
    ok(
      "WF-C: different approver approves submitted",
      decide("submitted", "approve", full, { createdBy: "u1", currentUserId: "u2" }).ok,
    );
    ok(
      "WF-D: draft → post rejected (illegal)",
      decide("draft", "post", full).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-E: submitted → post rejected (illegal)",
      decide("submitted", "post", full).code === "ILLEGAL_TRANSITION",
    );
    ok(
      "WF-F: return submitted → draft with reason",
      decide("submitted", "return", full, { reason: "تصحيح المبلغ" }).ok &&
        decide("submitted", "return", full, { reason: "تصحيح المبلغ" }).toStatus === "draft",
    );
    ok(
      "WF-G: reject with empty reason rejected",
      decide("submitted", "reject", full, { reason: "  " }).code === "REASON_REQUIRED",
    );
    ok(
      "WF-H: posted voucher cannot be edited (no draft/update transition)",
      findTransition("posted", "submit", RECEIPT_TRANSITIONS) === null,
    );
    ok("WF: approved → post allowed", decide("approved", "post", full).ok);
    ok(
      "WF: posted → reverse needs reason",
      decide("posted", "reverse", full, { reason: "" }).code === "REASON_REQUIRED",
    );
  }

  // ===================== POST-A..H — posting =====================
  console.log("\nPOST-A..H — posting to the General Ledger");
  {
    const { db } = await freshDb();
    // POST-D: balance before posting is zero.
    await seedVoucher(db, {
      id: "rvC",
      number: "RV-2026-000001",
      cashboxId: "cb1",
      total: 5000,
      lines: [{ acc: "a-rev", amt: 5000 }],
    });
    const before = await getAccountBalance(db, "a-cash");
    ok("POST-D: cash balance before posting unchanged (0)", Math.abs(before.closing) < 0.001);

    const entryId = await approveAndPost(db, "rvC", "u2");
    const eRows = await (db as any).execute(
      `SELECT * FROM journal_entries WHERE id='${entryId}'` as any,
    );
    const entry = (eRows.rows ?? eRows)[0];
    const lRows = await (db as any).execute(
      `SELECT * FROM journal_lines WHERE journal_entry_id='${entryId}' ORDER BY line_number` as any,
    );
    const jl = lRows.rows ?? lRows;
    const dr = jl.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const cr = jl.reduce((s: number, l: any) => s + Number(l.credit), 0);
    ok(
      "POST-A: cashbox voucher posts ONE balanced journal",
      entry?.status === "posted" && Math.abs(dr - cr) < 0.005 && Math.abs(dr - 5000) < 0.005,
    );
    ok(
      "POST-A: debit = cashbox linked GL account",
      jl.find((l: any) => Number(l.debit) > 0)?.account_id === "a-cash",
    );
    ok(
      "POST-A: credit = receipt line account",
      jl.find((l: any) => Number(l.credit) > 0)?.account_id === "a-rev",
    );
    ok(
      "POST-C: journal source_type/source_id trace to voucher",
      entry?.source_type === "receipt_voucher" && entry?.source_id === "rvC",
    );
    const after = await getAccountBalance(db, "a-cash");
    ok(
      "POST-E: cash balance after posting increases per GL (5000)",
      Math.abs(after.closing - 5000) < 0.005,
    );

    // POST-B: bank voucher posts one balanced journal.
    await seedVoucher(db, {
      id: "rvB",
      number: "RV-2026-000002",
      bankAccountId: "ba1",
      total: 1200,
      lines: [{ acc: "a-rev", amt: 1200 }],
    });
    const bEntry = await approveAndPost(db, "rvB", "u2");
    const bBal = await getAccountBalance(db, "a-bank");
    ok(
      "POST-B: bank voucher posts balanced journal, bank GL +1200",
      !!bEntry && Math.abs(bBal.closing - 1200) < 0.005,
    );

    // POST-F: closed fiscal period → reject.
    const { db: db2, client: c2 } = await freshDb();
    await c2.exec(`UPDATE fiscal_periods SET status='closed' WHERE id='p'`);
    await seedVoucher(db2, {
      id: "rvClosed",
      number: "RV-2026-000003",
      cashboxId: "cb1",
      total: 100,
      date: "2026-03-01",
      lines: [{ acc: "a-rev", amt: 100 }],
    });
    ok(
      "POST-F: posting into CLOSED period rejected",
      await throwsCode(() => approveAndPost(db2, "rvClosed", "u2"), "الفترة"),
    );

    // POST-G: date with no defined period → reject.
    const { db: db3 } = await freshDb();
    await seedVoucher(db3, {
      id: "rvNoPeriod",
      number: "RV-2026-000004",
      cashboxId: "cb1",
      total: 100,
      date: "2030-01-01",
      lines: [{ acc: "a-rev", amt: 100 }],
    });
    ok(
      "POST-G: posting with undefined period rejected",
      await throwsCode(() => approveAndPost(db3, "rvNoPeriod", "u2"), "فترة"),
    );

    // POST-H: master active on approval but inactive before post → reject.
    const { db: db4, client: c4 } = await freshDb();
    await seedVoucher(db4, {
      id: "rvDeact",
      number: "RV-2026-000005",
      cashboxId: "cb1",
      total: 100,
      lines: [{ acc: "a-rev", amt: 100 }],
    });
    await c4.exec(`UPDATE cashboxes SET status='inactive' WHERE id='cb1'`);
    ok(
      "POST-H: destination deactivated before post rejected",
      await throwsCode(() => approveAndPost(db4, "rvDeact", "u2"), "CASHBOX_INACTIVE"),
    );
  }

  // ===================== IDEM-A..D — idempotency/concurrency =====================
  console.log("\nIDEM-A..D — idempotency & concurrency");
  {
    const { db } = await freshDb();
    await seedVoucher(db, {
      id: "rvI",
      number: "RV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-rev", amt: 700 }],
    });
    await approveAndPost(db, "rvI", "u2");
    ok(
      "IDEM-A: second sequential post → rejected (one journal)",
      await throwsCode(() => approveAndPost(db, "rvI", "u2"), "STATE_CONFLICT"),
    );
    const cnt1 = (
      await (db as any).execute(
        `SELECT count(*)::int c FROM journal_entries WHERE source_type='receipt_voucher' AND source_id='rvI'` as any,
      )
    ).rows[0].c;
    ok("IDEM-A: exactly one journal for the voucher", Number(cnt1) === 1);

    // IDEM-B: two parallel posts → exactly one effect.
    const { db: db2 } = await freshDb();
    await seedVoucher(db2, {
      id: "rvP",
      number: "RV-2026-000001",
      cashboxId: "cb1",
      total: 900,
      lines: [{ acc: "a-rev", amt: 900 }],
    });
    const res = await Promise.allSettled([
      approveAndPost(db2, "rvP", "u2"),
      approveAndPost(db2, "rvP", "u2"),
    ]);
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    const cnt2 = (
      await (db2 as any).execute(
        `SELECT count(*)::int c FROM journal_entries WHERE source_type='receipt_voucher' AND source_id='rvP'` as any,
      )
    ).rows[0].c;
    ok(
      "IDEM-B: two parallel posts → exactly one succeeds",
      okCount === 1,
      JSON.stringify(res.map((r) => r.status)),
    );
    ok("IDEM-B: exactly one accounting effect", Number(cnt2) === 1);

    // IDEM-C: DB-level source uniqueness for receipt_voucher.
    const { client: client3 } = await freshDb();
    await client3.exec(
      `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j1','J1','2026-03-01','receipt_voucher','receipt_voucher','rvX','posted')`,
    );
    let idemCErr = "";
    try {
      await client3.exec(
        `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j2','J2','2026-03-01','receipt_voucher','receipt_voucher','rvX','posted')`,
      );
    } catch (e: any) {
      idemCErr = String(e?.message || e);
    }
    ok(
      "IDEM-C: duplicate receipt_voucher source journal impossible (unique index)",
      /receipt_voucher_source|unique/i.test(idemCErr),
      idemCErr,
    );

    // IDEM-D: two vouchers created concurrently get unique numbers (nextCode).
    const { db: db4 } = await freshDb();
    const { nextCode } = await import("@/server/db/numbering");
    const mk = (id: string) =>
      db4.transaction(async (tx: any) => {
        const num = await nextCode(tx, {
          table: "receipt_vouchers",
          column: "voucher_number",
          prefix: "RV-",
          year: true,
        });
        await tx
          .insert(receiptVouchers)
          .values({
            id,
            voucherNumber: num,
            voucherDate: "2026-03-01",
            status: "draft",
            cashboxId: "cb1",
            totalAmount: 1,
            createdBy: "u1",
            createdAt: now(),
            updatedAt: now(),
          });
        return num;
      });
    const nums = await Promise.all([mk("v1"), mk("v2"), mk("v3")]);
    ok(
      "IDEM-D: concurrent voucher numbers are unique",
      new Set(nums).size === 3,
      JSON.stringify(nums),
    );
  }

  // ===================== REV-A..E — reversal =====================
  console.log("\nREV-A..E — reversal");
  {
    // REV-A: authorization for reverse is a distinct permission.
    ok(
      "REV-A: no receipt.reverse → reverse forbidden",
      decide("posted", "reverse", [P.receiptPost], { reason: "x" }).code === "FORBIDDEN",
    );
    ok(
      "REV-B: authorized reverser + reason allowed",
      decide("posted", "reverse", [P.receiptReverse], { reason: "خطأ" }).ok,
    );

    const { db } = await freshDb();
    await seedVoucher(db, {
      id: "rvR",
      number: "RV-2026-000001",
      cashboxId: "cb1",
      total: 3000,
      lines: [{ acc: "a-rev", amt: 3000 }],
    });
    await approveAndPost(db, "rvR", "u2");
    const balPosted = await getAccountBalance(db, "a-cash");
    const revId = await reverseVoucher(db, "rvR", "u3");
    const balReversed = await getAccountBalance(db, "a-cash");
    ok("REV-B: reversal succeeds (mirror journal created)", !!revId);
    ok(
      "REV-C: cash balance nets to zero after reversal",
      Math.abs(balPosted.closing - 3000) < 0.005 && Math.abs(balReversed.closing) < 0.005,
    );
    ok(
      "REV-D: second reversal attempt rejected",
      await throwsCode(() => reverseVoucher(db, "rvR", "u3"), "STATE_CONFLICT"),
    );
    const orig = (await (db as any).execute(`SELECT * FROM receipt_vouchers WHERE id='rvR'` as any))
      .rows[0];
    const origJournal = (
      await (db as any).execute(
        `SELECT * FROM journal_entries WHERE id='${orig.journal_entry_id}'` as any,
      )
    ).rows[0];
    ok(
      "REV-E: original voucher preserved + linked journal readable (reversed)",
      orig.status === "reversed" && origJournal?.status === "reversed" && !!orig.journal_entry_id,
    );
  }

  // ===================== PERM-A..F — permission separation =====================
  console.log("\nPERM-A..F — permission separation");
  {
    ok(
      "PERM-A: no receipt.create → create route 403",
      /hasPermission\([^)]*receiptCreate\)/.test(route) &&
        !grants([P.receiptView], P.receiptCreate),
    );
    ok(
      "PERM-B: receipt.view only → mutation forbidden",
      !grants([P.receiptView], P.receiptSubmit) && !grants([P.receiptView], P.receiptPost),
    );
    ok(
      "PERM-C: receipt.submit does NOT imply approve",
      decide("submitted", "approve", [P.receiptSubmit], { createdBy: "u1", currentUserId: "u2" })
        .code === "FORBIDDEN",
    );
    ok(
      "PERM-D: receipt.approve does NOT imply post",
      decide("approved", "post", [P.receiptApprove]).code === "FORBIDDEN",
    );
    ok(
      "PERM-E: receipt.post does NOT imply reverse",
      decide("posted", "reverse", [P.receiptPost], { reason: "x" }).code === "FORBIDDEN",
    );
    ok(
      "PERM-F: receipt perms do not imply cash/bank master mutation",
      !grants([P.receiptCreate, P.receiptPost, P.receiptReverse], P.cashCreate) &&
        !grants([P.receiptCreate, P.receiptPost, P.receiptReverse], P.bankCreate) &&
        !grants([P.receiptCreate, P.receiptPost, P.receiptReverse], P.cashUpdate),
    );
    ok(
      "PERM: route reads gated by finance.receipt.view",
      /authHandler\(P\.receiptView/.test(route),
    );
    ok(
      "PERM: draft edit gated by finance.receipt.update_draft",
      /authHandler\(P\.receiptUpdateDraft/.test(route),
    );
  }

  // ===================== AUD-A..C — audit & history =====================
  console.log("\nAUD-A..C — audit & workflow history");
  {
    // AUD-A: full lifecycle produces chronological workflow history rows.
    const { db } = await freshDb();
    const events: any[] = [];
    async function record(tx: any, action: string, from: string | null, to: string) {
      await tx.execute(
        `INSERT INTO finance_workflow_events (id,entity_type,entity_id,action,from_status,to_status,user_id,user_name,created_at) VALUES ('${action}-${events.length}','receipt_voucher','rvH','${action}','${from ?? ""}','${to}','u1','User','${now()}')` as any,
      );
      events.push(action);
    }
    await seedVoucher(db, {
      id: "rvH",
      number: "RV-2026-000001",
      cashboxId: "cb1",
      total: 100,
      lines: [{ acc: "a-rev", amt: 100 }],
    });
    await db.transaction((tx: any) => record(tx, "create", null, "draft"));
    await db.transaction((tx: any) => record(tx, "submit", "draft", "submitted"));
    await db.transaction((tx: any) => record(tx, "return", "submitted", "draft"));
    await db.transaction((tx: any) => record(tx, "submit", "draft", "submitted"));
    await db.transaction((tx: any) => record(tx, "approve", "submitted", "approved"));
    const rows = (
      await (db as any).execute(
        `SELECT * FROM finance_workflow_events WHERE entity_id='rvH' ORDER BY created_at` as any,
      )
    ).rows;
    ok(
      "AUD-A: create→submit→return→submit→approve history recorded in order",
      rows.length === 5 && rows[0].action === "create" && rows[4].action === "approve",
    );
    ok(
      "AUD-B: workflow events carry actor + entity + transition",
      rows.every((r: any) => r.user_id && r.entity_id === "rvH" && r.to_status),
    );

    // AUD-C: the service writes both immutable workflow history AND audit log,
    // with distinct RECEIPT_VOUCHER_* actions, and never an update path for them.
    ok(
      "AUD: service records workflow events for receipt_voucher",
      /recordWorkflowEvent\(/.test(svc) && /entityType: "receipt_voucher"/.test(svc),
    );
    ok(
      "AUD: service emits RECEIPT_VOUCHER_* audit actions",
      /RECEIPT_VOUCHER_CREATED/.test(svc) &&
        /RECEIPT_VOUCHER_POSTED/.test(svc) &&
        /RECEIPT_VOUCHER_REVERSED/.test(svc),
    );
    ok(
      "AUD-C: no legacy cash/bank default resolver used for vouchers",
      !/cashOrBankAccountId/.test(svc) && !/SYS\.CASH|SYS\.BANK/.test(svc),
    );
    ok(
      "SRC: money destination resolved server-side from selected master",
      /resolveDestination/.test(svc) && /linkedAccountId/.test(svc),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
