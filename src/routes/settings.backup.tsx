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
import { DatabaseBackup, CheckCircle2, Trash2, Settings as Cog } from "lucide-react";
import { label } from "@/lib/i18n/labels";
import { getBackup, runBackup, deleteBackupRecord, type BackupRecord } from "@/lib/api/backup";

export const Route = createFileRoute("/settings/backup")({
  head: () => ({ meta: [{ title: "النسخ الاحتياطي — ثواب" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delTarget, setDelTarget] = useState<BackupRecord | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["backup"], queryFn: getBackup });
  const config = data?.config;
  const records = data?.records ?? [];
  const lastBackup = records[0];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["backup"] });

  const runMut = useMutation({
    mutationFn: runBackup,
    onSuccess: () => {
      invalidate();
      showToast("تم تسجيل نسخة احتياطية جديدة", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

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
              <CheckCircle2 size={11} className="inline ms-1" />
              {label("backupStatus", lastBackup.status)}
            </Badge>
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
            description="اضغط «نسخة احتياطية الآن» لتسجيل أول نسخة، أو اضبط الجدولة التلقائية من الإعدادات"
            action={
              <Btn variant="primary" onClick={() => runMut.mutate()}>
                <DatabaseBackup size={15} /> نسخة احتياطية الآن
              </Btn>
            }
          />
        </Card>
      ) : (
        <MobileTable
          columns={["التاريخ والوقت", "النوع", "الحالة", "بواسطة", ""]}
          rows={records}
          renderRow={(b: BackupRecord) => (
            <>
              <Td className="font-mono text-xs">{b.createdAt}</Td>
              <Td>{label("backupType", b.type)}</Td>
              <Td>
                <Badge tone={statusTone(b.status)}>{label("backupStatus", b.status)}</Badge>
              </Td>
              <Td className="text-muted-foreground text-xs">{b.createdByName || "—"}</Td>
              <Td>
                <ActionMenu
                  actions={[
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive" as const,
                      onClick: () => setDelTarget(b),
                    },
                  ]}
                />
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
        message="سيتم حذف سجل هذه النسخة من التاريخ. لا يؤثر ذلك على النسخ المخزّنة على الخادم."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
