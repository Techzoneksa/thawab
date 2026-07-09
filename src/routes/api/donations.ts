import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donations, donors, campaigns, projects } from "@/server/db/schema";
import { eq, and, gte, lte, like, desc } from "drizzle-orm";

// GET /api/donations - List with filters and aggregation
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const donorId = url.searchParams.get("donorId");
  const campaignId = url.searchParams.get("campaignId");
  const status = url.searchParams.get("status");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const search = url.searchParams.get("search");
  const stats = url.searchParams.get("stats");

  const conditions = [];

  if (donorId) conditions.push(eq(donations.donorId, donorId));
  if (campaignId) conditions.push(eq(donations.campaignId, campaignId));
  if (status && status !== "ط§ظ„ظƒظ„") conditions.push(eq(donations.status, status));
  if (dateFrom) conditions.push(gte(donations.date, dateFrom));
  if (dateTo) conditions.push(lte(donations.date, dateTo));
  if (search) conditions.push(like(donations.notes, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const baseQuery = db.select().from(donations).orderBy(desc(donations.date));

  if (stats === "1") {
    const all = whereClause ? baseQuery.where(whereClause).all() : baseQuery.all();

    const totalAmount = all.reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalCount = all.length;

    const byChannel: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byDonor: Record<string, { name: string; total: number; count: number }> = {};

    for (const d of all) {
      const amount = d.amount || 0;
      const channel = d.channel || "ط£ط®ط±ظ‰";
      byChannel[channel] = (byChannel[channel] || 0) + amount;

      if (d.campaignId) {
        const campaign = db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, d.campaignId))
          .limit(1)
          .all()[0];
        const name = campaign?.name || "ط؛ظٹط± ظ…ط­ط¯ط¯";
        byCampaign[name] = (byCampaign[name] || 0) + amount;
      }

      if (d.donorId) {
        const donor = db.select().from(donors).where(eq(donors.id, d.donorId)).limit(1).all()[0];
        const name = donor?.name || "ط؛ظٹط± ظ…ط­ط¯ط¯";
        if (!byDonor[d.donorId]) {
          byDonor[d.donorId] = { name, total: 0, count: 0 };
        }
        byDonor[d.donorId].total += amount;
        byDonor[d.donorId].count += 1;
      }
    }

    return Response.json({
      totalAmount,
      totalCount,
      averageAmount: totalCount > 0 ? totalAmount / totalCount : 0,
      byChannel,
      byCampaign,
      topDonors: Object.entries(byDonor)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 10)
        .map(([id, info]) => ({ id, ...info })),
    });
  }

  const items = whereClause ? baseQuery.where(whereClause).all() : baseQuery.all();
  const total = items.length;
  return Response.json({ items, total });
}

// POST /api/donations - Create new donation + update donor stats
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const {
    donorId,
    amount,
    channel,
    campaignId,
    projectId,
    notes,
    date,
    status,
    method,
    userId,
    userName,
  } = body;

  if (!donorId) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ظ…طھط¨ط±ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const donor = db.select().from(donors).where(eq(donors.id, donorId)).limit(1).all()[0];
  if (!donor) {
    return Response.json({ error: "ط§ظ„ظ…طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return Response.json(
      { error: "ظ‚ظٹظ…ط© ط§ظ„طھط¨ط±ط¹ ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ط±ظ‚ظ…ط§ظ‹ ظ…ظˆط¬ط¨ط§ظ‹" },
      { status: 400 },
    );
  }

  const id = genId("DON");
  const ts = now();
  const amountNum = Number(amount);

  db.insert(donations)
    .values({
      id,
      donorId,
      amount: amountNum,
      method: method || "ظ†ظ‚ط¯ظٹ",
      channel: channel || "ظ†ظ‚ط¯ظٹ",
      status: status || "ظ…ظƒطھظ…ظ„",
      campaignId: campaignId || null,
      projectId: projectId || null,
      notes: notes || "",
      date: date || ts,
      createdBy: userId || null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  const newTotal = (donor.totalDonations || 0) + amountNum;
  const newCount = (donor.donationCount || 0) + 1;
  let newTag = donor.tag || "ط¨ط±ظˆظ†ط²ظٹ";
  if (newTotal >= 100000) newTag = "ط°ظ‡ط¨ظٹ";
  else if (newTotal >= 50000) newTag = "ظپط¶ظٹ";
  else if (newTotal >= 10000) newTag = "ط¨ط±ظˆظ†ط²ظٹ";

  db.update(donors)
    .set({
      totalDonations: newTotal,
      donationCount: newCount,
      tag: newTag,
      lastDonation: date || ts,
      updatedAt: ts,
    })
    .where(eq(donors.id, donorId))
    .run();

  if (campaignId) {
    const campaign = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1)
      .all()[0];
    if (campaign) {
      db.update(campaigns)
        .set({ raised: (campaign.raised || 0) + amountNum, updatedAt: ts })
        .where(eq(campaigns.id, campaignId))
        .run();
    }
  }

  if (projectId) {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).limit(1).all()[0];
    if (project) {
      db.update(projects)
        .set({ donations: (project.donations || 0) + amountNum, updatedAt: ts })
        .where(eq(projects.id, projectId))
        .run();
    }
  }

  addAudit(
    "ط¥ط¶ط§ظپط©",
    "طھط¨ط±ط¹",
    id,
    `طھظ… طھط³ط¬ظٹظ„ طھط¨ط±ط¹ ط¬ط¯ظٹط¯ ط¨ظ…ط¨ظ„ط؛ ${amountNum} ظ…ظ† ${donor.name}`,
    userId,
    userName,
  );

  const created = db.select().from(donations).where(eq(donations.id, id)).limit(1).all()[0];
  return Response.json({ item: created }, { status: 201 });
}

// DELETE /api/donations - Soft delete + reverse donor stats
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„طھط¨ط±ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const donation = db.select().from(donations).where(eq(donations.id, id)).limit(1).all()[0];
  if (!donation) {
    return Response.json({ error: "ط§ظ„طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  const refundAmount = donation.amount || 0;

  db.update(donations)
    .set({ status: "ظ…ظ„ط؛ظٹ", updatedAt: now() })
    .where(eq(donations.id, id))
    .run();

  if (donation.donorId) {
    const donor = db.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1).all()[0];
    if (donor) {
      const newTotal = Math.max(0, (donor.totalDonations || 0) - refundAmount);
      const newCount = Math.max(0, (donor.donationCount || 0) - 1);
      let newTag = "ط¨ط±ظˆظ†ط²ظٹ";
      if (newTotal >= 100000) newTag = "ط°ظ‡ط¨ظٹ";
      else if (newTotal >= 50000) newTag = "ظپط¶ظٹ";
      else if (newTotal >= 10000) newTag = "ط¨ط±ظˆظ†ط²ظٹ";

      db.update(donors)
        .set({ totalDonations: newTotal, donationCount: newCount, tag: newTag, updatedAt: now() })
        .where(eq(donors.id, donation.donorId))
        .run();
    }
  }

  if (donation.campaignId) {
    const campaign = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, donation.campaignId))
      .limit(1)
      .all()[0];
    if (campaign) {
      db.update(campaigns)
        .set({ raised: Math.max(0, (campaign.raised || 0) - refundAmount), updatedAt: now() })
        .where(eq(campaigns.id, donation.campaignId))
        .run();
    }
  }

  addAudit(
    "ط­ط°ظپ",
    "طھط¨ط±ط¹",
    id,
    `طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„طھط¨ط±ط¹ ط¨ظ…ط¨ظ„ط؛ ${refundAmount}`,
    userId,
    userName,
  );

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/donations")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      DELETE: __handler_DELETE,
    },
  },
});
