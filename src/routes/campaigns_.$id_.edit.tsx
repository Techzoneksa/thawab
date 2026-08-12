import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CampaignStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { getCampaign, updateCampaign, type Campaign } from "@/lib/api/campaigns";

export const Route = createFileRoute("/campaigns_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل حملة — ثواب" }] }),
  component: EditCampaignPage,
});

function EditCampaignPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["campaignDetail", id],
    queryFn: () => getCampaign(id),
  });
  const item: Campaign | undefined = detailQuery.data?.item;

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<string>(CampaignStatus.ACTIVE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setGoal(String(item.goal || 0));
    setStatus(item.status || CampaignStatus.ACTIVE);
    setStartDate(item.startDate || "");
    setEndDate(item.endDate || "");
    setDescription(item.description || "");
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaignDetail", id] });
      showToast("تم حفظ التعديلات", "success");
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
    updateMut.mutate({
      id,
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
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
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

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الحملات" breadcrumb={["التبرعات", "الحملات"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الحملات" breadcrumb={["التبرعات", "الحملات"]}>
        <div className="text-center py-12 text-muted-foreground">الحملة غير موجودة</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الحملات" breadcrumb={["التبرعات", "الحملات", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/donations" },
          { label: "الحملات", to: "/campaigns" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={item.description || "تعديل بيانات الحملة"}
        draftNumber={item.id}
        status={{ label: label("campaignStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/campaigns" })}
      />
    </AppShell>
  );
}
