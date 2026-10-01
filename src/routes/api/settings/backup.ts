import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { backupConfig, backupRecords, users } from "@/server/db/schema";
import { hasPermission, invalidateAuthCache } from "@/server/db/auth";
import { createBackup, restoreBackup, deleteBackupFile, backupPath } from "@/server/db/backup";
import { readFileSync } from "node:fs";
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

/** Restore (and downloading a full copy of the data) is a dedicated permission. */
export const RESTORE_PERMISSION = "settings.backup.restore";
/** Typed by the user to confirm a restore — guards against a stray click. */
const RESTORE_CONFIRM_WORD = "استعادة";

// GET /api/settings/backup — config + recent records (+ ?download=<id>).
async function GET(event: { request: Request }, ctx: Ctx) {
  const url = new URL(event.request.url);
  const downloadId = url.searchParams.get("download");
  if (downloadId) {
    if (!(await hasPermission(ctx.user.role, RESTORE_PERMISSION)))
      return err("لا تملك صلاحية تنزيل النسخ الاحتياطية", 403, "FORBIDDEN");
    const rec = (await db.select().from(backupRecords).where(eq(backupRecords.id, downloadId)).limit(1))[0];
    if (!rec?.fileName) return err("النسخة غير موجودة", 404, "NOT_FOUND");
    const buf = readFileSync(backupPath(rec.fileName));
    await addAudit({
      action: "backup_download",
      entityType: "backup",
      entityId: rec.id,
      description: `تنزيل النسخة الاحتياطية ${rec.fileName}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return new Response(buf, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${rec.fileName}"`,
        "content-length": String(buf.length),
      },
    });
  }
  const config = await loadConfig();
  const records = await db
    .select()
    .from(backupRecords)
    .orderBy(desc(backupRecords.createdAt))
    .limit(100);
  const canRestore = await hasPermission(ctx.user.role, RESTORE_PERMISSION);
  return Response.json({ config, records, canRestore });
}

const postSchema = z.object({
  action: z.enum(["run", "restore"]).optional(),
  id: z.string().optional(),
  confirm: z.string().optional(),
  note: z.string().optional(),
});

/**
 * Take a REAL backup and record it. A failure is recorded as FAILED (with the
 * error) and returned as an error — the UI can never show a false success.
 */
async function runBackup(ctx: Ctx, type: string, note: string) {
  const id = genId("BKP");
  const ts = now();
  try {
    const r = await createBackup();
    await db.insert(backupRecords).values({
      id,
      type,
      status: BackupStatus.SUCCESS,
      note,
      fileName: r.fileName,
      sizeBytes: r.sizeBytes,
      sha256: r.sha256,
      tablesCount: r.tablesCount,
      rowsCount: r.rowsCount,
      createdBy: ctx.user.id,
      createdByName: ctx.user.name,
      createdAt: ts,
    });
    await addAudit({
      action: "backup_run",
      entityType: "backup",
      entityId: id,
      description: `نسخة احتياطية فعلية ${r.fileName} — ${r.tablesCount} جدول، ${r.rowsCount} سجل، SHA-256 ${r.sha256.slice(0, 12)}…`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return { ok: true as const, id, ...r };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.insert(backupRecords).values({
      id,
      type,
      status: BackupStatus.FAILED,
      note,
      error: message.slice(0, 500),
      createdBy: ctx.user.id,
      createdByName: ctx.user.name,
      createdAt: ts,
    });
    await addAudit({
      action: "backup_failed",
      entityType: "backup",
      entityId: id,
      description: `فشل إنشاء نسخة احتياطية: ${message.slice(0, 200)}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return { ok: false as const, id, message };
  }
}

// POST /api/settings/backup — {action:"run"} real backup · {action:"restore", id, confirm}
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    if (b.action === "restore") {
      if (!(await hasPermission(ctx.user.role, RESTORE_PERMISSION)))
        return err("لا تملك صلاحية استعادة النسخ الاحتياطية", 403, "FORBIDDEN");
      if ((b.confirm || "").trim() !== RESTORE_CONFIRM_WORD)
        return err(`اكتب «${RESTORE_CONFIRM_WORD}» لتأكيد الاستعادة`, 400, "CONFIRM_REQUIRED");
      const rec = b.id
        ? (await db.select().from(backupRecords).where(eq(backupRecords.id, b.id)).limit(1))[0]
        : undefined;
      if (!rec) return err("النسخة غير موجودة", 404, "NOT_FOUND");
      if (rec.status !== BackupStatus.SUCCESS || !rec.fileName || !rec.sha256)
        return err("لا يمكن الاستعادة إلا من نسخة ناجحة لها ملف", 409, "NOT_RESTORABLE");

      // Safety net: snapshot the CURRENT state first, so this restore can be undone.
      const safety = await runBackup(ctx, BackupType.PRE_RESTORE, `قبل الاستعادة من ${rec.fileName}`);
      if (!safety.ok)
        return err(`أُلغيت الاستعادة: تعذّر أخذ نسخة أمان أولاً — ${safety.message}`, 500, "PRE_RESTORE_FAILED");

      const { rows } = await restoreBackup(rec.fileName, rec.sha256);
      invalidateAuthCache();

      // The restoring user may not exist in the restored data — keep the name, null the link.
      const stillExists = (await db.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1))[0];
      const restoreId = genId("BKP");
      await db.insert(backupRecords).values({
        id: restoreId,
        type: BackupType.RESTORE,
        status: BackupStatus.SUCCESS,
        note: `استعادة من ${rec.fileName} (${rec.createdAt})`,
        fileName: rec.fileName,
        sha256: rec.sha256,
        rowsCount: rows,
        restoredFrom: rec.id,
        createdBy: stillExists ? ctx.user.id : null,
        createdByName: ctx.user.name,
        createdAt: now(),
      });
      await addAudit({
        action: "backup_restore",
        entityType: "backup",
        entityId: rec.id,
        description: `استعادة قاعدة البيانات من ${rec.fileName} — ${rows} سجل. نسخة الأمان: ${safety.fileName}`,
        userId: stillExists ? ctx.user.id : null,
        userName: ctx.user.name,
        ip: ctx.ip,
      });
      return Response.json({
        restored: true,
        rows,
        restoredFrom: rec.fileName,
        safetyBackup: safety.fileName,
        relogin: true,
      });
    }

    const r = await runBackup(ctx, BackupType.MANUAL, b.note || "نسخة يدوية");
    if (!r.ok) return err(`فشل إنشاء النسخة الاحتياطية: ${r.message}`, 500, "BACKUP_FAILED");
    const record = (await db.select().from(backupRecords).where(eq(backupRecords.id, r.id)).limit(1))[0];
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
  const rec = (await db.select().from(backupRecords).where(eq(backupRecords.id, id)).limit(1))[0];
  await db.delete(backupRecords).where(eq(backupRecords.id, id));
  // A restore record points at a file owned by another record — never delete that.
  if (rec?.fileName && rec.type !== BackupType.RESTORE) deleteBackupFile(rec.fileName);
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
