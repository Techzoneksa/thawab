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
import { EndowmentReturnStatus } from "@/lib/enums";
import {
  getEndowmentReturn,
  updateEndowmentReturn,
  type EndowmentReturnStatus as EndowmentReturnStatusType,
} from "@/lib/api/endowment-returns";

export const Route = createFileRoute("/endowment-returns_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل عائد وقف — ثواب" }] }),
  component: EditEndowmentReturnPage,
});

function EditEndowmentReturnPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["endowment-return", id],
    queryFn: () => getEndowmentReturn(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("0");
  const [status, setStatus] = useState<string>(EndowmentReturnStatus.REALIZED);
  const [date, setDate] = useState("");
  const [endowmentName, setEndowmentName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setPeriod(item.period);
      setAmount(String(item.amount));
      setStatus(item.status);
      setDate(item.date || "");
      setEndowmentName(item.endowmentName || "");
      setNotes(item.notes || "");
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateEndowmentReturn({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endowment-return", id] });
      queryClient.invalidateQueries({ queryKey: ["endowment-returns"] });
      showToast("تم تحديث عائد الوقف", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!period.trim()) {
      showToast("يرجى إدخال الفترة", "error");
      return;
    }
    if (!amount.trim()) {
      showToast("يرجى إدخال القيمة", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        period: period.trim(),
        amount: parseFloat(amount) || 0,
        status: status as EndowmentReturnStatusType,
        date,
        endowmentName,
        notes,
      });
      if (andClose) navigate({ to: "/endowment-returns" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="عوائد الأوقاف">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="عوائد الأوقاف">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">عائد الوقف غير موجود</div>
          <button
            onClick={() => navigate({ to: "/endowment-returns" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات عائد الوقف">
          <FormRow>
            <FormField label="الفترة" required>
              <FormInput value={period} onChange={(e) => setPeriod(e.target.value)} />
            </FormField>
            <FormField label="القيمة (ر.س)" required>
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("endowmentReturnStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="التاريخ">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "details",
      label: "التفاصيل",
      content: (
        <FormSection title="تفاصيل العائد">
          <FormField label="اسم الوقف">
            <FormInput value={endowmentName} onChange={(e) => setEndowmentName(e.target.value)} />
          </FormField>
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
            <FormSummaryLine label="الحالة" value={label("endowmentReturnStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="عوائد الأوقاف" breadcrumb={["المنح والأوقاف", "عوائد الأوقاف", item.period]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/endowment-returns" },
          { label: "عوائد الأوقاف", to: "/endowment-returns" },
          { label: item.period },
        ]}
        title={`العائد: ${item.period}`}
        subtitle={`${label("endowmentReturnStatus", item.status)} · ${fmtSAR(item.amount)}`}
        draftNumber={item.id}
        status={{
          label: label("endowmentReturnStatus", item.status),
          tone: statusTone(item.status),
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/endowment-returns" })}
      />
    </AppShell>
  );
}
