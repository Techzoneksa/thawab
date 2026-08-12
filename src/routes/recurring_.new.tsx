import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
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
import { RecurringFrequency, RecurringStatus } from "@/lib/enums";
import {
  createRecurring,
  type RecurringFrequency as RecurringFrequencyType,
  type RecurringStatus as RecurringStatusType,
} from "@/lib/api/recurring";

export const Route = createFileRoute("/recurring_/new")({
  head: () => ({ meta: [{ title: "تبرع متكرر جديد — ثواب" }] }),
  component: NewRecurringPage,
});

function NewRecurringPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("0");
  const [frequency, setFrequency] = useState<string>(RecurringFrequency.MONTHLY);
  const [status, setStatus] = useState<string>(RecurringStatus.ACTIVE);
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [nextRunDate, setNextRunDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createRecurring,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!donorName.trim()) {
      showToast("يرجى إدخال اسم المتبرع", "error");
      return;
    }
    if (!amount.trim() || !(parseFloat(amount) > 0)) {
      showToast("يرجى إدخال المبلغ", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        donorName: donorName.trim(),
        amount: parseFloat(amount) || 0,
        frequency: frequency as RecurringFrequencyType,
        status: status as RecurringStatusType,
        projectName,
        startDate,
        nextRunDate,
        notes,
      });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast(`تم إضافة التبرع المتكرر ${created.donorName}`, "success");
      if (andClose) navigate({ to: "/recurring" });
      else navigate({ to: "/recurring/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات التبرع المتكرر">
          <FormRow>
            <FormField label="اسم المتبرع" required>
              <FormInput
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="مثال: عبدالله العتيبي"
              />
            </FormField>
            <FormField label="المبلغ (ر.س)" required>
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التكرار">
              <FormSelect value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {options("recurringFrequency").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("recurringStatus").map((o) => (
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
    {
      id: "schedule",
      label: "الجدولة",
      content: (
        <FormSection title="جدولة الخصم">
          <FormField label="المشروع">
            <FormInput value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="تاريخ البدء">
              <FormInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الخصم القادم">
              <FormInput
                type="date"
                value={nextRunDate}
                onChange={(e) => setNextRunDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التبرعات المتكررة" breadcrumb={["التبرعات", "التبرعات المتكررة", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/recurring" },
          { label: "التبرعات المتكررة", to: "/recurring" },
          { label: "تبرع متكرر جديد" },
        ]}
        title="تبرع متكرر جديد"
        subtitle={`${label("recurringFrequency", frequency)} · ${fmtSAR(parseFloat(amount) || 0)}`}
        draftNumber="مسودة جديدة"
        status={{ label: label("recurringStatus", status), tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/recurring" })}
      />
    </AppShell>
  );
}
