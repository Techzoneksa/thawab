import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db/index";
import { journalEntries, journalLines, accounts, costCenters, projects } from "@/server/db/schema";
import { and, eq, gte, lte, like, or, sql } from "drizzle-orm";

// GET /api/finance/ledger - computed movements from posted journal entries joined with lines
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || "";
  const costCenterId = url.searchParams.get("costCenterId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  const search = url.searchParams.get("search") || "";

  // Build conditions for journal entries that are posted (not draft/cancelled/reversed)
  // Posted = status = "ظ…ط±ط­ظ‘ظ„" AND reversedAt IS NULL
  const entryConditions = [
    eq(journalEntries.status, "ظ…ط±ط­ظ‘ظ„"),
    sql`${journalEntries.reversedAt} IS NULL`,
  ];
  if (dateFrom) entryConditions.push(gte(journalEntries.date, dateFrom));
  if (dateTo) entryConditions.push(lte(journalEntries.date, dateTo));
  if (projectId) entryConditions.push(eq(journalEntries.projectId, projectId));
  if (search) {
    const s = or(
      like(journalEntries.number, `%${search}%`),
      like(journalEntries.description, `%${search}%`),
      like(journalEntries.notes, `%${search}%`),
    );
    if (s) entryConditions.push(s);
  }
  const entryWhere = and(...entryConditions)!;

  // Get posted entries that match entry-level filters
  const matchingEntries = await db
    .select()
    .from(journalEntries)
    .where(entryWhere)
    .orderBy(journalEntries.date, journalEntries.number)
    .all();

  const matchingEntryIds = matchingEntries.map((e) => e.id);

  // Get lines for those entries, applying line-level filters
  const lineConditions = [
    sql`${journalLines.journalEntryId} IN (${sql.join(
      matchingEntryIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  ];
  if (accountId) lineConditions.push(eq(journalLines.accountId, accountId));
  if (costCenterId) lineConditions.push(eq(journalLines.costCenterId, costCenterId));
  if (projectId) lineConditions.push(eq(journalLines.projectId, projectId));
  const lineWhere = and(...lineConditions);

  const lines = await db
    .select()
    .from(journalLines)
    .where(lineWhere)
    .orderBy(journalLines.lineNumber)
    .all();

  // Build lookups for accounts, costCenters, projects
  const accountList = await db.select().from(accounts).all();
  const accountMap = new Map(accountList.map((a) => [a.id, a]));

  const ccList = await db.select().from(costCenters).all();
  const ccMap = new Map(ccList.map((c) => [c.id, c]));

  const projList = await db.select().from(projects).all();
  const projMap = new Map(projList.map((p) => [p.id, p]));

  // Build movement rows from lines joined with entries
  const movements: Array<{
    lineId: string;
    entryId: string;
    entryNumber: string;
    date: string;
    description: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    costCenterId: string;
    costCenterName: string;
    projectId: string;
    projectName: string;
    debit: number;
    credit: number;
    notes: string;
    runningBalance: number;
  }> = lines.map((line) => {
    const entry = matchingEntries.find((e) => e.id === line.journalEntryId);
    const acc = accountMap.get(line.accountId);
    const cc = line.costCenterId ? ccMap.get(line.costCenterId) : null;
    const proj = line.projectId
      ? projMap.get(line.projectId)
      : entry?.projectId
        ? projMap.get(entry.projectId)
        : null;
    return {
      lineId: line.id,
      entryId: line.journalEntryId,
      entryNumber: entry?.number || "",
      date: entry?.date || "",
      description: entry?.description || "",
      accountId: line.accountId,
      accountCode: acc?.code || "",
      accountName: acc?.name || "",
      costCenterId: line.costCenterId || "",
      costCenterName: cc?.name || "",
      projectId: line.projectId || entry?.projectId || "",
      projectName: proj?.name || "",
      debit: line.debit,
      credit: line.credit,
      notes: line.notes || "",
      runningBalance: 0,
    };
  });

  // Sort by date, then entryNumber, then lineId for stability
  movements.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.entryNumber !== b.entryNumber) return a.entryNumber < b.entryNumber ? -1 : 1;
    return a.lineId < b.lineId ? -1 : 1;
  });

  // Compute opening balance for selected account (or all if no account selected)
  // Opening = sum of (debit - credit) for lines of posted entries before dateFrom
  let openingBalance = 0;
  if (accountId && dateFrom) {
    const openingEntryConditions = [
      eq(journalEntries.status, "ظ…ط±ط­ظ‘ظ„"),
      sql`${journalEntries.reversedAt} IS NULL`,
      sql`${journalEntries.date} < ${dateFrom}`,
    ];
    const openingEntries = await db
      .select()
      .from(journalEntries)
      .where(and(...openingEntryConditions))
      .all();
    const openingEntryIds = openingEntries.map((e) => e.id);
    if (openingEntryIds.length > 0) {
      const openingLines = await db
        .select()
        .from(journalLines)
        .where(
          and(
            eq(journalLines.accountId, accountId),
            sql`${journalLines.journalEntryId} IN (${sql.join(
              openingEntryIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        )
        .all();
      openingBalance = openingLines.reduce((sum, l) => sum + (l.debit - l.credit), 0);
    }
  }

  // Compute running balance and totals
  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of movements) {
    running += m.debit - m.credit;
    m.runningBalance = running;
    totalDebit += m.debit;
    totalCredit += m.credit;
  }
  const closingBalance = openingBalance + totalDebit - totalCredit;

  // Filter options for dropdowns
  const options = {
    accounts: accountList
      .filter((a) => a.status === "ظ†ط´ط·")
      .map((a) => ({ id: a.id, code: a.code, name: a.name })),
    costCenters: ccList
      .filter((c) => c.status === "ظ†ط´ط·")
      .map((c) => ({ id: c.id, name: c.name })),
    projects: projList.map((p) => ({ id: p.id, name: p.name })),
  };

  return Response.json({
    movements,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      net: totalDebit - totalCredit,
    },
    balances: {
      opening: openingBalance,
      closing: closingBalance,
    },
    count: movements.length,
    options,
  });
}

export const Route = createFileRoute("/api/finance/ledger")({
  server: {
    handlers: {
      GET: __handler_GET,
    },
  },
});
