import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import {
  EnterpriseFormLayout,
  type EnterpriseTab,
} from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormSegmented,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { createDonor } from "@/lib/api/donors";

export const Route = createFileRoute("/donors/new")({
  head: () => ({ meta: [{ title: "متبرع جديد — ثواب" }] }),
  component: NewDonorPage,
});

const TYPES = ["فرد", "شركة", "مؤسسة", "جهة حكومية"] as const;
type DonorType = (typeof TYPES)[number];
const TAGS = ["عام", "VIP", "متكرر", "جديد", "متوسط", "غير نشط"];

function NewDonorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [type, setType] = useState<DonorType>("فرد");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [tag, setTag] = useState("جديد");
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم المتبرع مطلوب";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "بريد إلكتروني غير صالح";
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
      const created = await createDonor({
        name: name.trim(),
        type,
        phone: phone || undefined,
        email: email || undefined,
        city,
        address,
        tag,
        recurring,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast(`تم تسجيل المتبرع ${created.name}`, "success");
      if (andClose) navigate({ to: "/donors" });
      else navigate({ to: "/donors/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات المتبرع">
          <FormRow>
            <FormField label="الاسم" required error={errors.name}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
            </FormField>
            <FormField label="النوع" required>
              <FormSegmented<DonorType>
                value={type}
                onChange={setType}
                options={TYPES.map((t) => ({ value: t, label: t }))}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
            </FormField>
            <FormField label="البريد الإلكتروني" error={errors.email}>
              <FormInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                dir="ltr"
                invalid={!!errors.email}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المدينة">
              <FormInput value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
            <FormField label="العنوان">
              <FormInput value={address} onChange={(e) => setAddress(e.target.value)} />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "categorization",
      label: "التصنيف",
      content: (
        <FormSection title="تصنيف المتبرع">
          <FormField label="الوسم" hint="يستخدم لتصفية المتبرعين">
            <FormSelect value={tag} onChange={(e) => setTag(e.target.value)}>
              {TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="متبرع متكرر">
            <FormSegmented<"yes" | "no">
              value={recurring ? "yes" : "no"}
              onChange={(v) => setRecurring(v === "yes")}
              options={[
                { value: "yes", label: "نعم — متبرع متكرر" },
                { value: "no", label: "لا — تبرع لمرة واحدة" },
              ]}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "ملاحظات",
      content: (
        <FormSection title="ملاحظات داخلية">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المتبرعون" breadcrumb={["المتبرعون", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المتبرعون", to: "/donors" }, { label: "إضافة متبرع" }]}
        title="إضافة متبرع جديد"
        subtitle="سجّل بيانات المتبرع لإضافته إلى قاعدة بيانات المتبرعين"
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donors" })}
      />
    </AppShell>
  );
}
