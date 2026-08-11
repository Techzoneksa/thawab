import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { fixedAssets, assetDepreciations, assetMovements, suppliers } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { AssetStatus, AssetCondition, DepreciationMethod, AssetMovementType } from "@/lib/enums";

// GET /api/assets?id=xxx — single asset with depreciation/movement summary.
// GET /api/assets      — list with search/filter/pagination.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const asset = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1))[0];
    if (!asset) return err("الأصل غير موجود", 404, "NOT_FOUND");

    const [{ c: depCount }] = await db
      .select({ c: count() })
      .from(assetDepreciations)
      .where(eq(assetDepreciations.assetId, id));
    const [{ c: mvCount }] = await db
      .select({ c: count() })
      .from(assetMovements)
      .where(eq(assetMovements.assetId, id));

    return Response.json({
      item: asset,
      depreciationCount: Number(depCount),
      movementCount: Number(mvCount),
      hasHistory: Number(depCount) > 0 || Number(mvCount) > 0,
      bookValue: asset.cost - asset.accumulatedDepreciation,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(fixedAssets.name, `%${search}%`),
        like(fixedAssets.code, `%${search}%`),
        like(fixedAssets.serialNumber, `%${search}%`),
        like(fixedAssets.category, `%${search}%`),
        like(fixedAssets.location, `%${search}%`),
      ),
    );
  }
  if (status) conditions.push(eq(fixedAssets.status, status));
  if (category) conditions.push(eq(fixedAssets.category, category));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(fixedAssets).where(where);
  const items = await db
    .select()
    .from(fixedAssets)
    .where(where)
    .orderBy(desc(fixedAssets.createdAt))
    .limit(limit)
    .offset(offset);

  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الأصل مطلوب"),
  code: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  cost: z.coerce.number().min(0, "التكلفة يجب ألا تكون سالبة").optional(),
  salvageValue: z.coerce.number().min(0, "القيمة المتبقية يجب ألا تكون سالبة").optional(),
  usefulLifeMonths: z.coerce.number().int().positive("العمر الإنتاجي يجب أن يكون أكبر من صفر").optional(),
  depreciationMethod: z.nativeEnum(DepreciationMethod).optional(),
  condition: z.nativeEnum(AssetCondition).optional(),
  purchaseDate: z.string().optional(),
  supplierId: z.string().nullish(),
  serialNumber: z.string().optional(),
  responsiblePerson: z.string().optional(),
  notes: z.string().optional(),
});

// Discriminated union for the asset workflow actions (transfer / maintenance / return / depreciate / dispose).
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("transfer"),
    id: z.string().min(1, "معرف الأصل مطلوب"),
    toLocation: z.string().optional(),
    toResponsible: z.string().optional(),
    date: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("maintenance"),
    id: z.string().min(1, "معرف الأصل مطلوب"),
    cost: z.coerce.number().min(0, "تكلفة الصيانة يجب ألا تكون سالبة").optional(),
    date: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("return"),
    id: z.string().min(1, "معرف الأصل مطلوب"),
    condition: z.nativeEnum(AssetCondition).optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("depreciate"),
    id: z.string().min(1, "معرف الأصل مطلوب"),
    amount: z.coerce.number().positive("مبلغ الإهلاك يجب أن يكون أكبر من صفر"),
    method: z.nativeEnum(DepreciationMethod).optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal("dispose"),
    id: z.string().min(1, "معرف الأصل مطلوب"),
    proceeds: z.coerce.number().min(0, "قيمة البيع يجب ألا تكون سالبة").optional(),
    buyer: z.string().optional(),
    date: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  }),
]);

// POST /api/assets — create a new asset, or run a workflow action when `action` is present.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));

    if (body && typeof body === "object" && "action" in body) {
      const a = actionSchema.parse(body);
      const existing = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, a.id)).limit(1))[0];
      if (!existing) return err("الأصل غير موجود", 404, "NOT_FOUND");

      const before = JSON.stringify(existing);
      const ts = now();

      if (a.action === "transfer") {
        if (existing.status === AssetStatus.DISPOSED)
          return err("لا يمكن نقل أصل مستبعد", 400, "BAD_STATE");

        await db.transaction(async (tx) => {
          await tx.insert(assetMovements).values({
            id: genId("AMV"),
            assetId: a.id,
            type: AssetMovementType.TRANSFER,
            fromLocation: existing.location || "",
            toLocation: a.toLocation || existing.location || "",
            fromResponsible: existing.responsiblePerson || "",
            toResponsible: a.toResponsible || existing.responsiblePerson || "",
            date: a.date || ts,
            reason: a.reason || "",
            notes: a.notes || "",
            createdBy: ctx.user.id,
            createdAt: ts,
          });
          await tx
            .update(fixedAssets)
            .set({
              location: a.toLocation || existing.location,
              responsiblePerson: a.toResponsible || existing.responsiblePerson,
              updatedAt: ts,
            })
            .where(eq(fixedAssets.id, a.id));
        });

        await addAudit({
          action: "transfer",
          entityType: "asset",
          entityId: a.id,
          description: `تم نقل الأصل ${existing.name} من "${existing.location || "غير محدد"}" إلى "${a.toLocation || existing.location || "غير محدد"}"`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (a.action === "maintenance") {
        if (existing.status === AssetStatus.DISPOSED)
          return err("لا يمكن تسجيل صيانة على أصل مستبعد", 400, "BAD_STATE");

        await db.transaction(async (tx) => {
          await tx.insert(assetMovements).values({
            id: genId("AMV"),
            assetId: a.id,
            type: AssetMovementType.MAINTENANCE,
            cost: a.cost ?? 0,
            date: a.date || ts,
            reason: a.reason || "",
            notes: a.notes || "",
            createdBy: ctx.user.id,
            createdAt: ts,
          });
          await tx
            .update(fixedAssets)
            .set({ status: AssetStatus.UNDER_MAINTENANCE, updatedAt: ts })
            .where(eq(fixedAssets.id, a.id));
        });

        await addAudit({
          action: "maintenance",
          entityType: "asset",
          entityId: a.id,
          description: `تم تسجيل صيانة للأصل ${existing.name} بتكلفة ${a.cost ?? 0} ر.س`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (a.action === "return") {
        if (existing.status !== AssetStatus.UNDER_MAINTENANCE)
          return err("الأصل ليس تحت الصيانة", 400, "BAD_STATE");

        await db
          .update(fixedAssets)
          .set({
            status: AssetStatus.ACTIVE,
            condition: a.condition ?? existing.condition,
            updatedAt: ts,
          })
          .where(eq(fixedAssets.id, a.id));

        await addAudit({
          action: "return",
          entityType: "asset",
          entityId: a.id,
          description: `تم إنهاء صيانة الأصل ${existing.name} وإعادته للخدمة (الحالة: ${a.condition ?? existing.condition})`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (a.action === "depreciate") {
        if (existing.status === AssetStatus.DISPOSED)
          return err("لا يمكن إهلاك أصل مستبعد", 400, "BAD_STATE");

        const maxDepreciable = existing.cost - existing.salvageValue;
        const remaining = maxDepreciable - existing.accumulatedDepreciation;
        const newAccumulated = existing.accumulatedDepreciation + a.amount;
        const bookValue = existing.cost - newAccumulated;

        if (bookValue < -0.0001)
          return err(
            `الإهلاك سيجعل القيمة الدفترية سالبة. الحد الأقصى للإهلاك: ${remaining}`,
            400,
            "OVER_DEPRECIATION",
          );
        if (newAccumulated > maxDepreciable + 0.0001)
          return err(
            `إجمالي الإهلاك سيتجاوز (التكلفة − القيمة المتبقية). المتبقي القابل للإهلاك: ${remaining}`,
            400,
            "OVER_DEPRECIATION",
          );

        await db.transaction(async (tx) => {
          await tx.insert(assetDepreciations).values({
            id: genId("DEP"),
            assetId: a.id,
            date: a.date || ts,
            amount: a.amount,
            bookValueAfter: bookValue,
            method: a.method ?? existing.depreciationMethod,
            notes: a.notes || "",
            createdBy: ctx.user.id,
            createdAt: ts,
          });
          await tx
            .update(fixedAssets)
            .set({ accumulatedDepreciation: newAccumulated, updatedAt: ts })
            .where(eq(fixedAssets.id, a.id));
        });

        await addAudit({
          action: "depreciate",
          entityType: "asset",
          entityId: a.id,
          description: `تم تسجيل إهلاك بمبلغ ${a.amount} ر.س للأصل ${existing.name} (القيمة الدفترية بعد الإهلاك: ${bookValue.toFixed(2)})`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      } else if (a.action === "dispose") {
        if (existing.status === AssetStatus.DISPOSED)
          return err("الأصل مستبعد بالفعل", 400, "BAD_STATE");

        const reason = a.reason || (a.buyer ? `المشتري: ${a.buyer}` : "");

        await db.transaction(async (tx) => {
          await tx.insert(assetMovements).values({
            id: genId("AMV"),
            assetId: a.id,
            type: AssetMovementType.DISPOSAL,
            cost: a.proceeds ?? 0,
            date: a.date || ts,
            reason,
            notes: a.notes || "",
            createdBy: ctx.user.id,
            createdAt: ts,
          });
          await tx
            .update(fixedAssets)
            .set({ status: AssetStatus.DISPOSED, updatedAt: ts })
            .where(eq(fixedAssets.id, a.id));
        });

        await addAudit({
          action: "dispose",
          entityType: "asset",
          entityId: a.id,
          description: `تم استبعاد الأصل ${existing.name}${a.proceeds ? ` بقيمة بيع ${a.proceeds} ر.س` : ""}${reason ? ` — السبب: ${reason}` : ""}`,
          userId: ctx.user.id,
          userName: ctx.user.name,
          before,
          ip: ctx.ip,
        });
      }

      const updated = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, a.id)).limit(1))[0];
      return Response.json({ item: updated });
    }

    // Create a new asset.
    const b = createSchema.parse(body);

    if (b.supplierId) {
      const sup = (await db.select().from(suppliers).where(eq(suppliers.id, b.supplierId)).limit(1))[0];
      if (!sup) return err("المورد غير موجود", 400, "INVALID_SUPPLIER");
    }

    const assetId = genId("AST");
    const ts = now();

    await db.insert(fixedAssets).values({
      id: assetId,
      name: b.name,
      code: b.code ?? "",
      category: b.category ?? "",
      location: b.location ?? "",
      cost: b.cost ?? 0,
      salvageValue: b.salvageValue ?? 0,
      usefulLifeMonths: b.usefulLifeMonths ?? 60,
      accumulatedDepreciation: 0,
      depreciationMethod: b.depreciationMethod ?? DepreciationMethod.STRAIGHT_LINE,
      status: AssetStatus.ACTIVE,
      condition: b.condition ?? AssetCondition.GOOD,
      purchaseDate: b.purchaseDate ?? "",
      supplierId: b.supplierId ?? null,
      serialNumber: b.serialNumber ?? "",
      responsiblePerson: b.responsiblePerson ?? "",
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "asset",
      entityId: assetId,
      description: `تم إضافة أصل جديد: ${b.name} (التكلفة ${b.cost ?? 0} ر.س)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, assetId)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1, "معرف الأصل مطلوب"),
});

// PUT /api/assets — update an asset (not permitted once disposed).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, b.id)).limit(1))[0];
    if (!existing) return err("الأصل غير موجود", 404, "NOT_FOUND");
    if (existing.status === AssetStatus.DISPOSED)
      return err("لا يمكن تعديل أصل مستبعد", 400, "BAD_STATE");

    if (b.supplierId) {
      const sup = (await db.select().from(suppliers).where(eq(suppliers.id, b.supplierId)).limit(1))[0];
      if (!sup) return err("المورد غير موجود", 400, "INVALID_SUPPLIER");
    }

    const before = JSON.stringify(existing);
    await db
      .update(fixedAssets)
      .set({
        name: b.name ?? existing.name,
        code: b.code ?? existing.code,
        category: b.category ?? existing.category,
        location: b.location ?? existing.location,
        cost: b.cost ?? existing.cost,
        salvageValue: b.salvageValue ?? existing.salvageValue,
        usefulLifeMonths: b.usefulLifeMonths ?? existing.usefulLifeMonths,
        depreciationMethod: b.depreciationMethod ?? existing.depreciationMethod,
        condition: b.condition ?? existing.condition,
        purchaseDate: b.purchaseDate ?? existing.purchaseDate,
        supplierId: b.supplierId === undefined ? existing.supplierId : b.supplierId,
        serialNumber: b.serialNumber ?? existing.serialNumber,
        responsiblePerson: b.responsiblePerson ?? existing.responsiblePerson,
        notes: b.notes ?? existing.notes,
        updatedAt: now(),
      })
      .where(eq(fixedAssets.id, b.id));

    await addAudit({
      action: "update",
      entityType: "asset",
      entityId: b.id,
      description: `تم تحديث بيانات الأصل: ${b.name || existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/assets?id=xxx — hard delete, only when the asset has no history.
// Identity comes from the session, never the query.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الأصل مطلوب", 400, "BAD_REQUEST");

  const existing = (await db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1))[0];
  if (!existing) return err("الأصل غير موجود", 404, "NOT_FOUND");

  const [{ c: depCount }] = await db
    .select({ c: count() })
    .from(assetDepreciations)
    .where(eq(assetDepreciations.assetId, id));
  const [{ c: mvCount }] = await db
    .select({ c: count() })
    .from(assetMovements)
    .where(eq(assetMovements.assetId, id));

  if (Number(depCount) > 0 || Number(mvCount) > 0) {
    const parts: string[] = [];
    if (Number(depCount) > 0) parts.push(`${Number(depCount)} قيد إهلاك`);
    if (Number(mvCount) > 0) parts.push(`${Number(mvCount)} حركة`);
    return err(
      `لا يمكن حذف الأصل لارتباطه بـ ${parts.join(" و ")}. قم باستبعاد الأصل بدلاً من حذفه.`,
      400,
      "HAS_HISTORY",
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(fixedAssets).where(eq(fixedAssets.id, id));

  await addAudit({
    action: "delete",
    entityType: "asset",
    entityId: id,
    description: `تم حذف الأصل: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/assets")({
  server: {
    handlers: {
      GET: authHandler("assets.view", GET),
      POST: authHandler("assets.create", POST),
      PUT: authHandler("assets.update", PUT),
      DELETE: authHandler("assets.delete", DELETE),
    },
  },
});
