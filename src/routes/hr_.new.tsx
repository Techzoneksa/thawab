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
import { EmployeeStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createEmployee } from "@/lib/api/hr";

export const Route = createFileRoute("/hr_/new")({
  head: () => ({ meta: [{ title: "موظف جديد — ثواب" }] }),
  component: NewEmployeePage,
});

function NewEmployeePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [salary, setSalary] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [status, setStatus] = useState<string>(EmployeeStatus.ACTIVE);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      showToast("تم إضافة الموظف بنجاح", "success");
      navigate({ to: "/hr" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم الموظف مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      department: department || undefined,
      title: title || undefined,
      salary: Number(salary) || 0,
      phone: phone || undefined,
      email: email || undefined,
      joinedAt: joinedAt || undefined,
      status,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الموظف">
          <FormRow>
            <FormField label="الاسم" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="الإدارة">
              <FormInput value={department} onChange={(e) => setDepartment(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المسمى الوظيفي">
              <FormInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormField label="الراتب (ر.س)">
              <FormInput
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                dir="ltr"
              />
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
          <FormRow>
            <FormField label="تاريخ التعيين">
              <FormInput
                type="date"
                value={joinedAt}
                onChange={(e) => setJoinedAt(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("employeeStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الموارد البشرية" breadcrumb={["الموارد", "الموارد البشرية", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/hr" },
          { label: "الموارد البشرية", to: "/hr" },
          { label: "موظف جديد" },
        ]}
        title="موظف جديد"
        subtitle={name || "أدخل بيانات الموظف"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("employeeStatus", status),
          tone: status === EmployeeStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/hr" })}
      />
    </AppShell>
  );
}
