/**
 * Phase Sales-2 — Customer Receipts & AR settlement allocation API.
 *
 * Reads under finance.customer_receipt_allocation.view. Creating a receipt (posts
 * Dr Cash|Bank / Cr AR) requires finance.customer_receipt.create; allocate /
 * unallocate (settlement metadata, never GL) require
 * finance.customer_receipt_allocation.manage. Posting reuses the certified GL
 * engine; allocation touches no ledger.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import { db } from "@/server/db/index";
import { receiveFromCustomer } from "@/server/db/customer-receipt";
import {
  allocate,
  unallocate,
  invoiceSettlement,
  receiptSettlement,
  allocationCandidates,
  listCustomerReceipts,
  listCustomerSalesInvoices,
} from "@/server/db/customer-receipt-allocation";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const receipt = url.searchParams.get("receipt");
  const invoice = url.searchParams.get("invoice");
  const candidates = url.searchParams.get("candidates");
  if (candidates)
    return Response.json(
      await allocationCandidates(db, candidates, {
        q: url.searchParams.get("q") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
      }),
    );
  if (receipt) return Response.json(await receiptSettlement(db, receipt));
  if (invoice) return Response.json(await invoiceSettlement(db, invoice));
  const invoicesForCustomer = url.searchParams.get("invoices");
  if (invoicesForCustomer)
    return Response.json(
      await listCustomerSalesInvoices(db, {
        customerId: invoicesForCustomer,
        limit: Number(url.searchParams.get("limit")) || undefined,
        offset: Number(url.searchParams.get("offset")) || undefined,
      }),
    );
  return Response.json(
    await listCustomerReceipts(db, {
      customerId: url.searchParams.get("customerId") || undefined,
      search: url.searchParams.get("search") || undefined,
      onlyUnapplied: url.searchParams.get("onlyUnapplied") === "1",
      page: Number(url.searchParams.get("page")) || undefined,
      pageSize: Number(url.searchParams.get("pageSize")) || undefined,
    }),
  );
}

const createSchema = z.object({
  action: z.literal("create"),
  customerId: z.string().min(1, "العميل مطلوب"),
  amount: z.coerce.number().finite().positive("المبلغ يجب أن يكون موجباً"),
  method: z.enum(["cash", "bank"]).optional(),
  reference: z.string().nullish(),
  date: z.string().nullish(),
  note: z.string().nullish(),
  idempotencyKey: z.string().nullish(),
});
const allocSchema = z.object({
  action: z.literal("allocate"),
  receiptId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().finite().positive(),
});
const unallocSchema = z.object({
  action: z.literal("unallocate"),
  receiptId: z.string().min(1),
  invoiceId: z.string().min(1),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const raw = (await event.request.json().catch(() => ({}))) as any;

    if (raw?.action === "create") {
      if (!(await hasPermission(ctx.user.role, P.customerReceiptCreate)))
        return err("لا تملك صلاحية تسجيل سند قبض", 403, "FORBIDDEN");
      const parsed = createSchema.safeParse(raw);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
      }
      const { customerId, amount, method, reference, date, note, idempotencyKey } = parsed.data;
      const result = await receiveFromCustomer(ctx, {
        customerId,
        amount,
        method,
        reference,
        date,
        note,
        idempotencyKey,
      });
      return Response.json(result, { status: 201 });
    }

    if (!(await hasPermission(ctx.user.role, P.customerReceiptAllocationManage)))
      return err("لا تملك صلاحية إدارة تخصيص التحصيل", 403, "FORBIDDEN");
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

export const Route = createFileRoute("/api/finance/customer-receipts")({
  server: {
    handlers: {
      GET: authHandler(P.customerReceiptAllocationView, GET),
      POST: authHandler(P.customerReceiptAllocationView, POST), // create/manage checked inside
    },
  },
});
