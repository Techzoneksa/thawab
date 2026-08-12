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
import { label, options } from "@/lib/i18n/labels";
import { ReportType, ReportPeriod, ReportFormat } from "@/lib/enums";
import { createSavedReport } from "@/lib/api/saved-reports";

export const Route = createFileRoute("/reports_/new")({
  head: () => ({ meta: [{ title: "تقرير جديد — ثواب" }] }),
  component: NewReportPage,
});

function NewReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(ReportType.FINANCIAL);
  const [period, setPeriod] = useState<string>(ReportPeriod.MONTHLY);
  const [format, setFormat] = useState<string>(ReportFormat.PDF);
  const [scheduled, setScheduled] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createSavedReport,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("الرجاء إدخال اسم التقرير", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        type: type as ReportType,
        period: period as ReportPeriod,
        format: format as ReportFormat,
        scheduled,
        notes,
      });
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
      showToast(`تم حفظ التقرير ${created.name}`, "success");
      if (andClose) navigate({ to: "/reports" });
      else navigate({ to: "/reports/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "تعريف التقرير",
      content: (
        <FormSection title="تعريف التقرير">
          <FormField label="اسم التقرير" required>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: قائمة المركز المالي الشهرية"
            />
          </FormField>
          <FormRow>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {options("reportType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الفترة">
              <FormSelect value={period} onChange={(e) => setPeriod(e.target.value)}>
                {options("reportPeriod").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التنسيق">
              <FormSelect value={format} onChange={(e) => setFormat(e.target.value)}>
                {options("reportFormat").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الجدولة">
              <label className="flex items-center gap-2 text-sm min-h-[40px]">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                />
                تشغيل دوري تلقائي حسب الفترة
              </label>
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
    <AppShell title="مركز التقارير" breadcrumb={["التقارير والحوكمة", "مركز التقارير", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التقارير والحوكمة", to: "/reports" },
          { label: "مركز التقارير", to: "/reports" },
          { label: "تقرير جديد" },
        ]}
        title="تقرير جديد"
        subtitle={`${label("reportType", type)} · ${label("reportPeriod", period)} · ${label("reportFormat", format)}`}
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/reports" })}
      />
    </AppShell>
  );
}
