import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import {
  stocktakes,
  stocktakeLines,
  inventoryItems,
  warehouses,
  stockMovements,
} from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { StocktakeStatus, StockMovementType } from "@/lib/enums";

// Statuses that lock a stocktake from further edits.
const READ_ONLY_STATUSES: string[] = [StocktakeStatus.COMPLETED, StocktakeStatus.CANCELLED];

// GET /api/inventory/stocktake?id=xxx — single with lines; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const st = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1))[0];
    if (!st) return err("الجرد غير موجود", 404, "NOT_FOUND");
    const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, id));
    return Response.json({ item: st, lines });
  }

  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(stocktakes.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(stocktakes).where(where);
  const items = await db
    .select()
    .from(stocktakes)
    .where(where)
    .orderBy(desc(stocktakes.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const lineSchema = z.object({
  itemId: z.string().min(1, "معرف الصنف مطلوب"),
  countedQuantity: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const postSchema = z.object({
  action: z.enum(["submit", "approve", "close", "create"]).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  warehouseId: z.string().nullish(),
  date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).optional(),
});

// POST /api/inventory/stocktake — create or workflow actions (submit/approve/close).
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "submit") {
      if (!b.id) return err("معرف الجرد مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
      if (!existing) return err("الجرد غير موجود", 404, "NOT_FOUND");
      if (existing.status !== StocktakeStatus.DRAFT)
        return err("يمكن إرسال المسودة فقط", 400, "INVALID_STATE");

      const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, b.id));
      if (lines.length === 0) return err("لا يمكن إرسال جرد فارغ", 400, "EMPTY");

      const before = JSON.stringify(existing);
      await db
        .update(stocktakes)
        .set({ status: StocktakeStatus.COUNTING, updatedAt: now() })
        .where(eq(stocktakes.id, b.id));
      await addAudit({
        action: "submit",
        entityType: "stocktake",
        entityId: b.id,
        description: `تم إرسال الجرد للاعتماد: ${existing.name} (${lines.length} سطر)`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });
      const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    if (b.action === "approve") {
      if (!b.id) return err("معرف الجرد مطلوب", 400, "BAD_REQUEST");
      const stId = b.id;
      const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, stId)).limit(1))[0];
      if (!existing) return err("الجرد غير موجود", 404, "NOT_FOUND");
      if (existing.status !== StocktakeStatus.COUNTING)
        return err("الجرد ليس بانتظار الاعتماد", 400, "INVALID_STATE");

      const lines = await db.select().from(stocktakeLines).where(eq(stocktakeLines.stocktakeId, stId));
      const ts = now();
      const before = JSON.stringify(existing);

      // Apply the stocktake atomically: for each line with a difference create an
      // adjustment movement and update the item quantity, then mark the stocktake done.
      await db.transaction(async (tx) => {
        for (const line of lines) {
          if (Math.abs(line.difference) < 0.0001) continue;
          const item = (await tx
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, line.itemId))
            .limit(1))[0];
          if (!item) continue;

          const newQty = item.quantity + line.difference;
          await tx
            .update(inventoryItems)
            .set({ quantity: newQty, updatedAt: ts })
            .where(eq(inventoryItems.id, item.id));

          await tx.insert(stockMovements).values({
            id: genId("MV"),
            itemId: item.id,
            warehouseId: existing.warehouseId || item.warehouseId || null,
            type: StockMovementType.ADJUSTMENT,
            quantity: line.difference,
            balanceAfter: newQty,
            relatedStocktakeId: stId,
            sourceType: "stocktake",
            sourceId: stId,
            reference: `جرد ${existing.name}`,
            date: ts,
            notes: `تسوية جرد: الفرق ${line.difference} (المعدود ${line.countedQuantity}، بالنظام ${line.systemQuantity})`,
            createdBy: ctx.user.id,
            createdAt: ts,
          });
        }

        await tx
          .update(stocktakes)
          .set({
            status: StocktakeStatus.COMPLETED,
            approvedBy: ctx.user.id,
            approvedAt: ts,
            updatedAt: ts,
          })
          .where(eq(stocktakes.id, stId));
      });

      await addAudit({
        action: "approve",
        entityType: "stocktake",
        entityId: stId,
        description: `تم اعتماد الجرد وإنشاء تسويات تلقائية: ${existing.name} (${lines.length} سطر)`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });
      const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, stId)).limit(1))[0];
      return Response.json({ item: updated });
    }

    if (b.action === "close") {
      if (!b.id) return err("معرف الجرد مطلوب", 400, "BAD_REQUEST");
      const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
      if (!existing) return err("الجرد غير موجود", 404, "NOT_FOUND");
      if (existing.status !== StocktakeStatus.COMPLETED)
        return err("يمكن إغلاق الجرد المعتمد فقط", 400, "INVALID_STATE");

      const before = JSON.stringify(existing);
      await db
        .update(stocktakes)
        .set({ status: StocktakeStatus.CANCELLED, updatedAt: now() })
        .where(eq(stocktakes.id, b.id));
      await addAudit({
        action: "close",
        entityType: "stocktake",
        entityId: b.id,
        description: `تم إغلاق الجرد: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });
      const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create
    if (!b.name?.trim()) return err("اسم الجرد مطلوب", 400, "BAD_REQUEST");
    if (!b.date?.trim()) return err("تاريخ الجرد مطلوب", 400, "BAD_REQUEST");

    if (b.warehouseId) {
      const wh = (await db.select().from(warehouses).where(eq(warehouses.id, b.warehouseId)).limit(1))[0];
      if (!wh) return err("المستودع غير موجود", 400, "BAD_REQUEST");
    }

    const stId = genId("ST");
    const ts = now();
    const inputLines = b.lines ?? [];

    // Resolve each line's system quantity before opening the transaction.
    const linesToInsert = await Promise.all(
      inputLines.map(async (l) => {
        const item = (await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, l.itemId))
          .limit(1))[0];
        const systemQty = item?.quantity ?? 0;
        const countedQty = l.countedQuantity ?? 0;
        return {
          id: genId("STL"),
          stocktakeId: stId,
          itemId: l.itemId,
          systemQuantity: systemQty,
          countedQuantity: countedQty,
          difference: countedQty - systemQty,
          notes: l.notes || "",
          createdAt: ts,
        };
      }),
    );

    await db.transaction(async (tx) => {
      await tx.insert(stocktakes).values({
        id: stId,
        name: b.name!.trim(),
        warehouseId: b.warehouseId || null,
        date: b.date!,
        status: StocktakeStatus.DRAFT,
        notes: b.notes || "",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });
      if (linesToInsert.length > 0) {
        await tx.insert(stocktakeLines).values(linesToInsert);
      }
    });

    await addAudit({
      action: "create",
      entityType: "stocktake",
      entityId: stId,
      description: `تم إضافة جرد: ${b.name} (${inputLines.length} سطر)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const created = (await db.select().from(stocktakes).where(eq(stocktakes.id, stId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف الجرد مطلوب"),
  name: z.string().optional(),
  warehouseId: z.string().nullish(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/inventory/stocktake — update a not-yet-finalized stocktake.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
    if (!existing) return err("الجرد غير موجود", 404, "NOT_FOUND");
    if (READ_ONLY_STATUSES.includes(existing.status)) {
      return err("لا يمكن تعديل جرد معتمد أو مغلق", 400, "READ_ONLY");
    }

    const before = JSON.stringify(existing);
    await db
      .update(stocktakes)
      .set({
        name: b.name?.trim() ?? existing.name,
        warehouseId: b.warehouseId ?? existing.warehouseId,
        date: b.date ?? existing.date,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(stocktakes.id, b.id));

    await addAudit({
      action: "update",
      entityType: "stocktake",
      entityId: b.id,
      description: `تم تحديث الجرد: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });
    const updated = (await db.select().from(stocktakes).where(eq(stocktakes.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/inventory/stocktake?id=xxx — only drafts can be deleted.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الجرد مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(stocktakes).where(eq(stocktakes.id, id)).limit(1))[0];
  if (!existing) return err("الجرد غير موجود", 404, "NOT_FOUND");
  if (existing.status !== StocktakeStatus.DRAFT) {
    return err(
      "لا يمكن حذف جرد تمت معالجته. يحتفظ النظام به للسجل التاريخي.",
      400,
      "NOT_DRAFT",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(stocktakes).where(eq(stocktakes.id, id));
  await addAudit({
    action: "delete",
    entityType: "stocktake",
    entityId: id,
    description: `تم حذف الجرد: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/inventory/stocktake")({
  server: {
    handlers: {
      GET: authHandler("inventory.view", GET),
      POST: authHandler("inventory.create", POST),
      PUT: authHandler("inventory.update", PUT),
      DELETE: authHandler("inventory.delete", DELETE),
    },
  },
});
