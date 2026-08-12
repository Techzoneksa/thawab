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
import { GrantStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createGrant } from "@/lib/api/grants";

export const Route = createFileRoute("/grants_/new")({
  head: () => ({ meta: [{ title: "منحة جديدة — ثواب" }] }),
  component: NewGrantPage,
});

function NewGrantPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [donor, setDonor] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string>(GrantStatus.ACTIVE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createGrant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] });
      showToast("تم إضافة المنحة بنجاح", "success");
      navigate({ to: "/grants" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم المنحة مطلوب");
    if (!donor.trim()) errs.push("الجهة المانحة مطلوبة");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      donor: donor.trim(),
      amount: Number(amount) || 0,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      notes: notes || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات المنحة">
          <FormRow>
            <FormField label="اسم المنحة" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="الجهة المانحة" required error={errors[1]}>
              <FormInput value={donor} onChange={(e) => setDonor(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="قيمة المنحة (ر.س)">
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("grantStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
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
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المنح" breadcrumb={["المنح والأوقاف", "المنح", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/grants" },
          { label: "المنح", to: "/grants" },
          { label: "منحة جديدة" },
        ]}
        title="منحة جديدة"
        subtitle={name || "أدخل بيانات المنحة"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("grantStatus", status),
          tone: status === GrantStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/grants" })}
      />
    </AppShell>
  );
}
