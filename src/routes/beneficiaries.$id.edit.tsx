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
  ELIGIBILITY_STATUSES,
  MARITAL_STATUSES,
  type EligibilityStatus,
} from "@/lib/api/beneficiaries";

export const Route = createFileRoute("/beneficiaries/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل مستفيد — ثواب" }] }),
  component: EditBeneficiaryPage,
});

function EditBeneficiaryPage() {
  const { id } = useParams({ from: "/beneficiaries/$id/edit" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: beneficiary, isLoading } = useQuery({
    queryKey: ["beneficiary", id],
    queryFn: () => getBeneficiary(id),
    enabled: !!id,
  });

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (beneficiary) {
      setName(beneficiary.name || "");
      setFileNumber(beneficiary.fileNumber || "");
      setIdNumber(beneficiary.idNumber || "");
      setPhone(beneficiary.phone || "");
      setCity(beneficiary.city || "");
      setAddress(beneficiary.address || "");
      setCategory(beneficiary.category || "أسرة");
      setStatus(beneficiary.status || "جديد");
      setFamilyMembers(String(beneficiary.familyMembers || 1));
      setMonthlyIncome(String(beneficiary.monthlyIncome || 0));
      setMaritalStatus(beneficiary.maritalStatus || "أعزب");
      setNotes(beneficiary.notes || "");
    }
  }, [beneficiary]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateBeneficiary({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiary", id] });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم تحديث المستفيد بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name,
        fileNumber,
        idNumber,
        phone,
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
      if (andClose) navigate({ to: "/beneficiaries" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="المستفيدون" breadcrumb={["المستفيدون", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!beneficiary) {
    return (
      <AppShell title="المستفيدون" breadcrumb={["المستفيدون"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المستفيد غير موجود</div>
          <button onClick={() => navigate({ to: "/beneficiaries" })} className="text-primary hover:underline text-sm">
            العودة إلى المستفيدين
          </button>
        </div>
      </AppShell>
    );
  }

  const aidHistory = beneficiary.aidHistory || [];

  const tabs: EnterpriseTab[] = [
    {
      id: "personal",
      label: "البيانات الشخصية",
      content: (
        <FormSection title="بيانات المستفيد">
          <FormRow>
            <FormField label="الاسم"><FormInput value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="رقم الملف"><FormInput value={fileNumber} onChange={(e) => setFileNumber(e.target.value)} dir="ltr" className="font-mono" /></FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الهوية"><FormInput value={idNumber} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" className="font-mono" /></FormField>
            <FormField label="رقم الجوال"><FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" /></FormField>
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
          <FormField label="حالة الأهلية">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value as EligibilityStatus)}>
              {ELIGIBILITY_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "aid",
      label: "تاريخ المساعدات",
      badge: aidHistory.length || undefined,
      content: (
        <FormSection title="المساعدات السابقة">
          {aidHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">لم يتلقَ هذا المستفيد أي مساعدات بعد.</p>
          ) : (
            <div className="space-y-2">
              {aidHistory.slice(0, 20).map((a) => (
                <div key={a.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{a.type}</span>
                    <span className="font-bold tabular-nums">{fmtSAR(a.amount)}</span>
                  </div>
                  {a.date && <div className="text-xs text-muted-foreground mt-1">{a.date}</div>}
                </div>
              ))}
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "الملخص",
      content: (
        <FormSection title="إحصاءات المستفيد">
          <div className="space-y-0">
            <FormSummaryLine label="إجمالي المساعدات" value={fmtSAR(beneficiary.totalAid ?? 0)} tone="success" />
            <FormSummaryLine label="عدد المساعدات" value={fmtNum(beneficiary.aidCount ?? 0)} />
            <FormSummaryLine label="مساعدات قيد الانتظار" value={fmtNum(beneficiary.pendingAidCount ?? 0)} />
            <FormSummaryLine label="آخر مساعدة" value={beneficiary.lastAidDate || "—"} />
            <FormSummaryLine label="تاريخ التسجيل" value={beneficiary.createdAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={beneficiary.createdBy || "—"} />
          </div>
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
    <AppShell title="المستفيدون" breadcrumb={["المستفيدون", beneficiary.name]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المستفيدون", to: "/beneficiaries" }, { label: beneficiary.name }]}
        title={beneficiary.name}
        subtitle={`${beneficiary.category} · ${beneficiary.city || "—"} · ${fmtNum(parseInt(familyMembers) || 0)} أفراد`}
        draftNumber={beneficiary.fileNumber || beneficiary.id}
        status={{ label: beneficiary.status, tone: statusTone(beneficiary.status) }}
        tabs={tabs}
        defaultTab="personal"
        loading={saving || updateMutation.isPending}
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
