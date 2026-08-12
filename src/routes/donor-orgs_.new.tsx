import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
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
import { label, options } from "@/lib/i18n/labels";
import { DonorOrgCategory, DonorOrgStatus } from "@/lib/enums";
import { createDonorOrg } from "@/lib/api/donor-orgs";

export const Route = createFileRoute("/donor-orgs_/new")({
  head: () => ({ meta: [{ title: "جهة مانحة جديدة — ثواب" }] }),
  component: NewDonorOrgPage,
});

function NewDonorOrgPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(DonorOrgCategory.GOVERNMENT);
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [grantsCount, setGrantsCount] = useState("0");
  const [totalAmount, setTotalAmount] = useState("0");
  const [status, setStatus] = useState<string>(DonorOrgStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createDonorOrg,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الجهة", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        category: category as DonorOrgCategory,
        contactPerson,
        phone,
        email,
        grantsCount: parseInt(grantsCount) || 0,
        totalAmount: parseFloat(totalAmount) || 0,
        status: status as DonorOrgStatus,
        notes,
      });
      queryClient.invalidateQueries({ queryKey: ["donor-orgs"] });
      showToast(`تم إضافة الجهة المانحة ${created.name}`, "success");
      if (andClose) navigate({ to: "/donor-orgs" });
      else navigate({ to: "/donor-orgs/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات الجهة المانحة">
          <FormRow>
            <FormField label="اسم الجهة" required>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: الصندوق الخيري الوطني"
              />
            </FormField>
            <FormField label="الفئة">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {options("donorOrgCategory").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("donorOrgStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "contact",
      label: "بيانات التواصل",
      content: (
        <FormSection title="جهة الاتصال">
          <FormField label="مسؤول التواصل">
            <FormInput value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="الهاتف">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <FormInput value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "grants",
      label: "المنح",
      content: (
        <FormSection title="ملخص المنح" description="القيم الأولية — تُحدّث لاحقاً مع ربط المنح">
          <FormRow>
            <FormField label="عدد المنح">
              <FormInput
                type="number"
                value={grantsCount}
                onChange={(e) => setGrantsCount(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="إجمالي القيمة (ر.س)">
              <FormInput
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الجهات المانحة" breadcrumb={["المنح والأوقاف", "الجهات المانحة", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/donor-orgs" },
          { label: "الجهات المانحة", to: "/donor-orgs" },
          { label: "جهة جديدة" },
        ]}
        title="جهة مانحة جديدة"
        subtitle={`${label("donorOrgCategory", category)} · ${fmtSAR(parseFloat(totalAmount) || 0)}`}
        draftNumber="مسودة جديدة"
        status={{ label: label("donorOrgStatus", status), tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donor-orgs" })}
      />
    </AppShell>
  );
}
