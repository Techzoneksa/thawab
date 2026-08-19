/**
 * Phase 3D — governed Goods Receipts (سندات الاستلام / GRN) API.
 *
 * Reads under procurement.grn.view. Create (posts Dr receipt / Cr GRNI +
 * inventory, atomically) → procurement.grn.create. Reverse → procurement.grn.reverse.
 * A GRN never credits Accounts Payable, never touches supplier payable, and only
 * receives against ISSUED governed Purchase Orders. `?poLines=<poId>` returns the
 * receivable PO lines (ordered / received-to-date / remaining, derived).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { db } from "@/server/db/index";
import { PROCUREMENT_PERMISSIONS as P } from "@/lib/procurement-permissions";
import {
  createGoodsReceipt,
  reverseGoodsReceipt,
  getGoodsReceiptDetail,
  listGoodsReceipts,
  receivablePoLines,
} from "@/server/db/goods-receipt";

const createSchema = z.object({
  purchaseOrderId: z.string().min(1, "أمر الشراء مطلوب"),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        poLineId: z.string().min(1),
        quantityReceived: z.coerce.number().positive("الكمية المستلمة يجب أن تكون موجبة"),
      }),
    )
    .min(1, "حدّد سطر استلام واحد على الأقل"),
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.literal("reverse"),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const poLines = url.searchParams.get("poLines");
  if (poLines) return Response.json({ lines: await receivablePoLines(db, poLines) });
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getGoodsReceiptDetail(id);
    if (!detail) return err("سند الاستلام غير موجود", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listGoodsReceipts({
      status: url.searchParams.get("status") || undefined,
      purchaseOrderId: url.searchParams.get("purchaseOrderId") || undefined,
      supplierId: url.searchParams.get("supplierId") || undefined,
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      search: url.searchParams.get("search") || undefined,
    }),
  );
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body && typeof body === "object" && "action" in body) {
      const { id, reason } = actionSchema.parse(body);
      if (!(await hasPermission(ctx.user.role, P.grnReverse)))
        return err("لا تملك صلاحية عكس سند استلام", 403, "FORBIDDEN");
      const { item } = await reverseGoodsReceipt(ctx, id, reason);
      return Response.json({ item });
    }
    if (!(await hasPermission(ctx.user.role, P.grnCreate)))
      return err("لا تملك صلاحية تسجيل استلام", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createGoodsReceipt(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

export const Route = createFileRoute("/api/procurement/goods-receipts")({
  server: {
    handlers: {
      GET: authHandler(P.grnView, GET),
      POST: authHandler(P.grnView, POST), // create/reverse permission checked inside
    },
  },
});
