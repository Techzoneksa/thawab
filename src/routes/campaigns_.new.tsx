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
import { CampaignStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createCampaign } from "@/lib/api/campaigns";

export const Route = createFileRoute("/campaigns_/new")({
  head: () => ({ meta: [{ title: "حملة جديدة — ثواب" }] }),
  component: NewCampaignPage,
});

function NewCampaignPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<string>(CampaignStatus.ACTIVE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      showToast("تم إضافة الحملة بنجاح", "success");
      navigate({ to: "/campaigns" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم الحملة مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      goal: Number(goal) || 0,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      description: description || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الحملة">
          <FormRow>
            <FormField label="اسم الحملة" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: حملة كسوة الشتاء"
              />
            </FormField>
            <FormField label="الهدف (ر.س)">
              <FormInput
                type="number"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="تاريخ البداية">
              <FormInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="تاريخ النهاية">
              <FormInput
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("campaignStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="الوصف">
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الحملات" breadcrumb={["التبرعات", "الحملات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/donations" },
          { label: "الحملات", to: "/campaigns" },
          { label: "حملة جديدة" },
        ]}
        title="حملة جديدة"
        subtitle={name || "أدخل بيانات الحملة"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("campaignStatus", status),
          tone: status === CampaignStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/campaigns" })}
      />
    </AppShell>
  );
}
