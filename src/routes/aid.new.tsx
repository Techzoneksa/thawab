import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { getBeneficiaries } from "@/lib/api/beneficiaries";
import { getProjects } from "@/lib/api/projects";
import { createAidRecord } from "@/lib/api/aid";

export const Route = createFileRoute("/aid/new")({
  head: () => ({ meta: [{ title: "مساعدة جديدة — ثواب" }] }),
  component: NewAidPage,
});

const TYPES = ["مالية", "عينية", "غذائية", "طبية", "تعليمية", "إسكان", "كفالة"];
const DELIVERY_METHODS = ["تحويل بنكي", "نقدًا", "استلام شخصي", "توصيل", "بريد"];

function NewAidPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const search = useSearch({ from: "/aid/new" }) as { beneficiary?: string };

  const { data: beneficiariesData } = useQuery({
    queryKey: ["beneficiaries-simple"],
    queryFn: () => getBeneficiaries({ limit: 500 }),
  });
  const beneficiaries = beneficiariesData?.items || [];

  const { data: projectsData } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: () => getProjects({ limit: 200 }),
  });
  const projects = projectsData?.items || [];

  const [beneficiaryId, setBeneficiaryId] = useState(search.beneficiary || "");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("مالية");
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryMethod, setDeliveryMethod] = useState("تحويل بنكي");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!beneficiaryId) e.beneficiaryId = "يرجى اختيار المستفيد";
    if (!type) e.type = "يرجى اختيار نوع المساعدة";
    if (type === "مالية" && (!amount || parseFloat(amount) <= 0))
      e.amount = "يرجى إدخال مبلغ أكبر من صفر";
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
      const created = await createAidRecord({
        beneficiaryId,
        projectId: projectId || undefined,
        type,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast(`تم تسجيل المساعدة للمستفيد`, "success");
      if (andClose) navigate({ to: "/aid" });
      else navigate({ to: "/aid/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات المساعدة">
          <FormRow>
            <FormField label="المستفيد" required error={errors.beneficiaryId}>
              <FormSelect value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} invalid={!!errors.beneficiaryId}>
                <option value="">— اختر مستفيداً —</option>
                {beneficiaries
                  .filter((b) => b.status === "مؤهل" || b.status === "قيد المراجعة")
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.fileNumber ? `(${b.fileNumber})` : ""}
                    </option>
                  ))}
              </FormSelect>
            </FormField>
            <FormField label="تاريخ المساعدة">
              <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="نوع المساعدة" required error={errors.type}>
              <FormSelect value={type} onChange={(e) => setType(e.target.value)} invalid={!!errors.type}>
                {TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </FormSelect>
            </FormField>
            <FormField label="قيمة المساعدة (ر.س)" error={errors.amount} hint="للمساعدات المالية فقط">
              <FormInput
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={type !== "مالية"}
                dir="ltr"
                className="font-mono tabular-nums"
                invalid={!!errors.amount}
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "allocation",
      label: "المشروع والتخصيص",
      content: (
        <FormSection title="تخصيص المساعدة">
          <FormField label="المشروع">
            <FormSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— خارج مشروع (مساعدة عامة) —</option>
              {projects
                .filter((p) => p.status === "نشط" || p.status === "قيد التنفيذ")
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "delivery",
      label: "التسليم",
      content: (
        <FormSection title="طريقة التسليم">
          <FormField label="طريقة التسليم">
            <FormSelect value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}>
              {DELIVERY_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات"><FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} /></FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المساعدات" breadcrumb={["المساعدات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المساعدات", to: "/aid" }, { label: "مساعدة جديدة" }]}
        title="تسجيل مساعدة جديدة"
        subtitle="سجّل مساعدة لمستفيد من قاعدة البيانات"
        draftNumber="مسودة جديدة"
        status={{ label: "بانتظار الاعتماد", tone: "warning" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ كمسودة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/aid" })}
      />
    </AppShell>
  );
}
