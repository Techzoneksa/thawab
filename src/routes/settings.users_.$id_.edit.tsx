import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { getUsers, updateUser, disableUser } from "@/lib/api/users";
import { getRoles } from "@/lib/api/roles";
import { label } from "@/lib/i18n/labels";
import { UserStatus } from "@/lib/enums";

export const Route = createFileRoute("/settings/users_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مستخدم — ثواب" }] }),
  component: EditUserPage,
});

function EditUserPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => getUsers() });
  const { data: rolesData } = useQuery({ queryKey: ["roles"], queryFn: getRoles });

  const item = data?.items.find((u) => u.id === id);
  const roles = rolesData?.items ?? data?.roles ?? [];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<string>(UserStatus.ACTIVE);
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setPhone(item.phone ?? "");
      setRole(item.role);
      setStatus(item.status);
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: updateUser,
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast(vars.password ? "تم تحديث كلمة المرور والبيانات" : "تم حفظ التغييرات", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      showToast("تم تعطيل المستخدم", "success");
      setConfirmDisable(false);
      navigate({ to: "/settings/users" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("الاسم مطلوب", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        id,
        name: name.trim(),
        role,
        phone,
        status,
        ...(password ? { password, mustChangePassword: mustChange } : {}),
      });
      setPassword("");
      if (andClose) navigate({ to: "/settings/users" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="المستخدمون">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="المستخدمون">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المستخدم غير موجود</div>
          <button
            onClick={() => navigate({ to: "/settings/users" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const roleName = (rid: string) => roles.find((r) => r.id === rid)?.name ?? rid;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات المستخدم",
      content: (
        <FormSection title="بيانات المستخدم">
          <FormRow>
            <FormField label="الاسم" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <FormInput value={item.email} dir="ltr" disabled />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="الدور / الصلاحيات">
              <FormSelect value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={UserStatus.ACTIVE}>{label("userStatus", UserStatus.ACTIVE)}</option>
              <option value={UserStatus.INACTIVE}>
                {label("userStatus", UserStatus.INACTIVE)}
              </option>
              <option value={UserStatus.SUSPENDED}>
                {label("userStatus", UserStatus.SUSPENDED)}
              </option>
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "security",
      label: "الأمان",
      content: (
        <FormSection title="كلمة المرور" description="اتركها فارغة لعدم تغيير كلمة المرور الحالية">
          <FormField label="كلمة مرور جديدة">
            <FormInput
              type="text"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 أحرف على الأقل"
            />
          </FormField>
          {password && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <input
                type="checkbox"
                checked={mustChange}
                onChange={(e) => setMustChange(e.target.checked)}
              />
              إجبار تغيير كلمة المرور عند أول تسجيل دخول
            </label>
          )}
        </FormSection>
      ),
    },
    {
      id: "info",
      label: "معلومات",
      content: (
        <FormSection title="معلومات الحساب">
          <div className="space-y-0">
            <FormSummaryLine label="الدور" value={roleName(item.role)} />
            <FormSummaryLine label="الحالة" value={label("userStatus", item.status)} />
            <FormSummaryLine label="آخر دخول" value={item.lastLogin || "—"} />
            <FormSummaryLine
              label="تغيير كلمة المرور مطلوب"
              value={item.mustChangePassword ? "نعم" : "لا"}
            />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المستخدمون" breadcrumb={["الإعدادات", "المستخدمون", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/users" },
          { label: "المستخدمون", to: "/settings/users" },
          { label: item.name },
        ]}
        title={`المستخدم: ${item.name}`}
        subtitle={`${item.email} · ${roleName(item.role)}`}
        draftNumber={item.id}
        status={{ label: label("userStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/settings/users" })}
        extraActions={
          <button
            type="button"
            onClick={() => setConfirmDisable(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/20 transition-colors min-h-[40px]"
          >
            تعطيل المستخدم
          </button>
        }
      />

      <ConfirmDialog
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        onConfirm={() => disableMutation.mutate()}
        title="تعطيل المستخدم"
        message="سيتم تعطيل هذا المستخدم وإنهاء جلساته. يمكنك إعادة تفعيله لاحقاً من قائمة المستخدمين."
        confirmText="تعطيل"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
