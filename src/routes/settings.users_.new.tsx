import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { createUser } from "@/lib/api/users";
import { getRoles } from "@/lib/api/roles";

export const Route = createFileRoute("/settings/users_/new")({
  head: () => ({ meta: [{ title: "مستخدم جديد — ثواب" }] }),
  component: NewUserPage,
});

function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rolesData } = useQuery({ queryKey: ["roles"], queryFn: getRoles });
  const roles = rolesData?.items ?? [];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!role && roles.length) setRole(roles[0].id);
  }, [roles, role]);

  const createMutation = useMutation({
    mutationFn: createUser,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async () => {
    if (!name.trim() || !email.trim() || !role) {
      showToast("عبّئ الاسم والبريد والدور", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await createMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        role,
        phone: phone || undefined,
        ...(password ? { password, mustChangePassword: mustChange } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      if (res.tempPassword) {
        showToast(
          `تم إنشاء المستخدم. كلمة المرور المؤقتة: ${res.tempPassword} — شاركها معه`,
          "success",
        );
      } else {
        showToast("تم إنشاء المستخدم بنجاح", "success");
      }
      navigate({ to: "/settings/users" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات المستخدم",
      content: (
        <FormSection title="بيانات المستخدم">
          <FormRow>
            <FormField label="الاسم" required>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="الاسم الكامل"
              />
            </FormField>
            <FormField label="البريد الإلكتروني" required>
              <FormInput
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="الدور / الصلاحيات" required>
              <FormSelect value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">— اختر دوراً —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "security",
      label: "الأمان",
      content: (
        <FormSection
          title="كلمة المرور"
          description="اتركها فارغة لإنشاء دعوة بكلمة مرور مؤقتة تُعرض بعد الحفظ"
        >
          <FormField label="كلمة المرور">
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
  ];

  return (
    <AppShell title="المستخدمون" breadcrumb={["الإعدادات", "المستخدمون", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/users" },
          { label: "المستخدمون", to: "/settings/users" },
          { label: "مستخدم جديد" },
        ]}
        title="مستخدم جديد"
        subtitle={email || "أدخل بيانات المستخدم"}
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="إنشاء المستخدم"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/settings/users" })}
      />
    </AppShell>
  );
}
