import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, ne, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { quotes, purchaseRequests } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { QuoteStatus } from "@/lib/enums";

// GET /api/procurement/quotes?id=xxx — single; else list.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const quote = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1))[0];
    if (!quote) return err("عرض السعر غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: quote });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const requestId = url.searchParams.get("requestId") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(quotes.supplier, `%${search}%`),
        like(quotes.delivery, `%${search}%`),
        like(quotes.notes, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(quotes.status, status));
  if (requestId) conditions.push(eq(quotes.requestId, requestId));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(quotes).where(where);
  const items = await db
    .select()
    .from(quotes)
    .where(where)
    .orderBy(desc(quotes.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  requestId: z.string().nullish(),
  supplierId: z.string().nullish(),
  supplier: z.string().trim().min(1, "اسم المورد/المورّد مطلوب"),
  price: z.coerce.number().optional(),
  delivery: z.string().optional(),
  warranty: z.string().optional(),
  rating: z.coerce.number().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

const actionSchema = z.object({
  action: z.enum(["accept", "reject"]),
  id: z.string().min(1, "معرف العرض مطلوب"),
});

// POST /api/procurement/quotes — create, or accept/reject.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, z.union([actionSchema, createSchema]));

    if ("action" in b) {
      const existing = (await db.select().from(quotes).where(eq(quotes.id, b.id)).limit(1))[0];
      if (!existing) return err("عرض السعر غير موجود", 404, "NOT_FOUND");
      if (existing.status !== QuoteStatus.PENDING) {
        return err(
          b.action === "accept" ? "يمكن قبول العروض بانتظار فقط" : "يمكن رفض العروض بانتظار فقط",
          400,
          "INVALID_STATE",
        );
      }

      const before = JSON.stringify(existing);

      if (b.action === "accept") {
        // Atomic: unset other winners for the same request, then mark this one.
        await db.transaction(async (tx) => {
          if (existing.requestId) {
            await tx
              .update(quotes)
              .set({ winner: false, updatedAt: now() })
              .where(and(eq(quotes.requestId, existing.requestId), ne(quotes.id, b.id)));
          }
          await tx
            .update(quotes)
            .set({ status: QuoteStatus.ACCEPTED, winner: true, updatedAt: now() })
            .where(eq(quotes.id, b.id));
        });
        await addAudit({
          action: "accept",
          entityType: "quote",
          entityId: b.id,
          description: `تم قبول عرض السعر وتحديده كفائز: ${existing.supplier} (${existing.price})`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else {
        await db
          .update(quotes)
          .set({ status: QuoteStatus.REJECTED, winner: false, updatedAt: now() })
          .where(eq(quotes.id, b.id));
        await addAudit({
          action: "reject",
          entityType: "quote",
          entityId: b.id,
          description: `تم رفض عرض السعر: ${existing.supplier}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      }

      const updated = (await db.select().from(quotes).where(eq(quotes.id, b.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    if (b.requestId) {
      const req = (await db
        .select()
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, b.requestId))
        .limit(1))[0];
      if (!req) return err("طلب الشراء غير موجود", 404, "NOT_FOUND");
    }

    const id = genId("QT");
    const ts = now();

    await db.insert(quotes).values({
      id,
      requestId: b.requestId || null,
      supplierId: b.supplierId || null,
      supplier: b.supplier,
      price: b.price ?? 0,
      delivery: b.delivery ?? "",
      warranty: b.warranty ?? "",
      rating: b.rating ?? 0,
      winner: false,
      status: QuoteStatus.PENDING,
      validUntil: b.validUntil ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "quote",
      entityId: id,
      description: `تم إضافة عرض سعر من ${b.supplier} بسعر ${b.price ?? 0}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1, "معرف العرض مطلوب"),
  supplier: z.string().trim().min(1).optional(),
  price: z.coerce.number().optional(),
  delivery: z.string().optional(),
  warranty: z.string().optional(),
  rating: z.coerce.number().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/procurement/quotes — update (only pending).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(quotes).where(eq(quotes.id, b.id)).limit(1))[0];
    if (!existing) return err("عرض السعر غير موجود", 404, "NOT_FOUND");
    if (existing.status !== QuoteStatus.PENDING) {
      return err("لا يمكن تعديل عرض تم البت فيه", 400, "INVALID_STATE");
    }

    const before = JSON.stringify(existing);
    await db
      .update(quotes)
      .set({
        supplier: b.supplier ?? existing.supplier,
        price: b.price ?? existing.price,
        delivery: b.delivery ?? existing.delivery,
        warranty: b.warranty ?? existing.warranty,
        rating: b.rating ?? existing.rating,
        validUntil: b.validUntil ?? existing.validUntil,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(quotes.id, b.id));

    await addAudit({
      action: "update",
      entityType: "quote",
      entityId: b.id,
      description: `تم تحديث عرض السعر: ${existing.supplier}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(quotes).where(eq(quotes.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/procurement/quotes?id=xxx — actor from session.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف العرض مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(quotes).where(eq(quotes.id, id)).limit(1))[0];
  if (!existing) return err("عرض السعر غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(quotes).where(eq(quotes.id, id));

  await addAudit({
    action: "delete",
    entityType: "quote",
    entityId: id,
    description: `تم حذف عرض السعر: ${existing.supplier}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/procurement/quotes")({
  server: {
    handlers: {
      GET: authHandler("procurement.view", GET),
      POST: authHandler("procurement.create", POST),
      PUT: authHandler("procurement.update", PUT),
      DELETE: authHandler("procurement.delete", DELETE),
    },
  },
});
