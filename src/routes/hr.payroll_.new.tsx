import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { options } from "@/lib/i18n/labels";
import { PayrollPayMethod } from "@/lib/enums";
import { createPayrollRun } from "@/lib/api/payroll";

export const Route = createFileRoute("/hr/payroll_/new")({
  head: () => ({ meta: [{ title: "مسير رواتب جديد — ثواب" }] }),
  component: NewPayrollPage,
});

function NewPayrollPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState("");
  const [payMethod, setPayMethod] = useState<string>(PayrollPayMethod.BANK);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createPayrollRun,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async () => {
    if (!period.trim()) {
      showToast("يرجى إدخال الفترة", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        period: period.trim(),
        payMethod: payMethod as PayrollPayMethod,
        notes: notes || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      showToast(`تم إنشاء مسير ${created.period}`, "success");
      navigate({ to: "/hr/payroll/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات المسير",
      content: (
        <FormSection
          title="مسير رواتب جديد"
          description="يتم إدراج جميع الموظفين النشطين برواتبهم الحالية في مسودة قابلة للتعديل قبل الاعتماد"
        >
          <FormRow>
            <FormField label="الفترة" required>
              <FormInput
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="مثال: رواتب شهر محرم 1447"
              />
            </FormField>
            <FormField label="طريقة الصرف">
              <FormSelect value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {options("payrollPayMethod").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="مسير الرواتب" breadcrumb={["الموارد", "مسير الرواتب", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/hr/payroll" },
          { label: "مسير الرواتب", to: "/hr/payroll" },
          { label: "مسير جديد" },
        ]}
        title="مسير رواتب جديد"
        subtitle={period || "أدخل الفترة"}
        draftNumber="مسودة جديدة"
        status={{ label: "مسودة", tone: "muted" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="إنشاء المسير"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/hr/payroll" })}
      />
    </AppShell>
  );
}
