import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { MembershipRole, MembershipType, MembershipStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createMembership } from "@/lib/api/memberships";

export const Route = createFileRoute("/memberships_/new")({
  head: () => ({ meta: [{ title: "عضو جديد — ثواب" }] }),
  component: NewMembershipPage,
});

function NewMembershipPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(MembershipRole.MEMBER);
  const [type, setType] = useState<string>(MembershipType.BOARD);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>(MembershipStatus.ACTIVE);
  const [joinedAt, setJoinedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createMembership,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      showToast("تم إضافة العضو بنجاح", "success");
      navigate({ to: "/memberships" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم العضو مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      role,
      type,
      phone: phone || undefined,
      email: email || undefined,
      status,
      joinedAt: joinedAt || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات العضو">
          <FormRow>
            <FormField label="الاسم" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="المنصب">
              <FormSelect value={role} onChange={(e) => setRole(e.target.value)}>
                {options("membershipRole").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الجهة">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {options("membershipType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("membershipStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الجوال">
              <FormInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                placeholder="05XXXXXXXX"
              />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <FormInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="تاريخ الانضمام">
            <FormInput
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              dir="ltr"
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="العضويات" breadcrumb={["الموارد", "العضويات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/memberships" },
          { label: "العضويات", to: "/memberships" },
          { label: "عضو جديد" },
        ]}
        title="عضو جديد"
        subtitle={name || "أدخل بيانات العضو"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("membershipStatus", status),
          tone: status === MembershipStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/memberships" })}
      />
    </AppShell>
  );
}
