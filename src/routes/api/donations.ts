import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donations, donors, campaigns, projects } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import {
  postBalancedEntry,
  reverseEntry,
  resolveSystemAccountId,
  cashOrBankAccountId,
  SYS,
} from "@/server/db/gl";
import {
  DonationMethod,
  DonationChannel,
  DonationStatus,
  DonorTag,
  Fund,
  JournalSource,
} from "@/lib/enums";

function tagFor(total: number): string {
  if (total >= 100000) return DonorTag.GOLD;
  if (total >= 50000) return DonorTag.SILVER;
  return DonorTag.BRONZE;
}

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const donorId = url.searchParams.get("donorId");
  const campaignId = url.searchParams.get("campaignId");
  const status = url.searchParams.get("status") || "";
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const search = url.searchParams.get("search");
  const stats = url.searchParams.get("stats");

  const conditions = [];
  if (donorId) conditions.push(eq(donations.donorId, donorId));
  if (campaignId) conditions.push(eq(donations.campaignId, campaignId));
  if (status) conditions.push(eq(donations.status, status));
  if (dateFrom) conditions.push(gte(donations.date, dateFrom));
  if (dateTo) conditions.push(lte(donations.date, dateTo));
  if (search) conditions.push(like(donations.notes, `%${search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  if (stats === "1") {
    const all = await db.select().from(donations).where(where);
    const totalAmount = all.reduce((s, d) => s + (d.amount || 0), 0);
    const totalCount = all.length;
    const byChannel: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    const byDonor: Record<string, { name: string; total: number; count: number }> = {};

    const campIds = [...new Set(all.map((d) => d.campaignId).filter(Boolean))] as string[];
    const donorIds = [...new Set(all.map((d) => d.donorId).filter(Boolean))] as string[];
    const campRows = campIds.length ? await db.select().from(campaigns).where(inArray(campaigns.id, campIds)) : [];
    const donorRows = donorIds.length ? await db.select().from(donors).where(inArray(donors.id, donorIds)) : [];
    const campMap = new Map(campRows.map((c) => [c.id, c.name]));
    const donorMap = new Map(donorRows.map((d) => [d.id, d.name]));

    for (const d of all) {
      const amount = d.amount || 0;
      byChannel[d.channel || "other"] = (byChannel[d.channel || "other"] || 0) + amount;
      if (d.campaignId) {
        const name = campMap.get(d.campaignId) || "غير محدد";
        byCampaign[name] = (byCampaign[name] || 0) + amount;
      }
      if (d.donorId) {
        const name = donorMap.get(d.donorId) || "غير محدد";
        if (!byDonor[d.donorId]) byDonor[d.donorId] = { name, total: 0, count: 0 };
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

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100") || 100));
  const [{ c: total }] = await db.select({ c: count() }).from(donations).where(where);
  const items = await db
    .select()
    .from(donations)
    .where(where)
    .orderBy(desc(donations.date))
    .limit(limit)
    .offset((page - 1) * limit);
  return Response.json({ items, total: Number(total), page, limit });
}

const createSchema = z.object({
  donorId: z.string().min(1, "معرف المتبرع مطلوب"),
  amount: z.coerce.number().positive("قيمة التبرع يجب أن تكون رقماً موجباً"),
  method: z.nativeEnum(DonationMethod).optional(),
  channel: z.nativeEnum(DonationChannel).optional(),
  fund: z.nativeEnum(Fund).optional(),
  status: z.nativeEnum(DonationStatus).optional(),
  campaignId: z.string().nullish(),
  projectId: z.string().nullish(),
  notes: z.string().optional(),
  date: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const donor = (await db.select().from(donors).where(eq(donors.id, b.donorId)).limit(1))[0];
    if (!donor) return err("المتبرع غير موجود", 404, "NOT_FOUND");

    const id = genId("DON");
    const ts = now();
    const amount = b.amount;
    const status = b.status ?? DonationStatus.CONFIRMED;
    const fund = b.fund ?? Fund.UNRESTRICTED;
    const date = (b.date || ts).slice(0, 10);

    await db.transaction(async (tx) => {
      let journalEntryId: string | null = null;

      if (status === DonationStatus.CONFIRMED) {
        // Post to the GL: Dr Cash/Bank, Cr Donations Revenue.
        const cashBank = await cashOrBankAccountId(tx as any, b.method);
        const revenue = await resolveSystemAccountId(tx as any, SYS.DONATIONS_REVENUE);
        journalEntryId = await postBalancedEntry(tx as any, {
          date,
          description: `تبرع من ${donor.name}`,
          fund,
          projectId: b.projectId ?? null,
          source: JournalSource.DONATION,
          sourceType: "donation",
          sourceId: id,
          lines: [
            { accountId: cashBank, debit: amount, fund },
            { accountId: revenue, credit: amount, fund },
          ],
          userId: ctx.user.id,
        });
      }

      await tx.insert(donations).values({
        id,
        donorId: b.donorId,
        amount,
        method: b.method ?? DonationMethod.CASH,
        channel: b.channel ?? DonationChannel.DIRECT,
        fund,
        status,
        campaignId: b.campaignId ?? null,
        projectId: b.projectId ?? null,
        journalEntryId,
        notes: b.notes ?? "",
        date,
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });

      if (status === DonationStatus.CONFIRMED) {
        const newTotal = (donor.totalDonations || 0) + amount;
        await tx
          .update(donors)
          .set({
            totalDonations: newTotal,
            donationCount: (donor.donationCount || 0) + 1,
            tag: tagFor(newTotal),
            lastDonation: date,
            updatedAt: ts,
          })
          .where(eq(donors.id, b.donorId));

        if (b.campaignId) {
          await tx
            .update(campaigns)
            .set({ raised: sql`${campaigns.raised} + ${amount}` })
            .where(eq(campaigns.id, b.campaignId));
        }
        if (b.projectId) {
          await tx
            .update(projects)
            .set({ donations: sql`${projects.donations} + ${amount}`, updatedAt: ts })
            .where(eq(projects.id, b.projectId));
        }
      }
    });

    await addAudit({
      action: "create",
      entityType: "donation",
      entityId: id,
      description: `تسجيل تبرع بمبلغ ${amount} من ${donor.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(donations).where(eq(donations.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

// DELETE /api/donations?id=xxx — cancel: reverse GL + donor/campaign/project stats.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف التبرع مطلوب", 400, "BAD_REQUEST");

  const donation = (await db.select().from(donations).where(eq(donations.id, id)).limit(1))[0];
  if (!donation) return err("التبرع غير موجود", 404, "NOT_FOUND");
  if (donation.status === DonationStatus.CANCELLED)
    return err("التبرع ملغى بالفعل", 400, "BAD_STATE");

  const amount = donation.amount || 0;
  const wasConfirmed = donation.status === DonationStatus.CONFIRMED;

  await db.transaction(async (tx) => {
    if (donation.journalEntryId) {
      await reverseEntry(tx as any, donation.journalEntryId, ctx.user.id);
    }
    await tx
      .update(donations)
      .set({ status: DonationStatus.CANCELLED, updatedAt: now() })
      .where(eq(donations.id, id));

    if (wasConfirmed && donation.donorId) {
      const donor = (await tx.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1))[0];
      if (donor) {
        const newTotal = Math.max(0, (donor.totalDonations || 0) - amount);
        await tx
          .update(donors)
          .set({
            totalDonations: newTotal,
            donationCount: Math.max(0, (donor.donationCount || 0) - 1),
            tag: tagFor(newTotal),
            updatedAt: now(),
          })
          .where(eq(donors.id, donation.donorId));
      }
    }
    if (wasConfirmed && donation.campaignId) {
      await tx
        .update(campaigns)
        .set({ raised: sql`GREATEST(0, ${campaigns.raised} - ${amount})` })
        .where(eq(campaigns.id, donation.campaignId));
    }
    if (wasConfirmed && donation.projectId) {
      await tx
        .update(projects)
        .set({ donations: sql`GREATEST(0, ${projects.donations} - ${amount})`, updatedAt: now() })
        .where(eq(projects.id, donation.projectId));
    }
  });

  await addAudit({
    action: "cancel",
    entityType: "donation",
    entityId: id,
    description: `إلغاء تبرع بمبلغ ${amount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/donations")({
  server: {
    handlers: {
      GET: authHandler("donations.view", GET),
      POST: authHandler("donations.create", POST),
      DELETE: authHandler("donations.delete", DELETE),
    },
  },
});
