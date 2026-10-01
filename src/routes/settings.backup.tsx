import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import {
  DatabaseBackup,
  CheckCircle2,
  Trash2,
  Settings as Cog,
  Download,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { label } from "@/lib/i18n/labels";
import {
  getBackup,
  runBackup,
  deleteBackupRecord,
  restoreBackup,
  backupDownloadUrl,
  type BackupRecord,
} from "@/lib/api/backup";

const CONFIRM_WORD = "استعادة";
const fmtSize = (n: number) =>
  !n ? "—" : n < 1024 ? `${n} بايت` : n < 1048576 ? `${(n / 1024).toFixed(1)} ك.ب` : `${(n / 1048576).toFixed(1)} م.ب`;
const restorable = (b: BackupRecord) => b.status === "success" && !!b.fileName && b.type !== "restore";

export const Route = createFileRoute("/settings/backup")({
  head: () => ({ meta: [{ title: "النسخ الاحتياطي" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delTarget, setDelTarget] = useState<BackupRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["backup"], queryFn: getBackup });
  const config = data?.config;
  const records = data?.records ?? [];
  const canRestore = !!data?.canRestore;
  const lastBackup = records.find((r) => r.type !== "restore");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["backup"] });

  const runMut = useMutation({
    mutationFn: runBackup,
    onSuccess: (r) => {
      invalidate();
      showToast(`تم إنشاء نسخة احتياطية فعلية: ${r.fileName} (${fmtSize(r.sizeBytes)})`, "success");
    },
    onError: (e: Error) => {
      invalidate(); // the FAILED attempt is recorded — show it
      showToast(e.message, "error");
    },
  });

  const restoreMut = useMutation({
    mutationFn: (b: BackupRecord) => restoreBackup(b.id, confirmText.trim()),
    onSuccess: (r) => {
      showToast(
        `تمت الاستعادة من ${r.restoredFrom} (${r.rows} سجل). نسخة أمان: ${r.safetyBackup}. سجّل الدخول من جديد.`,
        "success",
      );
      setRestoreTarget(null);
      setConfirmText("");
      // Sessions were cleared by the restore — sign in again.
      setTimeout(() => (window.location.href = "/login"), 2500);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const actionsFor = (b: BackupRecord) => [
    ...(canRestore && restorable(b)
      ? [
          { label: "تنزيل", icon: Download, onClick: () => (window.location.href = backupDownloadUrl(b.id)) },
          { label: "استعادة", icon: RotateCcw, onClick: () => { setConfirmText(""); setRestoreTarget(b); } },
        ]
      : []),
    { label: "حذف", icon: Trash2, variant: "destructive" as const, onClick: () => setDelTarget(b) },
  ];

  const delMut = useMutation({
    mutationFn: deleteBackupRecord,
    onSuccess: () => {
      invalidate();
      showToast("تم حذف سجل النسخة", "success");
      setDelTarget(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الإعدادات", "النسخ الاحتياطي"]}
      title="النسخ الاحتياطي والاستعادة"
      actions={
        <div className="flex items-center gap-2">
          <Btn variant="outline" onClick={() => navigate({ to: "/settings/backup/settings" })}>
            <Cog size={15} />
            <span className="hidden md:inline">الإعدادات</span>
          </Btn>
          <Btn variant="primary" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            <DatabaseBackup size={15} className={runMut.isPending ? "animate-pulse" : ""} />
            {runMut.isPending ? "جارٍ..." : "نسخة احتياطية الآن"}
          </Btn>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">آخر نسخة احتياطية</div>
          <div className="text-xl font-extrabold mt-1">
            {lastBackup ? lastBackup.createdAt : "لا توجد"}
          </div>
          {lastBackup && (
            <Badge tone={statusTone(lastBackup.status)}>
              {lastBackup.status === "success" ? (
                <CheckCircle2 size={11} className="inline ms-1" />
              ) : (
                <XCircle size={11} className="inline ms-1" />
              )}
              {label("backupStatus", lastBackup.status)}
            </Badge>
          )}
          {lastBackup?.fileName && (
            <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate" title={lastBackup.fileName}>
              {lastBackup.fileName} · {fmtSize(lastBackup.sizeBytes)}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">عدد النسخ المسجّلة</div>
          <div className="text-xl font-extrabold mt-1 tabular-nums">{records.length}</div>
          <div className="text-xs text-muted-foreground mt-1">
            الاحتفاظ: {config?.retention ?? 30} نسخة
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted-foreground">الجدولة</div>
          <div className="text-xl font-extrabold mt-1">
            {config ? label("backupFrequency", config.frequency) : "—"}
          </div>
          <Badge tone="info">الوقت {config?.time ?? "—"}</Badge>
        </Card>
      </div>

      <MobilePageHeader title="النسخ الاحتياطي" count={`${records.length} نسخة`} />
      <MobileActionRow>
        <Btn variant="outline" onClick={() => navigate({ to: "/settings/backup/settings" })}>
          <Cog size={15} /> إعدادات
        </Btn>
        <Btn variant="primary" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
          <DatabaseBackup size={15} className={runMut.isPending ? "animate-pulse" : ""} />
          {runMut.isPending ? "جارٍ..." : "إنشاء نسخة"}
        </Btn>
      </MobileActionRow>
      <div className="mt-3 lg:mt-0" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : records.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<DatabaseBackup size={40} />}
            title="لا توجد نسخ احتياطية"
            description="اضغط «نسخة احتياطية الآن» لإنشاء أول نسخة فعلية من بيانات الجمعية"
            action={
              <Btn variant="primary" onClick={() => runMut.mutate()}>
                <DatabaseBackup size={15} /> نسخة احتياطية الآن
              </Btn>
            }
          />
        </Card>
      ) : (
        <MobileTable
          columns={["التاريخ والوقت", "النوع", "الحالة", "الملف / المرجع", "المحتوى", "بواسطة", ""]}
          rows={records}
          renderRow={(b: BackupRecord) => (
            <>
              <Td className="font-mono text-xs">{b.createdAt}</Td>
              <Td>{label("backupType", b.type)}</Td>
              <Td>
                <Badge tone={statusTone(b.status)}>{label("backupStatus", b.status)}</Badge>
                {b.error && (
                  <div className="text-[10px] text-destructive mt-0.5 max-w-[220px] truncate" title={b.error}>
                    {b.error}
                  </div>
                )}
              </Td>
              <Td className="text-xs">
                {b.fileName ? (
                  <>
                    <div className="font-mono truncate max-w-[260px]" title={b.fileName}>{b.fileName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono" title={b.sha256}>
                      SHA-256 {b.sha256 ? `${b.sha256.slice(0, 12)}…` : "—"}
                    </div>
                  </>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="text-xs tabular-nums">
                {b.type === "restore"
                  ? `${b.rowsCount} سجل مُستعاد`
                  : b.fileName
                    ? `${fmtSize(b.sizeBytes)} · ${b.tablesCount} جدول · ${b.rowsCount} سجل`
                    : "—"}
              </Td>
              <Td className="text-muted-foreground text-xs">{b.createdByName || "—"}</Td>
              <Td>
                <ActionMenu actions={actionsFor(b)} />
              </Td>
            </>
          )}
          mobileCard={(b: BackupRecord) => (
            <Card key={b.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(b.status)}>{label("backupStatus", b.status)}</Badge>
                <Badge tone="info">{label("backupType", b.type)}</Badge>
              </div>
              <div className="font-mono text-xs">{b.createdAt}</div>
              {b.fileName && (
                <div className="text-[11px] font-mono text-muted-foreground mt-1 truncate">
                  {b.fileName} · {fmtSize(b.sizeBytes)}
                </div>
              )}
              {b.error && <div className="text-[11px] text-destructive mt-1">{b.error}</div>}
              <div className="text-xs text-muted-foreground mt-1">{b.createdByName || "—"}</div>
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setDelTarget(b)}
                  className="text-destructive text-xs font-semibold"
                >
                  حذف
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
        title="حذف سجل النسخة الاحتياطية"
        message="سيتم حذف هذه النسخة وملفها من الخادم نهائياً."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
      {restoreTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !restoreMut.isPending && setRestoreTarget(null)}
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold text-destructive">استعادة قاعدة البيانات</div>
            <div className="mt-2 text-sm space-y-1">
              <p>
                ستُستبدل <strong>جميع بيانات الجمعية الحالية</strong> بالنسخة:
              </p>
              <p className="font-mono text-xs break-all">{restoreTarget.fileName}</p>
              <p className="text-xs text-muted-foreground">
                بتاريخ {restoreTarget.createdAt} · {restoreTarget.rowsCount} سجل
              </p>
              <ul className="text-xs text-muted-foreground list-disc pr-4 mt-2 space-y-0.5">
                <li>تُؤخذ نسخة أمان من الوضع الحالي تلقائياً قبل الاستعادة</li>
                <li>سجل التدقيق وسجل النسخ لا يُستبدلان</li>
                <li>سيُطلب من جميع المستخدمين تسجيل الدخول من جديد</li>
              </ul>
            </div>
            <label className="block text-xs font-semibold text-muted-foreground mt-3">
              {`اكتب «${CONFIRM_WORD}» للتأكيد`}
            </label>
            <input
              autoFocus
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={restoreMut.isPending}
                onClick={() => setRestoreTarget(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted min-h-[40px]"
              >
                رجوع
              </button>
              <button
                type="button"
                disabled={restoreMut.isPending || confirmText.trim() !== CONFIRM_WORD}
                onClick={() => restoreMut.mutate(restoreTarget)}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50 min-h-[40px]"
              >
                {restoreMut.isPending ? "جارٍ الاستعادة…" : "استعادة الآن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
