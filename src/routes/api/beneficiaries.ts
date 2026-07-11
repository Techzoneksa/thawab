import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { beneficiaries, aidRecords, projects } from "@/server/db/schema";
import { eq, like, or, and, desc, ne } from "drizzle-orm";

// GET /api/beneficiaries - List with search, filters, pagination
// GET /api/beneficiaries?id=xxx - Single beneficiary by ID with aid history
// GET /api/beneficiaries?id=xxx&summary=true - Beneficiary summary calculations
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const summary = url.searchParams.get("summary");

  if (id) {
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all())[0];
    if (!beneficiary)
      return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Get aid history
    const aidHistory = await db
      .select()
      .from(aidRecords)
      .where(eq(aidRecords.beneficiaryId, id))
      .orderBy(desc(aidRecords.createdAt))
      .all();

    const totalAid = aidHistory
      .filter((a) => a.status === "طھظ… ط§ظ„طھط³ظ„ظٹظ…")
      .reduce((s, a) => s + a.amount, 0);
    const aidCount = aidHistory.filter((a) => a.status === "طھظ… ط§ظ„طھط³ظ„ظٹظ…").length;
    const pendingAidCount = aidHistory.filter(
      (a) => a.status === "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©" || a.status === "ظ…ط¹طھظ…ط¯",
    ).length;
    const lastAidDate = aidHistory.length > 0 ? aidHistory[0].createdAt : null;

    // Get unique project IDs from aid history
    const linkedProjectIds = Array.from(
      new Set(aidHistory.map((a) => a.projectId).filter((id): id is string => Boolean(id))),
    );
    const linkedProjects =
      linkedProjectIds.length > 0
        ? await db
            .select()
            .from(projects)
            .where(or(...linkedProjectIds.map((pid) => eq(projects.id, pid))))
            .all()
        : [];
    const linkedProjectsCount = linkedProjects.length;

    if (summary === "true") {
      return Response.json({
        item: {
          ...beneficiary,
          totalAid,
          aidCount,
          pendingAidCount,
          lastAidDate,
          linkedProjectsCount,
          eligibilityStatus: beneficiary.status,
        },
      });
    }

    // Enrich aid history with project names
    const enrichedAidHistory = aidHistory.map((a) => {
      const project = linkedProjects.find((p) => p.id === a.projectId);
      return { ...a, projectName: project?.name || "" };
    });

    return Response.json({
      item: {
        ...beneficiary,
        totalAid,
        aidCount,
        pendingAidCount,
        lastAidDate,
      },
      aidHistory: enrichedAidHistory,
      linkedProjects,
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const city = url.searchParams.get("city") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(beneficiaries.name, `%${search}%`),
        like(beneficiaries.idNumber, `%${search}%`),
        like(beneficiaries.phone, `%${search}%`),
        like(beneficiaries.fileNumber, `%${search}%`),
      ),
    );
  }
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(beneficiaries.status, status));
  if (category && category !== "ط§ظ„ظƒظ„") conditions.push(eq(beneficiaries.category, category));
  if (city && city !== "ط§ظ„ظƒظ„") conditions.push(eq(beneficiaries.city, city));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(beneficiaries).$dynamic();
  const all = whereClause
    ? await allQuery.where(whereClause).orderBy(desc(beneficiaries.createdAt)).all()
    : await allQuery.orderBy(desc(beneficiaries.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(beneficiaries).$dynamic();
  const items = whereClause
    ? await itemsQuery
        .where(whereClause)
        .orderBy(desc(beneficiaries.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : await itemsQuery.orderBy(desc(beneficiaries.createdAt)).limit(limit).offset(offset).all();

  return Response.json({ items, total, page, limit });
}

// POST /api/beneficiaries - Create beneficiary or change status (workflow actions)
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  // Eligibility workflow actions
  if (
    action === "review" ||
    action === "qualify" ||
    action === "disqualify" ||
    action === "suspend" ||
    action === "reactivate"
  ) {
    const statusMap: Record<string, string> = {
      review: "ظ‚ظٹط¯ ط§ظ„ظ…ط±ط§ط¬ط¹ط©",
      qualify: "ظ…ط¤ظ‡ظ„",
      disqualify: "ط؛ظٹط± ظ…ط¤ظ‡ظ„",
      suspend: "ظ…ظˆظ‚ظˆظپ",
      reactivate: "ظ…ط¤ظ‡ظ„",
    };

    const newStatus = statusMap[action];
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all())[0];
    if (!beneficiary)
      return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Workflow rules
    if (action === "qualify" && beneficiary.status === "ظ…ظˆظ‚ظˆظپ") {
      return Response.json(
        {
          error:
            "ظ„ط§ ظٹظ…ظƒظ† طھط£ظ‡ظٹظ„ ظ…ط³طھظپظٹط¯ ظ…ظˆظ‚ظˆظپ. ط£ط¹ط¯ طھظپط¹ظٹظ„ظ‡ ط£ظˆظ„ط§ظ‹.",
        },
        { status: 400 },
      );
    }

    if (action === "reactivate" && beneficiary.status !== "ظ…ظˆظ‚ظˆظپ") {
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ط¹ط§ط¯ط© طھظپط¹ظٹظ„ ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆظ‚ظˆظپ." },
        { status: 400 },
      );
    }

    if (action === "suspend" && beneficiary.status === "ط؛ظٹط± ظ…ط¤ظ‡ظ„") {
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط¥ظٹظ‚ط§ظپ ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ط¤ظ‡ظ„." },
        { status: 400 },
      );
    }

    const before = JSON.stringify(beneficiary);
    const ts = now();
    await db.update(beneficiaries)
      .set({ status: newStatus, updatedAt: ts })
      .where(eq(beneficiaries.id, id))
      .run();

    const actionLabels: Record<string, string> = {
      review: "ط¥ط±ط³ط§ظ„ ظ„ظ„ظ…ط±ط§ط¬ط¹ط©",
      qualify: "طھط£ظ‡ظٹظ„",
      disqualify: "ط¹ط¯ظ… طھط£ظ‡ظٹظ„",
      suspend: "ط¥ظٹظ‚ط§ظپ",
      reactivate: "ط¥ط¹ط§ط¯ط© طھظپط¹ظٹظ„",
    };

    await addAudit(
      actionLabels[action],
      "ظ…ط³طھظپظٹط¯",
      id,
      `طھظ… ${actionLabels[action]} ط§ظ„ظ…ط³طھظپظٹط¯: ${beneficiary.name} (ط§ظ„ط­ط§ظ„ط©: ${newStatus})`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Legacy "status" action - keep for backward compat
  if (action === "status") {
    const { status } = body;
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all())[0];
    if (!beneficiary)
      return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const before = JSON.stringify(beneficiary);
    await db.update(beneficiaries)
      .set({ status, updatedAt: now() })
      .where(eq(beneficiaries.id, id))
      .run();
    await addAudit(
      "طھط؛ظٹظٹط± ط§ظ„ط­ط§ظ„ط©",
      "ظ…ط³طھظپظٹط¯",
      id,
      `طھظ… طھط؛ظٹظٹط± ط­ط§ظ„ط© ط§ظ„ظ…ط³طھظپظٹط¯ ط¥ظ„ظ‰: ${status}`,
      userId,
      userName,
      before,
    );
    const updated = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, id))
      .limit(1)
      .all())[0];
    return Response.json({ item: updated });
  }

  // Create new beneficiary
  const {
    name,
    fileNumber,
    idNumber,
    phone,
    city,
    address,
    category,
    status,
    familyMembers,
    monthlyIncome,
    maritalStatus,
    notes,
    userId: uid,
    userName: uname,
  } = body;

  if (!name?.trim())
    return Response.json({ error: "ط§ط³ظ… ط§ظ„ظ…ط³طھظپظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const benId = genId("BEN");
  const ts = now();

  await db.insert(beneficiaries)
    .values({
      id: benId,
      name: name.trim(),
      fileNumber: fileNumber || "",
      idNumber: idNumber || "",
      phone: phone || "",
      city: city || "",
      address: address || "",
      category: category || "ط£ط³ط± ظ…ط­طھط§ط¬ط©",
      status: status || "ط¬ط¯ظٹط¯",
      familyMembers: parseInt(familyMembers) || 1,
      monthlyIncome: parseFloat(monthlyIncome) || 0,
      maritalStatus: maritalStatus || "",
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ط³طھظپظٹط¯",
    benId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ط³طھظپظٹط¯ ط¬ط¯ظٹط¯: ${name}`,
    uid,
    uname,
  );
  const created = (await db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, benId))
    .limit(1)
    .all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/beneficiaries - Update beneficiary
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const {
    id,
    name,
    fileNumber,
    idNumber,
    phone,
    city,
    address,
    category,
    status,
    familyMembers,
    monthlyIncome,
    maritalStatus,
    notes,
    userId,
    userName,
  } = body;

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط³طھظپظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // If trying to qualify, check that beneficiary is eligible
  if (status === "ظ…ط¤ظ‡ظ„" && existing.status === "ظ…ظˆظ‚ظˆظپ") {
    return Response.json(
      {
        error: "ظ„ط§ ظٹظ…ظƒظ† طھط£ظ‡ظٹظ„ ظ…ط³طھظپظٹط¯ ظ…ظˆظ‚ظˆظپ. ط£ط¹ط¯ طھظپط¹ظٹظ„ظ‡ ط£ظˆظ„ط§ظ‹.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(beneficiaries)
    .set({
      name: name?.trim() ?? existing.name,
      fileNumber: fileNumber ?? existing.fileNumber,
      idNumber: idNumber ?? existing.idNumber,
      phone: phone ?? existing.phone,
      city: city ?? existing.city,
      address: address ?? existing.address,
      category: category ?? existing.category,
      status: status ?? existing.status,
      familyMembers: familyMembers !== undefined ? parseInt(familyMembers) : existing.familyMembers,
      monthlyIncome:
        monthlyIncome !== undefined ? parseFloat(monthlyIncome) : existing.monthlyIncome,
      maritalStatus: maritalStatus ?? existing.maritalStatus,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(beneficiaries.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ط³طھظپظٹط¯",
    id,
    `طھظ… طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³طھظپظٹط¯: ${name || existing.name}`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(beneficiaries).where(eq(beneficiaries.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/beneficiaries - Delete beneficiary (only if no delivered aid)
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…ط³طھظپظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))
    .limit(1)
    .all())[0];
  if (!existing)
    return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // Check for delivered aid records
  const linkedAid = await db
    .select()
    .from(aidRecords)
    .where(and(eq(aidRecords.beneficiaryId, id), eq(aidRecords.status, "طھظ… ط§ظ„طھط³ظ„ظٹظ…")))
    .limit(1)
    .all();

  if (linkedAid.length > 0) {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ط³طھظپظٹط¯ ظ„ظ‡ ظ…ط³ط§ط¹ط¯ط§طھ ظ…ط³طھظ„ظ…ط©. ظٹظ…ظƒظ† ط¥ظٹظ‚ط§ظپظ‡ ظپظ‚ط·.",
      },
      { status: 400 },
    );
  }

  // Check for pending aid records
  const pendingAid = await db
    .select()
    .from(aidRecords)
    .where(
      and(
        eq(aidRecords.beneficiaryId, id),
        or(
          eq(aidRecords.status, "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©"),
          eq(aidRecords.status, "ظ…ط¹طھظ…ط¯"),
        ) as any,
      ),
    )
    .limit(1)
    .all();

  if (pendingAid.length > 0) {
    return Response.json(
      {
        error:
          "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ط³طھظپظٹط¯ ظ„ظ‡ ظ…ط³ط§ط¹ط¯ط§طھ ظ‚ظٹط¯ ط§ظ„ظ…ط¹ط§ظ„ط¬ط©. ط¹ط§ظ„ط¬ ط§ظ„ظ…ط³ط§ط¹ط¯ط§طھ ط£ظˆظ„ط§ظ‹ ط£ظˆ ط£ظˆظ‚ظپ ط§ظ„ظ…ط³طھظپظٹط¯.",
      },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(beneficiaries).where(eq(beneficiaries.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ظ…ط³طھظپظٹط¯",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ظ…ط³طھظپظٹط¯: ${existing.name}`,
    userId,
    userName,
    before,
  );

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/beneficiaries")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
