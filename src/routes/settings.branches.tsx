import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";
import { label } from "@/lib/i18n/labels";
import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  type Branch,
} from "@/lib/api/branches";
import { BranchStatus } from "@/lib/enums";
import { MapPin, Plus, Pencil, Ban, CheckCircle2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/settings/branches")({
  head: () => ({ meta: [{ title: "الفروع — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const [formName, setFormName] = useState("");
    const [formCity, setFormCity] = useState("");
    const [formMgr, setFormMgr] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formStatus, setFormStatus] = useState<string>(BranchStatus.ACTIVE);

    const { data, isLoading, error } = useQuery({
      queryKey: ["branches"],
      queryFn: () => getBranches(),
    });
    const items: Branch[] = data?.items ?? [];
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["branches"] });

    function resetForm() {
      setFormName("");
      setFormCity("");
      setFormMgr("");
      setFormPhone("");
      setFormEmail("");
      setFormStatus(BranchStatus.ACTIVE);
    }

    const openAdd = () => {
      setEditingId(null);
      resetForm();
      setFormOpen(true);
    };

    const openEdit = (b: Branch) => {
      setEditingId(b.id);
      setFormName(b.name);
      setFormCity(b.city ?? "");
      setFormMgr(b.manager ?? "");
      setFormPhone(b.phone ?? "");
      setFormEmail(b.email ?? "");
      setFormStatus(b.status);
      setFormOpen(true);
    };

    const createMutation = useMutation({
      mutationFn: createBranch,
      onSuccess: () => {
        invalidate();
        showToast("تم إضافة الفرع بنجاح", "success");
        setFormOpen(false);
        resetForm();
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const updateMutation = useMutation({
      mutationFn: updateBranch,
      onSuccess: () => {
        invalidate();
        showToast("تم حفظ التغييرات", "success");
        setFormOpen(false);
        setEditingId(null);
        resetForm();
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteBranch,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف الفرع بنجاح", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الفرع", "error");
        return;
      }
      const payload = {
        name: formName.trim(),
        city: formCity,
        manager: formMgr,
        phone: formPhone,
        email: formEmail,
        status: formStatus,
      };
      if (editingId) updateMutation.mutate({ id: editingId, ...payload });
      else createMutation.mutate(payload);
    };

    const toggleStatus = (b: Branch) => {
      const next = b.status === BranchStatus.ACTIVE ? BranchStatus.INACTIVE : BranchStatus.ACTIVE;
      updateMutation.mutate({ id: b.id, status: next });
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "الفروع"]}
        title="فروع الجمعية"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              data={items.map((b) => ({
                الفرع: b.name,
                المدينة: b.city,
                المدير: b.manager ?? "",
                الجوال: b.phone ?? "",
                البريد: b.email ?? "",
                الحالة: label("branchStatus", b.status),
              }))}
              filename="branches.csv"
            />
            <Btn variant="primary" onClick={openAdd}>
              <Plus size={15} />
              فرع جديد
            </Btn>
          </div>
        }
      >
        <MobilePageHeader title="فروع الجمعية" count={`${items.length} فرع`} />
        <MobileActionRow>
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة فرع
          </Btn>
        </MobileActionRow>

        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الفروع</div>
        )}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState title="لا توجد فروع" description="ابدأ بإضافة أول فرع" />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 lg:mt-0">
          {items.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <MapPin size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold truncate">{b.name}</h3>
                    <div className="text-xs text-muted-foreground">{b.city || "—"}</div>
                  </div>
                </div>
                <Badge tone={statusTone(b.status)}>{label("branchStatus", b.status)}</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>المدير: {b.manager || "—"}</div>
                <div>الجوال: {b.phone || "—"}</div>
                <div>البريد: {b.email || "—"}</div>
              </div>
              <div className="flex justify-end mt-3">
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(b) },
                    {
                      label: b.status === BranchStatus.ACTIVE ? "تعطيل" : "تفعيل",
                      icon: b.status === BranchStatus.ACTIVE ? Ban : CheckCircle2,
                      onClick: () => toggleStatus(b),
                    },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive",
                      onClick: () => setConfirmId(b.id),
                    },
                  ]}
                />
              </div>
            </Card>
          ))}
        </div>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingId(null);
            resetForm();
          }}
          title={editingId ? "تعديل الفرع" : "إضافة فرع جديد"}
          onSave={handleSave}
          saveText={editingId ? "حفظ التغييرات" : "إضافة"}
        >
          <div>
            <label className="text-xs text-muted-foreground">اسم الفرع *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدينة</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formCity}
              onChange={(e) => setFormCity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدير</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formMgr}
              onChange={(e) => setFormMgr(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الجوال</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">البريد</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الحالة</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              <option value={BranchStatus.ACTIVE}>
                {label("branchStatus", BranchStatus.ACTIVE)}
              </option>
              <option value={BranchStatus.INACTIVE}>
                {label("branchStatus", BranchStatus.INACTIVE)}
              </option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد حذف الفرع"
            message="هل أنت متأكد من حذف هذا الفرع؟"
            confirmText="حذف"
            cancelText="إلغاء"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
