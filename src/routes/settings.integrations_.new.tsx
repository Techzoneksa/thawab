import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { IntegrationCategory, IntegrationStatus } from "@/lib/enums";
import { createIntegration } from "@/lib/api/integrations";

export const Route = createFileRoute("/settings/integrations_/new")({
  head: () => ({ meta: [{ title: "تكامل جديد — ثواب" }] }),
  component: NewIntegrationPage,
});

function NewIntegrationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(IntegrationCategory.PAYMENTS);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string>(IntegrationStatus.ACTIVE);
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createIntegration,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم التكامل", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        category: category as IntegrationCategory,
        apiUrl,
        apiKey,
        status: status as IntegrationStatus,
        info,
      });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      showToast(`تم إضافة التكامل ${created.name}`, "success");
      if (andClose) navigate({ to: "/settings/integrations" });
      else navigate({ to: "/settings/integrations/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات التكامل",
      content: (
        <FormSection title="بيانات التكامل">
          <FormRow>
            <FormField label="الاسم" required>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: بوابة الدفع"
              />
            </FormField>
            <FormField label="النوع">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {options("integrationCategory").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("integrationStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="وصف">
            <FormTextarea value={info} onChange={(e) => setInfo(e.target.value)} rows={2} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "connection",
      label: "الاتصال",
      content: (
        <FormSection title="بيانات الاتصال" description="تُحفظ بشكل آمن ولا تُعرض بعد الحفظ">
          <FormField label="رابط API">
            <FormInput value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} dir="ltr" />
          </FormField>
          <FormField label="المفتاح (API Key)">
            <FormInput
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              dir="ltr"
              placeholder="sk_live_..."
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التكاملات" breadcrumb={["الإعدادات", "التكاملات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/integrations" },
          { label: "التكاملات", to: "/settings/integrations" },
          { label: "تكامل جديد" },
        ]}
        title="تكامل جديد"
        subtitle={label("integrationCategory", category)}
        draftNumber="مسودة جديدة"
        status={{ label: label("integrationStatus", status), tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/settings/integrations" })}
      />
    </AppShell>
  );
}
