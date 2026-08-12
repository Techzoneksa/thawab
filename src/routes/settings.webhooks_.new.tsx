import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import { FormField, FormInput, FormSelect, FormSection } from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { options } from "@/lib/i18n/labels";
import { WebhookEvent } from "@/lib/enums";
import { createWebhook } from "@/lib/api/integrations";

export const Route = createFileRoute("/settings/webhooks_/new")({
  head: () => ({ meta: [{ title: "Webhook جديد — ثواب" }] }),
  component: NewWebhookPage,
});

function NewWebhookPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [ev, setEv] = useState<string>(WebhookEvent.DONATION_CREATED);
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createWebhook,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      showToast("يرجى تعبئة الاسم والرابط", "error");
      return;
    }
    setSaving(true);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        event: ev as WebhookEvent,
      });
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      showToast("تم إضافة الـ Webhook", "success");
      navigate({ to: "/settings/integrations" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الـ Webhook",
      content: (
        <FormSection
          title="Webhook"
          description="يُرسل النظام طلب POST إلى الرابط عند وقوع الحدث المحدّد"
        >
          <FormField label="الاسم" required>
            <FormInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="رابط Webhook URL" required>
            <FormInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              dir="ltr"
              placeholder="https://example.com/hook"
            />
          </FormField>
          <FormField label="الحدث">
            <FormSelect value={ev} onChange={(e) => setEv(e.target.value)}>
              {options("webhookEvent").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التكاملات" breadcrumb={["الإعدادات", "التكاملات", "Webhook جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/integrations" },
          { label: "التكاملات", to: "/settings/integrations" },
          { label: "Webhook جديد" },
        ]}
        title="Webhook جديد"
        subtitle={url || "أدخل رابط الـ Webhook"}
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="إضافة"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/settings/integrations" })}
      />
    </AppShell>
  );
}
