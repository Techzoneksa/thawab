/**
 * Phase 3D / 3D.1 — governed Goods Receipts (سندات الاستلام / GRN) API.
 *
 * Reads under procurement.grn.view. Create → a DRAFT with ZERO accounting/
 * inventory effect (procurement.grn.create). Governance transitions —
 * submit/approve/return/reject/post/reverse — each carry their own granular
 * permission enforced by the shared governance engine (maker≠checker on approve).
 * Only POST books Dr receipt / Cr GRNI + inventory + GRNI subledger links; only
 * REVERSE unwinds them (never driving inventory negative). A GRN never credits
 * Accounts Payable, never touches supplier payable, and only receives against
 * ISSUED governed Purchase Orders. `?poLines=<poId>` returns the receivable PO
 * lines (ordered / received-to-date / remaining, derived).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { db } from "@/server/db/index";
import { PROCUREMENT_PERMISSIONS as P } from "@/lib/procurement-permissions";
import type { JournalAction } from "@/lib/finance-permissions";
import {
  createGoodsReceipt,
  updateGoodsReceipt,
  transitionGoodsReceipt,
  getGoodsReceiptDetail,
  listGoodsReceipts,
  receivablePoLines,
} from "@/server/db/goods-receipt";

const linesSchema = z
  .array(
    z.object({
      poLineId: z.string().min(1),
      quantityReceived: z.coerce.number().positive("الكمية المستلمة يجب أن تكون موجبة"),
    }),
  )
  .min(1, "حدّد سطر استلام واحد على الأقل");

const createSchema = z.object({
  purchaseOrderId: z.string().min(1, "أمر الشراء مطلوب"),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
  lines: linesSchema,
});

const updateSchema = z.object({
  id: z.string().min(1),
  action: z.literal("update"),
  receiptDate: z.string().optional(),
  notes: z.string().optional(),
  lines: linesSchema,
});

const transitionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["submit", "approve", "return", "reject", "post", "reverse"]),
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
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    }),
  );
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));

    if (body && typeof body === "object" && body.action === "update") {
      const b = updateSchema.parse(body);
      if (!(await hasPermission(ctx.user.role, P.grnUpdateDraft)))
        return err("لا تملك صلاحية تعديل مسودة سند استلام", 403, "FORBIDDEN");
      const item = await updateGoodsReceipt(ctx, b.id, {
        purchaseOrderId: "",
        receiptDate: b.receiptDate,
        notes: b.notes,
        lines: b.lines,
      });
      return Response.json({ item });
    }

    if (body && typeof body === "object" && "action" in body) {
      const { id, action, reason } = transitionSchema.parse(body);
      // Permission + maker≠checker + reason are enforced inside the governance
      // engine (transitionGoodsReceipt → evaluateTransition + GRN_TRANSITIONS).
      const { item } = await transitionGoodsReceipt(ctx, id, action as JournalAction, reason);
      return Response.json({ item });
    }

    if (!(await hasPermission(ctx.user.role, P.grnCreate)))
      return err("لا تملك صلاحية إنشاء سند استلام", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createGoodsReceipt(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

export const Route = createFileRoute("/api/procurement/goods-receipts")({
  server: {
    handlers: {
      GET: authHandler(P.grnView, GET),
      POST: authHandler(P.grnView, POST), // per-action permission checked inside
    },
  },
});
