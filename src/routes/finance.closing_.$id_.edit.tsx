import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtNum } from "@/data/sample";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormTextarea,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { label } from "@/lib/i18n/labels";
import { FiscalPeriodStatus } from "@/lib/enums";
import { getPeriod, updatePeriod, closePeriod, reopenPeriod } from "@/lib/api/periods";

export const Route = createFileRoute("/finance/closing_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل فترة مالية — ثواب" }] }),
  component: EditPeriodPage,
});

function EditPeriodPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["period", id],
    queryFn: () => getPeriod(id),
    enabled: !!id,
  });

  const item = payload?.item;
  const stats = payload?.stats;

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "reopen" | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setStartDate(item.startDate);
      setEndDate(item.endDate);
      setNotes(item.notes || "");
    }
  }, [item]);

  const isOpen = item?.status === FiscalPeriodStatus.OPEN;
  const isClosed = item?.status === FiscalPeriodStatus.CLOSED;

  const updateMutation = useMutation({
    mutationFn: (data: any) => updatePeriod({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["period", id] });
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم تحديث الفترة المالية", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closePeriod({ id, notes: closeNotes, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["period", id] });
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم إقفال الفترة المالية", "success");
      setConfirm(null);
      setCloseNotes("");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenPeriod({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["period", id] });
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم إعادة فتح الفترة المالية", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!isOpen) {
      showToast("لا يمكن تعديل فترة مقفلة. أعد فتحها أولاً.", "error");
      return;
    }
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الفترة", "error");
      return;
    }
    if (startDate > endDate) {
      showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        startDate,
        endDate,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/finance/closing" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="الإقفال المالي">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الإقفال المالي">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">الفترة المالية غير موجودة</div>
          <button
            onClick={() => navigate({ to: "/finance/closing" })}
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
      label: "بيانات الفترة",
      content: (
        <FormSection title="بيانات الفترة المالية">
          <FormField label="اسم الفترة" required>
            <FormInput value={name} onChange={(e) => setName(e.target.value)} disabled={!isOpen} />
          </FormField>
          <FormRow>
            <FormField label="تاريخ البداية" required>
              <FormInput
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
                disabled={!isOpen}
              />
            </FormField>
            <FormField label="تاريخ النهاية" required>
              <FormInput
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                dir="ltr"
                disabled={!isOpen}
              />
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={!isOpen}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "stats",
      label: "إحصائيات القيود",
      content: (
        <FormSection title="القيود ضمن الفترة">
          <div className="space-y-0">
            <FormSummaryLine label="إجمالي القيود" value={fmtNum(stats?.totalEntries ?? 0)} />
            <FormSummaryLine
              label="قيود مرحّلة"
              value={fmtNum(stats?.postedEntries ?? 0)}
              tone="success"
            />
            <FormSummaryLine
              label="قيود مسودة"
              value={fmtNum(stats?.draftEntries ?? 0)}
              tone="warning"
            />
          </div>
        </FormSection>
      ),
    },
    {
      id: "closing",
      label: "الإقفال",
      content: (
        <FormSection
          title="إقفال الفترة"
          description="يمنع الإقفال أي تعديل على القيود ضمن هذه الفترة"
        >
          {isOpen ? (
            <>
              <div className="rounded-lg bg-warning/10 p-3 text-sm mb-3">
                <div className="font-bold text-warning mb-2">⚠ تنبيهات قبل الإقفال</div>
                <ul className="text-xs space-y-1 pr-4 list-disc">
                  <li>سيتم منع أي تعديل على القيود ضمن هذه الفترة</li>
                  <li>لا يمكن حذف الفترة بعد الإقفال</li>
                  <li>يجب أن تكون جميع القيود مرحّلة ومتوازنة أولاً</li>
                  <li>يتم تسجيل هذا الإجراء في سجل التدقيق</li>
                </ul>
              </div>
              <FormField label="ملاحظات الإقفال">
                <FormTextarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  rows={3}
                  placeholder="ملاحظات اختيارية حول الإقفال..."
                />
              </FormField>
              <button
                type="button"
                onClick={() => setConfirm("close")}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px]"
              >
                إقفال الفترة
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-success/10 p-3">
                <div className="text-xs font-bold text-success mb-1">الفترة مقفلة</div>
                <div className="text-xs">
                  التاريخ: <span className="font-semibold">{item.closedAt}</span>
                </div>
                <div className="text-xs">
                  بواسطة: <span className="font-semibold">{item.closedByName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirm("reopen")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-4 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
              >
                إعادة فتح الفترة
              </button>
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      content: (
        <FormSection title="سجل التدقيق">
          <div className="space-y-0">
            <FormSummaryLine label="الحالة" value={label("fiscalPeriodStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
            <FormSummaryLine label="أُقفلت بواسطة" value={item.closedByName || "—"} />
            <FormSummaryLine label="تاريخ الإقفال" value={item.closedAt || "—"} />
            <FormSummaryLine label="أُعيد فتحها بواسطة" value={item.reopenedByName || "—"} />
            <FormSummaryLine label="تاريخ إعادة الفتح" value={item.reopenedAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الإقفال المالي" breadcrumb={["المالية", "الإقفال المالي", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/closing" },
          { label: "الفترات المالية", to: "/finance/closing" },
          { label: item.name },
        ]}
        title={`الفترة: ${item.name}`}
        subtitle={`${item.startDate} → ${item.endDate}`}
        draftNumber={item.id}
        status={{ label: label("fiscalPeriodStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={!isOpen}
        readonlyReason={isClosed ? "الفترة مقفلة. لتعديل البيانات أعد فتحها من تبويب الإقفال." : ""}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel={isOpen ? "حفظ ومتابعة" : "للقراءة فقط"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={isOpen}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/closing" })}
      />

      <ConfirmDialog
        open={confirm === "close"}
        onClose={() => setConfirm(null)}
        onConfirm={() => closeMutation.mutate()}
        title="إقفال الفترة المالية"
        message={`هل تريد إقفال الفترة "${item.name}"؟ سيتم منع أي تعديل على القيود ضمنها.`}
        confirmText="تأكيد الإقفال"
        cancelText="إلغاء"
        variant="default"
      />

      <ConfirmDialog
        open={confirm === "reopen"}
        onClose={() => setConfirm(null)}
        onConfirm={() => reopenMutation.mutate()}
        title="إعادة فتح الفترة"
        message={`هل تريد إعادة فتح الفترة "${item.name}"؟ سيتم السماح بإضافة وتعديل القيود مرة أخرى، ويبقى السجل في سجل التدقيق.`}
        confirmText="إعادة الفتح"
        cancelText="إلغاء"
        variant="default"
      />
    </AppShell>
  );
}
