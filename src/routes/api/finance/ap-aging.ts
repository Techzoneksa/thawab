/**
 * Phase 5A — Accounts Payable Aging API (read-only, GL-derived, set-based).
 * Under finance.ap_aging.view. Aging uses invoice OUTSTANDING (not gross) and
 * reconciles to the AP GL (unapplied payments surfaced, never hidden).
 */
import { createFileRoute } from "@tanstack/react-router";
import { authHandler, type Ctx } from "@/server/db/api-utils";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { db } from "@/server/db/index";
import {
  apAging,
  apAgingBySupplier,
  apAgingReconciliation,
} from "@/server/db/supplier-payment-allocation";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const asOfDate = url.searchParams.get("asOfDate") || undefined;
  const supplierId = url.searchParams.get("supplierId") || undefined;
  const view = url.searchParams.get("view");
  if (view === "by-supplier")
    return Response.json(
      await apAgingBySupplier(db, {
        asOfDate,
        limit: Number(url.searchParams.get("limit")) || undefined,
        offset: Number(url.searchParams.get("offset")) || undefined,
      }),
    );
  const [summary, reconciliation] = await Promise.all([
    apAging(db, { asOfDate, supplierId }),
    apAgingReconciliation(db, { supplierId }),
  ]);
  return Response.json({ summary, reconciliation });
}

export const Route = createFileRoute("/api/finance/ap-aging")({
  server: {
    handlers: {
      GET: authHandler(P.apAgingView, GET),
    },
  },
});
