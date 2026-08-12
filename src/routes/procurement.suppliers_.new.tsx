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
import { SupplierStatus as SupplierStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createSupplier, type SupplierStatus } from "@/lib/api/suppliers";

export const Route = createFileRoute("/procurement/suppliers_/new")({
  head: () => ({ meta: [{ title: "مورد جديد — ثواب" }] }),
  component: NewSupplierPage,
});

function NewSupplierPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [buildingNo, setBuildingNo] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [additionalNo, setAdditionalNo] = useState("");
  const [rating, setRating] = useState("3");
  const [status, setStatus] = useState<SupplierStatus>(SupplierStatusEnum.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم المورد مطلوب");
    if (!activity.trim()) errs.push("نشاط المورد مطلوب");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createSupplier({
        name: name.trim(),
        activity: activity.trim(),
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        taxNumber: taxNumber || undefined,
        address: address || undefined,
        buildingNo: buildingNo || undefined,
        street: street || undefined,
        district: district || undefined,
        city: city || undefined,
        postalCode: postalCode || undefined,
        additionalNo: additionalNo || undefined,
        rating: parseFloat(rating) || 0,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast(`تم إنشاء المورد ${created.name}`, "success");
      if (andClose) navigate({ to: "/procurement/suppliers" });
      else navigate({ to: "/procurement/suppliers/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات المورد">
          <FormRow>
            <FormField label="اسم المورد" required>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: شركة النور للتجهيزات"
              />
            </FormField>
            <FormField label="نشاط المورد" required>
              <FormInput
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="مثال: توريد مواد غذائية"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الشخص المسؤول">
              <FormInput
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="اسم الشخص المسؤول"
              />
            </FormField>
            <FormField label="رقم الجوال" hint="يستخدم للاتصال">
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
                placeholder="supplier@example.com"
              />
            </FormField>
            <FormField label="الرقم الضريبي" hint="إن وجد">
              <FormInput
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                dir="ltr"
                placeholder="300XXXXXXXXX"
              />
            </FormField>
          </FormRow>
          <FormField label="العنوان">
            <FormInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="المدينة، الحي، الشارع"
            />
          </FormField>
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
              <FormSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierStatus)}
              >
                {options("supplierStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="أي ملاحظات إضافية حول المورد..."
            />
          </FormField>
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
              <FormInput
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="مثال: طريق الملك فهد"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحي">
              <FormInput
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="مثال: العليا"
              />
            </FormField>
            <FormField label="المدينة">
              <FormInput
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="مثال: الرياض"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الرمز البريدي" hint="5 أرقام">
              <FormInput
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                dir="ltr"
                placeholder="12345"
              />
            </FormField>
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
    <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "الموردين", to: "/procurement/suppliers" },
          { label: "مورد جديد" },
        ]}
        title="مورد جديد"
        subtitle={name || "أدخل بيانات المورد"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("supplierStatus", status),
          tone: status === SupplierStatusEnum.ACTIVE ? "success" : "muted",
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
        onCancel={() => navigate({ to: "/procurement/suppliers" })}
      />
    </AppShell>
  );
}
