import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { getBranch, updateBranch, type Branch } from "@/lib/api/branches";

export const Route = createFileRoute("/settings/branches_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل فرع — ثواب" }] }),
  component: EditBranchPage,
});

function EditBranchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["branchDetail", id],
    queryFn: () => getBranch(id),
  });
  const item: Branch | undefined = detailQuery.data?.item;

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
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setCity(item.city || "");
    setManager(item.manager || "");
    setPhone(item.phone || "");
    setEmail(item.email || "");
    setStatus(item.status || BranchStatus.ACTIVE);
    setBuildingNo(item.buildingNo || "");
    setStreet(item.street || "");
    setDistrict(item.district || "");
    setPostalCode(item.postalCode || "");
    setAdditionalNo(item.additionalNo || "");
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branchDetail", id] });
      showToast("تم حفظ التعديلات", "success");
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
    updateMut.mutate({
      id,
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
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="المدينة">
              <FormInput value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المدير">
              <FormInput value={manager} onChange={(e) => setManager(e.target.value)} />
            </FormField>
            <FormField label="الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
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
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الرقم الإضافي" hint="4 أرقام">
              <FormInput
                value={additionalNo}
                onChange={(e) => setAdditionalNo(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
  ];

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الفروع" breadcrumb={["الإعدادات", "الفروع"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الفروع" breadcrumb={["الإعدادات", "الفروع"]}>
        <div className="text-center py-12 text-muted-foreground">الفرع غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الفروع" breadcrumb={["الإعدادات", "الفروع", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الإعدادات", to: "/settings/org" },
          { label: "الفروع", to: "/settings/branches" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${item.city || ""} · ${item.phone || ""}`}
        draftNumber={item.id}
        status={{
          label: label("branchStatus", item.status),
          tone: statusTone(item.status),
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/settings/branches" })}
      />
    </AppShell>
  );
}
