import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import {
  purchaseOrders,
  purchaseOrderLines,
  purchaseRequests,
  inventoryItems,
  stockMovements,
} from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { postBalancedEntry, resolveSystemAccountId, SYS } from "@/server/db/gl";
import {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  StockMovementType,
  JournalSource,
} from "@/lib/enums";

// NOTE: enums.ts PurchaseOrderStatus has no CLOSED key. The "close" workflow still
// needs a distinct terminal state, so we use the ASCII key "closed" until the enum
// is extended. Also, the legacy "approved" state maps to PurchaseOrderStatus.SENT.
const ORDER_CLOSED = "closed";

// GET /api/procurement/orders?id=xxx — single with lines; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const order = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1))[0];
    if (!order) return err("أمر الشراء غير موجود", 404, "NOT_FOUND");
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.orderId, id))
      .orderBy(purchaseOrderLines.lineNumber);
    return Response.json({ item: order, lines });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const supplierId = url.searchParams.get("supplierId") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(like(purchaseOrders.subject, `%${search}%`), like(purchaseOrders.notes, `%${search}%`)),
    );
  }
  if (status) conditions.push(eq(purchaseOrders.status, status));
  if (supplierId) conditions.push(eq(purchaseOrders.supplierId, supplierId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(purchaseOrders).where(where);
  const items = await db
    .select()
    .from(purchaseOrders)
    .where(where)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  supplierId: z.string().nullish(),
  requestId: z.string().nullish(),
  subject: z.string().trim().min(1, "موضوع أمر الشراء مطلوب"),
  date: z.string().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().nullish(),
        description: z.string().optional(),
        quantity: z.coerce.number().optional(),
        unitPrice: z.coerce.number().optional(),
        unit: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1, "يجب إضافة سطر واحد على الأقل"),
});

const simpleActionSchema = z.object({
  action: z.enum(["approve", "cancel", "close"]),
  id: z.string().min(1, "معرف أمر الشراء مطلوب"),
});

const receiveSchema = z.object({
  action: z.literal("receive"),
  id: z.string().min(1, "معرف أمر الشراء مطلوب"),
  receipts: z
    .array(
      z.object({
        lineId: z.string().min(1),
        receivedQty: z.coerce.number(),
      }),
    )
    .min(1, "يجب تحديد الكميات المستلمة"),
});

// POST /api/procurement/orders — create or workflow action.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(
      event.request,
      z.union([receiveSchema, simpleActionSchema, createSchema]),
    );

    if ("action" in b) {
      const order = (await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, b.id))
        .limit(1))[0];
      if (!order) return err("أمر الشراء غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(order);

      if (b.action === "approve") {
        if (order.status !== PurchaseOrderStatus.DRAFT)
          return err("يمكن اعتماد المسودة فقط", 400, "INVALID_STATE");
        await db
          .update(purchaseOrders)
          .set({ status: PurchaseOrderStatus.SENT, updatedAt: now() })
          .where(eq(purchaseOrders.id, b.id));
        await addAudit({
          action: "approve",
          entityType: "purchase_order",
          entityId: b.id,
          description: `تم اعتماد أمر الشراء: ${order.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "cancel") {
        if (order.status === PurchaseOrderStatus.CANCELLED)
          return err("الأمر ملغي بالفعل", 400, "INVALID_STATE");
        if (order.status === ORDER_CLOSED)
          return err("لا يمكن إلغاء أمر مغلق", 400, "INVALID_STATE");
        // Goods already received have booked inventory + a payable in the GL;
        // cancelling would orphan them. Require reversing the receipt first.
        if (
          order.status === PurchaseOrderStatus.RECEIVED ||
          order.status === PurchaseOrderStatus.PARTIAL
        )
          return err(
            "لا يمكن إلغاء أمر استُلمت بضاعته — عالِج الاستلام أولاً",
            400,
            "INVALID_STATE",
          );
        // Atomic: cancel the order and roll back the linked request if converted.
        await db.transaction(async (tx) => {
          await tx
            .update(purchaseOrders)
            .set({ status: PurchaseOrderStatus.CANCELLED, updatedAt: now() })
            .where(eq(purchaseOrders.id, b.id));
          if (order.requestId) {
            const linked = (await tx
              .select()
              .from(purchaseRequests)
              .where(eq(purchaseRequests.id, order.requestId))
              .limit(1))[0];
            if (linked && linked.status === PurchaseRequestStatus.ORDERED) {
              await tx
                .update(purchaseRequests)
                .set({ status: PurchaseRequestStatus.APPROVED, updatedAt: now() })
                .where(eq(purchaseRequests.id, order.requestId));
            }
          }
        });
        await addAudit({
          action: "cancel",
          entityType: "purchase_order",
          entityId: b.id,
          description: `تم إلغاء أمر الشراء: ${order.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (b.action === "close") {
        if (order.status === ORDER_CLOSED)
          return err("الأمر مغلق بالفعل", 400, "INVALID_STATE");
        await db
          .update(purchaseOrders)
          .set({ status: ORDER_CLOSED, updatedAt: now() })
          .where(eq(purchaseOrders.id, b.id));
        await addAudit({
          action: "close",
          entityType: "purchase_order",
          entityId: b.id,
          description: `تم إغلاق أمر الشراء: ${order.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else {
        // receive
        if (order.status !== PurchaseOrderStatus.SENT && order.status !== PurchaseOrderStatus.PARTIAL) {
          return err(
            "يمكن الاستلام فقط للأوامر المعتمدة أو المستلمة جزئياً",
            400,
            "INVALID_STATE",
          );
        }

        const lines = await db
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.orderId, b.id));
        const lineMap = new Map(lines.map((l) => [l.id, l]));

        // Validate all quantities before writing anything.
        for (const r of b.receipts) {
          const line = lineMap.get(r.lineId);
          if (!line) continue;
          const newReceived = (line.receivedQuantity || 0) + (r.receivedQty || 0);
          if (newReceived > line.quantity + 0.0001) {
            return err(
              `الكمية المستلمة للسطر "${line.description}" تتجاوز المطلوب (${line.quantity})`,
              400,
              "QTY_EXCEEDED",
            );
          }
        }

        const ts = now();
        let anyReceived = false;
        let allComplete = true;
        // Value of inventory goods received in THIS action (qty × unit price),
        // used to post the goods-received journal entry.
        let receivedValue = 0;

        // Atomic: update lines, inventory, stock movements, GL entry, and the header.
        await db.transaction(async (tx) => {
          for (const r of b.receipts) {
            const line = lineMap.get(r.lineId);
            if (!line) continue;
            const newReceived = (line.receivedQuantity || 0) + (r.receivedQty || 0);
            await tx
              .update(purchaseOrderLines)
              .set({ receivedQuantity: newReceived })
              .where(eq(purchaseOrderLines.id, line.id));

            if (r.receivedQty > 0 && line.itemId) {
              anyReceived = true;
              receivedValue += r.receivedQty * (line.unitPrice || 0);
              const item = (await tx
                .select()
                .from(inventoryItems)
                .where(eq(inventoryItems.id, line.itemId))
                .limit(1))[0];
              if (item) {
                const newQty = (item.quantity || 0) + r.receivedQty;
                await tx
                  .update(inventoryItems)
                  .set({ quantity: newQty, updatedAt: ts })
                  .where(eq(inventoryItems.id, line.itemId));
                await tx.insert(stockMovements).values({
                  id: genId("MV"),
                  itemId: line.itemId,
                  warehouseId: item.warehouseId || null,
                  type: StockMovementType.IN,
                  quantity: r.receivedQty,
                  balanceAfter: newQty,
                  sourceType: "purchase_order",
                  sourceId: order.id,
                  reference: `PO ${order.id}`,
                  date: ts,
                  notes: `استلام من أمر شراء ${order.id}`,
                  createdBy: ctx.user.id,
                  createdAt: ts,
                });
              }
            }

            if (newReceived < line.quantity - 0.0001) {
              allComplete = false;
            }
          }

          // Post to the GL: goods received into stock on credit.
          // Dr Inventory (asset), Cr Accounts Payable (liability owed to supplier).
          if (receivedValue > 0) {
            const inventory = await resolveSystemAccountId(tx as any, SYS.INVENTORY);
            const payable = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_PAYABLE);
            await postBalancedEntry(tx as any, {
              date: ts.slice(0, 10),
              description: `استلام أصناف — أمر شراء ${order.subject}`,
              source: JournalSource.PURCHASE,
              sourceType: "purchase_order",
              sourceId: order.id,
              lines: [
                { accountId: inventory, debit: receivedValue },
                { accountId: payable, credit: receivedValue },
              ],
              userId: ctx.user.id,
            });
          }

          const newStatus = allComplete
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIAL;
          const totalReceived = lines.reduce((sum, l) => {
            const r = b.receipts.find((x) => x.lineId === l.id);
            return sum + (l.receivedQuantity || 0) + (r?.receivedQty || 0);
          }, 0);
          await tx
            .update(purchaseOrders)
            .set({ status: newStatus, receivedAmount: totalReceived, updatedAt: ts })
            .where(eq(purchaseOrders.id, b.id));
        });

        await addAudit({
          action: "receive",
          entityType: "purchase_order",
          entityId: b.id,
          description: `تم استلام ${anyReceived ? "أصناف" : "تحديث"} لأمر الشراء: ${order.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      }

      const updated = (await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, b.id))
        .limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create
    if (b.requestId) {
      const req = (await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, b.requestId))
        .limit(1))[0];
      if (!req) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");
      if (req.status !== PurchaseRequestStatus.APPROVED) {
        return err("يجب أن يكون طلب الشراء معتمداً قبل إنشاء أمر شراء", 400, "INVALID_STATE");
      }
    }

    const orderId = genId("PO");
    const ts = now();
    let total = 0;
    for (const l of b.lines) {
      total += (l.quantity || 0) * (l.unitPrice || 0);
    }

    // Atomic: insert order header + all lines + link the source request.
    await db.transaction(async (tx) => {
      await tx.insert(purchaseOrders).values({
        id: orderId,
        supplierId: b.supplierId || null,
        requestId: b.requestId || null,
        subject: b.subject,
        date: b.date || ts,
        deliveryDate: b.deliveryDate ?? "",
        status: PurchaseOrderStatus.DRAFT,
        total,
        receivedAmount: 0,
        notes: b.notes ?? "",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });

      for (let i = 0; i < b.lines.length; i++) {
        const l = b.lines[i];
        await tx.insert(purchaseOrderLines).values({
          id: genId("POL"),
          orderId,
          lineNumber: i + 1,
          itemId: l.itemId || null,
          description: l.description || "",
          quantity: l.quantity || 0,
          unitPrice: l.unitPrice || 0,
          receivedQuantity: 0,
          unit: l.unit || "",
          notes: l.notes || "",
          createdAt: ts,
        });
      }

      if (b.requestId) {
        await tx
          .update(purchaseRequests)
          .set({ status: PurchaseRequestStatus.ORDERED, updatedAt: ts })
          .where(eq(purchaseRequests.id, b.requestId));
      }
    });

    await addAudit({
      action: "create",
      entityType: "purchase_order",
      entityId: orderId,
      description: `تم إضافة أمر شراء: ${b.subject} (${b.lines.length} سطر، الإجمالي ${total})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, orderId))
      .limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف أمر الشراء مطلوب"),
  subject: z.string().trim().min(1).optional(),
  date: z.string().optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/procurement/orders — update (only draft).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, b.id))
      .limit(1))[0];
    if (!existing) return err("أمر الشراء غير موجود", 404, "NOT_FOUND");
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      return err("لا يمكن تعديل أمر شراء في حالته الحالية", 400, "INVALID_STATE");
    }

    const before = JSON.stringify(existing);
    await db
      .update(purchaseOrders)
      .set({
        subject: b.subject ?? existing.subject,
        date: b.date ?? existing.date,
        deliveryDate: b.deliveryDate ?? existing.deliveryDate,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(purchaseOrders.id, b.id));

    await addAudit({
      action: "update",
      entityType: "purchase_order",
      entityId: b.id,
      description: `تم تحديث أمر الشراء: ${existing.subject}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, b.id))
      .limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/procurement/orders?id=xxx — only draft. Actor from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف أمر الشراء مطلوب", 400, "BAD_REQUEST");

  const existing = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .limit(1))[0];
  if (!existing) return err("أمر الشراء غير موجود", 404, "NOT_FOUND");
  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    return err("لا يمكن حذف أمر شراء غير مسودة. ألغِه بدلاً من ذلك.", 400, "INVALID_STATE");
  }

  const before = JSON.stringify(existing);
  // Atomic: roll back the linked request, then delete the order (lines cascade).
  await db.transaction(async (tx) => {
    if (existing.requestId) {
      await tx
        .update(purchaseRequests)
        .set({ status: PurchaseRequestStatus.APPROVED, updatedAt: now() })
        .where(eq(purchaseRequests.id, existing.requestId));
    }
    await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  });

  await addAudit({
    action: "delete",
    entityType: "purchase_order",
    entityId: id,
    description: `تم حذف أمر الشراء: ${existing.subject}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/orders")({
  server: {
    handlers: {
      GET: authHandler("procurement.view", GET),
      POST: authHandler("procurement.create", POST),
      PUT: authHandler("procurement.update", PUT),
      DELETE: authHandler("procurement.delete", DELETE),
    },
  },
});
