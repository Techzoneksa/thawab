import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { createInventoryItem, type ItemStatus } from "@/lib/api/inventory-items";
import { InventoryItemStatus, WarehouseStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/inventory/items_/new")({
  head: () => ({ meta: [{ title: "صنف جديد — ثواب" }] }),
  component: NewItemPage,
});

const CATEGORIES = [
  "مواد غذائية",
  "ملابس",
  "أجهزة إلكترونية",
  "أثاث",
  "مواد تنظيف",
  "أدوات مكتبية",
  "مستلزمات طبية",
  "أخرى",
];

function NewItemPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const whQuery = useQuery({
    queryKey: ["warehouses-simple"],
    queryFn: () => getWarehouses({ limit: 1000 }),
  });
  const warehouses: Warehouse[] = (whQuery.data?.items || []).filter(
    (w) => w.status === WarehouseStatus.ACTIVE,
  );

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("قطعة");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [price, setPrice] = useState("0");
  const [status, setStatus] = useState<ItemStatus>(InventoryItemStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم الصنف مطلوب");
    const qty = parseFloat(quantity) || 0;
    const min = parseFloat(minQuantity) || 0;
    if (qty < 0) errs.push("الكمية لا يمكن أن تكون سالبة");
    if (min < 0) errs.push("الحد الأدنى لا يمكن أن يكون سالبًا");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createInventoryItem({
        name: name.trim(),
        sku: sku || undefined,
        category: category || undefined,
        unit,
        warehouseId: warehouseId || undefined,
        quantity: qty,
        minQuantity: min,
        price: parseFloat(price) || 0,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast(`تم إضافة الصنف ${created.name}`, "success");
      if (andClose) navigate({ to: "/inventory/items" });
      else navigate({ to: "/inventory/items/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الصنف",
      content: (
        <FormSection title="بيانات الصنف">
          <FormRow>
            <FormField label="اسم الصنف" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: سكر 1 كجم"
              />
            </FormField>
            <FormField label="رمز SKU" hint="اختياري">
              <FormInput
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                dir="ltr"
                placeholder="SKU-001"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التصنيف">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— اختر —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="وحدة القياس">
              <FormInput
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="قطعة، كيلو، علبة..."
              />
            </FormField>
          </FormRow>
          <FormField label="المستودع الافتراضي">
            <FormSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— لا يوجد —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormRow>
            <FormField label="الكمية الحالية" error={errors[1]}>
              <FormInput
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحد الأدنى" hint="للتنبيه" error={errors[2]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="سعر الوحدة" hint="ر.س">
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
                {options("inventoryItemStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
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
    <AppShell title="الأصناف" breadcrumb={["المخزون", "الأصناف", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "الأصناف", to: "/inventory/items" },
          { label: "صنف جديد" },
        ]}
        title="صنف جديد"
        subtitle={name || "أدخل بيانات الصنف"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("inventoryItemStatus", status),
          tone: status === InventoryItemStatus.ACTIVE ? "success" : "muted",
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
        onCancel={() => navigate({ to: "/inventory/items" })}
      />
    </AppShell>
  );
}
