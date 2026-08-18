/**
 * Phase 2C — Payment Vouchers (سندات الصرف) tests.
 *
 * Exercises the REAL certified building blocks against PGlite — validateVoucher /
 * resolveSource / accountMappedToAnyCashBank / acquireCashPostingLock (payment-
 * voucher.ts + cash-bank.ts), postBalancedEntry / reverseEntry /
 * existingSourceEntryId (gl.ts), getAccountBalance (as-of), and evaluateTransition
 * + PAYMENT_TRANSITIONS. The thin status-orchestration + cash-sufficiency posting
 * is mirrored here in the SAME order the service uses, and additionally locked
 * down by source assertions on the service/route files.
 *
 * Covers PV-A..H, WF-A..H, POST-A..H, CASH-PAY-A..D, CASH-HIST-A..H (Phase 2C.1
 * backdated safety), CASH-RACE-A..D, BANK-PAY-A, IDEM-A..D, REV-A..E, PERM-A..F,
 * AUD-A..D.
 * Run: node_modules/.bin/tsx scripts/test-phase-2c.mts
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { paymentVouchers, paymentVoucherLines } from "@/server/db/schema";
import { validateVoucher } from "@/server/db/payment-voucher";
import {
  accountMappedToAnyCashBank,
  acquireCashPostingLock,
  assertCashPaymentSafe,
} from "@/server/db/cash-bank";
import { postBalancedEntry, reverseEntry, existingSourceEntryId } from "@/server/db/gl";
import { getAccountBalance } from "@/server/db/balances";
import { now } from "@/server/db/index";
import { AppError } from "@/server/db/errors";
import {
  evaluateTransition,
  findTransition,
  PAYMENT_TRANSITIONS,
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
function decide(
  fromStatus: string,
  action: any,
  perms: string[],
  opts: { createdBy?: string; currentUserId?: string; reason?: string } = {},
) {
  const t = findTransition(fromStatus, action, PAYMENT_TRANSITIONS);
  const perm = t?.permission ?? null;
  return evaluateTransition({
    fromStatus,
    action,
    hasPerm: (p) => (perm ? p === perm && grants(perms, perm) : false),
    createdBy: opts.createdBy ?? "maker",
    currentUserId: opts.currentUserId ?? "checker",
    reason: opts.reason,
    transitions: PAYMENT_TRANSITIONS,
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
CREATE UNIQUE INDEX journal_entries_payment_voucher_source_idx ON journal_entries (source_id) WHERE source_type = 'payment_voucher';
CREATE TABLE journal_lines (id text PRIMARY KEY, journal_entry_id text NOT NULL, line_number int NOT NULL,
  account_id text NOT NULL, description text DEFAULT '', debit double precision NOT NULL DEFAULT 0,
  credit double precision NOT NULL DEFAULT 0, fund text NOT NULL DEFAULT 'unrestricted',
  cost_center_id text, project_id text, notes text DEFAULT '', created_at text NOT NULL DEFAULT '');
CREATE TABLE fiscal_periods (id text PRIMARY KEY, name text NOT NULL, start_date text NOT NULL DEFAULT '',
  end_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', closed_at text,
  closed_by_id text, closed_by_name text, reopened_at text, reopened_by_id text, reopened_by_name text,
  notes text DEFAULT '', created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '');
CREATE TABLE payment_vouchers (id text PRIMARY KEY, voucher_number text NOT NULL UNIQUE,
  voucher_date text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft',
  cashbox_id text, bank_account_id text, payee_name text NOT NULL DEFAULT '',
  payee_reference_type text, payee_reference_id text, external_reference text,
  description text DEFAULT '', notes text DEFAULT '', currency text NOT NULL DEFAULT 'SAR',
  total_amount double precision NOT NULL DEFAULT 0, journal_entry_id text,
  created_by text, created_at text NOT NULL DEFAULT '', updated_at text NOT NULL DEFAULT '',
  submitted_by text, submitted_at text, approved_by text, approved_at text,
  posted_by text, posted_at text, reversed_by text, reversed_at text,
  CONSTRAINT payment_vouchers_one_source_chk CHECK
    ((cashbox_id IS NOT NULL AND bank_account_id IS NULL) OR (cashbox_id IS NULL AND bank_account_id IS NOT NULL)));
CREATE UNIQUE INDEX payment_vouchers_journal_entry_idx ON payment_vouchers (journal_entry_id);
CREATE TABLE payment_voucher_lines (id text PRIMARY KEY, payment_voucher_id text NOT NULL,
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
    ["a-exp", "5010", "Office expense", "expense", true],
    ["a-payable", "2110", "Supplier payable", "liability", true],
    ["a-parent", "5000", "Expenses", "expense", false],
    ["a-counter", "3010", "Net assets", "equity", true],
  ];
  for (const [id, code, name, cls, postable] of accs)
    await client.exec(
      `INSERT INTO accounts (id,code,name,classification,postable,status,currency) VALUES ('${id}','${code}','${name}','${cls}',${postable},'active','SAR')`,
    );
  await client.exec(
    `INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('p','FY2026','2026-01-01','2026-12-31','open')`,
  );
  await client.exec(
    `INSERT INTO cashboxes (id,code,name,linked_account_id,status,currency) VALUES ('cb1','CB1','Main','a-cash','active','SAR'),('cb-inact','CB2','Old','a-cash2','inactive','SAR')`,
  );
  await client.exec(
    `INSERT INTO bank_accounts (id,code,bank_name,linked_account_id,status,currency) VALUES ('ba1','BA1','Riyad','a-bank','active','SAR'),('ba-inact','BA2','Old','a-bank2','inactive','SAR')`,
  );
  return { db, client };
}

/** Post Dr <acct> / Cr net-assets — used to fund a cashbox/bank with book cash. */
async function fund(db: any, acct: string, amount: number, date: string) {
  return db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date,
      description: "fund",
      source: "manual",
      lines: [
        { accountId: acct, debit: amount },
        { accountId: "a-counter", credit: amount },
      ],
      userId: "u0",
      status: "posted",
    }),
  );
}
/** Post Dr expense / Cr <acct> — reduces book cash by amount on the given date. */
async function spend(db: any, acct: string, amount: number, date: string) {
  return db.transaction((tx: any) =>
    postBalancedEntry(tx, {
      date,
      description: "spend",
      source: "manual",
      lines: [
        { accountId: "a-exp", debit: amount },
        { accountId: acct, credit: amount },
      ],
      userId: "u0",
      status: "posted",
    }),
  );
}
/** Insert a posted journal directly (bypasses period control) — seeds arbitrary-
 *  dated existing ledger data such as a future-dated posted cash movement. */
async function rawPosted(
  client: any,
  id: string,
  date: string,
  drAcct: string,
  crAcct: string,
  amount: number,
) {
  await client.exec(
    `INSERT INTO journal_entries (id,number,date,source,source_type,status) VALUES ('${id}','${id}','${date}','manual','manual','posted')`,
  );
  await client.exec(
    `INSERT INTO journal_lines (id,journal_entry_id,line_number,account_id,debit,credit) VALUES ('${id}-1','${id}',1,'${drAcct}',${amount},0),('${id}-2','${id}',2,'${crAcct}',0,${amount})`,
  );
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
  await db.insert(paymentVouchers).values({
    id: v.id,
    voucherNumber: v.number,
    voucherDate: v.date ?? "2026-03-01",
    status: v.status ?? "approved",
    cashboxId: v.cashboxId ?? null,
    bankAccountId: v.bankAccountId ?? null,
    payeeName: "المستفيد",
    currency: v.currency ?? "SAR",
    totalAmount: v.total,
    createdBy: v.createdBy ?? "u1",
    createdAt: now(),
    updatedAt: now(),
  });
  let n = 0;
  for (const l of v.lines)
    await db.insert(paymentVoucherLines).values({
      id: `${v.id}-l${++n}`,
      paymentVoucherId: v.id,
      lineNumber: n,
      accountId: l.acc,
      amount: l.amt,
      createdAt: now(),
    });
}

/** Mirror of the service post: lock → status guard → idempotency → validate →
 *  (cashbox) advisory lock + as-of sufficiency → balanced journal (Dr lines /
 *  Cr source) → guarded status update. */
async function approveAndPost(db: any, id: string, userId: string) {
  return db.transaction(async (tx: any) => {
    const locked = (
      await tx
        .select()
        .from(paymentVouchers)
        .where(eq(paymentVouchers.id, id))
        .for("update")
        .limit(1)
    )[0];
    if (!locked || locked.status !== "approved") throw new AppError("state", 409, "STATE_CONFLICT");
    if (await existingSourceEntryId(tx, "payment_voucher", id))
      throw new AppError("already posted", 409, "ALREADY_POSTED");
    const lines = await tx
      .select()
      .from(paymentVoucherLines)
      .where(eq(paymentVoucherLines.paymentVoucherId, id))
      .orderBy(paymentVoucherLines.lineNumber);
    const src = await validateVoucher(tx, {
      cashboxId: locked.cashboxId,
      bankAccountId: locked.bankAccountId,
      currency: locked.currency,
      totalAmount: locked.totalAmount,
      lines: lines.map((l: any) => ({ accountId: l.accountId, amount: Number(l.amount) })),
    });
    if (src.kind === "cashbox") {
      await acquireCashPostingLock(tx, src.linkedAccountId);
      // REAL backdated-safe check (min daily balance over [voucher_date, end]).
      await assertCashPaymentSafe(
        tx,
        src.linkedAccountId,
        locked.voucherDate,
        Number(locked.totalAmount),
      );
    }
    const jLines = [
      ...lines.map((l: any) => ({ accountId: l.accountId, debit: Number(l.amount) })),
      { accountId: src.linkedAccountId, credit: Number(locked.totalAmount) },
    ];
    const entryId = await postBalancedEntry(tx, {
      date: locked.voucherDate,
      description: `سند صرف ${locked.voucherNumber}`,
      currency: locked.currency,
      source: "payment_voucher",
      sourceType: "payment_voucher",
      sourceId: id,
      lines: jLines,
      userId,
      status: "posted",
    });
    const changed = await tx
      .update(paymentVouchers)
      .set({
        status: "posted",
        journalEntryId: entryId,
        postedBy: userId,
        postedAt: now(),
        updatedAt: now(),
      })
      .where(and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, "approved")))
      .returning({ id: paymentVouchers.id });
    if (!changed.length) throw new AppError("state", 409, "STATE_CONFLICT");
    return entryId;
  });
}

async function reverseVoucher(db: any, id: string, userId: string) {
  return db.transaction(async (tx: any) => {
    const locked = (
      await tx
        .select()
        .from(paymentVouchers)
        .where(eq(paymentVouchers.id, id))
        .for("update")
        .limit(1)
    )[0];
    if (!locked || locked.status !== "posted") throw new AppError("state", 409, "STATE_CONFLICT");
    if (!locked.journalEntryId) throw new AppError("no journal", 409, "NO_JOURNAL");
    const revId = await reverseEntry(tx, locked.journalEntryId, userId);
    const changed = await tx
      .update(paymentVouchers)
      .set({ status: "reversed", reversedBy: userId, reversedAt: now(), updatedAt: now() })
      .where(and(eq(paymentVouchers.id, id), eq(paymentVouchers.status, "posted")))
      .returning({ id: paymentVouchers.id });
    if (!changed.length) throw new AppError("state", 409, "STATE_CONFLICT");
    return revId;
  });
}

const svc = readFileSync(resolve(process.cwd(), "src/server/db/payment-voucher.ts"), "utf8");
const route = readFileSync(
  resolve(process.cwd(), "src/routes/api/finance/payment-vouchers.ts"),
  "utf8",
);

async function main() {
  // ===================== PV-A..H — validation =====================
  console.log("\nPV-A..H — payment voucher validation");
  {
    const { db, client } = await freshDb();
    const src = await validateVoucher(db, {
      cashboxId: "cb1",
      currency: "SAR",
      totalAmount: 5000,
      lines: [{ accountId: "a-exp", amount: 5000 }],
    });
    ok("PV-A: valid draft resolves to cashbox linked GL", src.linkedAccountId === "a-cash");
    ok(
      "PV-A: no GL effect from validation/draft",
      Math.abs((await getAccountBalance(db, "a-cash")).closing) < 0.001,
    );

    ok(
      "PV-B: neither cashbox nor bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, { totalAmount: 100, lines: [{ accountId: "a-exp", amount: 100 }] }),
        "SOURCE_REQUIRED",
      ),
    );
    ok(
      "PV-C: both cashbox AND bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            bankAccountId: "ba1",
            totalAmount: 100,
            lines: [{ accountId: "a-exp", amount: 100 }],
          }),
        "SOURCE_BOTH",
      ),
    );
    ok(
      "PV-D: inactive cashbox → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb-inact",
            totalAmount: 100,
            lines: [{ accountId: "a-exp", amount: 100 }],
          }),
        "CASHBOX_INACTIVE",
      ),
    );
    ok(
      "PV-E: inactive bank → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            bankAccountId: "ba-inact",
            totalAmount: 100,
            lines: [{ accountId: "a-exp", amount: 100 }],
          }),
        "BANK_INACTIVE",
      ),
    );
    ok(
      "PV-F: non-postable debit account → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            totalAmount: 100,
            lines: [{ accountId: "a-parent", amount: 100 }],
          }),
        "DEBIT_ACCOUNT_NOT_POSTABLE",
      ),
    );
    ok(
      "PV-G: debit account mapped to active cash/bank → REJECT",
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
      "PV-G: debit account mapped to INACTIVE cash/bank also REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            totalAmount: 100,
            lines: [{ accountId: "a-cash2", amount: 100 }],
          }),
        "INTERNAL_TRANSFER_BLOCKED",
      ),
    );
    ok(
      "PV-H: lines total != voucher total → REJECT",
      await throwsCode(
        () =>
          validateVoucher(db, {
            cashboxId: "cb1",
            totalAmount: 5000,
            lines: [{ accountId: "a-exp", amount: 4000 }],
          }),
        "TOTAL_MISMATCH",
      ),
    );
    ok(
      "PV: multi-line debits summing to total accepted",
      !!(await validateVoucher(db, {
        cashboxId: "cb1",
        totalAmount: 5000,
        lines: [
          { accountId: "a-exp", amount: 3000 },
          { accountId: "a-payable", amount: 2000 },
        ],
      })),
    );

    let checkNeither = "";
    try {
      await client.exec(
        `INSERT INTO payment_vouchers (id,voucher_number,voucher_date,total_amount) VALUES ('bad1','PV-x1','2026-03-01',10)`,
      );
    } catch (e: any) {
      checkNeither = String(e?.message || e);
    }
    ok(
      "DB CHECK: neither source raw-insert rejected",
      /one_source|check constraint/i.test(checkNeither),
      checkNeither,
    );
    ok(
      "mapped helper (any status): active cashbox account detected",
      (await accountMappedToAnyCashBank(db, "a-cash")) === "cashbox",
    );
    ok(
      "mapped helper (any status): inactive bank account detected",
      (await accountMappedToAnyCashBank(db, "a-bank2")) === "bank",
    );
    ok(
      "mapped helper: unmapped expense account is free",
      (await accountMappedToAnyCashBank(db, "a-exp")) === null,
    );
  }

  // ===================== WF-A..H — workflow =====================
  console.log("\nWF-A..H — workflow governance");
  {
    const full = [
      P.paymentSubmit,
      P.paymentApprove,
      P.paymentReject,
      P.paymentPost,
      P.paymentReverse,
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
      decide("submitted", "return", full, { reason: "تصحيح" }).ok &&
        decide("submitted", "return", full, { reason: "تصحيح" }).toStatus === "draft",
    );
    ok(
      "WF-G: reject with empty reason rejected",
      decide("submitted", "reject", full, { reason: "  " }).code === "REASON_REQUIRED",
    );
    ok(
      "WF-H: posted voucher cannot be edited (no transition off posted except reverse)",
      findTransition("posted", "submit", PAYMENT_TRANSITIONS) === null,
    );
    ok("WF: approved → post allowed", decide("approved", "post", full).ok);
  }

  // ===================== POST-A..H — posting =====================
  console.log("\nPOST-A..H — posting to the General Ledger");
  {
    const { db } = await freshDb();
    await fund(db, "a-cash", 10000, "2026-02-01");
    await seedVoucher(db, {
      id: "pvC",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 5000,
      lines: [
        { acc: "a-exp", amt: 3000 },
        { acc: "a-payable", amt: 2000 },
      ],
    });
    const before = await getAccountBalance(db, "a-cash");
    ok(
      "POST-D: cash balance before posting unchanged (10000)",
      Math.abs(before.closing - 10000) < 0.005,
    );
    const entryId = await approveAndPost(db, "pvC", "u2");
    const eRows = await (db as any).execute(`SELECT * FROM journal_entries WHERE id='${entryId}'`);
    const entry = (eRows.rows ?? eRows)[0];
    const lRows = await (db as any).execute(
      `SELECT * FROM journal_lines WHERE journal_entry_id='${entryId}' ORDER BY line_number`,
    );
    const jl = lRows.rows ?? lRows;
    const dr = jl.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const cr = jl.reduce((s: number, l: any) => s + Number(l.credit), 0);
    ok(
      "POST-A: cashbox voucher posts ONE balanced journal",
      entry?.status === "posted" && Math.abs(dr - cr) < 0.005 && Math.abs(dr - 5000) < 0.005,
    );
    ok(
      "POST-A: credit = cashbox linked GL account (money out)",
      jl.find((l: any) => Number(l.credit) > 0)?.account_id === "a-cash",
    );
    ok(
      "POST-A: debits = payment line accounts",
      jl
        .filter((l: any) => Number(l.debit) > 0)
        .map((l: any) => l.account_id)
        .sort()
        .join(",") === "a-exp,a-payable",
    );
    ok(
      "POST-C: journal source_type/source_id trace to voucher",
      entry?.source_type === "payment_voucher" && entry?.source_id === "pvC",
    );
    const after = await getAccountBalance(db, "a-cash");
    ok(
      "POST-E: cash balance after posting decreases per GL (5000)",
      Math.abs(after.closing - 5000) < 0.005,
    );

    const { db: db2 } = await freshDb();
    await fund(db2, "a-bank", 10000, "2026-02-01");
    await seedVoucher(db2, {
      id: "pvB",
      number: "PV-2026-000002",
      bankAccountId: "ba1",
      total: 1200,
      lines: [{ acc: "a-exp", amt: 1200 }],
    });
    const bEntry = await approveAndPost(db2, "pvB", "u2");
    const bBal = await getAccountBalance(db2, "a-bank");
    ok(
      "POST-B: bank voucher posts balanced journal, bank GL -1200 → 8800",
      !!bEntry && Math.abs(bBal.closing - 8800) < 0.005,
    );

    const { db: db3, client: c3 } = await freshDb();
    await fund(db3, "a-cash", 1000, "2026-02-01");
    await c3.exec(`UPDATE fiscal_periods SET status='closed' WHERE id='p'`);
    await seedVoucher(db3, {
      id: "pvClosed",
      number: "PV-2026-000003",
      cashboxId: "cb1",
      total: 100,
      lines: [{ acc: "a-exp", amt: 100 }],
    });
    ok(
      "POST-F: posting into CLOSED period rejected",
      await throwsCode(() => approveAndPost(db3, "pvClosed", "u2"), "الفترة"),
    );

    const { db: db4 } = await freshDb();
    await fund(db4, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db4, {
      id: "pvNoPeriod",
      number: "PV-2026-000004",
      cashboxId: "cb1",
      total: 100,
      date: "2030-01-01",
      lines: [{ acc: "a-exp", amt: 100 }],
    });
    ok(
      "POST-G: posting with undefined period rejected",
      await throwsCode(() => approveAndPost(db4, "pvNoPeriod", "u2"), "فترة"),
    );

    const { db: db5, client: c5 } = await freshDb();
    await fund(db5, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db5, {
      id: "pvDeact",
      number: "PV-2026-000005",
      cashboxId: "cb1",
      total: 100,
      lines: [{ acc: "a-exp", amt: 100 }],
    });
    await c5.exec(`UPDATE cashboxes SET status='inactive' WHERE id='cb1'`);
    ok(
      "POST-H: source deactivated before post rejected",
      await throwsCode(() => approveAndPost(db5, "pvDeact", "u2"), "CASHBOX_INACTIVE"),
    );
  }

  // ===================== CASH-PAY-A..D — cash sufficiency =====================
  console.log("\nCASH-PAY-A..D — cashbox sufficiency");
  {
    const { db } = await freshDb();
    await fund(db, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db, {
      id: "cpA",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    await approveAndPost(db, "cpA", "u2");
    ok(
      "CASH-PAY-A: 700 from 1000 posts, closing cash = 300",
      Math.abs((await getAccountBalance(db, "a-cash")).closing - 300) < 0.005,
    );

    const { db: db2 } = await freshDb();
    await fund(db2, "a-cash", 500, "2026-02-01");
    await seedVoucher(db2, {
      id: "cpB",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    ok(
      "CASH-PAY-B: 700 from 500 → INSUFFICIENT_CASH",
      await throwsCode(() => approveAndPost(db2, "cpB", "u2"), "INSUFFICIENT_CASH"),
    );
    const noJournal = (
      await (db2 as any).execute(
        `SELECT count(*)::int c FROM journal_entries WHERE source_type='payment_voucher'`,
      )
    ).rows[0].c;
    ok("CASH-PAY-B: no journal created", Number(noJournal) === 0);

    const { db: db3 } = await freshDb();
    await fund(db3, "a-cash", 700, "2026-02-01");
    await seedVoucher(db3, {
      id: "cpC",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    await approveAndPost(db3, "cpC", "u2");
    ok(
      "CASH-PAY-C: exact balance posts, closing = 0",
      Math.abs((await getAccountBalance(db3, "a-cash")).closing) < 0.005,
    );

    // CASH-PAY-D: future-dated receipt must not count toward as-of availability.
    const { db: db4 } = await freshDb();
    await fund(db4, "a-cash", 1000, "2026-02-01");
    await fund(db4, "a-cash", 5000, "2026-09-01"); // future receipt
    await seedVoucher(db4, {
      id: "cpD",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 1500,
      date: "2026-03-01",
      lines: [{ acc: "a-exp", amt: 1500 }],
    });
    ok(
      "CASH-PAY-D: future receipt excluded from as-of cash → 1500 rejected (avail=1000)",
      await throwsCode(() => approveAndPost(db4, "cpD", "u2"), "INSUFFICIENT_CASH"),
    );
    await seedVoucher(db4, {
      id: "cpD2",
      number: "PV-2026-000002",
      cashboxId: "cb1",
      total: 700,
      date: "2026-03-01",
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    await approveAndPost(db4, "cpD2", "u2");
    ok(
      "CASH-PAY-D: 700 within as-of 1000 posts fine",
      Math.abs((await getAccountBalance(db4, "a-cash", { dateTo: "2026-03-01" })).closing - 300) <
        0.005,
    );
  }

  // ===================== CASH-RACE-A..C — cash concurrency =====================
  console.log("\nCASH-RACE-A..C — cash payment concurrency");
  {
    const { db } = await freshDb();
    await fund(db, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db, {
      id: "rA1",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    await seedVoucher(db, {
      id: "rA2",
      number: "PV-2026-000002",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    const rA = await Promise.allSettled([
      approveAndPost(db, "rA1", "u2"),
      approveAndPost(db, "rA2", "u2"),
    ]);
    const okA = rA.filter((r) => r.status === "fulfilled").length;
    ok(
      "CASH-RACE-A: 700+700 from 1000 → exactly one posts",
      okA === 1,
      JSON.stringify(rA.map((r) => r.status)),
    );
    ok(
      "CASH-RACE-A: final cash = 300 (never negative)",
      Math.abs((await getAccountBalance(db, "a-cash")).closing - 300) < 0.005,
    );

    const { db: db2 } = await freshDb();
    await fund(db2, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db2, {
      id: "rB1",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 600,
      lines: [{ acc: "a-exp", amt: 600 }],
    });
    await seedVoucher(db2, {
      id: "rB2",
      number: "PV-2026-000002",
      cashboxId: "cb1",
      total: 400,
      lines: [{ acc: "a-exp", amt: 400 }],
    });
    const rB = await Promise.allSettled([
      approveAndPost(db2, "rB1", "u2"),
      approveAndPost(db2, "rB2", "u2"),
    ]);
    const okB = rB.filter((r) => r.status === "fulfilled").length;
    ok(
      "CASH-RACE-B: 600+400 from 1000 → both post",
      okB === 2,
      JSON.stringify(rB.map((r) => r.status)),
    );
    ok(
      "CASH-RACE-B: final cash = 0",
      Math.abs((await getAccountBalance(db2, "a-cash")).closing) < 0.005,
    );

    const { db: db3 } = await freshDb();
    await fund(db3, "a-cash", 1000, "2026-02-01");
    await seedVoucher(db3, {
      id: "rC",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    const rC = await Promise.allSettled([
      approveAndPost(db3, "rC", "u2"),
      approveAndPost(db3, "rC", "u2"),
    ]);
    const okC = rC.filter((r) => r.status === "fulfilled").length;
    const cntC = (
      await (db3 as any).execute(`SELECT count(*)::int c FROM journal_entries WHERE source_id='rC'`)
    ).rows[0].c;
    ok(
      "CASH-RACE-C: two concurrent posts of SAME voucher → one effect",
      okC === 1 && Number(cntC) === 1,
    );

    // CASH-RACE-D: two concurrent BACKDATED payments, each safe alone (min=1000),
    // together would breach; the future 5000 receipt must not let both through.
    const { db: db4 } = await freshDb();
    await fund(db4, "a-cash", 1000, "2026-08-01");
    await fund(db4, "a-cash", 5000, "2026-08-20"); // later receipt → current 6000
    await seedVoucher(db4, {
      id: "rD1",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 600,
      date: "2026-08-01",
      lines: [{ acc: "a-exp", amt: 600 }],
    });
    await seedVoucher(db4, {
      id: "rD2",
      number: "PV-2026-000002",
      cashboxId: "cb1",
      total: 600,
      date: "2026-08-01",
      lines: [{ acc: "a-exp", amt: 600 }],
    });
    const rD = await Promise.allSettled([
      approveAndPost(db4, "rD1", "u2"),
      approveAndPost(db4, "rD2", "u2"),
    ]);
    const okD = rD.filter((r) => r.status === "fulfilled").length;
    const minAug01 = (await getAccountBalance(db4, "a-cash", { dateTo: "2026-08-01" })).closing;
    ok(
      "CASH-RACE-D: concurrent backdated payments serialized → exactly one posts",
      okD === 1,
      JSON.stringify(rD.map((r) => r.status)),
    );
    ok(
      "CASH-RACE-D: historical Aug-01 cash never negative (= 400)",
      minAug01 >= -0.005 && Math.abs(minAug01 - 400) < 0.005,
    );
  }

  // ===================== CASH-HIST-A..H — backdated cash safety =====================
  console.log("\nCASH-HIST-A..H — backdated cash payment protection");
  {
    // A: as-of Aug-01 is 10000 but Aug-10 closing is 500 → 2000 must REJECT.
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 10000, "2026-08-01");
      await spend(db, "a-cash", 9500, "2026-08-10"); // Aug-10 closing = 500
      await seedVoucher(db, {
        id: "hA",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 2000,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 2000 }],
      });
      const rej = await throwsCode(() => approveAndPost(db, "hA", "u2"), "INSUFFICIENT_CASH");
      const cnt = (
        await (db as any).execute(
          `SELECT count(*)::int c FROM journal_entries WHERE source_id='hA'`,
        )
      ).rows[0].c;
      ok("CASH-HIST-A: backdated 2000 rejected (later balance 500)", rej && Number(cnt) === 0);
    }
    // B: 01→1000, 05→100, 10→2100; backdated Aug-01 500 rejected (Aug-05 would be −400).
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await spend(db, "a-cash", 900, "2026-08-05"); // 100
      await fund(db, "a-cash", 2000, "2026-08-10"); // 2100
      await seedVoucher(db, {
        id: "hB",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500 }],
      });
      ok(
        "CASH-HIST-B: intermediate-negative protection rejects 500",
        await throwsCode(() => approveAndPost(db, "hB", "u2"), "INSUFFICIENT_CASH"),
      );
    }
    // C: min later balance 800, payment 500 → SUCCESS, all later balances ≥ 0.
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await spend(db, "a-cash", 200, "2026-08-05"); // 800 (the window minimum)
      await seedVoucher(db, {
        id: "hC",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500 }],
      });
      await approveAndPost(db, "hC", "u2");
      const minAfter = (await getAccountBalance(db, "a-cash", { dateTo: "2026-08-05" })).closing;
      ok(
        "CASH-HIST-C: valid backdated 500 posts, min later balance ≥ 0 (=300)",
        Math.abs(minAfter - 300) < 0.005,
      );
    }
    // D: exact minimum — min later 500, payment 500 → SUCCESS, min becomes 0.
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await spend(db, "a-cash", 500, "2026-08-05"); // 500
      await seedVoucher(db, {
        id: "hD",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500 }],
      });
      await approveAndPost(db, "hD", "u2");
      ok(
        "CASH-HIST-D: exact-minimum 500 posts, resulting min = 0",
        Math.abs((await getAccountBalance(db, "a-cash", { dateTo: "2026-08-05" })).closing) < 0.005,
      );
    }
    // E: one unit above minimum → REJECT.
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await spend(db, "a-cash", 500, "2026-08-05"); // min later 500
      await seedVoucher(db, {
        id: "hE",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500.01,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500.01 }],
      });
      ok(
        "CASH-HIST-E: 500.01 over minimum 500 rejected",
        await throwsCode(() => approveAndPost(db, "hE", "u2"), "INSUFFICIENT_CASH"),
      );
    }
    // F: future receipt must not hide an intermediate shortage.
    {
      const { db } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await spend(db, "a-cash", 800, "2026-08-05"); // 200 (intermediate low)
      await fund(db, "a-cash", 4800, "2026-08-20"); // 5000 later
      await seedVoucher(db, {
        id: "hF",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500 }],
      });
      ok(
        "CASH-HIST-F: future receipt cannot rescue intermediate shortage (200) → reject 500",
        await throwsCode(() => approveAndPost(db, "hF", "u2"), "INSUFFICIENT_CASH"),
      );
    }
    // G: a future-dated POSTED cash reduction participates in the window.
    {
      const { db, client } = await freshDb();
      await fund(db, "a-cash", 1000, "2026-08-01");
      await rawPosted(client, "fut", "2099-01-01", "a-exp", "a-cash", 900); // future closing = 100
      await seedVoucher(db, {
        id: "hG",
        number: "PV-2026-000001",
        cashboxId: "cb1",
        total: 500,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 500 }],
      });
      const safe = await assertCashPaymentSafe(db, "a-cash", "2026-08-01", 0).catch(() => -1);
      ok("CASH-HIST-G: future-dated posted movement lowers window min to 100", safe === 100);
      ok(
        "CASH-HIST-G: payment 500 rejected (future-dated reduction counted)",
        await throwsCode(() => approveAndPost(db, "hG", "u2"), "INSUFFICIENT_CASH"),
      );
    }
    // H: Bank control — same shape, NO cashbox sufficiency rejection.
    {
      const { db } = await freshDb();
      await fund(db, "a-bank", 1000, "2026-08-01");
      await spend(db, "a-bank", 900, "2026-08-10"); // bank later balance 100
      await seedVoucher(db, {
        id: "hH",
        number: "PV-2026-000001",
        bankAccountId: "ba1",
        total: 2000,
        date: "2026-08-01",
        lines: [{ acc: "a-exp", amt: 2000 }],
      });
      await approveAndPost(db, "hH", "u2");
      ok(
        "CASH-HIST-H: bank backdated payment posts (no cash timeline rule)",
        !!(
          await (db as any).execute(
            `SELECT count(*)::int c FROM journal_entries WHERE source_id='hH'`,
          )
        ).rows[0].c,
      );
    }
  }

  // ===================== BANK-PAY-A — bank overdraft allowed =====================
  console.log("\nBANK-PAY-A — bank negative balance policy");
  {
    const { db } = await freshDb();
    await fund(db, "a-bank", 100, "2026-02-01");
    await seedVoucher(db, {
      id: "bpA",
      number: "PV-2026-000001",
      bankAccountId: "ba1",
      total: 500,
      lines: [{ acc: "a-exp", amt: 500 }],
    });
    await approveAndPost(db, "bpA", "u2");
    ok(
      "BANK-PAY-A: 500 from bank of 100 posts (no block), closing = -400",
      Math.abs((await getAccountBalance(db, "a-bank")).closing - -400) < 0.005,
    );
  }

  // ===================== IDEM-A..D — idempotency =====================
  console.log("\nIDEM-A..D — idempotency & concurrency");
  {
    const { db } = await freshDb();
    await fund(db, "a-cash", 10000, "2026-02-01");
    await seedVoucher(db, {
      id: "iA",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 700,
      lines: [{ acc: "a-exp", amt: 700 }],
    });
    await approveAndPost(db, "iA", "u2");
    ok(
      "IDEM-A: second sequential post → rejected",
      await throwsCode(() => approveAndPost(db, "iA", "u2"), "STATE_CONFLICT"),
    );
    const cnt1 = (
      await (db as any).execute(`SELECT count(*)::int c FROM journal_entries WHERE source_id='iA'`)
    ).rows[0].c;
    ok("IDEM-A: exactly one journal", Number(cnt1) === 1);

    const { db: db2 } = await freshDb();
    await fund(db2, "a-cash", 10000, "2026-02-01");
    await seedVoucher(db2, {
      id: "iB",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 900,
      lines: [{ acc: "a-exp", amt: 900 }],
    });
    const rB = await Promise.allSettled([
      approveAndPost(db2, "iB", "u2"),
      approveAndPost(db2, "iB", "u2"),
    ]);
    const cntB = (
      await (db2 as any).execute(`SELECT count(*)::int c FROM journal_entries WHERE source_id='iB'`)
    ).rows[0].c;
    ok(
      "IDEM-B: parallel same-voucher post → one journal",
      rB.filter((r) => r.status === "fulfilled").length === 1 && Number(cntB) === 1,
    );

    const { client: c3 } = await freshDb();
    await c3.exec(
      `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j1','J1','2026-03-01','payment_voucher','payment_voucher','pvX','posted')`,
    );
    let idemCErr = "";
    try {
      await c3.exec(
        `INSERT INTO journal_entries (id,number,date,source,source_type,source_id,status) VALUES ('j2','J2','2026-03-01','payment_voucher','payment_voucher','pvX','posted')`,
      );
    } catch (e: any) {
      idemCErr = String(e?.message || e);
    }
    ok(
      "IDEM-C: duplicate payment_voucher source journal impossible",
      /payment_voucher_source|unique/i.test(idemCErr),
      idemCErr,
    );

    const { db: db4 } = await freshDb();
    const { nextCode } = await import("@/server/db/numbering");
    const mk = (id: string) =>
      db4.transaction(async (tx: any) => {
        const num = await nextCode(tx, {
          table: "payment_vouchers",
          column: "voucher_number",
          prefix: "PV-",
          year: true,
        });
        await tx.insert(paymentVouchers).values({
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
    ok("IDEM-D: concurrent voucher numbers unique", new Set(nums).size === 3, JSON.stringify(nums));
  }

  // ===================== REV-A..E — reversal =====================
  console.log("\nREV-A..E — reversal");
  {
    ok(
      "REV-A: no payment.reverse → reverse forbidden",
      decide("posted", "reverse", [P.paymentPost], { reason: "x" }).code === "FORBIDDEN",
    );
    ok(
      "REV-B: authorized reverser + reason allowed",
      decide("posted", "reverse", [P.paymentReverse], { reason: "خطأ" }).ok,
    );

    const { db } = await freshDb();
    await fund(db, "a-cash", 10000, "2026-02-01");
    await seedVoucher(db, {
      id: "rvR",
      number: "PV-2026-000001",
      cashboxId: "cb1",
      total: 3000,
      lines: [{ acc: "a-exp", amt: 3000 }],
    });
    await approveAndPost(db, "rvR", "u2");
    const balPosted = await getAccountBalance(db, "a-cash");
    const revId = await reverseVoucher(db, "rvR", "u3");
    const balReversed = await getAccountBalance(db, "a-cash");
    ok("REV-B: reversal succeeds", !!revId);
    ok(
      "REV-C: cash increases back after reversal (7000 → 10000)",
      Math.abs(balPosted.closing - 7000) < 0.005 && Math.abs(balReversed.closing - 10000) < 0.005,
    );
    ok(
      "REV-D: second reversal rejected",
      await throwsCode(() => reverseVoucher(db, "rvR", "u3"), "STATE_CONFLICT"),
    );
    const orig = (await (db as any).execute(`SELECT * FROM payment_vouchers WHERE id='rvR'`))
      .rows[0];
    const origJournal = (
      await (db as any).execute(`SELECT * FROM journal_entries WHERE id='${orig.journal_entry_id}'`)
    ).rows[0];
    ok(
      "REV-E: original voucher + journal preserved (reversed)",
      orig.status === "reversed" && origJournal?.status === "reversed" && !!orig.journal_entry_id,
    );
  }

  // ===================== PERM-A..F =====================
  console.log("\nPERM-A..F — permission separation");
  {
    ok(
      "PERM-A: no payment.create → create route 403",
      /hasPermission\([^)]*paymentCreate\)/.test(route) &&
        !grants([P.paymentView], P.paymentCreate),
    );
    ok(
      "PERM-B: payment.view only → mutation forbidden",
      !grants([P.paymentView], P.paymentSubmit) && !grants([P.paymentView], P.paymentPost),
    );
    ok(
      "PERM-C: payment.submit does NOT imply approve",
      decide("submitted", "approve", [P.paymentSubmit], { createdBy: "u1", currentUserId: "u2" })
        .code === "FORBIDDEN",
    );
    ok(
      "PERM-D: payment.approve does NOT imply post",
      decide("approved", "post", [P.paymentApprove]).code === "FORBIDDEN",
    );
    ok(
      "PERM-E: payment.post does NOT imply reverse",
      decide("posted", "reverse", [P.paymentPost], { reason: "x" }).code === "FORBIDDEN",
    );
    ok(
      "PERM-F: payment perms do not imply cash/bank master mutation",
      !grants([P.paymentCreate, P.paymentPost, P.paymentReverse], P.cashCreate) &&
        !grants([P.paymentCreate, P.paymentPost, P.paymentReverse], P.bankCreate) &&
        !grants([P.paymentCreate, P.paymentPost, P.paymentReverse], P.cashUpdate),
    );
    ok(
      "PERM: route reads gated by finance.payment.view",
      /authHandler\(P\.paymentView/.test(route),
    );
    ok(
      "PERM: draft edit gated by finance.payment.update_draft",
      /authHandler\(P\.paymentUpdateDraft/.test(route),
    );
  }

  // ===================== AUD-A..D =====================
  console.log("\nAUD-A..D — audit & workflow history");
  {
    const { db } = await freshDb();
    const events: any[] = [];
    async function record(tx: any, action: string, from: string | null, to: string) {
      await tx.execute(
        `INSERT INTO finance_workflow_events (id,entity_type,entity_id,action,from_status,to_status,user_id,user_name,created_at) VALUES ('${action}-${events.length}','payment_voucher','pvH','${action}','${from ?? ""}','${to}','u1','User','${now()}')`,
      );
      events.push(action);
    }
    await db.transaction((tx: any) => record(tx, "create", null, "draft"));
    await db.transaction((tx: any) => record(tx, "submit", "draft", "submitted"));
    await db.transaction((tx: any) => record(tx, "return", "submitted", "draft"));
    await db.transaction((tx: any) => record(tx, "submit", "draft", "submitted"));
    await db.transaction((tx: any) => record(tx, "approve", "submitted", "approved"));
    await db.transaction((tx: any) => record(tx, "post", "approved", "posted"));
    const rows = (
      await (db as any).execute(
        `SELECT * FROM finance_workflow_events WHERE entity_id='pvH' ORDER BY created_at`,
      )
    ).rows;
    ok(
      "AUD-A: full lifecycle history recorded in order",
      rows.length === 6 && rows[0].action === "create" && rows[5].action === "post",
    );
    ok(
      "AUD-B: workflow events carry actor + entity + transition",
      rows.every((r: any) => r.user_id && r.entity_id === "pvH" && r.to_status),
    );
    ok(
      "AUD: service records workflow events for payment_voucher",
      /recordWorkflowEvent\(/.test(svc) && /entityType: "payment_voucher"/.test(svc),
    );
    ok(
      "AUD: service emits PAYMENT_VOUCHER_* audit actions",
      /PAYMENT_VOUCHER_CREATED/.test(svc) &&
        /PAYMENT_VOUCHER_POSTED/.test(svc) &&
        /PAYMENT_VOUCHER_REVERSED/.test(svc),
    );
    ok(
      "AUD-C: workflow-history table is append-only in service (no update/delete of events)",
      !/update\(financeWorkflowEvents\)/.test(svc) && !/delete\(financeWorkflowEvents\)/.test(svc),
    );
    ok(
      "AUD-D: no legacy cash/bank default resolver used by the payment path",
      !/cashOrBankAccountId/.test(svc) && !/SYS\.CASH|SYS\.BANK/.test(svc),
    );
    ok(
      "SRC: money source resolved server-side from selected master",
      /resolveSource/.test(svc) && /linkedAccountId/.test(svc),
    );
  }

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
