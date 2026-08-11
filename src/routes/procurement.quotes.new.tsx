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
import { SupplierStatus, PurchaseRequestStatus, QuoteStatus as QuoteStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { getPurchaseRequests, type PurchaseRequest } from "@/lib/api/purchase-requests";
import { createQuote, type QuoteStatus } from "@/lib/api/quotes";

export const Route = createFileRoute("/procurement/quotes/new")({
  head: () => ({ meta: [{ title: "عرض سعر جديد — ثواب" }] }),
  component: NewQuotePage,
});

function NewQuotePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const supQuery = useQuery({
    queryKey: ["suppliers-simple"],
    queryFn: () => getSuppliers({ limit: 1000 }),
  });
  const reqQuery = useQuery({
    queryKey: ["purchaseRequests-simple"],
    queryFn: () => getPurchaseRequests({ limit: 1000 }),
  });

  const suppliers: Supplier[] = (supQuery.data?.items || []).filter(
    (s) => s.status === SupplierStatus.ACTIVE,
  );
  const requests: PurchaseRequest[] = (reqQuery.data?.items || []).filter(
    (r) =>
      r.status === PurchaseRequestStatus.APPROVED ||
      r.status === PurchaseRequestStatus.SUBMITTED,
  );

  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [requestId, setRequestId] = useState("");
  const [price, setPrice] = useState("");
  const [delivery, setDelivery] = useState("");
  const [warranty, setWarranty] = useState("");
  const [rating, setRating] = useState("3");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatusEnum.PENDING);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSupplierChange = (sid: string) => {
    setSupplierId(sid);
    const s = suppliers.find((x) => x.id === sid);
    if (s) setSupplierName(s.name);
  };

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    const supplier = supplierName.trim();
    if (!supplier) errs.push("اسم المورد مطلوب");
    if (!price || parseFloat(price) <= 0) errs.push("السعر يجب أن يكون أكبر من صفر");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createQuote({
        supplierId: supplierId || undefined,
        supplier,
        requestId: requestId || undefined,
        price: parseFloat(price) || 0,
        delivery: delivery || undefined,
        warranty: warranty || undefined,
        rating: parseFloat(rating) || 0,
        validUntil: validUntil || undefined,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      showToast(`تم تسجيل عرض السعر`, "success");
      if (andClose) navigate({ to: "/procurement/quotes" });
      else navigate({ to: "/procurement/quotes/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات العرض",
      content: (
        <FormSection title="بيانات عرض السعر">
          <FormRow>
            <FormField label="المورد" required error={errors[0]}>
              <FormSelect value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}>
                <option value="">— اختر موردًا مسجلاً —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.activity ? `· ${s.activity}` : ""}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="اسم المورد (يدوي)" hint="إن لم يكن مسجلاً">
              <FormInput
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="اكتب اسم المورد هنا إذا لم تختر من القائمة"
              />
            </FormField>
          </FormRow>
          <FormField label="طلب الشراء المرتبط" hint="اختياري">
            <FormSelect value={requestId} onChange={(e) => setRequestId(e.target.value)}>
              <option value="">— لا يوجد —</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.subject} — {r.department}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormRow>
            <FormField label="السعر" required error={errors[1]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                dir="ltr"
                placeholder="0.00"
              />
            </FormField>
            <FormField label="صالح حتى">
              <FormInput
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="مدة التسليم">
              <FormInput
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                placeholder="مثال: 7 أيام"
              />
            </FormField>
            <FormField label="الضمان">
              <FormInput
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
                placeholder="مثال: سنة كاملة"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التقييم" hint="من 1 إلى 5">
              <FormInput
                type="number"
                min="0"
                max="5"
                step="0.5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
                {options("quoteStatus").map((o) => (
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
    <AppShell title="عروض الأسعار" breadcrumb={["المشتريات", "عروض الأسعار", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "عروض الأسعار", to: "/procurement/quotes" },
          { label: "عرض جديد" },
        ]}
        title="عرض سعر جديد"
        subtitle={supplierName || "أدخل بيانات العرض"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("quoteStatus", status),
          tone:
            status === QuoteStatusEnum.ACCEPTED
              ? "success"
              : status === QuoteStatusEnum.REJECTED
                ? "destructive"
                : "warning",
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
        onCancel={() => navigate({ to: "/procurement/quotes" })}
      />
    </AppShell>
  );
}
