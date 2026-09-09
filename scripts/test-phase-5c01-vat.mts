/**
 * Phase 5C.0.1 — Historical Input-VAT PROVENANCE closure, VALUE side, on REAL
 * PostgreSQL, using the ACTUAL end-to-end Supplier Invoice services
 * (createSupplierInvoice → transitionSupplierInvoice submit/approve/post).
 *
 * Proves the load-bearing VALUE invariant for every POSTED taxable invoice:
 *
 *     r2( SUM(supplier_invoice_lines.tax_amount) )  ==  posted Input VAT debit
 *     ==  supplier_invoices.tax_amount              ==  Σ per-line r2 tax
 *
 * and the POST rounding policy (per-line r2 then SUM — NOT tax-on-total), plus
 * VAT-E (all-zero → no VAT leg at all). READ-ONLY w.r.t. the repo: it creates
 * only test rows in the disposable bench DB and configures Input VAT via the
 * EXISTING certified assignInputVatAccount service. It does NOT create any
 * Phase-5C structure.
 *
 * Run: DATABASE_URL=postgres://bench@127.0.0.1:5433/thawab_conc \
 *      node_modules/.bin/tsx scripts/test-phase-5c01-vat.mts
 */
import { eq, sql } from "drizzle-orm";
import { db, now, genId, closeDb } from "@/server/db/index";
import { accounts, supplierInvoices, supplierInvoiceLines } from "@/server/db/schema";
import { assignInputVatAccount } from "@/server/db/account-mapping";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";

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
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.0000001; // exact-to-halala

const RUN = Date.now().toString(36);
const maker: any = { user: { id: "u-5c01-mk", name: "Maker", role: "role-admin" }, ip: "127.0.0.1", request: new Request("http://localhost/") };
const checker: any = { user: { id: "u-5c01-ck", name: "Checker", role: "role-admin" }, ip: "127.0.0.1", request: new Request("http://localhost/") };

let EXP = "",
  ASSET = "",
  VAT = "",
  SUP = "";

async function mkAccount(code: string, name: string, cls: string): Promise<string> {
  const id = genId("ACC");
  const ts = now();
  await db.insert(accounts).values({
    id,
    code,
    name,
    classification: cls,
    postable: true,
    status: "active",
    currency: "SAR",
    createdAt: ts,
    updatedAt: ts,
  } as any);
  return id;
}

/** Post an invoice end-to-end via the REAL services; return the posted entry id. */
async function postInvoice(lines: any[], doc: string): Promise<string> {
  const inv = await createSupplierInvoice(maker, {
    supplierId: SUP,
    supplierInvoiceNumber: doc,
    invoiceDate: "2026-03-10",
    currency: "SAR",
    lines,
  } as any);
  await transitionSupplierInvoice(maker, inv.id, "submit" as any);
  await transitionSupplierInvoice(checker, inv.id, "approve" as any);
  await transitionSupplierInvoice(checker, inv.id, "post" as any);
  return inv.id as string;
}

async function entryFor(invoiceId: string) {
  const r = (await db.execute(
    sql`SELECT id FROM journal_entries WHERE source_type='supplier_invoice' AND source_id=${invoiceId} AND status='posted' LIMIT 1`,
  )) as any;
  return (r.rows ?? r ?? [])[0]?.id as string;
}
/** Posted VAT debit for an invoice = SUM(debit) on journal lines that hit the VAT account. */
async function vatDebit(entryId: string) {
  const r = (await db.execute(
    sql`SELECT COALESCE(SUM(debit),0) d, COUNT(*)::int n FROM journal_lines WHERE journal_entry_id=${entryId} AND account_id=${VAT} AND debit > 0`,
  )) as any;
  const row = (r.rows ?? r ?? [])[0];
  return { debit: Number(row.d), lines: Number(row.n) };
}
async function lineTaxSum(invoiceId: string) {
  const r = (await db.execute(
    sql`SELECT COALESCE(SUM(tax_amount),0) t FROM supplier_invoice_lines WHERE supplier_invoice_id=${invoiceId}`,
  )) as any;
  return Number((r.rows ?? r ?? [])[0]?.t || 0);
}
async function balanced(entryId: string) {
  const r = (await db.execute(
    sql`SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines WHERE journal_entry_id=${entryId}`,
  )) as any;
  const row = (r.rows ?? r ?? [])[0];
  return near(Number(row.d), Number(row.c));
}
async function headerTax(invoiceId: string) {
  const r = (await db.select({ t: supplierInvoices.taxAmount }).from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId))) as any;
  return Number(r[0]?.t || 0);
}

async function main() {
  // ---- seed the two actors (FK targets for confirmations + journal actor columns) ----
  for (const u of [maker.user.id, checker.user.id])
    await db.execute(
      sql`INSERT INTO users (id,name,email,password) VALUES (${u}, ${u}, ${u + "@bench.local"}, 'x') ON CONFLICT (id) DO NOTHING`,
    );

  // ---- seed line accounts + supplier + confirmed Input VAT mapping (real service) ----
  EXP = await mkAccount(`5C01E-${RUN}`, "5C01 expense", "expense");
  ASSET = await mkAccount(`5C01A-${RUN}`, "5C01 asset", "asset");
  VAT = await mkAccount(`5C01V-${RUN}`, "5C01 input VAT", "asset");
  await db.transaction((tx: any) => assignInputVatAccount(tx, { accountId: VAT, userId: "u-5c01-mk" }));
  SUP = genId("SUP");
  const ts = now();
  await db.execute(
    sql`INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES (${SUP}, ${"5C01 supplier"}, 'active','SAR', ${ts}, ${ts})`,
  );

  // Confirm the mapping really is READY (system_key + confirmation on VAT).
  const chk = (await db.execute(
    sql`SELECT (SELECT id FROM accounts WHERE system_key='input_vat') m, (SELECT account_id FROM finance_account_mapping_confirmations WHERE purpose='INPUT_VAT') c`,
  )) as any;
  const crow = (chk.rows ?? chk ?? [])[0];
  ok("SEED: Input VAT mapped AND confirmed to the test account (READY)", crow.m === VAT && crow.c === VAT);

  // ===================== VAT-A — one taxable line =====================
  console.log("\nVAT-A — single taxable line");
  {
    const id = await postInvoice([{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }], `5C01-A-${RUN}`);
    const e = await entryFor(id);
    const v = await vatDebit(e);
    const s = r2(await lineTaxSum(id));
    const h = await headerTax(id);
    ok("VAT-A: posted VAT debit == Σ line tax == header tax == 15.00", v.lines === 1 && near(v.debit, 15) && near(s, 15) && near(h, 15));
    ok("VAT-A: r2(Σ line tax) == posted VAT debit (invariant)", near(s, v.debit));
    ok("VAT-A: journal balanced", await balanced(e));
  }

  // ===================== VAT-B — multiple fractional per-line VAT =====================
  console.log("\nVAT-B — multiple taxable lines, fractional per-line VAT");
  {
    // 3 × (10.10 @15% → r2(1.515)=1.52). Σ per-line = 4.56.  tax-on-total = r2(30.30*.15)=4.55.
    const id = await postInvoice(
      [
        { accountId: EXP, quantity: 1, unitPrice: 10.1, taxRate: 15 },
        { accountId: ASSET, quantity: 1, unitPrice: 10.1, taxRate: 15 },
        { accountId: EXP, quantity: 1, unitPrice: 10.1, taxRate: 15 },
      ],
      `5C01-B-${RUN}`,
    );
    const e = await entryFor(id);
    const v = await vatDebit(e);
    const s = r2(await lineTaxSum(id));
    const h = await headerTax(id);
    ok("VAT-B: Σ persisted line tax == posted VAT debit exactly (4.56)", near(s, v.debit) && near(v.debit, 4.56));
    ok("VAT-B: header tax == 4.56 == Σ line tax", near(h, 4.56) && near(h, s));
    ok("VAT-B: single aggregated VAT leg (not one-per-line)", v.lines === 1);
    ok("VAT-B: journal balanced", await balanced(e));
  }

  // ===================== VAT-C — taxable + zero-tax line =====================
  console.log("\nVAT-C — mixed taxable + zero-rated");
  {
    const id = await postInvoice(
      [
        { accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }, // 15.00
        { accountId: ASSET, quantity: 1, unitPrice: 50, taxRate: 0 }, // 0
      ],
      `5C01-C-${RUN}`,
    );
    const e = await entryFor(id);
    const v = await vatDebit(e);
    const s = r2(await lineTaxSum(id));
    ok("VAT-C: only the taxable line contributes (VAT debit 15.00)", near(v.debit, 15) && near(s, 15));
    ok("VAT-C: r2(Σ line tax) == posted VAT debit", near(s, v.debit));
    ok("VAT-C: journal balanced", await balanced(e));
  }

  // ===================== VAT-D — independent rounding residual =====================
  console.log("\nVAT-D — 3 lines whose independent rounding creates a 0.01 residual");
  {
    // 3 × (7.77 @15% → r2(1.1655)=1.17). Σ per-line = 3.51.  tax-on-total = r2(23.31*.15)=3.50.
    const id = await postInvoice(
      [
        { accountId: EXP, quantity: 1, unitPrice: 7.77, taxRate: 15 },
        { accountId: ASSET, quantity: 1, unitPrice: 7.77, taxRate: 15 },
        { accountId: EXP, quantity: 1, unitPrice: 7.77, taxRate: 15 },
      ],
      `5C01-D-${RUN}`,
    );
    const e = await entryFor(id);
    const v = await vatDebit(e);
    const s = r2(await lineTaxSum(id));
    ok("VAT-D: POLICY is per-line r2 then SUM → 3.51 (NOT tax-on-total 3.50)", near(v.debit, 3.51) && near(s, 3.51));
    ok("VAT-D: posted VAT debit != tax-on-total (3.50) — proves the actual policy", !near(v.debit, 3.5));
    ok("VAT-D: r2(Σ line tax) == posted VAT debit", near(s, v.debit));
    ok("VAT-D: journal balanced", await balanced(e));
  }

  // ===================== VAT-E — all zero rate =====================
  console.log("\nVAT-E — all lines zero-rated");
  {
    const id = await postInvoice(
      [
        { accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 0 },
        { accountId: ASSET, quantity: 1, unitPrice: 50, taxRate: 0 },
      ],
      `5C01-E-${RUN}`,
    );
    const e = await entryFor(id);
    const v = await vatDebit(e);
    const s = r2(await lineTaxSum(id));
    const h = await headerTax(id);
    ok("VAT-E: posted Input VAT debit == 0 AND NO Input VAT journal line", v.lines === 0 && near(v.debit, 0));
    ok("VAT-E: header tax == 0 and Σ line tax == 0", near(h, 0) && near(s, 0));
    ok("VAT-E: journal balanced", await balanced(e));
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error(e);
  try {
    await closeDb();
  } catch {}
  process.exit(1);
});
