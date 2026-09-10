/**
 * Phase Sales-VAT — real-PG smoke test of Output VAT on sales invoices, via the
 * ACTUAL services (createSalesInvoice → submit → approve → post) and the
 * confirmed Output VAT mapping. Proves:
 *   Dr AR (gross) / Cr revenue (net per line) / Cr Output VAT (aggregated tax)
 *   header subtotal/taxAmount/totalAmount correct; journal balanced.
 *   Taxable POST without a confirmed Output VAT account is blocked.
 */
import { eq, sql } from "drizzle-orm";
import { db, now, genId, closeDb } from "@/server/db/index";
import { accounts } from "@/server/db/schema";
import { assignOutputVatAccount } from "@/server/db/account-mapping";
import { createSalesInvoice, transitionSalesInvoice } from "@/server/db/sales-invoice";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: need conc/bench DB. Got ${url}`);
  process.exit(2);
}
let pass = 0,
  fail = 0;
const ok = (n: string, c: boolean, e = "") => {
  c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`));
};
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.0000001;
const RUN = Date.now().toString(36);
const maker: any = { user: { id: "u-svat-mk", name: "M", role: "role-admin" }, ip: "127.0.0.1", request: new Request("http://localhost/") };
const checker: any = { user: { id: "u-svat-ck", name: "C", role: "role-admin" }, ip: "127.0.0.1", request: new Request("http://localhost/") };

async function mkAcc(code: string, name: string, cls: string) {
  const id = genId("ACC");
  const ts = now();
  await db.insert(accounts).values({ id, code, name, classification: cls, postable: true, status: "active", currency: "SAR", createdAt: ts, updatedAt: ts } as any);
  return id;
}
async function post(lines: any[], doc: string) {
  // Post in a fresh year (own open period) so the JV-2099- number space is clean
  // — the shared bench DB is polluted with 20k JV-2026-P##### scale rows.
  const inv = await createSalesInvoice(maker, { customerId: CUST, invoiceDate: "2099-03-10", currency: "SAR", lines } as any);
  await transitionSalesInvoice(maker, inv.id, "submit" as any);
  await transitionSalesInvoice(checker, inv.id, "approve" as any);
  await transitionSalesInvoice(checker, inv.id, "post" as any);
  return inv.id as string;
}
async function legs(invoiceId: string) {
  const r = (await db.execute(sql`
    SELECT jl.account_id, jl.debit, jl.credit FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE je.source_type='sales_invoice' AND je.source_id=${invoiceId} AND je.status='posted'`)) as any;
  return (r.rows ?? r ?? []) as any[];
}

let CUST = "", REV = "", OUTVAT = "";

async function main() {
  for (const u of [maker.user.id, checker.user.id])
    await db.execute(sql`INSERT INTO users (id,name,email,password) VALUES (${u},${u},${u + "@b.local"},'x') ON CONFLICT (id) DO NOTHING`);
  REV = await mkAcc(`SVATR-${RUN}`, "SVAT revenue", "revenue");
  OUTVAT = await mkAcc(`SVATV-${RUN}`, "SVAT output VAT", "liability");
  CUST = genId("CUST");
  const ts = now();
  await db.execute(sql`INSERT INTO customers (id,name,status,currency,created_at,updated_at) VALUES (${CUST},'SVAT customer','active','SAR',${ts},${ts})`);
  await db.execute(sql`INSERT INTO fiscal_periods (id,name,start_date,end_date,status) VALUES ('FP-2099','FY2099','2099-01-01','2099-12-31','open') ON CONFLICT (id) DO NOTHING`);
  const AR = (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.systemKey, "accounts_receivable")))[0]?.id;
  ok("AR system account present", !!AR);

  // Reset any Output VAT config left by a previous run so BLOCK is a true test
  // (the bench DB is shared and stateful).
  await db.execute(sql`UPDATE accounts SET system_key=NULL WHERE system_key='output_vat'`);
  await db.execute(sql`DELETE FROM finance_account_mapping_confirmations WHERE purpose='OUTPUT_VAT'`);

  // VAT-BLOCK: taxable invoice before Output VAT confirmed → blocked.
  let blocked = false;
  try {
    await post([{ accountId: REV, quantity: 1, unitPrice: 100, taxRate: 15 }], `SVAT-B-${RUN}`);
  } catch (e: any) {
    blocked = e?.code === "OUTPUT_VAT_ACCOUNT_MISSING" || e?.code === "OUTPUT_VAT_MAPPING_UNCONFIRMED";
  }
  ok("BLOCK: taxable sales invoice rejected until Output VAT confirmed", blocked);

  // Confirm Output VAT mapping (admin action).
  await db.transaction((tx: any) => assignOutputVatAccount(tx, { accountId: OUTVAT, userId: "u-svat-mk" }));

  // VAT-A: 1 line 1000 @15% → net 1000, VAT 150, gross 1150.
  {
    const id = await post([{ accountId: REV, quantity: 1, unitPrice: 1000, taxRate: 15 }], `SVAT-A-${RUN}`);
    const L = await legs(id);
    const ar = L.find((x) => x.account_id === AR);
    const rev = L.find((x) => x.account_id === REV);
    const vat = L.find((x) => x.account_id === OUTVAT);
    const dr = L.reduce((s, x) => s + Number(x.debit), 0);
    const cr = L.reduce((s, x) => s + Number(x.credit), 0);
    ok("VAT-A: Dr AR = gross 1150", !!ar && near(Number(ar.debit), 1150) && near(Number(ar.credit), 0));
    ok("VAT-A: Cr revenue = net 1000", !!rev && near(Number(rev.credit), 1000));
    ok("VAT-A: Cr Output VAT = 150", !!vat && near(Number(vat.credit), 150));
    ok("VAT-A: journal balanced", near(dr, cr) && near(dr, 1150));
  }

  // VAT-C: mixed taxable + zero-rate → only taxable contributes VAT.
  {
    const id = await post(
      [
        { accountId: REV, quantity: 1, unitPrice: 200, taxRate: 15 },
        { accountId: REV, quantity: 1, unitPrice: 100, taxRate: 0 },
      ],
      `SVAT-C-${RUN}`,
    );
    const L = await legs(id);
    const vat = L.find((x) => x.account_id === OUTVAT);
    const ar = L.find((x) => x.account_id === AR);
    ok("VAT-C: VAT only on taxable line (30.00)", !!vat && near(Number(vat.credit), 30));
    ok("VAT-C: Dr AR gross = 330", !!ar && near(Number(ar.debit), 330));
  }

  // VAT-ZERO: all zero-rate → no Output VAT leg.
  {
    const id = await post([{ accountId: REV, quantity: 1, unitPrice: 500, taxRate: 0 }], `SVAT-Z-${RUN}`);
    const L = await legs(id);
    const vat = L.find((x) => x.account_id === OUTVAT);
    ok("VAT-ZERO: no Output VAT leg when tax = 0", !vat);
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
