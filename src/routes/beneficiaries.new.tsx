import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, Badge, statusTone } from "@/components/erp/AppShell";
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  EnterpriseFormLayout,
  type EnterpriseTab,
} from "@/components/erp/EnterpriseFormLayout";
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
import { useAuth } from "@/lib/api/auth";
import {
  getBeneficiary,
  updateBeneficiary,
  createBeneficiary,
  ELIGIBILITY_STATUSES,
  MARITAL_STATUSES,
  type EligibilityStatus,
} from "@/lib/api/beneficiaries";

export const Route = createFileRoute("/beneficiaries/new")({
  head: () => ({ meta: [{ title: "مستفيد جديد — ثواب" }] }),
  component: NewBeneficiaryPage,
});

function NewBeneficiaryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [fileNumber, setFileNumber] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("أسرة");
  const [status, setStatus] = useState<EligibilityStatus>("جديد");
  const [familyMembers, setFamilyMembers] = useState("1");
  const [monthlyIncome, setMonthlyIncome] = useState("0");
  const [maritalStatus, setMaritalStatus] = useState("أعزب");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم المستفيد مطلوب";
    if (!phone && !idNumber) e.phone = "رقم الجوال أو الهوية مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (andClose: boolean) => {
    if (!validate()) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createBeneficiary({
        name: name.trim(),
        fileNumber: fileNumber || undefined,
        idNumber: idNumber || undefined,
        phone: phone || undefined,
        city,
        address,
        category,
        status,
        familyMembers: parseInt(familyMembers) || 1,
        monthlyIncome: parseFloat(monthlyIncome) || 0,
        maritalStatus,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast(`تم تسجيل المستفيد ${created.name}`, "success");
      if (andClose) navigate({ to: "/beneficiaries" });
      else navigate({ to: "/beneficiaries/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "personal",
      label: "البيانات الشخصية",
      content: (
        <FormSection title="بيانات المستفيد">
          <FormRow>
            <FormField label="الاسم" required error={errors.name}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
            </FormField>
            <FormField label="رقم الملف">
              <FormInput value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} dir="ltr" className="font-mono" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الهوية">
              <FormInput value={idNumber} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" className="font-mono" />
            </FormField>
            <FormField label="رقم الجوال" error={errors.phone}>
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" invalid={!!errors.phone} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المدينة"><FormInput value={city} onChange={(e) => setCity(e.target.value)} /></FormField>
            <FormField label="العنوان"><FormInput value={address} onChange={(e) => setAddress(e.target.value)} /></FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "family",
      label: "بيانات الأسرة",
      content: (
        <FormSection title="الحالة الأسرية والمالية">
          <FormRow>
            <FormField label="الحالة الاجتماعية">
              <FormSelect value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                {MARITAL_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </FormSelect>
            </FormField>
            <FormField label="عدد أفراد الأسرة">
              <FormInput type="number" min="1" value={familyMembers} onChange={(e) => setFamilyMembers(e.target.value)} dir="ltr" className="font-mono tabular-nums" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الدخل الشهري (ر.س)">
              <FormInput type="number" step="0.01" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} dir="ltr" className="font-mono tabular-nums" />
            </FormField>
            <FormField label="فئة المستفيد">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="أسرة">أسرة</option>
                <option value="يتيم">يتيم</option>
                <option value="أرملة">أرملة</option>
                <option value="مطلق">مطلق</option>
                <option value="معاق">معاق</option>
                <option value="طالب">طالب</option>
                <option value="أخرى">أخرى</option>
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "eligibility",
      label: "الأهلية والحالة",
      content: (
        <FormSection title="حالة الأهلية">
          <FormField label="حالة الأهلية" hint="تستخدم لتحديد الأهلية لتلقي المساعدات">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value as EligibilityStatus)}>
              {ELIGIBILITY_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </FormSelect>
          </FormField>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">ملاحظة:</strong> الأهلية تُحدّث آلياً بناءً على معايير الجمعية.
            الحالة الحالية هي «{status}».
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المستفيدون" breadcrumb={["المستفيدون", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المستفيدون", to: "/beneficiaries" }, { label: "إضافة مستفيد" }]}
        title="إضافة مستفيد جديد"
        subtitle="سجّل بيانات المستفيد لإضافته إلى قاعدة بيانات المستفيدين"
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="personal"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/beneficiaries" })}
      />
    </AppShell>
  );
}
