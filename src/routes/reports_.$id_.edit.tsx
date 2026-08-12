import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { ReportType, ReportPeriod, ReportFormat } from "@/lib/enums";
import { getSavedReport, updateSavedReport } from "@/lib/api/saved-reports";

export const Route = createFileRoute("/reports_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل تقرير — ثواب" }] }),
  component: EditReportPage,
});

function EditReportPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["saved-report", id],
    queryFn: () => getSavedReport(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(ReportType.FINANCIAL);
  const [period, setPeriod] = useState<string>(ReportPeriod.MONTHLY);
  const [format, setFormat] = useState<string>(ReportFormat.PDF);
  const [scheduled, setScheduled] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setType(item.type);
      setPeriod(item.period);
      setFormat(item.format);
      setScheduled(item.scheduled);
      setNotes(item.notes || "");
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      period: string;
      format: string;
      scheduled: boolean;
      notes: string;
    }) => updateSavedReport({ id, ...(data as any) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-report", id] });
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
      showToast("تم تحديث التقرير", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("الرجاء إدخال اسم التقرير", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        type,
        period,
        format,
        scheduled,
        notes,
      });
      if (andClose) navigate({ to: "/reports" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="مركز التقارير">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="مركز التقارير">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">التقرير غير موجود</div>
          <button
            onClick={() => navigate({ to: "/reports" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "تعريف التقرير",
      content: (
        <FormSection title="تعريف التقرير">
          <FormField label="اسم التقرير" required>
            <FormInput value={name} onChange={(e) => setName(e.target.value)} />
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
    {
      id: "info",
      label: "معلومات",
      content: (
        <FormSection title="معلومات التقرير">
          <div className="space-y-0">
            <FormSummaryLine label="النوع" value={label("reportType", item.type)} />
            <FormSummaryLine label="الفترة" value={label("reportPeriod", item.period)} />
            <FormSummaryLine label="التنسيق" value={label("reportFormat", item.format)} />
            <FormSummaryLine label="مجدول" value={item.scheduled ? "نعم" : "لا"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt || "—"} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="مركز التقارير" breadcrumb={["التقارير والحوكمة", "مركز التقارير", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التقارير والحوكمة", to: "/reports" },
          { label: "مركز التقارير", to: "/reports" },
          { label: item.name },
        ]}
        title={`تقرير: ${item.name}`}
        subtitle={`${label("reportType", item.type)} · ${label("reportPeriod", item.period)} · ${label("reportFormat", item.format)}`}
        draftNumber={item.id}
        status={{
          label: item.scheduled ? "مجدول" : "يدوي",
          tone: item.scheduled ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
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
