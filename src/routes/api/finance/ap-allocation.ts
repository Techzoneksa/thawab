/**
 * Phase 5A — Supplier Payment Allocation API (settlement metadata, never GL).
 *
 * Reads under finance.supplier_payment_allocation.view; writes (allocate /
 * unallocate) under finance.supplier_payment_allocation.manage — deliberately
 * separate from payment-posting authority. No endpoint touches the ledger.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { db } from "@/server/db/index";
import {
  allocate,
  unallocate,
  invoiceSettlement,
  paymentSettlement,
  allocationCandidates,
  listSupplierPayments,
  listSupplierInvoices,
} from "@/server/db/supplier-payment-allocation";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const payment = url.searchParams.get("payment");
  const invoice = url.searchParams.get("invoice");
  const candidates = url.searchParams.get("candidates");
  if (candidates)
    return Response.json(
      await allocationCandidates(db, candidates, {
        q: url.searchParams.get("q") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
      }),
    );
  if (payment) return Response.json(await paymentSettlement(db, payment));
  if (invoice) return Response.json(await invoiceSettlement(db, invoice));
  const invoicesForSupplier = url.searchParams.get("invoices");
  if (invoicesForSupplier)
    return Response.json(
      await listSupplierInvoices(db, {
        supplierId: invoicesForSupplier,
        asOfDate: url.searchParams.get("asOfDate") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
        offset: Number(url.searchParams.get("offset")) || undefined,
      }),
    );
  return Response.json(
    await listSupplierPayments(db, {
      supplierId: url.searchParams.get("supplierId") || undefined,
      search: url.searchParams.get("search") || undefined,
      onlyUnapplied: url.searchParams.get("onlyUnapplied") === "1",
      page: Number(url.searchParams.get("page")) || undefined,
      pageSize: Number(url.searchParams.get("pageSize")) || undefined,
    }),
  );
}

const allocSchema = z.object({
  action: z.literal("allocate"),
  paymentId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
});
const unallocSchema = z.object({
  action: z.literal("unallocate"),
  paymentId: z.string().min(1),
  invoiceId: z.string().min(1),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    if (!(await hasPermission(ctx.user.role, P.supplierPaymentAllocationManage)))
      return err("لا تملك صلاحية إدارة تخصيص الدفعات", 403, "FORBIDDEN");
    const raw = (await event.request.json().catch(() => ({}))) as any;
    const schema = raw?.action === "unallocate" ? unallocSchema : allocSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    if (parsed.data.action === "unallocate")
      return Response.json(await unallocate(ctx, parsed.data));
    return Response.json(await allocate(ctx, parsed.data));
  });
}

export const Route = createFileRoute("/api/finance/ap-allocation")({
  server: {
    handlers: {
      GET: authHandler(P.supplierPaymentAllocationView, GET),
      POST: authHandler(P.supplierPaymentAllocationView, POST), // manage checked inside
    },
  },
});
