import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { backupConfig, backupRecords } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { BackupFrequency, BackupType, BackupStatus } from "@/lib/enums";

const CONFIG_ID = "default";

async function loadConfig() {
  let cfg = (
    await db.select().from(backupConfig).where(eq(backupConfig.id, CONFIG_ID)).limit(1)
  )[0];
  if (!cfg) {
    await db.insert(backupConfig).values({ id: CONFIG_ID, updatedAt: now() }).onConflictDoNothing();
    cfg = (await db.select().from(backupConfig).where(eq(backupConfig.id, CONFIG_ID)).limit(1))[0];
  }
  return cfg;
}

// GET /api/settings/backup — config + recent records.
async function GET(_event: { request: Request }, _ctx: Ctx) {
  const config = await loadConfig();
  const records = await db
    .select()
    .from(backupRecords)
    .orderBy(desc(backupRecords.createdAt))
    .limit(100);
  return Response.json({ config, records });
}

const postSchema = z.object({
  action: z.enum(["run"]).optional(),
  note: z.string().optional(),
});

// POST /api/settings/backup — record a manual backup run.
//
// NOTE: the actual database dump is performed by the server's backup
// infrastructure (cron/pg_dump). This records the run so it appears in the
// history; it does not itself write a dump file.
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    await parseBody(event.request, postSchema);
    const id = genId("BKP");
    const ts = now();
    await db.insert(backupRecords).values({
      id,
      type: BackupType.MANUAL,
      status: BackupStatus.SUCCESS,
      note: "نسخة يدوية",
      createdBy: ctx.user.id,
      createdByName: ctx.user.name,
      createdAt: ts,
    });
    await addAudit({
      action: "backup_run",
      entityType: "backup",
      entityId: id,
      description: "تشغيل نسخة احتياطية يدوية",
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const record = (
      await db.select().from(backupRecords).where(eq(backupRecords.id, id)).limit(1)
    )[0];
    return Response.json({ item: record }, { status: 201 });
  });
}

const putSchema = z.object({
  frequency: z.nativeEnum(BackupFrequency).optional(),
  time: z.string().optional(),
  retention: z.coerce.number().int().min(1).max(365).optional(),
  location: z.string().optional(),
});

// PUT /api/settings/backup — save schedule config.
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, putSchema);
    const existing = await loadConfig();
    await db
      .update(backupConfig)
      .set({
        frequency: b.frequency ?? existing.frequency,
        time: b.time ?? existing.time,
        retention: b.retention ?? existing.retention,
        location: b.location ?? existing.location,
        updatedBy: ctx.user.id,
        updatedAt: now(),
      })
      .where(eq(backupConfig.id, CONFIG_ID));
    await addAudit({
      action: "update",
      entityType: "backup_config",
      entityId: CONFIG_ID,
      description: "تحديث إعدادات النسخ الاحتياطي",
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    const config = await loadConfig();
    return Response.json({ config });
  });
}

// DELETE /api/settings/backup?id=xxx — remove a history record.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف النسخة مطلوب", 400, "BAD_REQUEST");
  await db.delete(backupRecords).where(eq(backupRecords.id, id));
  await addAudit({
    action: "delete",
    entityType: "backup",
    entityId: id,
    description: "حذف سجل نسخة احتياطية",
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/settings/backup")({
  server: {
    handlers: {
      GET: authHandler("settings.view", GET),
      POST: authHandler("settings.create", POST),
      PUT: authHandler("settings.update", PUT),
      DELETE: authHandler("settings.delete", DELETE),
    },
  },
});
