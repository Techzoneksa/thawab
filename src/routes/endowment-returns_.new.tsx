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
import { EndowmentReturnStatus } from "@/lib/enums";
import { createEndowmentReturn } from "@/lib/api/endowment-returns";

export const Route = createFileRoute("/endowment-returns_/new")({
  head: () => ({ meta: [{ title: "عائد وقف جديد — ثواب" }] }),
  component: NewEndowmentReturnPage,
});

function NewEndowmentReturnPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState<string>(EndowmentReturnStatus.REALIZED);
  const [date, setDate] = useState("");
  const [endowmentName, setEndowmentName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createEndowmentReturn,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!period.trim()) {
      showToast("يرجى إدخال الفترة", "error");
      return;
    }
    if (!amount.trim()) {
      showToast("يرجى إدخال القيمة", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        period: period.trim(),
        amount: parseFloat(amount) || 0,
        status: status as EndowmentReturnStatus,
        date,
        endowmentName,
        notes,
      });
      queryClient.invalidateQueries({ queryKey: ["endowment-returns"] });
      showToast(`تم إضافة عائد الوقف ${created.period}`, "success");
      if (andClose) navigate({ to: "/endowment-returns" });
      else navigate({ to: "/endowment-returns/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات عائد الوقف">
          <FormRow>
            <FormField label="الفترة" required>
              <FormInput
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="مثال: Q1 1446"
              />
            </FormField>
            <FormField label="القيمة (ر.س)" required>
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("endowmentReturnStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="التاريخ">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "details",
      label: "التفاصيل",
      content: (
        <FormSection title="تفاصيل العائد">
          <FormField label="اسم الوقف">
            <FormInput value={endowmentName} onChange={(e) => setEndowmentName(e.target.value)} />
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="عوائد الأوقاف" breadcrumb={["المنح والأوقاف", "عوائد الأوقاف", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/endowment-returns" },
          { label: "عوائد الأوقاف", to: "/endowment-returns" },
          { label: "عائد جديد" },
        ]}
        title="عائد وقف جديد"
        subtitle={`${label("endowmentReturnStatus", status)} · ${fmtSAR(parseFloat(amount) || 0)}`}
        draftNumber="مسودة جديدة"
        status={{ label: label("endowmentReturnStatus", status), tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/endowment-returns" })}
      />
    </AppShell>
  );
}
