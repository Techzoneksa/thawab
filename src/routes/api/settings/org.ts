import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, now, addAudit } from "@/server/db/index";
import { orgSettings } from "@/server/db/schema";
import { authHandler, parseBody, guard, type Ctx } from "@/server/db/api-utils";

const ORG_ID = "org";
const EMPTY = {
  id: ORG_ID,
  name: "",
  regNo: "",
  taxNo: "",
  email: "",
  phone: "",
  ceo: "",
  fiscalYear: "",
  currency: "SAR",
  buildingNo: "",
  street: "",
  district: "",
  city: "",
  postalCode: "",
  additionalNo: "",
  updatedAt: "",
};

// GET /api/settings/org — the single org profile row (defaults if unset).
async function GET(_event: { request: Request }, _ctx: Ctx) {
  const item = (await db.select().from(orgSettings).where(eq(orgSettings.id, ORG_ID)).limit(1))[0];
  return Response.json({ item: item ?? EMPTY });
}

const saveSchema = z.object({
  name: z.string().optional(),
  regNo: z.string().optional(),
  taxNo: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  ceo: z.string().optional(),
  fiscalYear: z.string().optional(),
  currency: z.string().optional(),
  buildingNo: z.string().optional(),
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  additionalNo: z.string().optional(),
});

// PUT /api/settings/org — upsert the single org profile row.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, saveSchema);
    const ts = now();
    const existing = (
      await db.select().from(orgSettings).where(eq(orgSettings.id, ORG_ID)).limit(1)
    )[0];

    const values = {
      name: b.name ?? existing?.name ?? "",
      regNo: b.regNo ?? existing?.regNo ?? "",
      taxNo: b.taxNo ?? existing?.taxNo ?? "",
      email: b.email ?? existing?.email ?? "",
      phone: b.phone ?? existing?.phone ?? "",
      ceo: b.ceo ?? existing?.ceo ?? "",
      fiscalYear: b.fiscalYear ?? existing?.fiscalYear ?? "",
      currency: b.currency ?? existing?.currency ?? "SAR",
      buildingNo: b.buildingNo ?? existing?.buildingNo ?? "",
      street: b.street ?? existing?.street ?? "",
      district: b.district ?? existing?.district ?? "",
      city: b.city ?? existing?.city ?? "",
      postalCode: b.postalCode ?? existing?.postalCode ?? "",
      additionalNo: b.additionalNo ?? existing?.additionalNo ?? "",
      updatedAt: ts,
    };

    if (existing) {
      await db.update(orgSettings).set(values).where(eq(orgSettings.id, ORG_ID));
    } else {
      await db.insert(orgSettings).values({ id: ORG_ID, ...values });
    }

    await addAudit({
      action: "update",
      entityType: "org_settings",
      entityId: ORG_ID,
      description: "تحديث إعدادات الجمعية",
      userId: ctx.user.id,
      userName: ctx.user.name,
      before: existing ? JSON.stringify(existing) : undefined,
      ip: ctx.ip,
    });

    const updated = (
      await db.select().from(orgSettings).where(eq(orgSettings.id, ORG_ID)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

export const Route = createFileRoute("/api/settings/org")({
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
      PUT: authHandler("settings.manage", PUT),
    },
  },
});
