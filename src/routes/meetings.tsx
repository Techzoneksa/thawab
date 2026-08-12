import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { label, options } from "@/lib/i18n/labels";
import {
  getMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  attendeesCount,
  type Meeting,
} from "@/lib/api/meetings";
import { MeetingStatus } from "@/lib/enums";
import { CalendarDays, MapPin, Users, Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "الاجتماعات — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formTitle, setFormTitle] = useState("");
    const [formDate, setFormDate] = useState("");
    const [formLocation, setFormLocation] = useState("");
    const [formStatus, setFormStatus] = useState<string>(MeetingStatus.SCHEDULED);

    const { data, isLoading, error } = useQuery({
      queryKey: ["meetings"],
      queryFn: () => getMeetings(),
    });
    const items: Meeting[] = data?.items ?? [];

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["meetings"] });

    const openAdd = () => {
      setEditingId(null);
      setFormTitle("");
      setFormDate("");
      setFormLocation("");
      setFormStatus(MeetingStatus.SCHEDULED);
      setFormOpen(true);
    };

    const openEdit = (m: Meeting) => {
      setEditingId(m.id);
      setFormTitle(m.title);
      setFormDate(m.date);
      setFormLocation(m.location ?? "");
      setFormStatus(m.status);
      setFormOpen(true);
    };

    const createMutation = useMutation({
      mutationFn: createMeeting,
      onSuccess: () => {
        invalidate();
        showToast("تم إضافة الاجتماع بنجاح", "success");
        setFormOpen(false);
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const updateMutation = useMutation({
      mutationFn: updateMeeting,
      onSuccess: () => {
        invalidate();
        showToast("تم تحديث الاجتماع بنجاح", "success");
        setFormOpen(false);
        setEditingId(null);
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteMeeting,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف الاجتماع", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const handleSave = () => {
      if (!formTitle.trim()) {
        showToast("يرجى إدخال عنوان الاجتماع", "error");
        return;
      }
      const payload = {
        title: formTitle.trim(),
        date: formDate || undefined,
        location: formLocation,
        status: formStatus,
      };
      if (editingId) updateMutation.mutate({ id: editingId, ...payload });
      else createMutation.mutate(payload);
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "الاجتماعات"]}
        title="الاجتماعات والقرارات"
        actions={
          <Btn variant="primary" onClick={openAdd}>
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
                      { label: "عرض", icon: Eye, onClick: () => showToast(m.title, "info") },
                      { label: "تعديل", icon: Edit, onClick: () => openEdit(m) },
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

        <EntityFormDrawer
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
          title={editingId ? "تعديل اجتماع" : "إضافة اجتماع"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">عنوان الاجتماع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="عنوان الاجتماع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المكان</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="مكان الانعقاد"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              {options("meetingStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </EntityFormDrawer>

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
