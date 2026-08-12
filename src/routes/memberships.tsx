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
  getMemberships,
  createMembership,
  updateMembership,
  deleteMembership,
  type Membership,
} from "@/lib/api/memberships";
import { MembershipRole, MembershipType } from "@/lib/enums";
import { UsersRound, Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/memberships")({
  head: () => ({ meta: [{ title: "العضويات — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formRole, setFormRole] = useState<string>(MembershipRole.MEMBER);
    const [formType, setFormType] = useState<string>(MembershipType.BOARD);
    const [formPhone, setFormPhone] = useState("");

    const { data, isLoading, error } = useQuery({
      queryKey: ["memberships"],
      queryFn: () => getMemberships(),
    });
    const items: Membership[] = data?.items ?? [];

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["memberships"] });

    const openAdd = () => {
      setEditingId(null);
      setFormName("");
      setFormRole(MembershipRole.MEMBER);
      setFormType(MembershipType.BOARD);
      setFormPhone("");
      setFormOpen(true);
    };

    const openEdit = (m: Membership) => {
      setEditingId(m.id);
      setFormName(m.name);
      setFormRole(m.role);
      setFormType(m.type);
      setFormPhone(m.phone ?? "");
      setFormOpen(true);
    };

    const createMutation = useMutation({
      mutationFn: createMembership,
      onSuccess: () => {
        invalidate();
        showToast("تم إضافة العضو بنجاح", "success");
        setFormOpen(false);
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const updateMutation = useMutation({
      mutationFn: updateMembership,
      onSuccess: () => {
        invalidate();
        showToast("تم تحديث بيانات العضو بنجاح", "success");
        setFormOpen(false);
        setEditingId(null);
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteMembership,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف العضو", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم العضو", "error");
        return;
      }
      const payload = {
        name: formName.trim(),
        role: formRole,
        type: formType,
        phone: formPhone,
      };
      if (editingId) updateMutation.mutate({ id: editingId, ...payload });
      else createMutation.mutate(payload);
    };

    const countType = (t: string) => items.filter((m) => m.type === t).length;

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "العضويات"]}
        title="العضويات ومجلس الإدارة"
        actions={
          <>
            <ExportButton
              data={items as unknown as Record<string, unknown>[]}
              filename="memberships.csv"
            />
            <Btn variant="primary" onClick={openAdd}>
              <Plus size={15} /> إضافة عضو
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="العضويات ومجلس الإدارة" count={`${items.length} عضو`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { l: "إجمالي الأعضاء", v: String(items.length) },
            { l: "مجلس الإدارة", v: String(countType(MembershipType.BOARD)) },
            { l: "الجمعية العمومية", v: String(countType(MembershipType.GENERAL_ASSEMBLY)) },
            { l: "اللجان", v: String(countType(MembershipType.COMMITTEE)) },
          ].map((s) => (
            <Card key={s.l} className="p-4">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <h3 className="font-bold mb-3">الأعضاء</h3>
          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
          )}
          {error && (
            <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الأعضاء</div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <EmptyState title="لا يوجد أعضاء" description="ابدأ بإضافة أعضاء مجلس الإدارة" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {label("membershipRole", m.role)} · {label("membershipType", m.type)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={statusTone(m.status)}>{label("membershipStatus", m.status)}</Badge>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () =>
                          showToast(`${m.name} - ${label("membershipRole", m.role)}`, "info"),
                      },
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
            ))}
          </div>
        </Card>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
          title={editingId ? "تعديل عضو" : "إضافة عضو"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="الاسم الكامل"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المنصب</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
            >
              {options("membershipRole").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الجهة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              {options("membershipType").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الجوال</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </div>
        </EntityFormDrawer>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف العضو؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
