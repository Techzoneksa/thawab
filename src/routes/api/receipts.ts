import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { receipts, donations, donors } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { ReceiptType, ReceiptStatus } from "@/lib/enums";

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const donationId = url.searchParams.get("donationId");

  const items = donationId
    ? await db.select().from(receipts).where(eq(receipts.donationId, donationId)).orderBy(desc(receipts.createdAt))
    : await db.select().from(receipts).orderBy(desc(receipts.createdAt));

  // Enrich with donation + donor, no N+1.
  const donIds = [...new Set(items.map((r) => r.donationId).filter(Boolean))] as string[];
  const dons = donIds.length ? await db.select().from(donations).where(inArray(donations.id, donIds)) : [];
  const donorIds = [...new Set(dons.map((d) => d.donorId).filter(Boolean))] as string[];
  const donorRows = donorIds.length ? await db.select().from(donors).where(inArray(donors.id, donorIds)) : [];
  const donMap = new Map(dons.map((d) => [d.id, d]));
  const donorMap = new Map(donorRows.map((d) => [d.id, d]));

  const enriched = items.map((r) => {
    const donation = r.donationId ? donMap.get(r.donationId) || null : null;
    const donor = donation?.donorId ? donorMap.get(donation.donorId) || null : null;
    return { ...r, donation, donor };
  });

  return Response.json({ items: enriched, total: enriched.length });
}

const createSchema = z.object({
  donationId: z.string().min(1, "معرف التبرع مطلوب"),
  number: z.string().optional(),
  amount: z.coerce.number().positive("قيمة الإيصال يجب أن تكون رقماً موجباً"),
  date: z.string().optional(),
  type: z.nativeEnum(ReceiptType).optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const donation = (await db.select().from(donations).where(eq(donations.id, b.donationId)).limit(1))[0];
    if (!donation) return err("التبرع غير موجود", 404, "NOT_FOUND");

    const id = genId("REC");
    const ts = now();
    const finalNumber = b.number || genId("REC");
    const donor = (await db.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1))[0];

    await db.insert(receipts).values({
      id,
      donationId: b.donationId,
      number: finalNumber,
      amount: b.amount,
      date: (b.date || ts).slice(0, 10),
      type: b.type ?? ReceiptType.DONATION,
      status: ReceiptStatus.ISSUED,
      printed: false,
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    await db.update(donations).set({ receiptId: id, updatedAt: ts }).where(eq(donations.id, b.donationId));

    await addAudit({
      action: "create",
      entityType: "receipt",
      entityId: id,
      description: `إصدار إيصال رقم ${finalNumber} بمبلغ ${b.amount} للمتبرع ${donor?.name || ""}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const putSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["void", "reprint"]),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, putSchema);
    const existing = (await db.select().from(receipts).where(eq(receipts.id, b.id)).limit(1))[0];
    if (!existing) return err("الإيصال غير موجود", 404, "NOT_FOUND");

    if (b.action === "void") {
      await db.update(receipts).set({ status: ReceiptStatus.CANCELLED }).where(eq(receipts.id, b.id));
      await addAudit({ action: "void", entityType: "receipt", entityId: b.id, description: `إلغاء الإيصال رقم ${existing.number}`, userId: ctx.user.id, userName: ctx.user.name, ip: ctx.ip });
    } else {
      await db.update(receipts).set({ printed: true }).where(eq(receipts.id, b.id));
      await addAudit({ action: "reprint", entityType: "receipt", entityId: b.id, description: `إعادة طباعة الإيصال رقم ${existing.number}`, userId: ctx.user.id, userName: ctx.user.name, ip: ctx.ip });
    }

    const updated = (await db.select().from(receipts).where(eq(receipts.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الإيصال مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1))[0];
  if (!existing) return err("الإيصال غير موجود", 404, "NOT_FOUND");
  await db.delete(receipts).where(eq(receipts.id, id));
  await addAudit({ action: "delete", entityType: "receipt", entityId: id, description: `حذف الإيصال رقم ${existing.number}`, userId: ctx.user.id, userName: ctx.user.name, ip: ctx.ip });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/receipts")({
  server: {
    handlers: {
      GET: authHandler("receipts.view", GET),
      POST: authHandler("receipts.create", POST),
      PUT: authHandler("receipts.update", PUT),
      DELETE: authHandler("receipts.delete", DELETE),
    },
  },
});
