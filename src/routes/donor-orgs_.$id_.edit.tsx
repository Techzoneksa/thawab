import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { DonorOrgCategory, DonorOrgStatus } from "@/lib/enums";
import {
  getDonorOrg,
  updateDonorOrg,
  setDonorOrgStatus,
  type DonorOrgCategory as DonorOrgCategoryType,
  type DonorOrgStatus as DonorOrgStatusType,
} from "@/lib/api/donor-orgs";

export const Route = createFileRoute("/donor-orgs_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل جهة مانحة — ثواب" }] }),
  component: EditDonorOrgPage,
});

function EditDonorOrgPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["donor-org", id],
    queryFn: () => getDonorOrg(id),
    enabled: !!id,
  });

  const item = payload?.item;

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

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category);
      setContactPerson(item.contactPerson || "");
      setPhone(item.phone || "");
      setEmail(item.email || "");
      setGrantsCount(String(item.grantsCount));
      setTotalAmount(String(item.totalAmount));
      setStatus(item.status);
      setNotes(item.notes || "");
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateDonorOrg({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donor-org", id] });
      queryClient.invalidateQueries({ queryKey: ["donor-orgs"] });
      showToast("تم تحديث الجهة المانحة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "activate" | "deactivate") => setDonorOrgStatus({ id, action }),
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["donor-org", id] });
      queryClient.invalidateQueries({ queryKey: ["donor-orgs"] });
      showToast(action === "deactivate" ? "تم إيقاف الجهة" : "تم تفعيل الجهة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الجهة", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        category: category as DonorOrgCategoryType,
        contactPerson,
        phone,
        email,
        grantsCount: parseInt(grantsCount) || 0,
        totalAmount: parseFloat(totalAmount) || 0,
        status: status as DonorOrgStatusType,
        notes,
      });
      if (andClose) navigate({ to: "/donor-orgs" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="الجهات المانحة">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الجهات المانحة">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">الجهة المانحة غير موجودة</div>
          <button
            onClick={() => navigate({ to: "/donor-orgs" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const isActive = item.status === DonorOrgStatus.ACTIVE;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الجهة المانحة">
          <FormRow>
            <FormField label="اسم الجهة" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
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
        <FormSection title="ملخص المنح">
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
    {
      id: "audit",
      label: "سجل التدقيق",
      content: (
        <FormSection title="سجل التدقيق">
          <div className="space-y-0">
            <FormSummaryLine label="الحالة" value={label("donorOrgStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الجهات المانحة" breadcrumb={["المنح والأوقاف", "الجهات المانحة", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/donor-orgs" },
          { label: "الجهات المانحة", to: "/donor-orgs" },
          { label: item.name },
        ]}
        title={`الجهة: ${item.name}`}
        subtitle={`${label("donorOrgCategory", item.category)} · ${item.grantsCount} منحة · ${fmtSAR(item.totalAmount)}`}
        draftNumber={item.id}
        status={{ label: label("donorOrgStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donor-orgs" })}
        extraActions={
          isActive ? (
            <button
              type="button"
              onClick={() => statusMutation.mutate("deactivate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
            >
              إيقاف الجهة
            </button>
          ) : (
            <button
              type="button"
              onClick={() => statusMutation.mutate("activate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 text-success px-3 py-2 text-sm font-semibold hover:bg-success/20 transition-colors min-h-[40px]"
            >
              تفعيل الجهة
            </button>
          )
        }
      />
    </AppShell>
  );
}
