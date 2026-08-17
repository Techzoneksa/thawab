import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db/index";
import { journalEntries, journalLines, accounts, costCenters, projects } from "@/server/db/schema";
import { and, eq, gte, inArray, lte, like, or, sql } from "drizzle-orm";
import { authHandler, type Ctx } from "@/server/db/api-utils";
import { JournalStatus, AccountStatus, CostCenterStatus } from "@/lib/enums";

// GET /api/finance/ledger - computed movements from posted journal entries joined with lines
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId") || "";
  const costCenterId = url.searchParams.get("costCenterId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  const search = url.searchParams.get("search") || "";

  // General Ledger states: posted + reversed (reversed originals are offset by
  // posted mirrors, so both are counted and net to zero). Draft/pending/
  // cancelled never affect the ledger.
  const glStates = [JournalStatus.POSTED, JournalStatus.REVERSED];
  const entryConditions = [inArray(journalEntries.status, glStates)];
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
    .orderBy(journalEntries.date, journalEntries.number);

  const matchingEntryIds = matchingEntries.map((e) => e.id);

  // Lookups for accounts, costCenters, projects
  const accountList = await db.select().from(accounts);
  const accountMap = new Map(accountList.map((a) => [a.id, a]));

  const ccList = await db.select().from(costCenters);
  const ccMap = new Map(ccList.map((c) => [c.id, c]));

  const projList = await db.select().from(projects);
  const projMap = new Map(projList.map((p) => [p.id, p]));

  // Get lines for those entries, applying line-level filters
  const lines =
    matchingEntryIds.length > 0
      ? await (() => {
          const lineConditions = [
            sql`${journalLines.journalEntryId} IN (${sql.join(
              matchingEntryIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ];
          if (accountId) lineConditions.push(eq(journalLines.accountId, accountId));
          if (costCenterId) lineConditions.push(eq(journalLines.costCenterId, costCenterId));
          if (projectId) lineConditions.push(eq(journalLines.projectId, projectId));
          return db
            .select()
            .from(journalLines)
            .where(and(...lineConditions))
            .orderBy(journalLines.lineNumber);
        })()
      : [];

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

  // Compute opening balance for selected account (only meaningful when an account is selected).
  // Opening = sum of (debit - credit) for that account's lines of posted entries before dateFrom.
  let openingBalance = 0;
  if (accountId && dateFrom) {
    const openingEntries = await db
      .select()
      .from(journalEntries)
      .where(
        and(inArray(journalEntries.status, glStates), sql`${journalEntries.date} < ${dateFrom}`),
      );
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
        );
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
      .filter((a) => a.status === AccountStatus.ACTIVE)
      .map((a) => ({ id: a.id, code: a.code, name: a.name })),
    costCenters: ccList
      .filter((c) => c.status === CostCenterStatus.ACTIVE)
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
      GET: authHandler("finance.view", GET),
    },
  },
});
