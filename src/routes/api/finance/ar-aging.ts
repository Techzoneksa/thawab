/**
 * Phase Sales-1 — Accounts Receivable Aging API (read-only, GL-derived, set-based).
 * Under finance.ar_aging.view. Aging buckets posted sales-invoice outstanding and
 * reconciles to the AR control-account GL balance.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authHandler, type Ctx } from "@/server/db/api-utils";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { db } from "@/server/db/index";
import { arAging, arAgingByCustomer, arAgingReconciliation } from "@/server/db/ar-aging";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const asOfDate = url.searchParams.get("asOfDate") || undefined;
  const customerId = url.searchParams.get("customerId") || undefined;
  const view = url.searchParams.get("view");
  if (view === "by-customer")
    return Response.json(
      await arAgingByCustomer(db, {
        asOfDate,
        limit: Number(url.searchParams.get("limit")) || undefined,
        offset: Number(url.searchParams.get("offset")) || undefined,
      }),
    );
  const [summary, reconciliation] = await Promise.all([
    arAging(db, { asOfDate, customerId }),
    arAgingReconciliation(db, { customerId }),
  ]);
  return Response.json({ summary, reconciliation });
}

export const Route = createFileRoute("/api/finance/ar-aging")({
  server: {
    handlers: {
      GET: authHandler(P.arAgingView, GET),
    },
  },
});
