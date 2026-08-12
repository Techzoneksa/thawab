import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { suppliers, purchaseOrders, stockMovements, fixedAssets } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import {
  postBalancedEntry,
  resolveSystemAccountId,
  cashOrBankAccountId,
  SYS,
} from "@/server/db/gl";
import { SupplierStatus, JournalSource } from "@/lib/enums";

// GET /api/procurement/suppliers?id=xxx — single with usage info; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
    if (!supplier) return err("المورد غير موجود", 404, "NOT_FOUND");

    const [{ c: orderCount }] = await db
      .select({ c: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id));
    const [{ c: movementCount }] = await db
      .select({ c: count() })
      .from(stockMovements)
      .where(and(eq(stockMovements.sourceType, "supplier"), eq(stockMovements.sourceId, id)));
    const [{ c: assetCount }] = await db
      .select({ c: count() })
      .from(fixedAssets)
      .where(eq(fixedAssets.supplierId, id));

    const usage = Number(orderCount) + Number(assetCount);

    return Response.json({
      item: supplier,
      orderCount: Number(orderCount),
      assetCount: Number(assetCount),
      movementCount: Number(movementCount),
      hasTransactions: usage > 0,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(suppliers.name, `%${search}%`),
        like(suppliers.activity, `%${search}%`),
        like(suppliers.phone, `%${search}%`),
        like(suppliers.taxNumber, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(suppliers.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(suppliers).where(where);
  const items = await db
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(desc(suppliers.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

// National Address (العنوان الوطني السعودي) — shared across create/update.
const nationalAddressFields = {
  buildingNo: z.string().optional(),
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  additionalNo: z.string().optional(),
};

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم المورد مطلوب"),
  activity: z.string().optional(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  taxNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  ...nationalAddressFields,
  rating: z.coerce.number().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(SupplierStatus).optional(),
});

const actionSchema = z.object({
  action: z.enum(["activate", "deactivate"]),
  id: z.string().min(1, "معرف المورد مطلوب"),
});

const paySchema = z.object({
  action: z.literal("pay"),
  id: z.string().min(1, "معرف المورد مطلوب"),
  amount: z.coerce.number().positive("قيمة السداد يجب أن تكون رقماً موجباً"),
  method: z.enum(["cash", "bank"]).optional(),
  note: z.string().optional(),
});

// POST /api/procurement/suppliers — create, activate/deactivate, or pay.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, z.union([paySchema, actionSchema, createSchema]));

    // Settle part/all of what we owe a supplier: Dr Accounts Payable / Cr Cash|Bank.
    if ("action" in b && b.action === "pay") {
      const supplier = (
        await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1)
      )[0];
      if (!supplier) return err("المورد غير موجود", 404, "NOT_FOUND");
      const ts = now();
      const before = JSON.stringify(supplier);

      await db.transaction(async (tx) => {
        const payable = await resolveSystemAccountId(tx as any, SYS.ACCOUNTS_PAYABLE);
        const cashBank = await cashOrBankAccountId(
          tx as any,
          b.method === "cash" ? "cash" : "bank",
        );
        await postBalancedEntry(tx as any, {
          date: ts.slice(0, 10),
          description: `سداد للمورد ${supplier.name}${b.note ? ` — ${b.note}` : ""}`,
          source: JournalSource.PURCHASE,
          sourceType: "supplier_payment",
          sourceId: b.id,
          lines: [
            { accountId: payable, debit: b.amount },
            { accountId: cashBank, credit: b.amount },
          ],
          userId: ctx.user.id,
        });
        await tx
          .update(suppliers)
          .set({ balance: sql`${suppliers.balance} - ${b.amount}`, updatedAt: ts })
          .where(eq(suppliers.id, b.id));
      });

      await addAudit({
        action: "pay",
        entityType: "supplier",
        entityId: b.id,
        description: `سداد ${b.amount} للمورد: ${supplier.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    if ("action" in b) {
      const existing = (
        await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1)
      )[0];
      if (!existing) return err("المورد غير موجود", 404, "NOT_FOUND");

      const newStatus = b.action === "activate" ? SupplierStatus.ACTIVE : SupplierStatus.INACTIVE;
      if (existing.status === newStatus) {
        return err(
          `المورد ${b.action === "activate" ? "نشط" : "موقوف"} بالفعل`,
          400,
          "INVALID_STATE",
        );
      }

      const before = JSON.stringify(existing);
      await db
        .update(suppliers)
        .set({ status: newStatus, updatedAt: now() })
        .where(eq(suppliers.id, b.id));

      await addAudit({
        action: b.action,
        entityType: "supplier",
        entityId: b.id,
        description: `تم ${b.action === "activate" ? "تفعيل" : "تعطيل"} المورد: ${existing.name}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        before,
        ip: ctx.ip,
      });

      const updated = (await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    const id = genId("SUP");
    const ts = now();

    await db.insert(suppliers).values({
      id,
      name: b.name,
      activity: b.activity ?? "",
      phone: b.phone || null,
      email: b.email || null,
      taxNumber: b.taxNumber ?? "",
      contactPerson: b.contactPerson ?? "",
      address: b.address ?? "",
      buildingNo: b.buildingNo ?? "",
      street: b.street ?? "",
      district: b.district ?? "",
      city: b.city ?? "",
      postalCode: b.postalCode ?? "",
      additionalNo: b.additionalNo ?? "",
      rating: b.rating ?? 0,
      notes: b.notes ?? "",
      status: b.status ?? SupplierStatus.ACTIVE,
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "supplier",
      entityId: id,
      description: `تم إضافة مورد: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1, "معرف المورد مطلوب"),
});

// PUT /api/procurement/suppliers — update.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1))[0];
    if (!existing) return err("المورد غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(suppliers)
      .set({
        name: b.name ?? existing.name,
        activity: b.activity ?? existing.activity,
        phone: b.phone ?? existing.phone,
        email: b.email === undefined ? existing.email : b.email || null,
        taxNumber: b.taxNumber ?? existing.taxNumber,
        contactPerson: b.contactPerson ?? existing.contactPerson,
        address: b.address ?? existing.address,
        buildingNo: b.buildingNo ?? existing.buildingNo,
        street: b.street ?? existing.street,
        district: b.district ?? existing.district,
        city: b.city ?? existing.city,
        postalCode: b.postalCode ?? existing.postalCode,
        additionalNo: b.additionalNo ?? existing.additionalNo,
        rating: b.rating ?? existing.rating,
        notes: b.notes ?? existing.notes,
        status: b.status ?? existing.status,
        updatedAt: now(),
      })
      .where(eq(suppliers.id, b.id));

    await addAudit({
      action: "update",
      entityType: "supplier",
      entityId: b.id,
      description: `تم تحديث المورد: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(suppliers).where(eq(suppliers.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/procurement/suppliers?id=xxx — only if no orders/assets. Actor from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المورد مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1))[0];
  if (!existing) return err("المورد غير موجود", 404, "NOT_FOUND");

  const [{ c: orderCount }] = await db
    .select({ c: count() })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));
  const [{ c: assetCount }] = await db
    .select({ c: count() })
    .from(fixedAssets)
    .where(eq(fixedAssets.supplierId, id));

  if (Number(orderCount) > 0 || Number(assetCount) > 0) {
    const parts: string[] = [];
    if (Number(orderCount) > 0) parts.push(`${orderCount} أمر شراء`);
    if (Number(assetCount) > 0) parts.push(`${assetCount} أصل`);
    return err(
      `لا يمكن حذف المورد لارتباطه بـ ${parts.join(" و ")}. قم بتعطيل المورد بدلاً من ذلك.`,
      400,
      "HAS_TRANSACTIONS",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(suppliers).where(eq(suppliers.id, id));

  await addAudit({
    action: "delete",
    entityType: "supplier",
    entityId: id,
    description: `تم حذف المورد: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/suppliers")({
  server: {
    handlers: {
      GET: authHandler("suppliers.view", GET),
      POST: authHandler("suppliers.create", POST),
      PUT: authHandler("suppliers.update", PUT),
      DELETE: authHandler("suppliers.delete", DELETE),
    },
  },
});
