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
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { NotificationTone } from "@/lib/enums";
import { createNotification } from "@/lib/api/notifications";

const TONE_BADGE: Record<string, "info" | "warning" | "destructive" | "success"> = {
  info: "info",
  warning: "warning",
  critical: "destructive",
  success: "success",
};

export const Route = createFileRoute("/notifications_/new")({
  head: () => ({ meta: [{ title: "تنبيه جديد — ثواب" }] }),
  component: NewNotificationPage,
});

function NewNotificationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<string>(NotificationTone.INFO);
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createNotification,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async () => {
    if (!title.trim()) {
      showToast("يرجى إدخال نص التنبيه", "error");
      return;
    }
    setSaving(true);
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        body: body || undefined,
        tone: tone as NotificationTone,
        link: link || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      showToast("تم إنشاء التنبيه ونشره", "success");
      navigate({ to: "/notifications" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات التنبيه",
      content: (
        <FormSection
          title="التنبيه"
          description="سيظهر لجميع المستخدمين في مركز التنبيهات وجرس الإشعارات"
        >
          <FormField label="نص التنبيه" required>
            <FormInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: اجتماع مجلس الإدارة يوم الأحد"
            />
          </FormField>
          <FormField label="التفاصيل">
            <FormTextarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="تفاصيل إضافية (اختياري)"
            />
          </FormField>
          <FormField label="النوع">
            <FormSelect value={tone} onChange={(e) => setTone(e.target.value)}>
              {options("notificationTone").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="رابط (اختياري)">
            <FormInput
              value={link}
              onChange={(e) => setLink(e.target.value)}
              dir="ltr"
              placeholder="/approvals"
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التنبيهات" breadcrumb={["الرئيسية", "التنبيهات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "التنبيهات", to: "/notifications" }, { label: "تنبيه جديد" }]}
        title="تنبيه جديد"
        subtitle={title || "أدخل نص التنبيه"}
        draftNumber="مسودة جديدة"
        status={{ label: label("notificationTone", tone), tone: TONE_BADGE[tone] ?? "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="نشر التنبيه"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/notifications" })}
      />
    </AppShell>
  );
}
