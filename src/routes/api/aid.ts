import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { aidRecords, beneficiaries, projects } from "@/server/db/schema";
import { eq, like, or, and, desc } from "drizzle-orm";
import { safeHandler } from "@/server/db/api-utils";

async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    if (!aid) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, aid.beneficiaryId))
      .limit(1)
      .all())[0];
    const project = aid.projectId
      ? (await db.select().from(projects).where(eq(projects.id, aid.projectId)).limit(1).all())[0]
      : null;

    return Response.json({
      item: {
        ...aid,
        beneficiaryName: beneficiary?.name || "",
        beneficiaryStatus: beneficiary?.status || "",
        projectName: project?.name || "",
      },
    });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const beneficiaryId = url.searchParams.get("beneficiaryId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(like(aidRecords.id, `%${search}%`));
  }
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(aidRecords.status, status));
  if (type && type !== "ط§ظ„ظƒظ„") conditions.push(eq(aidRecords.type, type));
  if (beneficiaryId) conditions.push(eq(aidRecords.beneficiaryId, beneficiaryId));
  if (projectId) conditions.push(eq(aidRecords.projectId, projectId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allQuery = db.select().from(aidRecords).$dynamic();
  const all = whereClause
    ? await allQuery.where(whereClause).orderBy(desc(aidRecords.createdAt)).all()
    : await allQuery.orderBy(desc(aidRecords.createdAt)).all();
  const total = all.length;

  const itemsQuery = db.select().from(aidRecords).$dynamic();
  const items = whereClause
    ? await itemsQuery
        .where(whereClause)
        .orderBy(desc(aidRecords.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
    : await itemsQuery.orderBy(desc(aidRecords.createdAt)).limit(limit).offset(offset).all();

  // Enrich with beneficiary and project names
  const enrichedItems = items.map(async (a) => {
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, a.beneficiaryId))
      .limit(1)
      .all())[0];
    const project = a.projectId
      ? (await db.select().from(projects).where(eq(projects.id, a.projectId)).limit(1).all())[0]
      : null;
    return {
      ...a,
      beneficiaryName: beneficiary?.name || "",
      beneficiaryStatus: beneficiary?.status || "",
      projectName: project?.name || "",
    };
  });

  return Response.json({ items: enrichedItems, total, page, limit });
}

async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { action, id, userId, userName } = body;

  if (action === "approve") {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    if (!aid) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (aid.status !== "ظ‚ظٹط¯ ط§ظ„ظ…ط±ط§ط¬ط¹ط©")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† ط§ط¹طھظ…ط§ط¯ ظ‡ط°ط§ ط§ظ„ط³ط¬ظ„" },
        { status: 400 },
      );

    const before = JSON.stringify(aid);
    await db.update(aidRecords)
      .set({
        status: "ظ…ط¹طھظ…ط¯",
        approvedBy: userId || null,
        approvedAt: now(),
        updatedAt: now(),
      })
      .where(eq(aidRecords.id, id))
      .run();

    await addAudit(
      "ط§ط¹طھظ…ط§ط¯",
      "ظ…ط³ط§ط¹ط¯ط©",
      id,
      `طھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ظ…ط³ط§ط¹ط¯ط©`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "reject") {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    if (!aid) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const before = JSON.stringify(aid);
    await db.update(aidRecords)
      .set({ status: "ظ…ط±ظپظˆط¶", updatedAt: now() })
      .where(eq(aidRecords.id, id))
      .run();
    await addAudit(
      "ط±ظپط¶",
      "ظ…ط³ط§ط¹ط¯ط©",
      id,
      `طھظ… ط±ظپط¶ ط§ظ„ظ…ط³ط§ط¹ط¯ط©`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "deliver") {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    if (!aid) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    // Check beneficiary eligibility
    const beneficiary = (await db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.id, aid.beneficiaryId))
      .limit(1)
      .all())[0];
    if (!beneficiary)
      return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
    if (beneficiary.status !== "ظ…ط¤ظ‡ظ„")
      return Response.json(
        { error: "ظ„ط§ ظٹظ…ظƒظ† طھط³ظ„ظٹظ… ظ…ط³ط§ط¹ط¯ط© ظ„ظ…ط³طھظپظٹط¯ ط؛ظٹط± ظ…ط¤ظ‡ظ„" },
        { status: 400 },
      );
    if (aid.status !== "ظ…ط¹طھظ…ط¯")
      return Response.json(
        { error: "ظٹط¬ط¨ ط§ط¹طھظ…ط§ط¯ ط§ظ„ظ…ط³ط§ط¹ط¯ط© ط£ظˆظ„ط§ظ‹" },
        { status: 400 },
      );

    const before = JSON.stringify(aid);
    const ts = now();
    await db.update(aidRecords)
      .set({
        status: "طھظ… ط§ظ„طھط³ظ„ظٹظ…",
        updatedAt: ts,
        deliveredAt: ts,
        deliveredBy: userId || null,
        deliveryMethod: body.deliveryMethod || "",
        deliveryNotes: body.deliveryNotes || "",
      })
      .where(eq(aidRecords.id, id))
      .run();

    // Update project spent
    if (aid.projectId && aid.amount > 0) {
      const project = (await db
        .select()
        .from(projects)
        .where(eq(projects.id, aid.projectId))
        .limit(1)
        .all())[0];
      if (project) {
        await db.update(projects)
          .set({
            spent: project.spent + aid.amount,
            beneficiaryCount: project.beneficiaryCount + 1,
            updatedAt: now(),
          })
          .where(eq(projects.id, aid.projectId))
          .run();
      }
    }

    await addAudit(
      "طھط³ظ„ظٹظ…",
      "ظ…ط³ط§ط¹ط¯ط©",
      id,
      `طھظ… طھط³ظ„ظٹظ… ط§ظ„ظ…ط³ط§ط¹ط¯ط© ط¨ظ…ط¨ظ„ط؛ ${aid.amount} ط±.ط³`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  if (action === "return") {
    const aid = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    if (!aid) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

    const before = JSON.stringify(aid);
    await db.update(aidRecords)
      .set({ status: "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©", updatedAt: now() })
      .where(eq(aidRecords.id, id))
      .run();
    await addAudit(
      "ط¥ط±ط¬ط§ط¹",
      "ظ…ط³ط§ط¹ط¯ط©",
      id,
      `طھظ… ط¥ط±ط¬ط§ط¹ ط§ظ„ظ…ط³ط§ط¹ط¯ط© ظ„ظ„طھط¹ط¯ظٹظ„`,
      userId,
      userName,
      before,
    );
    const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
    return Response.json({ item: updated });
  }

  // Normal create
  const {
    beneficiaryId,
    projectId,
    type,
    amount,
    date,
    notes,
    userId: uid,
    userName: uname,
  } = body;

  if (!beneficiaryId)
    return Response.json({ error: "ط§ظ„ظ…ط³طھظپظٹط¯ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  if (!type) return Response.json({ error: "ظ†ظˆط¹ ط§ظ„ظ…ط³ط§ط¹ط¯ط© ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  // Check beneficiary eligibility
  const beneficiary = (await db
    .select()
    .from(beneficiaries)
    .where(eq(beneficiaries.id, beneficiaryId))
    .limit(1)
    .all())[0];
  if (beneficiary && beneficiary.status !== "ظ…ط¤ظ‡ظ„") {
    return Response.json(
      {
        error: `ظ„ط§ ظٹظ…ظƒظ† ط¥ط¶ط§ظپط© ظ…ط³ط§ط¹ط¯ط© ظ„ظ…ط³طھظپظٹط¯ ط¨ط­ط§ظ„ط©: ${beneficiary.status}`,
      },
      { status: 400 },
    );
  }

  const aidId = genId("AID");
  const ts = now();

  await db.insert(aidRecords)
    .values({
      id: aidId,
      beneficiaryId,
      projectId: projectId || null,
      type,
      amount: parseFloat(amount) || 0,
      status: "ط¨ط§ظ†طھط¸ط§ط± ط§ظ„ظ…ظˆط§ظپظ‚ط©",
      date: date || ts,
      approvedBy: null,
      approvedAt: null,
      notes: notes || "",
      createdBy: uid || null,
      createdAt: ts,
    })
    .run();

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ظ…ط³ط§ط¹ط¯ط©",
    aidId,
    `طھظ… ط¥ط¶ط§ظپط© ظ…ط³ط§ط¹ط¯ط© ط¬ط¯ظٹط¯ط©: ${type}`,
    uid,
    uname,
  );
  const created = (await db.select().from(aidRecords).where(eq(aidRecords.id, aidId)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, beneficiaryId, projectId, type, amount, date, notes, userId, userName } = body;

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط³ط¬ظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // Can only edit draft or pending review records
  if (existing.status === "طھظ… ط§ظ„طھط³ظ„ظٹظ…" || existing.status === "ظ…ط±ظپظˆط¶") {
    return Response.json({ error: "ظ„ط§ ظٹظ…ظƒظ† طھط¹ط¯ظٹظ„ ظ‡ط°ط§ ط§ظ„ط³ط¬ظ„" }, { status: 400 });
  }

  const before = JSON.stringify(existing);
  const ts = now();

  await db.update(aidRecords)
    .set({
      beneficiaryId: beneficiaryId ?? existing.beneficiaryId,
      projectId: projectId !== undefined ? projectId : existing.projectId,
      type: type ?? existing.type,
      amount: amount !== undefined ? parseFloat(amount) : existing.amount,
      date: date ?? existing.date,
      notes: notes ?? existing.notes,
      updatedAt: ts,
    })
    .where(eq(aidRecords.id, id))
    .run();

  await addAudit(
    "طھط¹ط¯ظٹظ„",
    "ظ…ط³ط§ط¹ط¯ط©",
    id,
    `طھظ… طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³ط§ط¹ط¯ط©`,
    userId,
    userName,
    before,
  );
  const updated = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط³ط¬ظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });

  const existing = (await db.select().from(aidRecords).where(eq(aidRecords.id, id)).limit(1).all())[0];
  if (!existing) return Response.json({ error: "ط§ظ„ط³ط¬ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });

  // Can only delete draft/pending records
  if (existing.status === "طھظ… ط§ظ„طھط³ظ„ظٹظ…") {
    return Response.json(
      { error: "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ…ط³ط§ط¹ط¯ط© طھظ… طھط³ظ„ظٹظ…ظ‡ط§" },
      { status: 400 },
    );
  }

  const before = JSON.stringify(existing);
  await db.delete(aidRecords).where(eq(aidRecords.id, id)).run();
  await addAudit("ط­ط°ظپ", "ظ…ط³ط§ط¹ط¯ط©", id, `طھظ… ط­ط°ظپ ط§ظ„ظ…ط³ط§ط¹ط¯ط©`, userId, userName, before);

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/aid")({
  server: {
    handlers: {
      GET: safeHandler(__handler_GET),
      POST: safeHandler(__handler_POST),
      PUT: safeHandler(__handler_PUT),
      DELETE: safeHandler(__handler_DELETE),
    },
  },
});
