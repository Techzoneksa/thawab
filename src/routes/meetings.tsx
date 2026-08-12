import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { label } from "@/lib/i18n/labels";
import { getMeetings, deleteMeeting, attendeesCount, type Meeting } from "@/lib/api/meetings";
import { CalendarDays, MapPin, Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "الاجتماعات — ثواب" }] }),
  component: () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
      queryKey: ["meetings"],
      queryFn: () => getMeetings(),
    });
    const items: Meeting[] = data?.items ?? [];

    const deleteMutation = useMutation({
      mutationFn: deleteMeeting,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
        showToast("تم حذف الاجتماع", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "الاجتماعات"]}
        title="الاجتماعات والقرارات"
        actions={
          <Btn variant="primary" onClick={() => navigate({ to: "/meetings/new" })}>
            <Plus size={15} /> إضافة اجتماع
          </Btn>
        }
      >
        <MobilePageHeader title="الاجتماعات والقرارات" count={`${items.length} اجتماع`} />
        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الاجتماعات</div>
        )}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState title="لا توجد اجتماعات" description="ابدأ بإضافة أول اجتماع" />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold">{m.title}</h3>
                    <div className="text-xs text-muted-foreground font-mono">{m.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={statusTone(m.status)}>{label("meetingStatus", m.status)}</Badge>
                  <ActionMenu
                    actions={[
                      {
                        label: "تعديل",
                        icon: Pencil,
                        onClick: () => navigate({ to: "/meetings/$id/edit", params: { id: m.id } }),
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmId(m.id),
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays size={13} /> {m.date || "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} /> {m.location || "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users size={13} /> {attendeesCount(m.attendees)} حاضر
                </span>
              </div>
            </Card>
          ))}
        </div>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الاجتماع؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
