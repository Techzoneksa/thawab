/**
 * Phase 3B — Supplier Invoices (فواتير الموردين) API.
 *
 * Reads under finance.supplier_invoice.view. Writes are granular: create →
 * finance.supplier_invoice.create; lifecycle actions (submit/approve/return/
 * reject/post/reverse) → per-action permission enforced inside the workflow
 * service; draft edit → finance.supplier_invoice.update_draft. Posting/reversal
 * reuse the certified GL engine; posting accrues Dr expense/asset + Dr input VAT
 * / Cr accounts payable and attributes the AP credit to the supplier subledger.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createSupplierInvoice,
  updateSupplierInvoice,
  transitionSupplierInvoice,
  getSupplierInvoiceDetail,
  listSupplierInvoices,
} from "@/server/db/supplier-invoice";
import { matchableGrnLinesForSupplier } from "@/server/db/invoice-matching";
import { db } from "@/server/db/index";
import type { JournalAction } from "@/lib/finance-permissions";

const lineSchema = z
  .object({
    // Phase 3E — 'direct' (choose a debit account) or 'grn_matched' (clears a
    // posted GRN line's GRNI; the account is server-resolved, never client-chosen).
    accountingMode: z.enum(["direct", "grn_matched"]).optional(),
    accountId: z.string().optional(),
    goodsReceiptLineId: z.string().optional(),
    description: z.string().optional(),
    quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
    unitPrice: z.coerce.number().positive("سعر الوحدة يجب أن يكون موجباً"),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    costCenterId: z.string().nullish(),
  })
  .refine((l) => (l.accountingMode === "grn_matched" ? !!l.goodsReceiptLineId : !!l.accountId), {
    message: "سطر مباشر يتطلب حساباً، وسطر المطابقة يتطلب سطر استلام",
  });

const createSchema = z.object({
  supplierId: z.string().min(1, "المورد مطلوب"),
  supplierInvoiceNumber: z.string().trim().min(1, "رقم فاتورة المورد مطلوب"),
  invoiceDate: z.string().min(1, "تاريخ الفاتورة مطلوب"),
  dueDate: z.string().nullish(),
  currency: z.string().trim().optional(),
  externalReference: z.string().nullish(),
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
  // Matchable GRN lines for a supplier (posted governed receipts, remaining > 0).
  const matchable = url.searchParams.get("matchable");
  if (matchable)
    return Response.json({
      lines: await matchableGrnLinesForSupplier(db, matchable, {
        q: url.searchParams.get("q") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
      }),
    });
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getSupplierInvoiceDetail(id);
    if (!detail) return err("فاتورة المورد غير موجودة", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listSupplierInvoices({
      status: url.searchParams.get("status") || undefined,
      supplierId: url.searchParams.get("supplierId") || undefined,
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
      const { item, reversalId } = await transitionSupplierInvoice(
        ctx,
        id,
        action as JournalAction,
        reason,
      );
      return Response.json({ item, reversalId });
    }
    if (!(await hasPermission(ctx.user.role, P.supplierInvoiceCreate)))
      return err("لا تملك صلاحية إنشاء فاتورة مورد", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createSupplierInvoice(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updateSupplierInvoice(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/supplier-invoices")({
  server: {
    handlers: {
      GET: authHandler(P.supplierInvoiceView, GET),
      POST: authHandler(P.supplierInvoiceView, POST), // create/actions checked inside
      PUT: authHandler(P.supplierInvoiceUpdateDraft, PUT),
    },
  },
});
