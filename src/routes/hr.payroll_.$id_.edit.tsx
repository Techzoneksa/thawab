import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormSelect,
  FormTextarea,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { PayrollStatus } from "@/lib/enums";
import {
  getPayrollRun,
  updatePayrollRun,
  approvePayrollRun,
  type PayrollLine,
} from "@/lib/api/payroll";

export const Route = createFileRoute("/hr/payroll_/$id_/edit")({
  head: () => ({ meta: [{ title: "مسير رواتب — ثواب" }] }),
  component: EditPayrollPage,
});

interface DraftLine {
  id: string;
  employeeName: string;
  department: string;
  salary: number;
  allowances: number;
  deductions: number;
}

function EditPayrollPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["payroll", id],
    queryFn: () => getPayrollRun(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [payMethod, setPayMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  useEffect(() => {
    if (payload) {
      setPayMethod(payload.item.payMethod);
      setNotes(payload.item.notes || "");
      setLines(
        payload.lines.map((l: PayrollLine) => ({
          id: l.id,
          employeeName: l.employeeName,
          department: l.department,
          salary: l.salary,
          allowances: l.allowances,
          deductions: l.deductions,
        })),
      );
    }
  }, [payload]);

  const isApproved = item?.status === PayrollStatus.APPROVED;

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.salary + l.allowances - l.deductions), 0),
    [lines],
  );

  const updateLine = (lid: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.id === lid ? { ...l, ...patch } : l)));

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePayrollRun({
        id,
        payMethod: payMethod as any,
        notes,
        lines: lines.map((l) => ({
          id: l.id,
          allowances: l.allowances,
          deductions: l.deductions,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", id] });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      showToast("تم حفظ المسير", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: () => approvePayrollRun(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", id] });
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      showToast("تم اعتماد المسير وترحيل القيد", "success");
      setConfirmApprove(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (isApproved) {
      showToast("لا يمكن تعديل مسير معتمد", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync();
      if (andClose) navigate({ to: "/hr/payroll" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="مسير الرواتب">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="مسير الرواتب">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المسير غير موجود</div>
          <button
            onClick={() => navigate({ to: "/hr/payroll" })}
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
      id: "lines",
      label: "بنود الرواتب",
      content: (
        <FormSection
          title="الموظفون"
          description={isApproved ? "للقراءة فقط" : "عدّل البدلات والاستقطاعات قبل الاعتماد"}
        >
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الموظف</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">الراتب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">بدلات</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">
                      استقطاعات
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">الصافي</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{l.department || "—"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-left">
                        {fmtSAR(l.salary)}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={l.allowances || ""}
                          disabled={isApproved}
                          onChange={(e) =>
                            updateLine(l.id, { allowances: parseFloat(e.target.value) || 0 })
                          }
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px] disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={l.deductions || ""}
                          disabled={isApproved}
                          onChange={(e) =>
                            updateLine(l.id, { deductions: parseFloat(e.target.value) || 0 })
                          }
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px] disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-left font-bold">
                        {fmtSAR(l.salary + l.allowances - l.deductions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/30 px-3 py-3 flex items-center justify-end gap-2 text-sm font-bold tabular-nums">
              الإجمالي الصافي: <span className="text-foreground">{fmtSAR(total)}</span>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "settings",
      label: "الصرف والملاحظات",
      content: (
        <FormSection title="الصرف">
          <FormField label="طريقة الصرف">
            <FormSelect
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              disabled={isApproved}
            >
              {options("payrollPayMethod").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={isApproved}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "audit",
      label: "الترحيل والتدقيق",
      content: (
        <FormSection title="القيد المحاسبي">
          <div className="space-y-0">
            <FormSummaryLine label="الحالة" value={label("payrollStatus", item.status)} />
            <FormSummaryLine
              label="طريقة الصرف"
              value={label("payrollPayMethod", item.payMethod)}
            />
            <FormSummaryLine label="الإجمالي" value={fmtSAR(item.totalAmount)} />
            <FormSummaryLine label="رقم القيد" value={item.journalEntryId || "لم يُرحّل بعد"} />
            <FormSummaryLine label="اعتمد بواسطة" value={item.approvedBy || "—"} />
            <FormSummaryLine label="تاريخ الاعتماد" value={item.approvedAt || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
          </div>
          {!isApproved && (
            <div className="rounded-lg bg-info/10 p-3 text-xs mt-3">
              عند الاعتماد يُرحّل القيد تلقائياً: <b>من ح/ الرواتب والأجور</b> إلى{" "}
              <b>{item.payMethod === "accrue" ? "ح/ رواتب وأجور مستحقة" : "ح/ النقد أو البنك"}</b>{" "}
              بمبلغ {fmtSAR(total)}.
            </div>
          )}
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="مسير الرواتب" breadcrumb={["الموارد", "مسير الرواتب", item.period]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/hr/payroll" },
          { label: "مسير الرواتب", to: "/hr/payroll" },
          { label: item.period },
        ]}
        title={`مسير: ${item.period}`}
        subtitle={`${lines.length} موظف · ${fmtSAR(total)}`}
        draftNumber={item.id}
        status={{ label: label("payrollStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={isApproved}
        readonlyReason={isApproved ? "المسير معتمد ومُرحّل — لا يمكن تعديله." : ""}
        tabs={tabs}
        defaultTab="lines"
        loading={saving || updateMutation.isPending}
        primaryLabel={isApproved ? "للقراءة فقط" : "حفظ ومتابعة"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={!isApproved}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/hr/payroll" })}
        extraActions={
          !isApproved ? (
            <button
              type="button"
              onClick={() => setConfirmApprove(true)}
              disabled={approveMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px]"
            >
              اعتماد وترحيل
            </button>
          ) : null
        }
      />

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => approveMutation.mutate()}
        title="اعتماد مسير الرواتب"
        message={`سيتم ترحيل قيد محاسبي بمبلغ ${fmtSAR(total)} ولن يمكن تعديل المسير بعد الاعتماد. احفظ أي تعديلات أولاً. هل تريد المتابعة؟`}
        confirmText="اعتماد وترحيل"
        cancelText="إلغاء"
        variant="default"
      />
    </AppShell>
  );
}
