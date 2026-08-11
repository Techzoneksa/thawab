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
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { createProject } from "@/lib/api/projects";
import { ProjectStatus } from "@/lib/enums";
import { options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/projects_/new")({
  head: () => ({ meta: [{ title: "مشروع جديد — ثواب" }] }),
  component: NewProjectPage,
});

const STATUS_OPTIONS = options("projectStatus");
const CATEGORIES = ["إغاثي", "تنموي", "تعليمي", "صحي", "كفالة", "رعاية أيتام", "إسكان", "أخرى"];

function NewProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("تنموي");
  const [category, setCategory] = useState("أخرى");
  const [branch, setBranch] = useState("الفرع الرئيسي");
  const [manager, setManager] = useState("");
  const [budget, setBudget] = useState("0");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<string>(ProjectStatus.ACTIVE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم المشروع مطلوب";
    if (!code.trim()) e.code = "رمز المشروع مطلوب";
    if (!startDate) e.startDate = "تاريخ البدء مطلوب";
    if (endDate && startDate && new Date(endDate) < new Date(startDate))
      e.endDate = "تاريخ النهاية يجب أن يكون بعد تاريخ البدء";
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
      const created = await createProject({
        name: name.trim(),
        code: code.trim(),
        type,
        category,
        branch,
        manager,
        budget: parseFloat(budget) || 0,
        startDate,
        endDate,
        status,
        description,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast(`تم إنشاء المشروع ${created.name}`, "success");
      if (andClose) navigate({ to: "/projects" });
      else navigate({ to: "/projects/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات المشروع">
          <FormRow>
            <FormField label="اسم المشروع" required error={errors.name}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
            </FormField>
            <FormField label="الرمز" required error={errors.code} hint="مثال: PRJ-2026-001">
              <FormInput value={code} onChange={(e) => setCode(e.target.value)} invalid={!!errors.code} dir="ltr" className="font-mono" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التصنيف">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </FormSelect>
            </FormField>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                <option value="إغاثي">إغاثي</option>
                <option value="تنموي">تنموي</option>
                <option value="مستدام">مستدام</option>
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الفرع">
              <FormSelect value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="الفرع الرئيسي">الفرع الرئيسي</option>
                <option value="فرع المنطقة الشمالية">فرع المنطقة الشمالية</option>
                <option value="فرع المنطقة الجنوبية">فرع المنطقة الجنوبية</option>
              </FormSelect>
            </FormField>
            <FormField label="مدير المشروع">
              <FormInput value={manager} onChange={(e) => setManager(e.target.value)} />
            </FormField>
          </FormRow>
          <FormField label="الوصف">
            <FormTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "budget",
      label: "الميزانية والجدول",
      content: (
        <FormSection title="الميزانية والجدول الزمني">
          <FormRow>
            <FormField label="الميزانية المعتمدة (ر.س)">
              <FormInput
                type="number"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                dir="ltr"
                className="font-mono tabular-nums"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="تاريخ البدء" required error={errors.startDate}>
              <FormInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" invalid={!!errors.startDate} />
            </FormField>
            <FormField label="تاريخ النهاية المتوقع" error={errors.endDate}>
              <FormInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" invalid={!!errors.endDate} />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
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
    <AppShell title="المشاريع" breadcrumb={["المشاريع", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المشاريع", to: "/projects" }, { label: "مشروع جديد" }]}
        title="مشروع جديد"
        subtitle="أنشئ مشروعاً جديداً لتخصيص التبرعات والمساعدات له"
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
        onCancel={() => navigate({ to: "/projects" })}
      />
    </AppShell>
  );
}
