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
import { RecurringFrequency, RecurringStatus } from "@/lib/enums";
import {
  getRecurringOne,
  updateRecurring,
  setRecurringStatus,
  type RecurringFrequency as RecurringFrequencyType,
  type RecurringStatus as RecurringStatusType,
} from "@/lib/api/recurring";

export const Route = createFileRoute("/recurring_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل تبرع متكرر — ثواب" }] }),
  component: EditRecurringPage,
});

function EditRecurringPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["recurring", id],
    queryFn: () => getRecurringOne(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("0");
  const [frequency, setFrequency] = useState<string>(RecurringFrequency.MONTHLY);
  const [status, setStatus] = useState<string>(RecurringStatus.ACTIVE);
  const [projectName, setProjectName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [nextRunDate, setNextRunDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setDonorName(item.donorName);
      setAmount(String(item.amount));
      setFrequency(item.frequency);
      setStatus(item.status);
      setProjectName(item.projectName || "");
      setStartDate(item.startDate || "");
      setNextRunDate(item.nextRunDate || "");
      setNotes(item.notes || "");
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateRecurring({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring", id] });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast("تم تحديث التبرع المتكرر", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "activate" | "pause") => setRecurringStatus({ id, action }),
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["recurring", id] });
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast(
        action === "pause" ? "تم إيقاف التبرع المتكرر" : "تم تفعيل التبرع المتكرر",
        "success",
      );
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!donorName.trim()) {
      showToast("يرجى إدخال اسم المتبرع", "error");
      return;
    }
    if (!amount.trim() || !(parseFloat(amount) > 0)) {
      showToast("يرجى إدخال المبلغ", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        donorName: donorName.trim(),
        amount: parseFloat(amount) || 0,
        frequency: frequency as RecurringFrequencyType,
        status: status as RecurringStatusType,
        projectName,
        startDate,
        nextRunDate,
        notes,
      });
      if (andClose) navigate({ to: "/recurring" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="التبرعات المتكررة">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="التبرعات المتكررة">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">التبرع المتكرر غير موجود</div>
          <button
            onClick={() => navigate({ to: "/recurring" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const isActive = item.status === RecurringStatus.ACTIVE;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات التبرع المتكرر">
          <FormRow>
            <FormField label="اسم المتبرع" required>
              <FormInput value={donorName} onChange={(e) => setDonorName(e.target.value)} />
            </FormField>
            <FormField label="المبلغ (ر.س)" required>
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التكرار">
              <FormSelect value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {options("recurringFrequency").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("recurringStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "schedule",
      label: "الجدولة",
      content: (
        <FormSection title="جدولة الخصم">
          <FormField label="المشروع">
            <FormInput value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="تاريخ البدء">
              <FormInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الخصم القادم">
              <FormInput
                type="date"
                value={nextRunDate}
                onChange={(e) => setNextRunDate(e.target.value)}
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
            <FormSummaryLine label="الحالة" value={label("recurringStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell
      title="التبرعات المتكررة"
      breadcrumb={["التبرعات", "التبرعات المتكررة", item.donorName]}
    >
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/recurring" },
          { label: "التبرعات المتكررة", to: "/recurring" },
          { label: item.donorName },
        ]}
        title={`التبرع: ${item.donorName}`}
        subtitle={`${label("recurringFrequency", item.frequency)} · ${fmtSAR(item.amount)}`}
        draftNumber={item.code}
        status={{ label: label("recurringStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/recurring" })}
        extraActions={
          isActive ? (
            <button
              type="button"
              onClick={() => statusMutation.mutate("pause")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
            >
              إيقاف
            </button>
          ) : (
            <button
              type="button"
              onClick={() => statusMutation.mutate("activate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 text-success px-3 py-2 text-sm font-semibold hover:bg-success/20 transition-colors min-h-[40px]"
            >
              تفعيل
            </button>
          )
        }
      />
    </AppShell>
  );
}
