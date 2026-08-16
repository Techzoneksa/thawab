import { createFileRoute } from "@tanstack/react-router";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/index";
import {
  journalEntries,
  journalLines,
  budgets,
  budgetLines,
  accounts,
  costCenters,
  projects,
} from "@/server/db/schema";
import { authHandler, err, type Ctx } from "@/server/db/api-utils";

// GET /api/data/export?type=journal|budget
// Returns flat rows (one row per line) ready to be written to an .xlsx by the
// client. Journal rows are round-trip compatible with the import template.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const type = new URL(request.url).searchParams.get("type") || "journal";

  const accs = await db.select().from(accounts);
  const accMap = new Map(accs.map((a) => [a.id, a]));

  if (type === "journal") {
    const entries = await db
      .select()
      .from(journalEntries)
      .orderBy(desc(journalEntries.date), desc(journalEntries.number));
    const entryMap = new Map(entries.map((e) => [e.id, e]));
    const ids = entries.map((e) => e.id);
    const lines = ids.length
      ? await db.select().from(journalLines).where(inArray(journalLines.journalEntryId, ids))
      : [];

    const ccIds = [...new Set(lines.map((l) => l.costCenterId).filter(Boolean) as string[])];
    const prIds = [...new Set(lines.map((l) => l.projectId).filter(Boolean) as string[])];
    const ccs = ccIds.length
      ? await db.select().from(costCenters).where(inArray(costCenters.id, ccIds))
      : [];
    const prs = prIds.length
      ? await db.select().from(projects).where(inArray(projects.id, prIds))
      : [];
    const ccMap = new Map(ccs.map((c) => [c.id, c]));
    const prMap = new Map(prs.map((p) => [p.id, p]));

    // Preserve entry order, then line order.
    const orderIndex = new Map(ids.map((id, i) => [id, i]));
    lines.sort((a, b) => {
      const ea = orderIndex.get(a.journalEntryId) ?? 0;
      const eb = orderIndex.get(b.journalEntryId) ?? 0;
      return ea - eb || a.lineNumber - b.lineNumber;
    });

    const rows = lines.map((l) => {
      const e = entryMap.get(l.journalEntryId);
      const a = accMap.get(l.accountId);
      return {
        number: e?.number || "",
        date: (e?.date || "").slice(0, 10),
        description: e?.description || "",
        status: e?.status || "",
        fund: e?.fund || "",
        accountCode: a?.code || "",
        accountName: a?.name || "",
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        costCenter: l.costCenterId ? ccMap.get(l.costCenterId)?.name || "" : "",
        project: l.projectId ? prMap.get(l.projectId)?.name || "" : "",
        notes: l.description || "",
      };
    });
    return Response.json({ type, rows, count: entries.length });
  }

  if (type === "budget") {
    const buds = await db.select().from(budgets).orderBy(desc(budgets.year));
    const budMap = new Map(buds.map((b) => [b.id, b]));
    const ids = buds.map((b) => b.id);
    const lines = ids.length
      ? await db.select().from(budgetLines).where(inArray(budgetLines.budgetId, ids))
      : [];
    const orderIndex = new Map(ids.map((id, i) => [id, i]));
    lines.sort((a, b) => {
      const ea = orderIndex.get(a.budgetId) ?? 0;
      const eb = orderIndex.get(b.budgetId) ?? 0;
      return ea - eb || a.lineNumber - b.lineNumber;
    });
    const rows = lines.map((l) => {
      const bud = budMap.get(l.budgetId);
      const a = l.accountId ? accMap.get(l.accountId) : undefined;
      return {
        name: bud?.name || "",
        year: bud?.year || "",
        department: bud?.department || "",
        accountCode: a?.code || "",
        accountName: a?.name || "",
        plannedAmount: Number(l.plannedAmount || 0),
        notes: l.notes || "",
      };
    });
    return Response.json({ type, rows, count: buds.length });
  }

  return err("نوع تصدير غير مدعوم", 400, "BAD_TYPE");
}

export const Route = createFileRoute("/api/data/export")({
  server: { handlers: { GET: authHandler("finance.view", GET) } },
});
