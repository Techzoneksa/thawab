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
import { EndowmentType, EndowmentStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createEndowment } from "@/lib/api/endowments";

export const Route = createFileRoute("/endowments_/new")({
  head: () => ({ meta: [{ title: "وقف جديد — ثواب" }] }),
  component: NewEndowmentPage,
});

function NewEndowmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(EndowmentType.GENERAL);
  const [value, setValue] = useState("");
  const [returns, setReturns] = useState("");
  const [status, setStatus] = useState<string>(EndowmentStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createEndowment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endowments"] });
      showToast("تم إضافة الوقف بنجاح", "success");
      navigate({ to: "/endowments" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم الوقف مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      type,
      value: Number(value) || 0,
      returns: Number(returns) || 0,
      status,
      notes: notes || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الوقف">
          <FormRow>
            <FormField label="اسم الوقف" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {options("endowmentType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="القيمة (ر.س)">
              <FormInput
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="العائد السنوي (ر.س)">
              <FormInput
                type="number"
                value={returns}
                onChange={(e) => setReturns(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("endowmentStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الأوقاف" breadcrumb={["المنح والأوقاف", "الأوقاف", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/endowments" },
          { label: "الأوقاف", to: "/endowments" },
          { label: "وقف جديد" },
        ]}
        title="وقف جديد"
        subtitle={name || "أدخل بيانات الوقف"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("endowmentStatus", status),
          tone: status === EndowmentStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/endowments" })}
      />
    </AppShell>
  );
}
