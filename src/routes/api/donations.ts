import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { donations, donors, campaigns, projects, receipts } from "@/server/db/schema";
import { hasPermission } from "@/server/db/auth";
import { nextCode } from "@/server/db/numbering";
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
  ReceiptType,
  ReceiptStatus,
} from "@/lib/enums";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DonationRow = typeof donations.$inferSelect;
type DonorRow = typeof donors.$inferSelect;

/** Post a donation to the GL: Dr Cash/Bank, Cr Donations Revenue (same rule as before). */
async function postDonationEntry(tx: Tx, d: DonationRow, donor: DonorRow, userId: string) {
  const fund = (d.fund as Fund) || Fund.UNRESTRICTED;
  const cashBank = await cashOrBankAccountId(tx as any, d.method as DonationMethod);
  const revenue = await resolveSystemAccountId(tx as any, SYS.DONATIONS_REVENUE);
  return postBalancedEntry(tx as any, {
    date: d.date,
    description: `تبرع من ${donor.name}`,
    fund,
    projectId: d.projectId ?? null,
    source: JournalSource.DONATION,
    sourceType: "donation",
    sourceId: d.id,
    lines: [
      { accountId: cashBank, debit: d.amount, fund },
      { accountId: revenue, credit: d.amount, fund },
    ],
    userId,
  });
}

/** Keep donor / campaign / project running totals in step with confirm (+1) / cancel (−1). */
async function applyTotals(tx: Tx, d: DonationRow, sign: 1 | -1) {
  const amount = (d.amount || 0) * sign;
  const ts = now();
  if (d.donorId) {
    const donor = (await tx.select().from(donors).where(eq(donors.id, d.donorId)).limit(1))[0];
    if (donor) {
      const newTotal = Math.max(0, (donor.totalDonations || 0) + amount);
      await tx
        .update(donors)
        .set({
          totalDonations: newTotal,
          donationCount: Math.max(0, (donor.donationCount || 0) + sign),
          tag: tagFor(newTotal),
          ...(sign > 0 ? { lastDonation: d.date } : {}),
          updatedAt: ts,
        })
        .where(eq(donors.id, d.donorId));
    }
  }
  if (d.campaignId)
    await tx
      .update(campaigns)
      .set({ raised: sql`GREATEST(0, ${campaigns.raised} + ${amount})` })
      .where(eq(campaigns.id, d.campaignId));
  if (d.projectId)
    await tx
      .update(projects)
      .set({ donations: sql`GREATEST(0, ${projects.donations} + ${amount})`, updatedAt: ts })
      .where(eq(projects.id, d.projectId));
}

/** Attach donorName / projectName / campaignName / receiptNumber for the UI (no N+1). */
async function enrich(rows: DonationRow[]) {
  const ids = (k: "donorId" | "projectId" | "campaignId" | "receiptId") =>
    [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const [dn, pj, cp, rc] = await Promise.all([
    ids("donorId").length ? db.select().from(donors).where(inArray(donors.id, ids("donorId"))) : [],
    ids("projectId").length ? db.select().from(projects).where(inArray(projects.id, ids("projectId"))) : [],
    ids("campaignId").length ? db.select().from(campaigns).where(inArray(campaigns.id, ids("campaignId"))) : [],
    ids("receiptId").length ? db.select().from(receipts).where(inArray(receipts.id, ids("receiptId"))) : [],
  ]);
  const m = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const D = m(dn as DonorRow[]), P = m(pj as any[]), C = m(cp as any[]), R = m(rc as any[]);
  return rows.map((r) => ({
    ...r,
    donorName: (r.donorId && D.get(r.donorId)?.name) || "",
    projectName: (r.projectId && P.get(r.projectId)?.name) || "",
    campaignName: (r.campaignId && C.get(r.campaignId)?.name) || "",
    receiptNumber: (r.receiptId && R.get(r.receiptId)?.number) || "",
  }));
}

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
  const id = url.searchParams.get("id");
  const projectId = url.searchParams.get("projectId");
  const method = url.searchParams.get("method");
  const channel = url.searchParams.get("channel");

  if (id) {
    const row = (await db.select().from(donations).where(eq(donations.id, id)).limit(1))[0];
    if (!row) return err("التبرع غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: (await enrich([row]))[0] });
  }

  const conditions = [];
  // Totals only count money actually received (confirmed), unless a status is asked for.
  if (stats === "1" && !status) conditions.push(eq(donations.status, DonationStatus.CONFIRMED));
  if (projectId) conditions.push(eq(donations.projectId, projectId));
  if (method) conditions.push(eq(donations.method, method));
  if (channel) conditions.push(eq(donations.channel, channel));
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
  return Response.json({ items: await enrich(items), total: Number(total), page, limit });
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

const actionSchema = z.object({
  id: z.string().min(1, "معرف التبرع مطلوب"),
  action: z.enum(["confirm", "cancel", "issueReceipt"]),
  reason: z.string().optional(),
});

const ACTION_PERMISSION: Record<z.infer<typeof actionSchema>["action"], string> = {
  confirm: "donations.update",
  cancel: "donations.delete",
  issueReceipt: "receipts.create",
};

/**
 * Workflow actions:
 *  - confirm      DRAFT → CONFIRMED, posts Dr Cash/Bank / Cr Donations Revenue
 *  - cancel       DRAFT|CONFIRMED → CANCELLED; a posted entry is REVERSED and an
 *                 issued receipt is voided
 *  - issueReceipt CONFIRMED only; sequential RCPT-YYYY-NNNNN, idempotent
 * Each runs in one transaction with the donation row locked (no double post).
 */
async function runAction(b: z.infer<typeof actionSchema>, ctx: Ctx) {
  if (!(await hasPermission(ctx.user.role, ACTION_PERMISSION[b.action])))
    return err("لا تملك صلاحية لهذا الإجراء", 403, "FORBIDDEN");

  let auditText = "";
  let receiptId: string | null = null;
  const res = await db.transaction(async (tx) => {
    const d = (await tx.select().from(donations).where(eq(donations.id, b.id)).for("update").limit(1))[0];
    if (!d) return err("التبرع غير موجود", 404, "NOT_FOUND");
    const ts = now();

    if (b.action === "confirm") {
      if (d.status !== DonationStatus.DRAFT)
        return err("يمكن تأكيد التبرعات المسودة فقط", 409, "BAD_STATE");
      const donor = (await tx.select().from(donors).where(eq(donors.id, d.donorId)).limit(1))[0];
      if (!donor) return err("المتبرع غير موجود", 404, "NOT_FOUND");
      const journalEntryId = await postDonationEntry(tx, d, donor, ctx.user.id);
      await tx
        .update(donations)
        .set({ status: DonationStatus.CONFIRMED, journalEntryId, updatedAt: ts })
        .where(eq(donations.id, d.id));
      await applyTotals(tx, d, 1);
      auditText = `تأكيد وترحيل تبرع بمبلغ ${d.amount} من ${donor.name}`;
      return null;
    }

    if (b.action === "cancel") {
      if (d.status === DonationStatus.CANCELLED) return err("التبرع ملغى بالفعل", 409, "BAD_STATE");
      const wasConfirmed = d.status === DonationStatus.CONFIRMED;
      if (d.journalEntryId) await reverseEntry(tx as any, d.journalEntryId, ctx.user.id);
      if (d.receiptId)
        await tx
          .update(receipts)
          .set({ status: ReceiptStatus.CANCELLED })
          .where(eq(receipts.id, d.receiptId));
      await tx
        .update(donations)
        .set({ status: DonationStatus.CANCELLED, updatedAt: ts })
        .where(eq(donations.id, d.id));
      if (wasConfirmed) await applyTotals(tx, d, -1);
      auditText =
        `إلغاء تبرع بمبلغ ${d.amount}` +
        (d.journalEntryId ? " مع عكس القيد" : "") +
        (d.receiptId ? " وإلغاء الإيصال" : "") +
        (b.reason ? ` — السبب: ${b.reason}` : "");
      return null;
    }

    // issueReceipt
    if (d.status !== DonationStatus.CONFIRMED)
      return err("يُصدر الإيصال للتبرعات المؤكدة فقط", 409, "BAD_STATE");
    if (d.receiptId) {
      const existing = (await tx.select().from(receipts).where(eq(receipts.id, d.receiptId)).limit(1))[0];
      if (existing && existing.status !== ReceiptStatus.CANCELLED) {
        receiptId = existing.id;
        return null; // idempotent: one live receipt per donation
      }
    }
    const number = await nextCode(tx as any, {
      table: "receipts",
      column: "number",
      prefix: "RCPT-",
      year: true,
      pad: 5,
    });
    receiptId = genId("REC");
    await tx.insert(receipts).values({
      id: receiptId,
      donationId: d.id,
      number,
      amount: d.amount,
      date: ts.slice(0, 10),
      type: ReceiptType.DONATION,
      status: ReceiptStatus.ISSUED,
      printed: false,
      createdBy: ctx.user.id,
      createdAt: ts,
    });
    await tx.update(donations).set({ receiptId, updatedAt: ts }).where(eq(donations.id, d.id));
    auditText = `إصدار إيصال رقم ${number} بمبلغ ${d.amount}`;
    return null;
  });
  if (res) return res;

  if (auditText)
    await addAudit({
      action: b.action === "issueReceipt" ? "issue_receipt" : b.action,
      entityType: "donation",
      entityId: b.id,
      description: auditText,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
  const row = (await db.select().from(donations).where(eq(donations.id, b.id)).limit(1))[0];
  return Response.json({ item: (await enrich([row]))[0], receiptId });
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const raw = await event.request.clone().json().catch(() => ({}) as Record<string, unknown>);
    if (raw && typeof raw === "object" && "action" in raw)
      return runAction(await parseBody(event.request, actionSchema), ctx);
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

const updateSchema = createSchema.partial().extend({ id: z.string().min(1) });

// PUT /api/donations — edit a DRAFT only (posted donations are changed by cancel + re-entry).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const d = (await db.select().from(donations).where(eq(donations.id, b.id)).limit(1))[0];
    if (!d) return err("التبرع غير موجود", 404, "NOT_FOUND");
    if (d.status !== DonationStatus.DRAFT)
      return err("لا يمكن تعديل تبرع مؤكد أو ملغى — ألغِه ثم سجّل تبرعاً جديداً", 409, "BAD_STATE");
    if (b.donorId) {
      const donor = (await db.select().from(donors).where(eq(donors.id, b.donorId)).limit(1))[0];
      if (!donor) return err("المتبرع غير موجود", 404, "NOT_FOUND");
    }
    await db
      .update(donations)
      .set({
        ...(b.donorId ? { donorId: b.donorId } : {}),
        ...(b.amount !== undefined ? { amount: b.amount } : {}),
        ...(b.method ? { method: b.method } : {}),
        ...(b.channel ? { channel: b.channel } : {}),
        ...(b.fund ? { fund: b.fund } : {}),
        ...(b.projectId !== undefined ? { projectId: b.projectId ?? null } : {}),
        ...(b.campaignId !== undefined ? { campaignId: b.campaignId ?? null } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        ...(b.date ? { date: b.date.slice(0, 10) } : {}),
        updatedAt: now(),
      })
      .where(eq(donations.id, b.id));
    await addAudit({
      action: "update",
      entityType: "donation",
      entityId: b.id,
      description: `تعديل مسودة تبرع`,
      before: JSON.stringify(d),
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const row = (await db.select().from(donations).where(eq(donations.id, b.id)).limit(1))[0];
    return Response.json({ item: (await enrich([row]))[0] });
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
      PUT: authHandler("donations.update", PUT),
      DELETE: authHandler("donations.delete", DELETE),
    },
  },
});
