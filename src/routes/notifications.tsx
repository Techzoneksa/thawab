import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Badge, Btn, MobilePageHeader } from "@/components/erp/AppShell";
import {
  Bell,
  AlertTriangle,
  Info,
  CheckCircle2,
  BellRing,
  Plus,
  Check,
  Trash2,
} from "lucide-react";
import { showToast, ActionMenu, EmptyState } from "@/components/erp/actions";
import { label } from "@/lib/i18n/labels";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type AppNotification,
} from "@/lib/api/notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "التنبيهات — ثواب" }] }),
  component: Page,
});

const ICON: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: BellRing,
  info: Info,
  success: CheckCircle2,
};

function toneClasses(tone: string) {
  switch (tone) {
    case "critical":
      return "bg-destructive/10 text-destructive";
    case "warning":
      return "bg-warning/20 text-warning-foreground";
    case "success":
      return "bg-success/10 text-success";
    default:
      return "bg-info/10 text-info";
  }
}

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(),
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, true),
    onSuccess: invalidate,
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const markAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      invalidate();
      showToast("تم تحديد الكل كمقروء", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      invalidate();
      showToast("تم حذف التنبيه", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التنبيهات"]}
      title="مركز التنبيهات"
      actions={
        <>
          <Btn variant="outline" onClick={() => markAllMut.mutate()} disabled={unread === 0}>
            <Check size={15} /> تحديد الكل مقروء
          </Btn>
          <Btn variant="primary" onClick={() => navigate({ to: "/notifications/new" })}>
            <Plus size={15} /> تنبيه جديد
          </Btn>
        </>
      }
    >
      <MobilePageHeader
        title="مركز التنبيهات"
        count={`${unread} غير مقروء`}
        action={
          <Btn variant="primary" onClick={() => navigate({ to: "/notifications/new" })}>
            <Plus size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <Card className="p-2">
          <EmptyState
            icon={<Bell size={40} />}
            title="خطأ في تحميل التنبيهات"
            description="حدث خطأ أثناء جلب التنبيهات"
            action={
              <Btn variant="primary" onClick={invalidate}>
                إعادة المحاولة
              </Btn>
            }
          />
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Bell size={40} />}
            title="لا توجد تنبيهات"
            description="ستظهر التنبيهات هنا عند توفرها"
            action={
              <Btn variant="primary" onClick={() => navigate({ to: "/notifications/new" })}>
                <Plus size={15} /> إنشاء تنبيه
              </Btn>
            }
          />
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="divide-y">
            {items.map((a: AppNotification) => {
              const Icon = ICON[a.tone] || Info;
              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 p-4 hover:bg-muted/50 ${a.read ? "opacity-60" : ""}`}
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneClasses(a.tone)}`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{a.title}</div>
                    {a.body && <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {label("notificationTone", a.tone)} · {a.createdAt}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.read && <Badge tone="warning">جديد</Badge>}
                    <ActionMenu
                      actions={[
                        ...(!a.read
                          ? [
                              {
                                label: "تحديد كمقروء",
                                icon: Check,
                                onClick: () => markReadMut.mutate(a.id),
                              },
                            ]
                          : []),
                        {
                          label: "حذف",
                          icon: Trash2,
                          variant: "destructive" as const,
                          onClick: () => deleteMut.mutate(a.id),
                        },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
