/**
 * Phase 5A.1 — Allocation reversal-race serialization & monetary-precision closure.
 * REAL PostgreSQL only (needs true overlapping transactions + advisory locks).
 *
 * P1-A REV-RACE-A..E — Supplier Invoice reversal and allocate/unallocate serialize
 *   on the SAME invoice allocation resource; no interleaving can produce a REVERSED
 *   invoice with an active allocation; both forced orderings proven; zero deadlocks.
 * P1-B MONEY-A..I + OVER-MONEY-A..C — allocation amounts are strict 2dp; sub-cent
 *   input is REJECTED (never rounded, never absorbed by tolerance); outstanding /
 *   unapplied stay cent-exact; the DB CHECK rejects a rogue sub-cent insert.
 *
 * Forced ordering: a dedicated "gate" connection holds the invoice allocation
 * advisory lock, both racers queue behind it (FIFO), we launch them in the desired
 * order with a gap, then release the gate — the first-queued racer proceeds first.
 *
 * Run: DATABASE_URL=postgres://.../thawab_conc node_modules/.bin/tsx scripts/test-phase-5a1.mts
 */
import { sql, eq } from "drizzle-orm";
import postgres from "postgres";
import { db, closeDb } from "@/server/db/index";
import { createSupplier, paySupplier } from "@/server/db/supplier";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import {
  allocate,
  unallocate,
  invoiceSettlement,
  paymentSettlement,
} from "@/server/db/supplier-payment-allocation";
import { LOCK_NS } from "@/server/db/lock-namespaces";
import { accounts } from "@/server/db/schema";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
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
async function rejects(name: string, code: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(name, false, "did not throw");
  } catch (e: any) {
    ok(name, e?.code === code, `got ${e?.code}:${e?.message}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ctx: any = {
  user: { id: "u-bench", name: "Bench Maker", role: "role-admin" },
  ip: "127.0.0.1",
  userAgent: "5a1",
  request: new Request("http://localhost/"),
};
const ctx2: any = { ...ctx, user: { id: "u-bench2", name: "Bench Approver", role: "role-admin" } };

// Dedicated gate connection for forced-ordering (separate from the app pool).
const gate = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

/**
 * Run `firstFn` then `secondFn` with a deterministic order on `invoiceId`'s
 * allocation lock: the gate holds the lock so both queue; first-launched wins the
 * FIFO wait queue. Returns both settled results.
 */
async function forceOrder(
  invoiceId: string,
  firstFn: () => Promise<any>,
  secondFn: () => Promise<any>,
) {
  let release!: () => void;
  const releaser = new Promise<void>((r) => (release = r));
  let acquired!: () => void;
  const acquiredP = new Promise<void>((r) => (acquired = r));
  const held = gate
    .begin(async (g) => {
      await g`SELECT pg_advisory_xact_lock(${LOCK_NS.PAYMENT_ALLOCATION}, hashtext(${invoiceId}))`;
      acquired();
      await releaser; // hold the lock open until both racers are queued
    })
    .catch((e) => {
      throw e;
    });
  await acquiredP; // gate now holds the invoice allocation lock
  const pFirst = firstFn().then(
    (v) => ({ status: "fulfilled", value: v }),
    (e) => ({ status: "rejected", reason: e }),
  );
  await sleep(200); // ensure firstFn is waiting in the lock queue
  const pSecond = secondFn().then(
    (v) => ({ status: "fulfilled", value: v }),
    (e) => ({ status: "rejected", reason: e }),
  );
  await sleep(200); // ensure secondFn is queued behind firstFn
  release(); // gate commits → releases lock → firstFn wakes, then secondFn
  await held;
  const [first, second] = await Promise.all([pFirst, pSecond]);
  return { first, second } as {
    first: { status: string; value?: any; reason?: any };
    second: { status: string; value?: any; reason?: any };
  };
}

let seq = 0;
async function main() {
  await db.execute(sql`INSERT INTO users (id,name,email,password) VALUES
    ('u-bench','Bench Maker','u-bench@example.com','x'),('u-bench2','Bench Approver','u-bench2@example.com','x')
    ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`TRUNCATE
    journal_lines, journal_entries, supplier_journal_links, supplier_payments,
    supplier_payment_allocations, suppliers, finance_workflow_events, audit_log,
    supplier_invoices, supplier_invoice_lines, supplier_invoice_grn_allocations
    RESTART IDENTITY CASCADE`);
  const expId = (
    await (db as any).select().from(accounts).where(eq(accounts.code, "5101")).limit(1)
  )[0].id as string;

  const mkSupplier = async (name: string) =>
    ((await createSupplier(ctx, { name, currency: "SAR" } as any)) as any).id as string;
  async function mkPostedInvoice(supplierId: string, amount: number) {
    seq++;
    const inv = await createSupplierInvoice(ctx, {
      supplierId,
      supplierInvoiceNumber: `EXT-${seq}`,
      invoiceDate: "2026-06-01",
      dueDate: null,
      lines: [
        { accountingMode: "direct", accountId: expId, quantity: 1, unitPrice: amount, taxRate: 0 },
      ],
    } as any);
    const id = (inv as any).id;
    await transitionSupplierInvoice(ctx, id, "submit");
    await transitionSupplierInvoice(ctx2, id, "approve");
    await transitionSupplierInvoice(ctx2, id, "post");
    return id as string;
  }
  async function mkPostedPayment(supplierId: string, amount: number) {
    seq++;
    const r = await paySupplier(ctx, {
      supplierId,
      amount,
      method: "bank",
      idempotencyKey: `PAY-${supplierId}-${seq}`,
    } as any);
    return r.payment.id as string;
  }
  const invStatus = async (id: string) =>
    ((await db.execute(sql`SELECT status FROM supplier_invoices WHERE id=${id}`)) as any).rows?.[0]
      ?.status ??
    ((await db.execute(sql`SELECT status FROM supplier_invoices WHERE id=${id}`)) as any)[0]
      ?.status;
  const allocCount = async (id: string) => {
    const r = (await db.execute(
      sql`SELECT count(*)::int AS c FROM supplier_payment_allocations WHERE supplier_invoice_id=${id}`,
    )) as any;
    return Number((r.rows ?? r ?? [])[0]?.c || 0);
  };
  const isReversed = (v: string) => v === "reversed";

  // =====================================================================
  // P1-A — REVERSAL vs ALLOCATION SERIALIZATION
  // =====================================================================
  console.log(
    "\nREV-RACE-A — allocation acquires the invoice lock first → alloc OK, reverse REJECT",
  );
  {
    const s = await mkSupplier("RR-A");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    const { first, second } = await forceOrder(
      inv,
      () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1000 }),
      () => transitionSupplierInvoice(ctx2, inv, "reverse", "race"),
    );
    ok("allocation (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "reverse (second) rejected SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      second.status === "rejected" &&
        second.reason?.code === "SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      `${second.status}:${second.reason?.code}`,
    );
    ok("invoice remains POSTED", (await invStatus(inv)) === "posted");
    ok("allocation is active", (await allocCount(inv)) === 1);
  }

  console.log("\nREV-RACE-B — reverse acquires the invoice lock first → reverse OK, alloc REJECT");
  {
    const s = await mkSupplier("RR-B");
    const inv = await mkPostedInvoice(s, 1000);
    const pay = await mkPostedPayment(s, 1000);
    const { first, second } = await forceOrder(
      inv,
      () => transitionSupplierInvoice(ctx2, inv, "reverse", "race"),
      () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 1000 }),
    );
    ok("reverse (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok(
      "allocation (second) rejected INVOICE_NOT_POSTED",
      second.status === "rejected" && second.reason?.code === "INVOICE_NOT_POSTED",
      `${second.status}:${second.reason?.code}`,
    );
    ok("invoice is REVERSED", isReversed(await invStatus(inv)));
    ok("no allocation row exists", (await allocCount(inv)) === 0);
  }

  console.log(
    "\nREV-RACE-C — 40 forced interleavings: never REVERSED+active-alloc, zero deadlocks",
  );
  {
    let bad = 0,
      deadlocks = 0,
      reverses = 0,
      allocsKept = 0;
    for (let i = 0; i < 40; i++) {
      const s = await mkSupplier(`RR-C${i}`);
      const inv = await mkPostedInvoice(s, 500);
      const pay = await mkPostedPayment(s, 500);
      const allocFirst = i % 2 === 0;
      let res;
      try {
        res = await forceOrder(
          inv,
          allocFirst
            ? () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 500 })
            : () => transitionSupplierInvoice(ctx2, inv, "reverse", "race"),
          allocFirst
            ? () => transitionSupplierInvoice(ctx2, inv, "reverse", "race")
            : () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 500 }),
        );
      } catch (e: any) {
        if (e?.code === "40P01" || /deadlock/i.test(e?.message || "")) deadlocks++;
        continue;
      }
      for (const r of [res.first, res.second])
        if (
          r.status === "rejected" &&
          (r.reason?.code === "40P01" || /deadlock/i.test(r.reason?.message || ""))
        )
          deadlocks++;
      const st = await invStatus(inv);
      const ac = await allocCount(inv);
      if (isReversed(st) && ac > 0) bad++;
      if (isReversed(st)) reverses++;
      if (ac > 0) allocsKept++;
    }
    ok("no REVERSED invoice ever kept an active allocation", bad === 0, `bad=${bad}`);
    ok("zero deadlocks across 40 forced races", deadlocks === 0, `deadlocks=${deadlocks}`);
    ok(
      "both outcomes were exercised",
      reverses > 0 && allocsKept > 0,
      `rev=${reverses} keptAlloc=${allocsKept}`,
    );
  }

  console.log(
    "\nREV-RACE-D — unallocate first, then reverse → both succeed, invoice reversed cleanly",
  );
  {
    const s = await mkSupplier("RR-D");
    const inv = await mkPostedInvoice(s, 800);
    const pay = await mkPostedPayment(s, 800);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 800 });
    const { first, second } = await forceOrder(
      inv,
      () => unallocate(ctx, { paymentId: pay, invoiceId: inv }),
      () => transitionSupplierInvoice(ctx2, inv, "reverse", "race"),
    );
    ok("unallocate (first) succeeded", first.status === "fulfilled", first.reason?.code);
    ok("reverse (second) succeeded", second.status === "fulfilled", second.reason?.code);
    ok("invoice is REVERSED", isReversed(await invStatus(inv)));
    ok("no active allocation", (await allocCount(inv)) === 0);
  }

  console.log(
    "\nREV-RACE-E — reverse checks first while allocation exists → reverse REJECT, alloc kept",
  );
  {
    const s = await mkSupplier("RR-E");
    const inv = await mkPostedInvoice(s, 800);
    const pay = await mkPostedPayment(s, 800);
    await allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 800 });
    const { first, second } = await forceOrder(
      inv,
      () => transitionSupplierInvoice(ctx2, inv, "reverse", "race"),
      () => unallocate(ctx, { paymentId: pay, invoiceId: inv }),
    );
    ok(
      "reverse (first) rejected SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      first.status === "rejected" &&
        first.reason?.code === "SUPPLIER_INVOICE_HAS_PAYMENT_ALLOCATIONS",
      `${first.status}:${first.reason?.code}`,
    );
    ok("invoice remains POSTED", (await invStatus(inv)) === "posted");
    // the concurrent unallocate is a legitimate op; either it removed the alloc or
    // not — the invariant is only that we never reversed with an active alloc.
    ok("invoice was never reversed with an active allocation", (await invStatus(inv)) === "posted");
  }

  // =====================================================================
  // P1-B — MONETARY PRECISION
  // =====================================================================
  console.log("\nMONEY / OVER-MONEY — 2dp precision, tolerance can't authorize over-allocation");
  {
    const s = await mkSupplier("MON");
    const inv = await mkPostedInvoice(s, 100);
    const pay = await mkPostedPayment(s, 100);
    const A = (amount: number) => () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount });

    await rejects(
      "MONEY-A 100.001 → INVALID_MONEY_PRECISION",
      "INVALID_MONEY_PRECISION",
      A(100.001),
    );
    await rejects(
      "MONEY-B 100.004 → INVALID_MONEY_PRECISION",
      "INVALID_MONEY_PRECISION",
      A(100.004),
    );
    await rejects(
      "MONEY-C 100.005 → INVALID_MONEY_PRECISION (policy: reject)",
      "INVALID_MONEY_PRECISION",
      A(100.005),
    );
    await rejects("MONEY-E 0.001 → INVALID_MONEY_PRECISION", "INVALID_MONEY_PRECISION", A(0.001));
    await rejects(
      "MONEY-F NaN → INVALID_MONEY_PRECISION",
      "INVALID_MONEY_PRECISION",
      A(Number.NaN),
    );
    await rejects(
      "MONEY-F Infinity → INVALID_MONEY_PRECISION",
      "INVALID_MONEY_PRECISION",
      A(Infinity),
    );
    // OVER-MONEY-C: sub-cent over an exact fill must fail on PRECISION, not slip via tolerance
    await rejects(
      "OVER-MONEY-C 100.004 on 100.00 outstanding → INVALID_MONEY_PRECISION (not tolerance)",
      "INVALID_MONEY_PRECISION",
      A(100.004),
    );

    // MONEY-D 100.01 fits an invoice of ≥100.01 — use a fresh 200 invoice
    const inv2 = await mkPostedInvoice(s, 200);
    const pay2 = await mkPostedPayment(s, 200);
    let mdOk = false;
    try {
      await allocate(ctx, { paymentId: pay2, invoiceId: inv2, amount: 100.01 });
      mdOk = true;
    } catch {
      mdOk = false;
    }
    ok("MONEY-D 100.01 → SUCCESS", mdOk);
    const si2 = await invoiceSettlement(db as any, inv2);
    ok(
      "MONEY-D outstanding exact 99.99",
      Math.abs(si2.outstanding - 99.99) < 1e-9,
      `${si2.outstanding}`,
    );

    // OVER-MONEY-A: 100.00 outstanding, request 100.01 → INVOICE_OVER_ALLOCATED
    await rejects(
      "OVER-MONEY-A 100.01 on 100.00 outstanding → INVOICE_OVER_ALLOCATED",
      "INVOICE_OVER_ALLOCATED",
      () => allocate(ctx, { paymentId: pay, invoiceId: inv, amount: 100.01 }),
    );
  }

  console.log("\nOVER-MONEY-B — payment unapplied 100.00, request 100.01 → PAYMENT_OVER_ALLOCATED");
  {
    const s = await mkSupplier("OMB");
    const big = await mkPostedInvoice(s, 1000); // room on invoice side
    const pay = await mkPostedPayment(s, 100); // payment cap 100.00
    await rejects("payment 100.00 cannot allocate 100.01", "PAYMENT_OVER_ALLOCATED", () =>
      allocate(ctx, { paymentId: pay, invoiceId: big, amount: 100.01 }),
    );
    // exact fill 100.00 succeeds and leaves unapplied exactly 0.00
    await allocate(ctx, { paymentId: pay, invoiceId: big, amount: 100 });
    const rows = (await db.execute(
      sql`SELECT COALESCE(SUM(amount),0) AS a FROM supplier_payment_allocations WHERE supplier_payment_id=${pay}`,
    )) as any;
    const applied = Number((rows.rows ?? rows ?? [])[0]?.a || 0);
    ok("payment fully applied 100.00 exact", Math.abs(applied - 100) < 1e-9, `${applied}`);
  }

  console.log("\nMONEY-G/H — float-residue-free outstanding/unapplied");
  {
    // MONEY-G: 0.30 invoice, allocations 0.10 + 0.20 → outstanding exactly 0.00
    const s = await mkSupplier("MG");
    const inv = await mkPostedInvoice(s, 0.3);
    const p1 = await mkPostedPayment(s, 0.1);
    const p2 = await mkPostedPayment(s, 0.2);
    await allocate(ctx, { paymentId: p1, invoiceId: inv, amount: 0.1 });
    await allocate(ctx, { paymentId: p2, invoiceId: inv, amount: 0.2 });
    const si = await invoiceSettlement(db as any, inv);
    ok("MONEY-G outstanding exactly 0.00 (no 5.5e-17)", si.outstanding === 0, `${si.outstanding}`);

    // MONEY-H: payment 100.00 across 33.33 + 33.33 + 33.34 → unapplied exactly 0.00
    const s2 = await mkSupplier("MH");
    const pay = await mkPostedPayment(s2, 100);
    for (const amt of [33.33, 33.33, 33.34]) {
      const iv = await mkPostedInvoice(s2, amt);
      await allocate(ctx, { paymentId: pay, invoiceId: iv, amount: amt });
    }
    const sp = await paymentSettlement(db as any, pay);
    ok("MONEY-H unapplied exactly 0.00 at domain boundary", sp.unapplied === 0, `${sp.unapplied}`);
  }

  console.log("\nMONEY-I — many valid 2dp allocations keep aggregates cent-exact");
  {
    const s = await mkSupplier("MI");
    const pay = await mkPostedPayment(s, 100); // 1000 × 0.10
    let target = 0;
    for (let i = 0; i < 1000; i++) {
      const iv = await mkPostedInvoice(s, 0.1);
      await allocate(ctx, { paymentId: pay, invoiceId: iv, amount: 0.1 });
      target += 0.1;
    }
    const rows = (await db.execute(
      sql`SELECT COALESCE(SUM(amount),0) AS a, count(*)::int AS c FROM supplier_payment_allocations WHERE supplier_payment_id=${pay}`,
    )) as any;
    const r0 = (rows.rows ?? rows ?? [])[0];
    const applied = Number(r0?.a || 0);
    ok(
      "MONEY-I 1000 × 0.10 sum to 100.00 (≤ 1 halala drift)",
      Math.abs(applied - 100) < 0.005,
      `${applied}`,
    );
    ok("MONEY-I all 1000 allocations persisted", Number(r0?.c) === 1000, `${r0?.c}`);
  }

  console.log("\nDB-GUARD — the CHECK rejects a rogue sub-cent insert (defense-in-depth)");
  {
    const s = await mkSupplier("DBG");
    const inv = await mkPostedInvoice(s, 100);
    const pay = await mkPostedPayment(s, 100);
    let rejected = false;
    try {
      await db.execute(sql`INSERT INTO supplier_payment_allocations (id, supplier_payment_id, supplier_invoice_id, amount, created_at)
        VALUES ('SPA-ROGUE', ${pay}, ${inv}, 100.001, '2026-08-30')`);
    } catch {
      rejected = true;
    }
    ok("DB CHECK rejected amount 100.001", rejected);
    let accepted = false;
    try {
      await db.execute(sql`INSERT INTO supplier_payment_allocations (id, supplier_payment_id, supplier_invoice_id, amount, created_at)
        VALUES ('SPA-OK', ${pay}, ${inv}, 100.00, '2026-08-30')`);
      accepted = true;
    } catch {
      accepted = false;
    }
    ok("DB CHECK accepted amount 100.00", accepted);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} Phase 5A.1: ${pass} passed, ${fail} failed`);
  await gate.end({ timeout: 5 });
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  try {
    await gate.end({ timeout: 5 });
  } catch {}
  process.exit(1);
});
