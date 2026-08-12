import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormTextarea,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { label } from "@/lib/i18n/labels";
import { FiscalPeriodStatus } from "@/lib/enums";
import { createPeriod } from "@/lib/api/periods";

export const Route = createFileRoute("/finance/closing_/new")({
  head: () => ({ meta: [{ title: "فترة مالية جديدة — ثواب" }] }),
  component: NewPeriodPage,
});

function NewPeriodPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createPeriod,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الفترة", "error");
      return;
    }
    if (!startDate) {
      showToast("يرجى تحديد تاريخ البداية", "error");
      return;
    }
    if (!endDate) {
      showToast("يرجى تحديد تاريخ النهاية", "error");
      return;
    }
    if (startDate > endDate) {
      showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        startDate,
        endDate,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast(`تم إنشاء الفترة المالية ${created.name}`, "success");
      if (andClose) navigate({ to: "/finance/closing" });
      else navigate({ to: "/finance/closing/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الفترة",
      content: (
        <FormSection
          title="بيانات الفترة المالية"
          description="حدد فترة محاسبية (شهرية أو ربع سنوية أو سنوية) ليتم ترحيل القيود ضمنها"
        >
          <FormField label="اسم الفترة" required>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: شهر شوال 1446، الربع الأول 1446، السنة 1446"
            />
          </FormField>
          <FormRow>
            <FormField label="تاريخ البداية" required>
              <FormInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="تاريخ النهاية" required>
              <FormInput
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="ملاحظات حول الفترة..."
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الإقفال المالي" breadcrumb={["المالية", "الإقفال المالي", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/closing" },
          { label: "الفترات المالية", to: "/finance/closing" },
          { label: "فترة جديدة" },
        ]}
        title="فترة مالية جديدة"
        subtitle={startDate && endDate ? `${startDate} → ${endDate}` : "حدد نطاق الفترة"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("fiscalPeriodStatus", FiscalPeriodStatus.OPEN),
          tone: statusTone(FiscalPeriodStatus.OPEN),
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/closing" })}
      />
    </AppShell>
  );
}
