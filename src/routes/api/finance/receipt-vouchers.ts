/**
 * Phase 2B — Receipt Vouchers (سندات القبض) API.
 *
 * Reads under finance.receipt.view. Writes are granular: create →
 * finance.receipt.create; lifecycle actions (submit/approve/return/reject/post/
 * reverse) → per-action permission enforced inside the workflow service
 * (state matrix + exact permission + maker≠checker + required reason); draft
 * edit → finance.receipt.update_draft. Posting/reversal reuse the certified GL
 * engine. The money destination is resolved server-side from the selected
 * cashbox/bank master — never from a client-supplied GL account.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createReceiptVoucher,
  updateReceiptVoucher,
  transitionReceiptVoucher,
  getReceiptVoucherDetail,
  listReceiptVouchers,
} from "@/server/db/receipt-voucher";
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
  payerName: z.string().trim().optional(),
  payerReferenceType: z.string().nullish(),
  payerReferenceId: z.string().nullish(),
  externalReference: z.string().nullish(),
  description: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().trim().optional(),
  totalAmount: z.coerce.number(),
  lines: z.array(lineSchema).min(1, "أضف سطراً دائناً واحداً على الأقل"),
});

const updateSchema = createSchema.extend({ id: z.string().min(1) });

const RECEIPT_ACTIONS = ["submit", "approve", "return", "reject", "post", "reverse"] as const;
const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(RECEIPT_ACTIONS),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getReceiptVoucherDetail(id);
    if (!detail) return err("سند القبض غير موجود", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listReceiptVouchers({
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
      // Lifecycle transition — permission/maker-checker/reason enforced inside.
      const { id, action, reason } = actionSchema.parse(body);
      const { item, reversalId } = await transitionReceiptVoucher(
        ctx,
        id,
        action as JournalAction,
        reason,
      );
      return Response.json({ item, reversalId });
    }
    // Create draft — requires the dedicated create permission.
    if (!(await hasPermission(ctx.user.role, P.receiptCreate)))
      return err("لا تملك صلاحية إنشاء سند قبض", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createReceiptVoucher(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updateReceiptVoucher(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/receipt-vouchers")({
  server: {
    handlers: {
      GET: authHandler(P.receiptView, GET),
      POST: authHandler(P.receiptView, POST), // create/actions checked inside
      PUT: authHandler(P.receiptUpdateDraft, PUT),
    },
  },
});
