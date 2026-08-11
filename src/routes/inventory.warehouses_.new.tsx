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
import { useAuth } from "@/lib/api/auth";
import { createWarehouse, type WarehouseStatus } from "@/lib/api/warehouses";
import { WarehouseStatus as WarehouseStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/inventory/warehouses_/new")({
  head: () => ({ meta: [{ title: "مستودع جديد — ثواب" }] }),
  component: NewWarehousePage,
});

function NewWarehousePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [manager, setManager] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [occupancy, setOccupancy] = useState("0");
  const [status, setStatus] = useState<WarehouseStatus>(WarehouseStatusEnum.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم المستودع مطلوب");
    if (!location.trim()) errs.push("موقع المستودع مطلوب");
    const cap = parseFloat(capacity) || 0;
    const occ = parseFloat(occupancy) || 0;
    if (cap < 0) errs.push("السعة يجب ألا تكون سالبة");
    if (occ < 0) errs.push("الإشغال يجب ألا يكون سالبًا");
    if (cap > 0 && occ > cap) errs.push("الإشغال لا يمكن أن يتجاوز السعة");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createWarehouse({
        name: name.trim(),
        location: location.trim(),
        manager: manager || undefined,
        capacity: cap,
        occupancy: occ,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast(`تم إنشاء المستودع ${created.name}`, "success");
      if (andClose) navigate({ to: "/inventory/warehouses" });
      else navigate({ to: "/inventory/warehouses/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات المستودع",
      content: (
        <FormSection title="بيانات المستودع">
          <FormRow>
            <FormField label="اسم المستودع" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: المستودع الرئيسي"
              />
            </FormField>
            <FormField label="الموقع" required error={errors[1]}>
              <FormInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="المدينة، الحي، الشارع"
              />
            </FormField>
          </FormRow>
          <FormField label="مدير المستودع">
            <FormInput
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="اسم الشخص المسؤول"
            />
          </FormField>
          <FormRow>
            <FormField label="السعة" hint="بالكيلو/قطعة" error={errors[2] || errors[4]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الإشغال الحالي" error={errors[3] || errors[4]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as WarehouseStatus)}
            >
              {options("warehouseStatus").map((o) => (
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
    <AppShell title="المستودعات" breadcrumb={["المخزون", "المستودعات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "المستودعات", to: "/inventory/warehouses" },
          { label: "مستودع جديد" },
        ]}
        title="مستودع جديد"
        subtitle={name || "أدخل بيانات المستودع"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("warehouseStatus", status),
          tone: status === WarehouseStatusEnum.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/inventory/warehouses" })}
      />
    </AppShell>
  );
}
