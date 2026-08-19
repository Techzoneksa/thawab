/**
 * Phase 2C — Payment Vouchers (سندات الصرف) API.
 *
 * Reads under finance.payment.view. Writes are granular: create →
 * finance.payment.create; lifecycle actions (submit/approve/return/reject/post/
 * reverse) → per-action permission enforced inside the workflow service; draft
 * edit → finance.payment.update_draft. Posting/reversal reuse the certified GL
 * engine; cashbox posting adds an advisory lock + as-of cash-sufficiency check.
 * The money source is resolved server-side from the selected cashbox/bank master.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createPaymentVoucher,
  updatePaymentVoucher,
  transitionPaymentVoucher,
  getPaymentVoucherDetail,
  listPaymentVouchers,
} from "@/server/db/payment-voucher";
import type { JournalAction } from "@/lib/finance-permissions";

const lineSchema = z.object({
  accountId: z.string().min(1, "الحساب مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجباً"),
  description: z.string().optional(),
  costCenterId: z.string().nullish(),
});

const createSchema = z.object({
  voucherDate: z.string().min(1, "التاريخ مطلوب"),
  cashboxId: z.string().nullish(),
  bankAccountId: z.string().nullish(),
  payeeName: z.string().trim().optional(),
  payeeReferenceType: z.string().nullish(),
  payeeReferenceId: z.string().nullish(),
  externalReference: z.string().nullish(),
  description: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().trim().optional(),
  totalAmount: z.coerce.number(),
  lines: z.array(lineSchema).min(1, "أضف سطراً مديناً واحداً على الأقل"),
});

const updateSchema = createSchema.extend({ id: z.string().min(1) });

const PAYMENT_ACTIONS = ["submit", "approve", "return", "reject", "post", "reverse"] as const;
const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(PAYMENT_ACTIONS),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getPaymentVoucherDetail(id);
    if (!detail) return err("سند الصرف غير موجود", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listPaymentVouchers({
      status: url.searchParams.get("status") || undefined,
      cashboxId: url.searchParams.get("cashboxId") || undefined,
      bankAccountId: url.searchParams.get("bankAccountId") || undefined,
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
      const { item, reversalId } = await transitionPaymentVoucher(
        ctx,
        id,
        action as JournalAction,
        reason,
      );
      return Response.json({ item, reversalId });
    }
    if (!(await hasPermission(ctx.user.role, P.paymentCreate)))
      return err("لا تملك صلاحية إنشاء سند صرف", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createPaymentVoucher(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updatePaymentVoucher(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/payment-vouchers")({
  server: {
    handlers: {
      GET: authHandler(P.paymentView, GET),
      POST: authHandler(P.paymentView, POST), // create/actions checked inside
      PUT: authHandler(P.paymentUpdateDraft, PUT),
    },
  },
});
