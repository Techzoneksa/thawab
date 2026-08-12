import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { IntegrationStatus } from "@/lib/enums";
import { getIntegration, updateIntegration, setIntegrationStatus } from "@/lib/api/integrations";

export const Route = createFileRoute("/settings/integrations_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل تكامل — ثواب" }] }),
  component: EditIntegrationPage,
});

function EditIntegrationPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["integration", id],
    queryFn: () => getIntegration(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setApiUrl(item.apiUrl || "");
      setStatus(item.status);
      setInfo(item.info || "");
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateIntegration({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration", id] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      showToast("تم تحديث التكامل", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "activate" | "deactivate") => setIntegrationStatus(id, action),
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["integration", id] });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      showToast(action === "deactivate" ? "تم تعطيل التكامل" : "تم تفعيل التكامل", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم التكامل", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        category,
        apiUrl,
        // Only send the key when the admin typed a new one.
        ...(apiKey ? { apiKey } : {}),
        status,
        info,
      });
      setApiKey("");
      if (andClose) navigate({ to: "/settings/integrations" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="التكاملات">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="التكاملات">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">التكامل غير موجود</div>
          <button
            onClick={() => navigate({ to: "/settings/integrations" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const isActive = item.status === IntegrationStatus.ACTIVE;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات التكامل",
      content: (
        <FormSection title="بيانات التكامل">
          <FormRow>
            <FormField label="الاسم" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
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
        <FormSection title="بيانات الاتصال">
          <FormField label="رابط API">
            <FormInput value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} dir="ltr" />
          </FormField>
          <FormField label="المفتاح (API Key)">
            <FormInput
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              dir="ltr"
              placeholder={item.hasKey ? "•••••••• (اتركه فارغاً للإبقاء)" : "sk_live_..."}
            />
          </FormField>
          <FormSummaryLine label="مفتاح محفوظ" value={item.hasKey ? "نعم" : "لا"} />
        </FormSection>
      ),
    },
    {
      id: "info",
      label: "معلومات",
      content: (
        <FormSection title="معلومات التكامل">
          <div className="space-y-0">
            <FormSummaryLine label="النوع" value={label("integrationCategory", item.category)} />
            <FormSummaryLine label="الحالة" value={label("integrationStatus", item.status)} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt || "—"} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التكاملات" breadcrumb={["الإعدادات", "التكاملات", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/integrations" },
          { label: "التكاملات", to: "/settings/integrations" },
          { label: item.name },
        ]}
        title={`التكامل: ${item.name}`}
        subtitle={label("integrationCategory", item.category)}
        draftNumber={item.id}
        status={{ label: label("integrationStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/settings/integrations" })}
        extraActions={
          isActive ? (
            <button
              type="button"
              onClick={() => statusMutation.mutate("deactivate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
            >
              تعطيل
            </button>
          ) : (
            <button
              type="button"
              onClick={() => statusMutation.mutate("activate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 text-success px-3 py-2 text-sm font-semibold hover:bg-success/20 transition-colors min-h-[40px]"
            >
              تفعيل
            </button>
          )
        }
      />
    </AppShell>
  );
}
