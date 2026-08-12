import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { campaigns, donations } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { CampaignStatus } from "@/lib/enums";

// GET /api/campaigns?id=xxx — single (+ donation count); else list (+ donor counts).
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    if (!item) return err("الحملة غير موجودة", 404, "NOT_FOUND");
    const [{ c: donationCount }] = await db
      .select({ c: count() })
      .from(donations)
      .where(eq(donations.campaignId, id));
    return Response.json({ item, donationCount: Number(donationCount) });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const conditions = [];
  if (search) conditions.push(like(campaigns.name, `%${search}%`));
  if (status) conditions.push(eq(campaigns.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(campaigns).where(where).orderBy(desc(campaigns.createdAt));

  // Enrich each campaign with its distinct-donor count, without N+1.
  const rows = await db
    .select({ campaignId: donations.campaignId, donorId: donations.donorId })
    .from(donations);
  const donorSets = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.campaignId) continue;
    if (!donorSets.has(r.campaignId)) donorSets.set(r.campaignId, new Set());
    if (r.donorId) donorSets.get(r.campaignId)!.add(r.donorId);
  }
  const enriched = items.map((c) => ({ ...c, donorCount: donorSets.get(c.id)?.size ?? 0 }));

  return Response.json({ items: enriched, total: enriched.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الحملة مطلوب"),
  goal: z.coerce.number().min(0, "الهدف لا يمكن أن يكون سالباً").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  description: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("CMP");
    const ts = now();

    await db.insert(campaigns).values({
      id,
      name: b.name,
      goal: b.goal ?? 0,
      raised: 0,
      startDate: b.startDate ?? "",
      endDate: b.endDate ?? "",
      status: b.status ?? CampaignStatus.PLANNED,
      description: b.description ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "campaign",
      entityId: id,
      description: `إضافة حملة تبرع: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  goal: z.coerce.number().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  description: z.string().optional(),
});

// PUT /api/campaigns — update campaign fields (raised is derived from donations,
// never set directly here).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(campaigns).where(eq(campaigns.id, b.id)).limit(1))[0];
    if (!existing) return err("الحملة غير موجودة", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(campaigns)
      .set({
        name: b.name ?? existing.name,
        goal: b.goal ?? existing.goal,
        startDate: b.startDate ?? existing.startDate,
        endDate: b.endDate ?? existing.endDate,
        status: b.status ?? existing.status,
        description: b.description ?? existing.description,
      })
      .where(eq(campaigns.id, b.id));

    await addAudit({
      action: "update",
      entityType: "campaign",
      entityId: b.id,
      description: `تحديث حملة التبرع: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(campaigns).where(eq(campaigns.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/campaigns?id=xxx — blocked if donations are linked (cancel instead).
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الحملة مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
  if (!existing) return err("الحملة غير موجودة", 404, "NOT_FOUND");

  const [{ c: linked }] = await db
    .select({ c: count() })
    .from(donations)
    .where(eq(donations.campaignId, id));
  if (Number(linked) > 0)
    return err("لا يمكن حذف حملة مرتبطة بتبرعات — ألغِها بدلاً من ذلك", 400, "HAS_DONATIONS");

  const before = JSON.stringify(existing);
  await db.delete(campaigns).where(eq(campaigns.id, id));
  await addAudit({
    action: "delete",
    entityType: "campaign",
    entityId: id,
    description: `حذف حملة التبرع: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/campaigns")({
  server: {
    handlers: {
      GET: authHandler("campaigns.view", GET),
      POST: authHandler("campaigns.create", POST),
      PUT: authHandler("campaigns.update", PUT),
      DELETE: authHandler("campaigns.delete", DELETE),
    },
  },
});
