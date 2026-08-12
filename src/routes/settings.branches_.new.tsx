import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { BranchStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createBranch } from "@/lib/api/branches";

export const Route = createFileRoute("/settings/branches_/new")({
  head: () => ({ meta: [{ title: "فرع جديد — ثواب" }] }),
  component: NewBranchPage,
});

function NewBranchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [manager, setManager] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>(BranchStatus.ACTIVE);
  const [buildingNo, setBuildingNo] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [additionalNo, setAdditionalNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      showToast("تم إضافة الفرع بنجاح", "success");
      navigate({ to: "/settings/branches" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم الفرع مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      name: name.trim(),
      city,
      manager,
      phone,
      email,
      status,
      buildingNo,
      street,
      district,
      postalCode,
      additionalNo,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الفرع">
          <FormRow>
            <FormField label="اسم الفرع" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فرع جدة"
              />
            </FormField>
            <FormField label="المدينة">
              <FormInput
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="مثال: جدة"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المدير">
              <FormInput value={manager} onChange={(e) => setManager(e.target.value)} />
            </FormField>
            <FormField label="الجوال">
              <FormInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                placeholder="05XXXXXXXX"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="البريد الإلكتروني">
              <FormInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("branchStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "national-address",
      label: "العنوان الوطني",
      content: (
        <FormSection title="العنوان الوطني السعودي">
          <FormRow>
            <FormField label="رقم المبنى" hint="4 أرقام">
              <FormInput
                value={buildingNo}
                onChange={(e) => setBuildingNo(e.target.value)}
                dir="ltr"
                placeholder="1234"
              />
            </FormField>
            <FormField label="اسم الشارع">
              <FormInput value={street} onChange={(e) => setStreet(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحي">
              <FormInput value={district} onChange={(e) => setDistrict(e.target.value)} />
            </FormField>
            <FormField label="الرمز البريدي" hint="5 أرقام">
              <FormInput
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                dir="ltr"
                placeholder="12345"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الرقم الإضافي" hint="4 أرقام">
              <FormInput
                value={additionalNo}
                onChange={(e) => setAdditionalNo(e.target.value)}
                dir="ltr"
                placeholder="6789"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الفروع" breadcrumb={["الإعدادات", "الفروع", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/org" },
          { label: "الفروع", to: "/settings/branches" },
          { label: "فرع جديد" },
        ]}
        title="فرع جديد"
        subtitle={name || "أدخل بيانات الفرع"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("branchStatus", status),
          tone: status === BranchStatus.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/settings/branches" })}
      />
    </AppShell>
  );
}
