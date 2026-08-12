import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { options } from "@/lib/i18n/labels";
import { BackupFrequency } from "@/lib/enums";
import { getBackup, updateBackupConfig } from "@/lib/api/backup";

export const Route = createFileRoute("/settings/backup_/settings")({
  head: () => ({ meta: [{ title: "إعدادات النسخ الاحتياطي — ثواب" }] }),
  component: BackupSettingsPage,
});

function BackupSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["backup"], queryFn: getBackup });
  const config = data?.config;

  const [frequency, setFrequency] = useState<string>(BackupFrequency.DAILY);
  const [time, setTime] = useState("03:00");
  const [retention, setRetention] = useState("30");
  const [location, setLocation] = useState("السعودية");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setFrequency(config.frequency);
      setTime(config.time);
      setRetention(String(config.retention));
      setLocation(config.location || "");
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: updateBackupConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backup"] });
      showToast("تم حفظ إعدادات النسخ الاحتياطي", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        frequency: frequency as BackupFrequency,
        time,
        retention: parseInt(retention) || 30,
        location,
      });
      if (andClose) navigate({ to: "/settings/backup" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "جدولة النسخ",
      content: (
        <FormSection
          title="جدولة النسخ الاحتياطي"
          description="يقوم الخادم بتنفيذ النسخ تلقائياً وفق هذه الإعدادات"
        >
          <FormRow>
            <FormField label="التكرار">
              <FormSelect value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {options("backupFrequency").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الوقت">
              <FormInput
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الاحتفاظ بـ (عدد النسخ)">
              <FormInput
                type="number"
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="موقع التخزين">
              <FormInput value={location} onChange={(e) => setLocation(e.target.value)} />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
  ];

  if (isLoading) {
    return (
      <AppShell title="النسخ الاحتياطي">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="النسخ الاحتياطي" breadcrumb={["الإعدادات", "النسخ الاحتياطي", "الإعدادات"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/backup" },
          { label: "النسخ الاحتياطي", to: "/settings/backup" },
          { label: "الإعدادات" },
        ]}
        title="إعدادات النسخ الاحتياطي"
        subtitle="جدولة النسخ التلقائي ومدة الاحتفاظ"
        status={{ label: "إعدادات", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/settings/backup" })}
      />
    </AppShell>
  );
}
