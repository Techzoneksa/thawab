/**
 * Phase 5B — governed Purchase Returns (مرتجعات المشتريات) API.
 *
 * Reads under procurement.purchase_return.view. Create → a DRAFT with ZERO
 * accounting/inventory effect (procurement.purchase_return.create). Governance
 * transitions — submit/approve/return/reject/post/reverse — carry their own
 * granular permission enforced by the shared governance engine (maker≠checker on
 * approve). Only POST books Dr GRNI (historical) / Cr the line's historical
 * receipt debit account + decrements inventory + links the GRNI subledger; only
 * REVERSE unwinds them (restoring stock + capacity). A return NEVER touches
 * Accounts Payable, VAT or supplier payable. `?returnable=<grnId>` returns the
 * still-returnable lines of a POSTED GRN (received/invoiced/returned/returnable).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { db } from "@/server/db/index";
import { PROCUREMENT_PERMISSIONS as P } from "@/lib/procurement-permissions";
import type { JournalAction } from "@/lib/finance-permissions";
import {
  createPurchaseReturn,
  transitionPurchaseReturn,
  getPurchaseReturnDetail,
  listPurchaseReturns,
  returnableGrnLines,
} from "@/server/db/purchase-return";

const createSchema = z.object({
  goodsReceiptId: z.string().min(1, "سند الاستلام مطلوب"),
  returnDate: z.string().optional(),
  reason: z.string().optional(),
  lines: z
    .array(
      z.object({
        goodsReceiptLineId: z.string().min(1),
        quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
      }),
    )
    .min(1, "حدّد سطر إرجاع واحد على الأقل"),
});

const transitionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["submit", "approve", "return", "reject", "post", "reverse"]),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const returnable = url.searchParams.get("returnable");
  if (returnable) return Response.json(await returnableGrnLines(db as any, returnable));
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getPurchaseReturnDetail(id);
    if (!detail) return err("مرتجع المشتريات غير موجود", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listPurchaseReturns({
      status: url.searchParams.get("status") || undefined,
      goodsReceiptId: url.searchParams.get("goodsReceiptId") || undefined,
      supplierId: url.searchParams.get("supplierId") || undefined,
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
      const { id, action, reason } = transitionSchema.parse(body);
      const { item } = await transitionPurchaseReturn(ctx, id, action as JournalAction, reason);
      return Response.json({ item });
    }

    if (!(await hasPermission(ctx.user.role, P.returnCreate)))
      return err("لا تملك صلاحية إنشاء مرتجع مشتريات", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createPurchaseReturn(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

export const Route = createFileRoute("/api/procurement/purchase-returns")({
  server: {
    handlers: {
      GET: authHandler(P.returnView, GET),
      POST: authHandler(P.returnView, POST), // per-action permission checked inside
    },
  },
});
