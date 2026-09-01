/**
 * Phase Sales-1 — Sales Invoices (فواتير المبيعات) API.
 *
 * Reads under finance.sales_invoice.view. Writes are granular: create →
 * finance.sales_invoice.create; lifecycle actions (submit/approve/return/reject/
 * post/reverse) → per-action permission enforced inside the workflow service;
 * draft edit → finance.sales_invoice.update_draft. Posting/reversal reuse the
 * certified GL engine; posting recognizes revenue (Dr AR / Cr revenue) and
 * attributes the AR debit to the customer subledger.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createSalesInvoice,
  updateSalesInvoice,
  transitionSalesInvoice,
  getSalesInvoiceDetail,
  listSalesInvoices,
} from "@/server/db/sales-invoice";
import type { JournalAction } from "@/lib/finance-permissions";

const lineSchema = z.object({
  accountId: z.string().min(1, "حساب الإيراد مطلوب"),
  description: z.string().optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
  unitPrice: z.coerce.number().positive("سعر الوحدة يجب أن يكون موجباً"),
  costCenterId: z.string().nullish(),
});

const createSchema = z.object({
  customerId: z.string().min(1, "العميل مطلوب"),
  invoiceDate: z.string().min(1, "تاريخ الفاتورة مطلوب"),
  dueDate: z.string().nullish(),
  currency: z.string().trim().optional(),
  fund: z.string().optional(),
  projectId: z.string().nullish(),
  customerReference: z.string().nullish(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, "أضف سطراً واحداً على الأقل"),
});

const updateSchema = createSchema.extend({ id: z.string().min(1) });

const INVOICE_ACTIONS = ["submit", "approve", "return", "reject", "post", "reverse"] as const;
const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(INVOICE_ACTIONS),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getSalesInvoiceDetail(id);
    if (!detail) return err("فاتورة المبيعات غير موجودة", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listSalesInvoices({
      status: url.searchParams.get("status") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    }),
  );
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body && typeof body === "object" && "action" in body) {
      const { id, action, reason } = actionSchema.parse(body);
      const { item, reversalId } = await transitionSalesInvoice(
        ctx,
        id,
        action as JournalAction,
        reason,
      );
      return Response.json({ item, reversalId });
    }
    if (!(await hasPermission(ctx.user.role, P.salesInvoiceCreate)))
      return err("لا تملك صلاحية إنشاء فاتورة مبيعات", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createSalesInvoice(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updateSalesInvoice(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/sales-invoices")({
  server: {
    handlers: {
      GET: authHandler(P.salesInvoiceView, GET),
      POST: authHandler(P.salesInvoiceView, POST), // create/actions checked inside
      PUT: authHandler(P.salesInvoiceUpdateDraft, PUT),
    },
  },
});
