/*
 * Super-admin journal overrides — end-to-end on a REAL Postgres tenant DB:
 * unpost (POSTED→DRAFT), return from APPROVED, cancel, governed delete, and
 * every guard (permission, reason, closed period, document source, posted).
 *   TENANT_URL=postgres://… node_modules/.bin/tsx scripts/test-journal-override.ts
 * The DB must be migrated and EMPTY (the test bootstraps its own admin).
 */
const URL = process.env.TENANT_URL || "postgres://postgres@127.0.0.1:5433/thawab_c";
process.env.TENANTS_JSON = JSON.stringify({ t: { databaseUrl: URL } });
process.env.BASE_DOMAIN = "jaadpro.com";

const { runWithTenant } = await import("../src/server/db/tenant-context.ts");
const { db, closeDb } = await import("../src/server/db/client.ts");
const S = await import("../src/server/db/schema.ts");
const { bootstrapFirstAdmin } = await import("../src/server/db/auth.ts");
const { postBalancedEntry } = await import("../src/server/db/gl.ts");
const { getAllAccountBalances } = await import("../src/server/db/balances.ts");
const { transitionJournal, deleteJournalEntry } = await import("../src/server/db/finance-workflow.ts");
const { eq } = await import("drizzle-orm");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${!cond && extra ? "  → " + extra : ""}`);
  cond ? pass++ : fail++;
};
async function expectErr(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, false, "no error thrown"); }
  catch (e: any) { check(name, e?.code === code, `got ${e?.code}: ${e?.message}`); }
}

await runWithTenant({ id: "t", host: "t.jaadpro.com", databaseUrl: URL }, async () => {
  const today = new Date().toISOString().slice(0, 10);
  const boot: any = await bootstrapFirstAdmin({ name: "المدير العام", email: "admin@x.sa", password: "secret123" });
  const admin = { user: { id: boot.user.id, role: "role-admin", name: "المدير العام" }, ip: "" } as any;
  await db.insert(S.roles).values({ id: "role-maker", name: "محاسب", permissions: JSON.stringify([
    "finance.view", "finance.journal.create", "finance.journal.update_draft", "finance.journal.submit"]), createdAt: today });
  await db.insert(S.users).values({ id: "USR-m", name: "محاسب", email: "m@x.sa", password: "x", role: "role-maker", createdAt: today });
  const maker = { user: { id: "USR-m", role: "role-maker", name: "محاسب" }, ip: "" } as any;
  for (const [id, code, cls] of [["A-cash", "1101", "asset"], ["A-rev", "4101", "revenue"]] as const)
    await db.insert(S.accounts).values({ id, code, name: code, classification: cls, createdAt: today, updatedAt: today });

  const draft = () => db.transaction((tx) => postBalancedEntry(tx as any, {
    date: today, description: "اختبار", source: "manual", userId: admin.user.id, status: "draft",
    lines: [{ accountId: "A-cash", debit: 100, credit: 0 }, { accountId: "A-rev", debit: 0, credit: 100 }] as any,
  }));
  const status = async (id: string) => (await db.select().from(S.journalEntries).where(eq(S.journalEntries.id, id)))[0];
  const cash = async () => (await getAllAccountBalances(db as any)).get("A-cash")?.balance ?? 0;
  const toPosted = async (id: string) => { for (const a of ["submit", "approve", "post"] as const) await transitionJournal(admin, id, a); };

  const id = await draft();
  await toPosted(id);
  check("posted entry counts in GL (cash = 100)", (await cash()) === 100);

  await expectErr("maker cannot unpost", "FORBIDDEN", () => transitionJournal(maker, id, "unpost", "x"));
  await expectErr("unpost requires a reason", "REASON_REQUIRED", () => transitionJournal(admin, id, "unpost"));
  await transitionJournal(admin, id, "unpost", "خطأ في المبلغ");
  let e = await status(id);
  check("unpost → DRAFT with posting/approval stamps cleared", e.status === "draft" && !e.postedBy && !e.approvedBy && !e.submittedBy);
  check("unposted entry leaves the GL (cash = 0)", (await cash()) === 0);

  await toPosted(id);
  await db.update(S.fiscalPeriods).set({ status: "closed" });
  await expectErr("cannot unpost inside a CLOSED period", "PERIOD_CLOSED", () => transitionJournal(admin, id, "unpost", "x"));
  await db.update(S.fiscalPeriods).set({ status: "open" });
  await db.update(S.journalEntries).set({ sourceType: "receipt_voucher" }).where(eq(S.journalEntries.id, id));
  await expectErr("cannot unpost a document-generated journal", "DOCUMENT_SOURCE", () => transitionJournal(admin, id, "unpost", "x"));
  await db.update(S.journalEntries).set({ sourceType: null }).where(eq(S.journalEntries.id, id));
  await expectErr("cannot delete a POSTED entry directly", "POSTED", () => deleteJournalEntry(admin, id));

  await transitionJournal(admin, id, "unpost", "تعديل");
  await transitionJournal(admin, id, "submit");
  await transitionJournal(admin, id, "approve");
  await transitionJournal(admin, id, "return", "يحتاج تعديل");
  e = await status(id);
  check("return from APPROVED → DRAFT, approval cleared", e.status === "draft" && !e.approvedBy);

  await transitionJournal(admin, id, "submit");
  await transitionJournal(admin, id, "approve");
  await expectErr("maker cannot delete a non-draft entry", "FORBIDDEN", () => deleteJournalEntry(maker, id));
  await expectErr("maker cannot cancel an approved entry", "FORBIDDEN", () => transitionJournal(maker, id, "cancel"));
  await transitionJournal(admin, id, "cancel");
  check("admin cancels an APPROVED entry", (await status(id)).status === "cancelled");
  await deleteJournalEntry(admin, id);
  check("admin deletes it permanently", !(await status(id)));
  const lines = await db.select().from(S.journalLines).where(eq(S.journalLines.journalEntryId, id));
  check("its lines are gone too", lines.length === 0);
  const aud = (await db.select().from(S.auditLog).where(eq(S.auditLog.entityId, id))).find((r) => r.action === "delete");
  check("audit log records WHO deleted (name) + full snapshot",
    !!aud && aud.userName === "المدير العام" && JSON.parse(aud.before || "{}").lines?.length === 2);
  const ev = (await db.select().from(S.financeWorkflowEvents).where(eq(S.financeWorkflowEvents.entityId, id)));
  check("workflow history keeps every step incl. unpost + delete",
    ev.some((x) => x.action === "unpost" && x.reason === "خطأ في المبلغ") && ev.some((x) => x.action === "delete"));

  const d2 = await draft();
  await deleteJournalEntry(maker, d2);
  check("maker can still delete their DRAFT (unchanged behaviour)", !(await status(d2)));
});
await closeDb();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
