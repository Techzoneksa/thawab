import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtNum } from "@/data/sample";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { KeyRound, Plus, Pencil, Copy, Trash2 } from "lucide-react";
import { getRoles, createRole, deleteRole, type Role } from "@/lib/api/roles";

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — ثواب" }] }),
  component: Page,
});

function permSummary(r: Role): string {
  if (r.permissions.includes("*")) return "كامل";
  return `${r.permissions.length} صلاحية`;
}

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["roles"],
    queryFn: getRoles,
  });

  const roles = data?.items || [];

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      showToast("تم حذف الدور", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (r: Role) =>
      createRole({
        name: `${r.name} (نسخة)`,
        description: r.description,
        permissions: r.permissions,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      showToast(`تم نسخ الدور: ${created.name}`, "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/permissions/new" });
  const openEdit = (r: Role) => navigate({ to: "/permissions/$id/edit", params: { id: r.id } });

  const roleActions = (r: Role) => [
    { label: "تعديل", icon: Pencil, onClick: () => openEdit(r) },
    { label: "نسخ الدور", icon: Copy, onClick: () => duplicateMutation.mutate(r) },
    {
      label: "حذف",
      icon: Trash2,
      variant: "destructive" as const,
      onClick: () => setDeleteTarget(r),
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "الصلاحيات"]}
      title="إدارة الصلاحيات (RBAC)"
      actions={
        <Btn variant="primary" onClick={openAdd}>
          <Plus size={15} /> دور جديد
        </Btn>
      }
    >
      <MobilePageHeader
        title="إدارة الصلاحيات"
        count={`${fmtNum(roles.length)} دور`}
        action={
          <Btn variant="primary" onClick={openAdd}>
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
            icon={<KeyRound size={40} />}
            title="خطأ في تحميل الأدوار"
            description="حدث خطأ أثناء جلب الأدوار"
            action={
              <Btn
                variant="primary"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["roles"] })}
              >
                إعادة المحاولة
              </Btn>
            }
          />
        </Card>
      ) : roles.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<KeyRound size={40} />}
            title="لا توجد أدوار مُعرّفة"
            description="تُدار الصلاحيات عبر الأدوار. استخدم زر «دور جديد» لإضافة أول دور وتحديد صلاحياته."
            action={
              <Btn variant="primary" onClick={openAdd}>
                <Plus size={15} /> دور جديد
              </Btn>
            }
          />
        </Card>
      ) : (
        <MobileTable
          columns={["الدور", "الوصف", "الصلاحيات", "المستخدمون", ""]}
          rows={roles}
          renderRow={(r: Role) => (
            <>
              <Td className="font-semibold">
                <button
                  onClick={() => openEdit(r)}
                  className="hover:text-primary text-right inline-flex items-center gap-1.5"
                >
                  <KeyRound size={14} className="text-primary" />
                  {r.name}
                </button>
              </Td>
              <Td className="text-muted-foreground max-w-[280px] truncate">
                {r.description || "—"}
              </Td>
              <Td>
                <Badge tone={r.permissions.includes("*") ? "success" : "info"}>
                  {permSummary(r)}
                </Badge>
              </Td>
              <Td className="tabular-nums">{fmtNum(r.userCount ?? 0)}</Td>
              <Td>
                <ActionMenu actions={roleActions(r)} />
              </Td>
            </>
          )}
          mobileCard={(r: Role) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => openEdit(r)}
                  className="font-semibold hover:text-primary text-right inline-flex items-center gap-1.5"
                >
                  <KeyRound size={14} className="text-primary" />
                  {r.name}
                </button>
                <ActionMenu actions={roleActions(r)} />
              </div>
              {r.description && (
                <div className="text-xs text-muted-foreground mb-2">{r.description}</div>
              )}
              <div className="flex items-center gap-2">
                <Badge tone={r.permissions.includes("*") ? "success" : "info"}>
                  {permSummary(r)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {fmtNum(r.userCount ?? 0)} مستخدم
                </span>
              </div>
            </Card>
          )}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card className="p-5">
          <h3 className="font-bold mb-3">فصل المهام (SoD)</h3>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>✓ المنشئ ≠ المعتمِد للقيود المالية</li>
            <li>✓ المشتريات ≠ السداد</li>
            <li>✓ صرف المساعدة يتطلب 3 مستويات اعتماد</li>
            <li>✓ تعديل الميزانية يتطلب موافقة المجلس</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">المصادقة الثنائية 2FA</h3>
          <p className="text-sm text-muted-foreground mb-3">
            مفعّلة لجميع المستخدمين ذوي الصلاحيات المالية والإدارية.
          </p>
          <Badge tone="success">مفعّلة</Badge>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">سياسة كلمات المرور</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• الحد الأدنى 12 حرفاً</li>
            <li>• تجديد كل 90 يوم</li>
            <li>• حظر آخر 5 كلمات مرور</li>
            <li>• قفل بعد 5 محاولات فاشلة</li>
          </ul>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
        title="تأكيد حذف الدور"
        message={
          deleteTarget
            ? `هل أنت متأكد من حذف الدور "${deleteTarget.name}"؟ لا يمكن حذف دور مُسند إلى مستخدمين.`
            : ""
        }
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
