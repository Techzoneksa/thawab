import { db, now, genId, addAudit } from "@/server/db/index";
import { fixedAssets, assetDepreciations, assetMovements, suppliers } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";
import type { APIEvent } from "@tanstack/start/server";

export const ASSET_STATUSES = ["نشط", "تحت الصيانة", "منقول", "مستبعد", "مباع", "ملغي"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_CONDITIONS = ["جيد", "متوسط", "يحتاج صيانة", "تالف"] as const;

export const ASSET_DEPRECIATION_METHODS = ["قسط ثابت", "قسط متناقص"] as const;

export const ASSET_MOVEMENT_TYPES = ["تحويل", "صيانة", "إهلاك", "استبعاد", "بيع"] as const;
export type AssetMovementType = (typeof ASSET_MOVEMENT_TYPES)[number];

const READ_ONLY_STATUSES: AssetStatus[] = ["مستبعد", "مباع", "ملغي"];

// GET /api/assets - list
// GET /api/assets?id=xxx - single with depreciation info
export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const asset = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!asset) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });

    const depCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(assetDepreciations)
        .where(eq(assetDepreciations.assetId, id))
        .all()[0]?.count || 0;

    const mvCount =
      db
        .select({ count: sql<number>`count(*)` })
        .from(assetMovements)
        .where(eq(assetMovements.assetId, id))
        .all()[0]?.count || 0;

    return Response.json({
      item: asset,
      depreciationCount: depCount,
      movementCount: mvCount,
      hasHistory: depCount > 0 || mvCount > 0,
      bookValue: asset.cost - asset.accumulatedDepreciation,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";

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
  if (status && status !== "الكل") conditions.push(eq(fixedAssets.status, status));
  if (category && category !== "الكل") conditions.push(eq(fixedAssets.category, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(fixedAssets).where(whereClause).orderBy(desc(fixedAssets.createdAt)).all()
    : db.select().from(fixedAssets).orderBy(desc(fixedAssets.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/assets - create or workflow actions
export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const { action } = body;

  if (action === "transfer") {
    const { id, toLocation, toResponsible, date, reason, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `لا يمكن نقل أصل في حالة ${existing.status}` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({
        location: toLocation || existing.location,
        responsiblePerson: toResponsible || existing.responsiblePerson,
        status: "منقول",
        updatedAt: ts,
      })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "تحويل",
        fromLocation: existing.location || "",
        toLocation: toLocation || "",
        fromResponsible: existing.responsiblePerson || "",
        toResponsible: toResponsible || "",
        date: date || ts,
        reason: reason || "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    addAudit(
      "تحويل",
      "أصل ثابت",
      id,
      `تم نقل الأصل ${existing.name} من ${existing.location || "—"} إلى ${toLocation || "—"}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "maintain") {
    const { id, date, cost, reason, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `لا يمكن تسجيل صيانة على أصل في حالة ${existing.status}` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "صيانة",
        cost: parseFloat(cost) || 0,
        date: date || ts,
        reason: reason || "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    db.update(fixedAssets)
      .set({ status: "تحت الصيانة", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    addAudit(
      "صيانة",
      "أصل ثابت",
      id,
      `تم تسجيل صيانة للأصل ${existing.name} بتكلفة ${cost || 0}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "returnFromMaintenance") {
    const { id, condition, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (existing.status !== "تحت الصيانة") {
      return Response.json({ error: "الأصل ليس تحت الصيانة" }, { status: 400 });
    }

    const before = JSON.stringify(existing);
    db.update(fixedAssets)
      .set({
        status: "نشط",
        condition: condition || existing.condition,
        updatedAt: now(),
      })
      .where(eq(fixedAssets.id, id))
      .run();
    addAudit(
      "إنهاء صيانة",
      "أصل ثابت",
      id,
      `تم إنهاء صيانة الأصل ${existing.name} (الحالة: ${condition || existing.condition})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "depreciate") {
    const { id, amount, date, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `لا يمكن إهلاك أصل في حالة ${existing.status}` },
        { status: 400 },
      );
    }

    const depAmount = parseFloat(amount) || 0;
    if (depAmount <= 0)
      return Response.json({ error: "مبلغ الإهلاك يجب أن يكون أكبر من صفر" }, { status: 400 });

    const newAccumulated = existing.accumulatedDepreciation + depAmount;
    const bookValue = existing.cost - newAccumulated;

    if (bookValue < -0.0001) {
      return Response.json(
        {
          error: `الإهلاك سيجعل القيمة الدفترية سالبة. الحد الأقصى للإهلاك: ${existing.cost - existing.accumulatedDepreciation - (existing.salvageValue || 0)}`,
        },
        { status: 400 },
      );
    }

    const maxDepreciable = existing.cost - (existing.salvageValue || 0);
    if (newAccumulated > maxDepreciable + 0.0001) {
      return Response.json(
        {
          error: `إجمالي الإهلاك سيتجاوز (التكلفة - القيمة المتبقية). الحد المتبقي: ${maxDepreciable - existing.accumulatedDepreciation}`,
        },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();

    db.insert(assetDepreciations)
      .values({
        id: genId("DEP"),
        assetId: id,
        date: date || ts,
        amount: depAmount,
        bookValueAfter: bookValue,
        method: existing.depreciationMethod,
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    db.update(fixedAssets)
      .set({ accumulatedDepreciation: newAccumulated, updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    addAudit(
      "إهلاك",
      "أصل ثابت",
      id,
      `تم تسجيل إهلاك ${depAmount} للأصل ${existing.name} (القيمة الدفترية بعد: ${bookValue.toFixed(2)})`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "dispose") {
    const { id, date, reason, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json({ error: `الأصل بالفعل في حالة ${existing.status}` }, { status: 400 });
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({ status: "مستبعد", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "استبعاد",
        date: date || ts,
        reason: reason || "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    addAudit(
      "استبعاد",
      "أصل ثابت",
      id,
      `تم استبعاد الأصل ${existing.name}${reason ? ` — السبب: ${reason}` : ""}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  if (action === "sell") {
    const { id, salePrice, date, buyer, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json({ error: `الأصل بالفعل في حالة ${existing.status}` }, { status: 400 });
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({ status: "مباع", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "بيع",
        cost: parseFloat(salePrice) || 0,
        date: date || ts,
        reason: buyer ? `المشتري: ${buyer}` : "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    addAudit(
      "بيع",
      "أصل ثابت",
      id,
      `تم بيع الأصل ${existing.name} بسعر ${salePrice || 0}`,
      userId,
      userName,
      before,
    );
    const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    return Response.json({ item: updated });
  }

  // Create
  const {
    name,
    code,
    category,
    location,
    cost,
    salvageValue,
    usefulLifeMonths,
    depreciationMethod,
    condition,
    purchaseDate,
    supplierId,
    serialNumber,
    responsiblePerson,
    notes,
    userId,
    userName,
  } = body;
  if (!name?.trim()) return Response.json({ error: "اسم الأصل مطلوب" }, { status: 400 });

  if (supplierId) {
    const sup = db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1).all()[0];
    if (!sup) return Response.json({ error: "المورد غير موجود" }, { status: 400 });
  }

  const assetId = genId("AST");
  const ts = now();

  db.insert(fixedAssets)
    .values({
      id: assetId,
      name: name.trim(),
      code: code || "",
      category: category || "",
      location: location || "",
      cost: parseFloat(cost) || 0,
      salvageValue: parseFloat(salvageValue) || 0,
      usefulLifeMonths: parseInt(usefulLifeMonths) || 60,
      accumulatedDepreciation: 0,
      depreciationMethod: depreciationMethod || "قسط ثابت",
      status: "نشط",
      condition: condition || "جيد",
      purchaseDate: purchaseDate || "",
      supplierId: supplierId || null,
      serialNumber: serialNumber || "",
      responsiblePerson: responsiblePerson || "",
      notes: notes || "",
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  addAudit(
    "إضافة",
    "أصل ثابت",
    assetId,
    `تم إضافة أصل: ${name} (التكلفة ${cost || 0})`,
    userId,
    userName,
  );
  const created = db
    .select()
    .from(fixedAssets)
    .where(eq(fixedAssets.id, assetId))
    .limit(1)
    .all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/assets - update (only active assets)
export async function PUT({ request }: APIEvent) {
  const body = await request.json();
  const {
    id,
    name,
    code,
    category,
    location,
    cost,
    salvageValue,
    usefulLifeMonths,
    depreciationMethod,
    condition,
    purchaseDate,
    supplierId,
    serialNumber,
    responsiblePerson,
    notes,
    userId,
    userName,
  } = body;
  if (!id) return Response.json({ error: "معرف الأصل مطلوب" }, { status: 400 });

  const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });
  if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
    return Response.json(
      { error: `لا يمكن تعديل أصل في حالة ${existing.status}` },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.update(fixedAssets)
    .set({
      name: name?.trim() ?? existing.name,
      code: code ?? existing.code,
      category: category ?? existing.category,
      location: location ?? existing.location,
      cost: cost !== undefined ? parseFloat(cost) : existing.cost,
      salvageValue: salvageValue !== undefined ? parseFloat(salvageValue) : existing.salvageValue,
      usefulLifeMonths:
        usefulLifeMonths !== undefined ? parseInt(usefulLifeMonths) : existing.usefulLifeMonths,
      depreciationMethod: depreciationMethod ?? existing.depreciationMethod,
      condition: condition ?? existing.condition,
      purchaseDate: purchaseDate ?? existing.purchaseDate,
      supplierId: supplierId ?? existing.supplierId,
      serialNumber: serialNumber ?? existing.serialNumber,
      responsiblePerson: responsiblePerson ?? existing.responsiblePerson,
      notes: notes ?? existing.notes,
      updatedAt: now(),
    })
    .where(eq(fixedAssets.id, id))
    .run();

  addAudit("تعديل", "أصل ثابت", id, `تم تحديث الأصل: ${existing.name}`, userId, userName, before);
  const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/assets - only if no depreciation and no movements
export async function DELETE({ request }: APIEvent) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "مستخدم";

  if (!id) return Response.json({ error: "معرف الأصل مطلوب" }, { status: 400 });

  const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "الأصل غير موجود" }, { status: 404 });

  const depCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(assetDepreciations)
      .where(eq(assetDepreciations.assetId, id))
      .all()[0]?.count || 0;

  const mvCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(assetMovements)
      .where(eq(assetMovements.assetId, id))
      .all()[0]?.count || 0;

  if (depCount > 0 || mvCount > 0) {
    const parts: string[] = [];
    if (depCount > 0) parts.push(`${depCount} قيد إهلاك`);
    if (mvCount > 0) parts.push(`${mvCount} حركة`);
    return Response.json(
      {
        error: `لا يمكن حذف الأصل لارتباطه بـ ${parts.join(" و ")}. قم باستبعاد الأصل بدلاً من ذلك.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(fixedAssets).where(eq(fixedAssets.id, id)).run();
  addAudit("حذف", "أصل ثابت", id, `تم حذف الأصل: ${existing.name}`, userId, userName, before);
  return Response.json({ success: true });
}
