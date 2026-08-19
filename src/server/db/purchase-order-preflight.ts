/**
 * Phase 3C — Purchase Order legacy-data preflight (read-only diagnostics).
 *
 * Surfaces the state of existing purchase-order data so an administrator can see
 * how many orders are legacy vs governed, and — critically — how many legacy
 * orders already carried accounting/inventory side effects from the legacy
 * receive flow (Dr Inventory / Cr AP, suppliers.balance +=, stock movements).
 * NEVER mutates anything and NEVER auto-classifies.
 */
import { and, eq, sql } from "drizzle-orm";
import { purchaseOrders, journalEntries, stockMovements } from "./schema";
import { PurchaseOrderGovernance } from "@/lib/enums";

type Db = { select: (...a: any[]) => any };

export async function purchaseOrderPreflight(dbh: Db) {
  const rows = (await dbh.select().from(purchaseOrders)) as any[];
  const byStatus: Record<string, number> = {};
  let governed = 0,
    legacy = 0,
    withSupplier = 0,
    withoutSupplier = 0,
    received = 0,
    withJournal = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.governanceMode === PurchaseOrderGovernance.GOVERNED) governed++;
    else legacy++;
    if (r.supplierId) withSupplier++;
    else withoutSupplier++;
    if (r.status === "received" || r.status === "partial" || Number(r.receivedAmount || 0) > 0)
      received++;
    if (r.journalEntryId) withJournal++;
  }

  // Journals produced by the legacy PO receive flow (sourceType='purchase_order').
  const receiveJournals = (
    await dbh
      .select({ c: sql<number>`COUNT(*)` })
      .from(journalEntries)
      .where(eq(journalEntries.sourceType, "purchase_order"))
  )[0] as any;
  // Distinct POs whose receive touched inventory (stock movements).
  const invMovementPos = (
    await dbh
      .select({ c: sql<number>`COUNT(DISTINCT ${stockMovements.sourceId})` })
      .from(stockMovements)
      .where(eq(stockMovements.sourceType, "purchase_order"))
  )[0] as any;
  // Governed POs must NEVER have a receive journal — this must always be 0.
  const governedWithReceiveJournal = (
    await dbh
      .select({ c: sql<number>`COUNT(*)` })
      .from(journalEntries)
      .innerJoin(purchaseOrders, eq(journalEntries.sourceId, purchaseOrders.id))
      .where(
        and(
          eq(journalEntries.sourceType, "purchase_order"),
          eq(purchaseOrders.governanceMode, PurchaseOrderGovernance.GOVERNED),
        ),
      )
  )[0] as any;

  // Phase 3C.1 cutover verification: the newest legacy vs governed PO created_at.
  // No reliable cutover timestamp/marker exists, so the before/after split is NOT
  // fabricated. Instead, production can watch `latestLegacyCreatedAt` stop
  // advancing (no NEW legacy POs) while `latestGovernedCreatedAt` keeps advancing.
  const latestLegacy = (
    await dbh
      .select({ m: sql<string>`MAX(${purchaseOrders.createdAt})` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.governanceMode, "legacy"))
  )[0] as any;
  const latestGoverned = (
    await dbh
      .select({ m: sql<string>`MAX(${purchaseOrders.createdAt})` })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.governanceMode, PurchaseOrderGovernance.GOVERNED))
  )[0] as any;

  return {
    totalPurchaseOrders: rows.length,
    byStatus,
    governedCount: governed,
    legacyCount: legacy,
    posWithSupplier: withSupplier,
    posWithoutSupplier: withoutSupplier,
    posAlreadyReceived: received,
    posThatGeneratedGl: withJournal,
    receiveJournalCount: Number(receiveJournals?.c || 0),
    posThatChangedInventory: Number(invMovementPos?.c || 0),
    // suppliers.balance mutations from the legacy receive flow are not attributable
    // to individual rows (the column is a running total), so it is reported as not
    // row-level tracked rather than guessed.
    supplierBalanceMutationsTracked: false,
    // Invariant guard: governed POs never post — must be 0.
    governedPosWithReceiveJournal: Number(governedWithReceiveJournal?.c || 0),
    // Cutover watchpoints (no fabricated before/after split — see note above).
    latestLegacyCreatedAt: latestLegacy?.m ?? null,
    latestGovernedCreatedAt: latestGoverned?.m ?? null,
  };
}
