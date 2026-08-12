import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { getEmployee, updateEmployee, type Employee } from "@/lib/api/hr";

export const Route = createFileRoute("/hr_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل موظف — ثواب" }] }),
  component: EditEmployeePage,
});

function EditEmployeePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["employeeDetail", id],
    queryFn: () => getEmployee(id),
  });
  const item: Employee | undefined = detailQuery.data?.item;

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
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setDepartment(item.department || "");
    setTitle(item.title || "");
    setSalary(String(item.salary || 0));
    setPhone(item.phone || "");
    setEmail(item.email || "");
    setJoinedAt(item.joinedAt || "");
    setStatus(item.status || EmployeeStatus.ACTIVE);
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employeeDetail", id] });
      showToast("تم حفظ التعديلات", "success");
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
    updateMut.mutate({
      id,
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
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
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

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الموارد البشرية" breadcrumb={["الموارد", "الموارد البشرية"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الموارد البشرية" breadcrumb={["الموارد", "الموارد البشرية"]}>
        <div className="text-center py-12 text-muted-foreground">الموظف غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الموارد البشرية" breadcrumb={["الموارد", "الموارد البشرية", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/hr" },
          { label: "الموارد البشرية", to: "/hr" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${item.title || ""}${item.department ? " · " + item.department : ""}`}
        draftNumber={item.id}
        status={{ label: label("employeeStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/hr" })}
      />
    </AppShell>
  );
}
