/**
 * Phase 3C — governed Purchase Orders (أوامر الشراء) API.
 *
 * A governed Purchase Order is a purchasing COMMITMENT document with ZERO GL /
 * supplier-payable / inventory effect. Reads under procurement.po.view. Writes
 * are granular: create → procurement.po.create; lifecycle actions
 * (submit/approve/return/reject/issue/cancel) → per-action permission enforced
 * inside the workflow service; draft edit → procurement.po.update_draft. No
 * action here posts anything; receiving accounting is a future phase and the
 * legacy AP-posting receive path rejects governed POs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { db } from "@/server/db/index";
import { PROCUREMENT_PERMISSIONS as P } from "@/lib/procurement-permissions";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  transitionPurchaseOrder,
  getPurchaseOrderDetail,
  listPurchaseOrders,
  purchaseOrderLookup,
} from "@/server/db/purchase-order";
import { purchaseOrderPreflight } from "@/server/db/purchase-order-preflight";
import type { JournalAction } from "@/lib/finance-permissions";

const lineSchema = z.object({
  description: z.string().optional(),
  itemId: z.string().nullish(),
  accountId: z.string().nullish(),
  lineType: z.enum(["ITEM", "SERVICE", "ASSET", "EXPENSE", "OTHER"]).optional(),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون موجبة"),
  unit: z.string().optional(),
  unitPrice: z.coerce.number().min(0, "سعر الوحدة لا يمكن أن يكون سالباً"),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  costCenterId: z.string().nullish(),
  notes: z.string().optional(),
});

const createSchema = z.object({
  supplierId: z.string().min(1, "المورد مطلوب"),
  subject: z.string().trim().min(1, "موضوع أمر الشراء مطلوب"),
  orderDate: z.string().optional(),
  expectedDeliveryDate: z.string().nullish(),
  currency: z.string().trim().optional(),
  supplierReference: z.string().nullish(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, "أضف سطراً واحداً على الأقل"),
});

const updateSchema = createSchema.extend({ id: z.string().min(1) });

const PO_ACTIONS = ["submit", "approve", "return", "reject", "issue", "cancel"] as const;
const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(PO_ACTIONS),
  reason: z.string().optional(),
});

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  if (url.searchParams.get("preflight")) {
    return Response.json({ preflight: await purchaseOrderPreflight(db) });
  }
  // Bounded + searchable governed-ISSUED PO lookup for the GRN form.
  if (url.searchParams.get("lookup") === "1") {
    return Response.json(
      await purchaseOrderLookup(db, {
        q: url.searchParams.get("q") || undefined,
        supplierId: url.searchParams.get("supplierId") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
      }),
    );
  }
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getPurchaseOrderDetail(id);
    if (!detail) return err("أمر الشراء غير موجود", 404, "NOT_FOUND");
    return Response.json(detail);
  }
  return Response.json(
    await listPurchaseOrders({
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
      const { item } = await transitionPurchaseOrder(ctx, id, action as JournalAction, reason);
      return Response.json({ item });
    }
    if (!(await hasPermission(ctx.user.role, P.poCreate)))
      return err("لا تملك صلاحية إنشاء أمر شراء", 403, "FORBIDDEN");
    const b = createSchema.parse(body);
    const item = await createPurchaseOrder(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updatePurchaseOrder(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/procurement/purchase-orders")({
  server: {
    handlers: {
      GET: authHandler(P.poView, GET),
      POST: authHandler(P.poView, POST), // create/actions checked inside
      PUT: authHandler(P.poUpdateDraft, PUT),
    },
  },
});
