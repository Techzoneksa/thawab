/**
 * Phase 5C.0.2 — FORWARD Input-VAT provenance + Credit-Note eligibility, on REAL
 * PostgreSQL, driving the ACTUAL Supplier Invoice services
 * (createSupplierInvoice → submit → approve → post → reverse) and the new
 * provenance/eligibility services.
 *
 * PROV-A..J + PROV-CORR-A..C. Configures Input VAT via the existing certified
 * assignInputVatAccount service; creates NO Phase-5C-proper structures (no credit
 * notes, no SRR, no invoiced returns). Read-only w.r.t. the repo except the
 * 0037 provenance table this phase introduces.
 *
 * Run: THAWAB_FAILPOINTS=1 DATABASE_URL=postgres://bench@127.0.0.1:5433/thawab_conc \
 *      node_modules/.bin/tsx scripts/test-phase-5c02-prov.mts
 */
import { eq, sql } from "drizzle-orm";
import { db, now, genId, closeDb } from "@/server/db/index";
import { accounts, supplierInvoices, supplierInvoiceTaxJournalLinks } from "@/server/db/schema";
import { assignInputVatAccount } from "@/server/db/account-mapping";
import { createSupplierInvoice, transitionSupplierInvoice } from "@/server/db/supplier-invoice";
import {
  resolveSupplierInvoiceHistoricalInputVat,
  getSupplierInvoiceCreditNoteEligibility,
  supplierInvoiceTaxProvenanceReport,
} from "@/server/db/supplier-invoice-tax-link";
import { armFailpoint, clearFailpoints } from "@/server/db/failpoint";

const url = process.env.DATABASE_URL || "";
if (!/conc|bench/.test(url)) {
  console.error(`REFUSING: DATABASE_URL must target an isolated conc/bench DB. Got: ${url}`);
  process.exit(2);
}
if (process.env.THAWAB_FAILPOINTS !== "1")
  console.warn("NOTE: THAWAB_FAILPOINTS!=1 — PROV-H/I failure injection will be skipped.");

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
    ok(name, e?.code === code || String(e?.message).includes(code), `got ${e?.code}:${e?.message}`);
  }
}
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.0000001;

const RUN = Date.now().toString(36);
const maker: any = {
  user: { id: "u-5c02-mk", name: "Maker", role: "role-admin" },
  ip: "127.0.0.1",
  request: new Request("http://localhost/"),
};
const checker: any = {
  user: { id: "u-5c02-ck", name: "Checker", role: "role-admin" },
  ip: "127.0.0.1",
  request: new Request("http://localhost/"),
};

let EXP = "",
  ASSET = "",
  VAT_A = "",
  VAT_B = "",
  SUP = "";

async function mkAccount(code: string, name: string, cls: string): Promise<string> {
  const id = genId("ACC");
  const ts = now();
  await db
    .insert(accounts)
    .values({
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
async function setVat(accountId: string) {
  await db.transaction((tx: any) =>
    assignInputVatAccount(tx, { accountId, userId: maker.user.id }),
  );
}
async function createTaxable(lines: any[], doc: string) {
  return createSupplierInvoice(maker, {
    supplierId: SUP,
    supplierInvoiceNumber: doc,
    invoiceDate: "2026-03-10",
    currency: "SAR",
    lines,
  } as any);
}
async function drive(id: string, upTo: "approve" | "post") {
  await transitionSupplierInvoice(maker, id, "submit" as any);
  await transitionSupplierInvoice(checker, id, "approve" as any);
  if (upTo === "post") await transitionSupplierInvoice(checker, id, "post" as any);
}
async function postTaxable(lines: any[], doc: string) {
  const inv = await createTaxable(lines, doc);
  await drive(inv.id, "post");
  return inv.id as string;
}
async function linkRow(invoiceId: string) {
  return (
    await db
      .select()
      .from(supplierInvoiceTaxJournalLinks)
      .where(eq(supplierInvoiceTaxJournalLinks.supplierInvoiceId, invoiceId))
      .limit(1)
  )[0] as any;
}
async function linkCount(invoiceId: string) {
  const r = (await db.execute(
    sql`SELECT COUNT(*)::int n FROM supplier_invoice_tax_journal_links WHERE supplier_invoice_id=${invoiceId}`,
  )) as any;
  return Number((r.rows ?? r ?? [])[0]?.n || 0);
}
async function entryFor(invoiceId: string) {
  const r = (await db.execute(
    sql`SELECT id FROM journal_entries WHERE source_type='supplier_invoice' AND source_id=${invoiceId} AND status='posted' LIMIT 1`,
  )) as any;
  return (r.rows ?? r ?? [])[0]?.id as string | undefined;
}
async function invStatus(invoiceId: string) {
  const r = (
    await db
      .select({
        s: supplierInvoices.status,
        tax: supplierInvoices.taxAmount,
        je: supplierInvoices.journalEntryId,
      })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, invoiceId))
  )[0] as any;
  return r;
}

async function main() {
  for (const u of [maker.user.id, checker.user.id])
    await db.execute(
      sql`INSERT INTO users (id,name,email,password) VALUES (${u}, ${u}, ${u + "@bench.local"}, 'x') ON CONFLICT (id) DO NOTHING`,
    );
  EXP = await mkAccount(`5C02E-${RUN}`, "5C02 expense", "expense");
  ASSET = await mkAccount(`5C02A-${RUN}`, "5C02 asset", "asset");
  VAT_A = await mkAccount(`5C02VA-${RUN}`, "5C02 input VAT A", "asset");
  VAT_B = await mkAccount(`5C02VB-${RUN}`, "5C02 input VAT B", "asset");
  SUP = genId("SUP");
  const ts = now();
  await db.execute(
    sql`INSERT INTO suppliers (id,name,status,currency,created_at,updated_at) VALUES (${SUP}, ${"5C02 supplier"}, 'active','SAR', ${ts}, ${ts})`,
  );
  await setVat(VAT_A);

  // ===================== PROV-A / PROV-B =====================
  console.log("\nPROV-A/B — taxable POST creates exactly one valid provenance link");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-A-${RUN}`,
    );
    ok(
      "PROV-A: taxable invoice POSTs and gets exactly one VAT provenance link",
      (await linkCount(id)) === 1,
    );
    const link = await linkRow(id);
    const entry = await entryFor(id);
    // Line evidence via resolver.
    const res: any = await resolveSupplierInvoiceHistoricalInputVat(db, id);
    ok(
      "PROV-B: linked line belongs to the invoice's posting entry, debit==tax(15.00), account==actual VAT account (A)",
      res.status === "RESOLVED" &&
        res.journalEntryId === entry &&
        res.accountId === VAT_A &&
        near(res.postedVatDebit, 15) &&
        res.journalLineId === link.journalLineId,
    );
    const elig = await getSupplierInvoiceCreditNoteEligibility(db, id);
    ok(
      "PROV-B: eligibility = ELIGIBLE_PROVENANCE",
      elig.reason === "ELIGIBLE_PROVENANCE" && elig.eligibleForFutureCreditNoteFoundation,
    );
  }

  // ===================== PROV-C — zero-tax =====================
  console.log("\nPROV-C — zero-tax POST creates no link, eligibility ELIGIBLE_ZERO_TAX");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 0 }],
      `5C02-C-${RUN}`,
    );
    ok("PROV-C: zero-tax invoice POSTs with NO VAT provenance link", (await linkCount(id)) === 0);
    const elig = await getSupplierInvoiceCreditNoteEligibility(db, id);
    ok(
      "PROV-C: eligibility = ELIGIBLE_ZERO_TAX",
      elig.reason === "ELIGIBLE_ZERO_TAX" && elig.eligibleForFutureCreditNoteFoundation,
    );
    const res: any = await resolveSupplierInvoiceHistoricalInputVat(db, id);
    ok(
      "PROV-C: resolver returns NO_INPUT_VAT_REQUIRED for zero-tax",
      res.status === "NO_INPUT_VAT_REQUIRED",
    );
  }

  // ===================== PROV-D — historical taxable without provenance =====================
  console.log("\nPROV-D — historical taxable invoice without link is BLOCKED");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 200, taxRate: 15 }],
      `5C02-D-${RUN}`,
    );
    // Simulate a pre-0037 historical invoice: remove its provenance link.
    await db.execute(
      sql`DELETE FROM supplier_invoice_tax_journal_links WHERE supplier_invoice_id=${id}`,
    );
    const elig = await getSupplierInvoiceCreditNoteEligibility(db, id);
    ok(
      "PROV-D: taxable + no link → BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED",
      elig.reason === "BLOCKED_HISTORICAL_VAT_PROVENANCE_REQUIRED" &&
        !elig.eligibleForFutureCreditNoteFoundation,
    );
    await rejects(
      "PROV-D: resolver throws HISTORICAL_INPUT_VAT_PROVENANCE_REQUIRED",
      "HISTORICAL_INPUT_VAT_PROVENANCE_REQUIRED",
      () => resolveSupplierInvoiceHistoricalInputVat(db, id),
    );
  }

  // ===================== PROV-E — historical zero-tax without provenance =====================
  console.log("\nPROV-E — historical zero-tax invoice remains eligible");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 0 }],
      `5C02-E-${RUN}`,
    );
    const elig = await getSupplierInvoiceCreditNoteEligibility(db, id);
    ok(
      "PROV-E: zero-tax without link → ELIGIBLE_ZERO_TAX",
      elig.reason === "ELIGIBLE_ZERO_TAX" && elig.eligibleForFutureCreditNoteFoundation,
    );
  }

  // ===================== PROV-F — mapping change does not move historical account =====================
  console.log("\nPROV-F — mapping A→B: old invoice resolves A, new invoice resolves B");
  {
    const idA = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-F1-${RUN}`,
    );
    await setVat(VAT_B); // Finance admin changes the Input VAT mapping to account B
    const resA: any = await resolveSupplierInvoiceHistoricalInputVat(db, idA);
    ok(
      "PROV-F: invoice posted under mapping A still resolves account A after switch to B",
      resA.status === "RESOLVED" && resA.accountId === VAT_A,
    );
    const idB = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-F2-${RUN}`,
    );
    const resB: any = await resolveSupplierInvoiceHistoricalInputVat(db, idB);
    ok(
      "PROV-F: invoice posted under mapping B resolves account B",
      resB.status === "RESOLVED" && resB.accountId === VAT_B,
    );
    ok(
      "PROV-F: the two invoices carry DIFFERENT historical VAT accounts (A≠B)",
      resA.accountId !== resB.accountId,
    );
    await setVat(VAT_A); // restore for later cases
  }

  // ===================== PROV-G — POST retry idempotency =====================
  console.log("\nPROV-G — re-posting an already-posted invoice creates no second link");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-G-${RUN}`,
    );
    let retryThrew = false;
    try {
      await transitionSupplierInvoice(checker, id, "post" as any); // posted→post is not a legal transition
    } catch {
      retryThrew = true;
    }
    ok("PROV-G: re-posting an already-posted invoice is rejected", retryThrew);
    ok("PROV-G: still exactly one VAT provenance link after retry", (await linkCount(id)) === 1);
  }

  // ===================== PROV-H / PROV-I — failure injection + clean retry =====================
  if (process.env.THAWAB_FAILPOINTS === "1") {
    console.log(
      "\nPROV-H/I — inject failure before provenance link → full rollback, then clean retry",
    );
    const inv = await createTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-H-${RUN}`,
    );
    await drive(inv.id, "approve");
    armFailpoint("si.before_vat_provenance_link", 1);
    let threw = false;
    try {
      await transitionSupplierInvoice(checker, inv.id, "post" as any);
    } catch (e: any) {
      threw = String(e?.message).includes("FAILPOINT:si.before_vat_provenance_link");
    }
    clearFailpoints();
    const st = await invStatus(inv.id);
    const noEntry = !(await entryFor(inv.id));
    const noLink = (await linkCount(inv.id)) === 0;
    // No AP link / no GRNI clearing from the failed post = no posted journal for this source at all.
    ok("PROV-H: injected failure threw at the provenance boundary", threw);
    ok("PROV-H: invoice NOT posted (rolled back to approved)", st.s === "approved" && !st.je);
    ok("PROV-H: no persisted journal, no VAT link after rollback", noEntry && noLink);

    // PROV-I: retry normally → clean one-time accounting + one link.
    await transitionSupplierInvoice(checker, inv.id, "post" as any);
    const st2 = await invStatus(inv.id);
    ok(
      "PROV-I: clean retry posts exactly once with one VAT link",
      st2.s === "posted" && (await linkCount(inv.id)) === 1 && !!(await entryFor(inv.id)),
    );
  } else {
    console.log("\nPROV-H/I — SKIPPED (THAWAB_FAILPOINTS!=1)");
  }

  // ===================== PROV-J — reversal preserves provenance =====================
  console.log("\nPROV-J — reversing an invoice preserves its original VAT provenance");
  {
    const id = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-J-${RUN}`,
    );
    const before = await linkRow(id);
    await transitionSupplierInvoice(checker, id, "reverse" as any, "audit reversal");
    const after = await linkRow(id);
    ok(
      "PROV-J: VAT provenance link still present & unchanged after reversal",
      !!after && after.journalLineId === before.journalLineId && (await linkCount(id)) === 1,
    );
    const elig = await getSupplierInvoiceCreditNoteEligibility(db, id);
    ok(
      "PROV-J: reversed invoice eligibility = BLOCKED_INVOICE_NOT_POSTED",
      elig.reason === "BLOCKED_INVOICE_NOT_POSTED" && !elig.eligibleForFutureCreditNoteFoundation,
    );
  }

  // ===================== PROV-CORR-A/B/C — corruption fails closed =====================
  console.log("\nPROV-CORR-A/B/C — corrupt provenance is REJECTED (never inferred)");
  {
    // Two invoices, both with valid links.
    const idX = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-CX-${RUN}`,
    );
    const idY = await postTaxable(
      [{ accountId: EXP, quantity: 1, unitPrice: 100, taxRate: 15 }],
      `5C02-CY-${RUN}`,
    );
    const entryX = await entryFor(idX);
    const entryY = await entryFor(idY);

    // CORR-A: point X's link at a line from Y's entry (another invoice's posting).
    // Use Y's expense line (not itself linked, so UNIQUE(journal_line_id) permits it).
    const yExp = (await db.execute(
      sql`SELECT id FROM journal_lines WHERE journal_entry_id=${entryY} AND account_id=${EXP} AND debit>0 LIMIT 1`,
    )) as any;
    const yExpId = (yExp.rows ?? yExp ?? [])[0]?.id;
    await db.execute(
      sql`UPDATE supplier_invoice_tax_journal_links SET journal_line_id=${yExpId} WHERE supplier_invoice_id=${idX}`,
    );
    await rejects(
      "PROV-CORR-A: link → another invoice's entry REJECTED (corrupt)",
      "VAT_PROVENANCE_CORRUPT",
      () => resolveSupplierInvoiceHistoricalInputVat(db, idX),
    );

    // CORR-B: point X's link at an expense DEBIT line in X's OWN entry (amount != tax).
    const expLine = (await db.execute(
      sql`SELECT id FROM journal_lines WHERE journal_entry_id=${entryX} AND account_id=${EXP} AND debit>0 LIMIT 1`,
    )) as any;
    const expLineId = (expLine.rows ?? expLine ?? [])[0]?.id;
    await db.execute(
      sql`UPDATE supplier_invoice_tax_journal_links SET journal_line_id=${expLineId} WHERE supplier_invoice_id=${idX}`,
    );
    await rejects(
      "PROV-CORR-B: link → line whose amount != invoice tax REJECTED",
      "VAT_PROVENANCE_CORRUPT",
      () => resolveSupplierInvoiceHistoricalInputVat(db, idX),
    );

    // CORR-C: point X's link at the AP CREDIT line of X's entry (credit, not debit).
    const apLine = (await db.execute(
      sql`SELECT jl.id FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE jl.journal_entry_id=${entryX} AND jl.credit>0 AND a.system_key='accounts_payable' LIMIT 1`,
    )) as any;
    const apLineId = (apLine.rows ?? apLine ?? [])[0]?.id;
    await db.execute(
      sql`UPDATE supplier_invoice_tax_journal_links SET journal_line_id=${apLineId} WHERE supplier_invoice_id=${idX}`,
    );
    await rejects("PROV-CORR-C: link → a credit line REJECTED", "VAT_PROVENANCE_CORRUPT", () =>
      resolveSupplierInvoiceHistoricalInputVat(db, idX),
    );

    const elig = await getSupplierInvoiceCreditNoteEligibility(db, idX);
    ok(
      "PROV-CORR: eligibility on corrupt link fails closed (not inferred)",
      elig.reason === "VAT_PROVENANCE_CORRUPT" && !elig.eligibleForFutureCreditNoteFoundation,
    );
  }

  // ===================== Report (§21/§22) =====================
  console.log("\nProvenance coverage report (this bench DB)");
  const rep = await supplierInvoiceTaxProvenanceReport(db);
  console.log(
    `  postedTaxable=${rep.postedTaxable} withLink=${rep.postedTaxableWithLink} withoutLink=${rep.postedTaxableWithoutLink} postedZeroTax=${rep.postedZeroTax}`,
  );
  ok(
    "REPORT: coverage counts are internally consistent",
    rep.postedTaxable === rep.postedTaxableWithLink + rep.postedTaxableWithoutLink,
  );

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
