import { createFileRoute } from "@tanstack/react-router";
import { db, now, genId, addAudit } from "@/server/db/index";
import { receipts, donations, donors } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/receipts - List all receipts (newest first)
async function __handler_GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const donationId = url.searchParams.get("donationId");

  const baseQuery = db.select().from(receipts).orderBy(desc(receipts.createdAt));
  const items = donationId
    ? await baseQuery.where(eq(receipts.donationId, donationId)).all()
    : await baseQuery.all();

  const enriched = items.map(async (receipt) => {
    let donation = null;
    let donor = null;
    if (receipt.donationId) {
      donation = (await db
        .select()
        .from(donations)
        .where(eq(donations.id, receipt.donationId))
        .limit(1)
        .all())[0];
      if (donation?.donorId) {
        donor = (await db.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1).all())[0];
      }
    }
    return { ...receipt, donation, donor };
  });

  return Response.json({ items: enriched, total: enriched.length });
}

// POST /api/receipts - Create new receipt
async function __handler_POST({ request }: { request: Request }) {
  const body = await request.json();
  const { donationId, number, amount, date, type, status, userId, userName } = body;

  if (!donationId) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„طھط¨ط±ط¹ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return Response.json(
      { error: "ظ‚ظٹظ…ط© ط§ظ„ط¥ظٹطµط§ظ„ ظٹط¬ط¨ ط£ظ† طھظƒظˆظ† ط±ظ‚ظ…ط§ظ‹ ظ…ظˆط¬ط¨ط§ظ‹" },
      { status: 400 },
    );
  }

  const donation = (await db
    .select()
    .from(donations)
    .where(eq(donations.id, donationId))
    .limit(1)
    .all())[0];
  if (!donation) {
    return Response.json({ error: "ط§ظ„طھط¨ط±ط¹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  const id = genId("REC");
  const ts = now();
  const finalNumber = number || `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  await db.insert(receipts)
    .values({
      id,
      donationId,
      number: finalNumber,
      amount: Number(amount),
      date: date || ts,
      type: type || "ط¥ظٹطµط§ظ„ طھط¨ط±ط¹",
      status: status || "طµط§ط¯ط±",
      printed: false,
      createdBy: userId || null,
      createdAt: ts,
    })
    .run();

  const donor = (await db.select().from(donors).where(eq(donors.id, donation.donorId)).limit(1).all())[0];

  await addAudit(
    "ط¥ط¶ط§ظپط©",
    "ط¥ظٹطµط§ظ„",
    id,
    `طھظ… ط¥طµط¯ط§ط± ط¥ظٹطµط§ظ„ ط±ظ‚ظ… ${finalNumber} ط¨ظ…ط¨ظ„ط؛ ${amount} ظ„ظ„ظ…طھط¨ط±ط¹ ${donor?.name || donation.donorName || ""}`,
    userId,
    userName,
  );

  const created = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1).all())[0];
  return Response.json({ item: created }, { status: 201 });
}

// PUT /api/receipts - Update receipt (void or reprint)
async function __handler_PUT({ request }: { request: Request }) {
  const body = await request.json();
  const { id, action, userId, userName } = body;

  if (!id) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¥ظٹطµط§ظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const existing = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1).all())[0];
  if (!existing) {
    return Response.json({ error: "ط§ظ„ط¥ظٹطµط§ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  if (action === "void") {
    await db.update(receipts).set({ status: "ظ…ظ„ط؛ظٹ" }).where(eq(receipts.id, id)).run();
    await addAudit(
      "طھط¹ط¯ظٹظ„",
      "ط¥ظٹطµط§ظ„",
      id,
      `طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط¥ظٹطµط§ظ„ ط±ظ‚ظ… ${existing.number}`,
      userId,
      userName,
    );
  } else if (action === "reprint") {
    await db.update(receipts).set({ printed: true }).where(eq(receipts.id, id)).run();
    await addAudit(
      "طھط¹ط¯ظٹظ„",
      "ط¥ظٹطµط§ظ„",
      id,
      `طھظ… ط¥ط¹ط§ط¯ط© ط·ط¨ط§ط¹ط© ط§ظ„ط¥ظٹطµط§ظ„ ط±ظ‚ظ… ${existing.number}`,
      userId,
      userName,
    );
  }

  const updated = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1).all())[0];
  return Response.json({ item: updated });
}

// DELETE /api/receipts - Delete receipt
async function __handler_DELETE({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId") || undefined;
  const userName = url.searchParams.get("userName") || "ظ…ط³طھط®ط¯ظ…";

  if (!id) {
    return Response.json({ error: "ظ…ط¹ط±ظپ ط§ظ„ط¥ظٹطµط§ظ„ ظ…ط·ظ„ظˆط¨" }, { status: 400 });
  }

  const existing = (await db.select().from(receipts).where(eq(receipts.id, id)).limit(1).all())[0];
  if (!existing) {
    return Response.json({ error: "ط§ظ„ط¥ظٹطµط§ظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" }, { status: 404 });
  }

  await db.delete(receipts).where(eq(receipts.id, id)).run();
  await addAudit(
    "ط­ط°ظپ",
    "ط¥ظٹطµط§ظ„",
    id,
    `طھظ… ط­ط°ظپ ط§ظ„ط¥ظٹطµط§ظ„ ط±ظ‚ظ… ${existing.number}`,
    userId,
    userName,
  );

  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/receipts")({
  server: {
    handlers: {
      GET: __handler_GET,
      POST: __handler_POST,
      PUT: __handler_PUT,
      DELETE: __handler_DELETE,
    },
  },
});
