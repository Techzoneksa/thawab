import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { fixedAssets, assetDepreciations, assetMovements, suppliers } from "@/server/db/schema";
import { eq, like, or, and, desc, sql } from "drizzle-orm";

export const ASSET_STATUSES = [
  "ظ†ط´ط·",
  "طھط­طھ ط§ظ„طµظٹط§ظ†ط©",
  "ظ…ظ†ظ‚ظˆظ„",
  "ظ…ط³طھط¨ط¹ط¯",
  "ظ…ط¨ط§ط¹",
  "ظ…ظ„ط؛ظٹ",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_CONDITIONS = [
  "ط¬ظٹط¯",
  "ظ…طھظˆط³ط·",
  "ظٹط­طھط§ط¬ طµظٹط§ظ†ط©",
  "طھط§ظ„ظپ",
] as const;

export const ASSET_DEPRECIATION_METHODS = ["ظ‚ط³ط· ط«ط§ط¨طھ", "ظ‚ط³ط· ظ…طھظ†ط§ظ‚طµ"] as const;

export const ASSET_MOVEMENT_TYPES = [
  "طھط­ظˆظٹظ„",
  "طµظٹط§ظ†ط©",
  "ط¥ظ‡ظ„ط§ظƒ",
  "ط§ط³طھط¨ط¹ط§ط¯",
  "ط¨ظٹط¹",
] as const;
export type AssetMovementType = (typeof ASSET_MOVEMENT_TYPES)[number];

const READ_ONLY_STATUSES: AssetStatus[] = ["ظ…ط³طھط¨ط¹ط¯", "ظ…ط¨ط§ط¹", "ظ…ظ„ط؛ظٹ"];

// GET /api/assets - list
// GET /api/assets?id=xxx - single with depreciation info
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const asset = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!asset) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

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
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(fixedAssets.status, status));
  if (category && category !== "ط§ظ„ظƒظ„") conditions.push(eq(fixedAssets.category, category));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = whereClause
    ? db.select().from(fixedAssets).where(whereClause).orderBy(desc(fixedAssets.createdAt)).all()
    : db.select().from(fixedAssets).orderBy(desc(fixedAssets.createdAt)).all();

  return Response.json({ items, total: items.length });
}

// POST /api/assets - create or workflow actions
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action } = body;

  if (action === "transfer") {
    const { id, toLocation, toResponsible, date, reason, notes, userId, userName } = body;
    const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `ظ„ط§ ظٹظ…ظƒظ† ظ†ظ‚ظ„ ط£طµظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({
        location: toLocation || existing.location,
        responsiblePerson: toResponsible || existing.responsiblePerson,
        status: "ظ…ظ†ظ‚ظˆظ„",
        updatedAt: ts,
      })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "طھط­ظˆظٹظ„",
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
      "طھط­ظˆظٹظ„",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… ظ†ظ‚ظ„ ط§ظ„ط£طµظ„ ${existing.name} ظ…ظ† ${existing.location || "â€”"} ط¥ظ„ظ‰ ${toLocation || "â€”"}`,
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
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        {
          error: `ظ„ط§ ظٹظ…ظƒظ† طھط³ط¬ظٹظ„ طµظٹط§ظ†ط© ط¹ظ„ظ‰ ط£طµظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}`,
        },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "طµظٹط§ظ†ط©",
        cost: parseFloat(cost) || 0,
        date: date || ts,
        reason: reason || "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    db.update(fixedAssets)
      .set({ status: "طھط­طھ ط§ظ„طµظٹط§ظ†ط©", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    addAudit(
      "طµظٹط§ظ†ط©",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… طھط³ط¬ظٹظ„ طµظٹط§ظ†ط© ظ„ظ„ط£طµظ„ ${existing.name} ط¨طھظƒظ„ظپط© ${cost || 0}`,
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
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (existing.status !== "طھط­طھ ط§ظ„طµظٹط§ظ†ط©") {
      return Response.json({ error: "ط§ظ„ط£طµظ„ ظ„ظٹط³ طھط­طھ ط§ظ„طµظٹط§ظ†ط©" }, { status: 400 });
    }

    const before = JSON.stringify(existing);
    db.update(fixedAssets)
      .set({
        status: "ظ†ط´ط·",
        condition: condition || existing.condition,
        updatedAt: now(),
      })
      .where(eq(fixedAssets.id, id))
      .run();
    addAudit(
      "ط¥ظ†ظ‡ط§ط، طµظٹط§ظ†ط©",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… ط¥ظ†ظ‡ط§ط، طµظٹط§ظ†ط© ط§ظ„ط£طµظ„ ${existing.name} (ط§ظ„ط­ط§ظ„ط©: ${condition || existing.condition})`,
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
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `ظ„ط§ ظٹظ…ظƒظ† ط¥ظ‡ظ„ط§ظƒ ط£طµظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}` },
        { status: 400 },
      );
    }

    const depAmount = parseFloat(amount) || 0;
    if (depAmount <= 0)
      return Response.json(
        { error: "ظ…ط¨ظ„ط؛ ط§ظ„ط¥ظ‡ظ„ط§ظƒ ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ط£ظƒط¨ط± ظ…ظ† طµظپط±" },
        { status: 400 },
      );

    const newAccumulated = existing.accumulatedDepreciation + depAmount;
    const bookValue = existing.cost - newAccumulated;

    if (bookValue < -0.0001) {
      return Response.json(
        {
          error: `ط§ظ„ط¥ظ‡ظ„ط§ظƒ ط³ظٹط¬ط¹ظ„ ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ط¯ظپطھط±ظٹط© ط³ط§ظ„ط¨ط©. ط§ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ ظ„ظ„ط¥ظ‡ظ„ط§ظƒ: ${existing.cost - existing.accumulatedDepreciation - (existing.salvageValue || 0)}`,
        },
        { status: 400 },
      );
    }

    const maxDepreciable = existing.cost - (existing.salvageValue || 0);
    if (newAccumulated > maxDepreciable + 0.0001) {
      return Response.json(
        {
          error: `ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¥ظ‡ظ„ط§ظƒ ط³ظٹطھط¬ط§ظˆط² (ط§ظ„طھظƒظ„ظپط© - ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ظ…طھط¨ظ‚ظٹط©). ط§ظ„ط­ط¯ ط§ظ„ظ…طھط¨ظ‚ظٹ: ${maxDepreciable - existing.accumulatedDepreciation}`,
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
      "ط¥ظ‡ظ„ط§ظƒ",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… طھط³ط¬ظٹظ„ ط¥ظ‡ظ„ط§ظƒ ${depAmount} ظ„ظ„ط£طµظ„ ${existing.name} (ط§ظ„ظ‚ظٹظ…ط© ط§ظ„ط¯ظپطھط±ظٹط© ط¨ط¹ط¯: ${bookValue.toFixed(2)})`,
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
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `ط§ظ„ط£طµظ„ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({ status: "ظ…ط³طھط¨ط¹ط¯", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "ط§ط³طھط¨ط¹ط§ط¯",
        date: date || ts,
        reason: reason || "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    addAudit(
      "ط§ط³طھط¨ط¹ط§ط¯",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… ط§ط³طھط¨ط¹ط§ط¯ ط§ظ„ط£طµظ„ ${existing.name}${reason ? ` â€” ط§ظ„ط³ط¨ط¨: ${reason}` : ""}`,
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
    if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
      return Response.json(
        { error: `ط§ظ„ط£طµظ„ ط¨ط§ظ„ظپط¹ظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}` },
        { status: 400 },
      );
    }

    const before = JSON.stringify(existing);
    const ts = now();
    db.update(fixedAssets)
      .set({ status: "ظ…ط¨ط§ط¹", updatedAt: ts })
      .where(eq(fixedAssets.id, id))
      .run();

    db.insert(assetMovements)
      .values({
        id: genId("AMV"),
        assetId: id,
        type: "ط¨ظٹط¹",
        cost: parseFloat(salePrice) || 0,
        date: date || ts,
        reason: buyer ? `ط§ظ„ظ…ط´طھط±ظٹ: ${buyer}` : "",
        notes: notes || "",
        createdBy: userId || null,
        createdAt: ts,
      })
      .run();

    addAudit(
      "ط¨ظٹط¹",
      "ط£طµظ„ ط«ط§ط¨طھ",
      id,
      `طھظ… ط¨ظٹط¹ ط§ظ„ط£طµظ„ ${existing.name} ط¨ط³ط¹ط± ${salePrice || 0}`,
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
  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ط£طµظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  if (supplierId) {
    const sup = db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1).all()[0];
    if (!sup) return Response.json({ error: "ط§ظ„ظ…ظˆط±ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 400 });
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
      depreciationMethod: depreciationMethod || "ظ‚ط³ط· ط«ط§ط¨طھ",
      status: "ظ†ط´ط·",
      condition: condition || "ط¬ظٹط¯",
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
    "ط¥ط¶ط§ظپط©",
    "ط£طµظ„ ط«ط§ط¨طھ",
    assetId,
    `طھظ… ط¥ط¶ط§ظپط© ط£طµظ„: ${name} (ط§ظ„طھظƒظ„ظپط© ${cost || 0})`,
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
async function __handler_PUT({ request }: { request: Request }) {
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
  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط£طµظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  if (READ_ONLY_STATUSES.includes(existing.status as AssetStatus)) {
    return Response.json(
      { error: `ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ط£طµظ„ ظپظٹ ط­ط§ظ„ط© ${existing.status}` },
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

  addAudit(
    "طھط¹ط¯ظٹظ„",
    "ط£طµظ„ ط«ط§ط¨طھ",
    id,
    `طھظ… طھط­ط¯ظٹط« ط§ظ„ط£طµظ„: ${existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  return Response.json({ item: updated });
}

// DELETE /api/assets - only if no depreciation and no movements
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط£طµظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).limit(1).all()[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط£طµظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

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
    if (depCount > 0) parts.push(`${depCount} ظ‚ظٹط¯ ط¥ظ‡ظ„ط§ظƒ`);
    if (mvCount > 0) parts.push(`${mvCount} ط­ط±ظƒط©`);
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ط§ظ„ط£طµظ„ ظ„ط§ط±طھط¨ط§ط·ظ‡ ط¨ظ€ ${parts.join(" ظˆ ")}. ظ‚ظ… ط¨ط§ط³طھط¨ط¹ط§ط¯ ط§ظ„ط£طµظ„ ط¨ط¯ظ„ط§ظ‹ ظ…ظ† ط°ظ„ظƒ.`,
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  db.delete(fixedAssets).where(eq(fixedAssets.id, id)).run();
  addAudit(
    "ط­ط°ظپ",
    "ط£طµظ„ ط«ط§ط¨طھ",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ط£طµظ„: ${existing.name}`,
    userId,
    userName,
    before,
  );
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/assets")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
