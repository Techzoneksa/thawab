import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
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
import { label } from "@/lib/i18n/labels";
import { BudgetStatus } from "@/lib/enums";
import {
  getBudget,
  updateBudget,
  approveBudget,
  lockBudget,
  unlockBudget,
  type BudgetLine,
} from "@/lib/api/budgets";

export const Route = createFileRoute("/finance/budgets_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل موازنة — ثواب" }] }),
  component: EditBudgetPage,
});

function EditBudgetPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["budget", id],
    queryFn: () => getBudget(id),
    enabled: !!id,
  });

  const item = payload?.item;
  const serverLines = payload?.lines || [];
  const totals = payload?.totals;

  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setYear(item.year);
      setDepartment(item.department || "");
      setDescription(item.description || "");
      setNotes(item.notes || "");
    }
  }, [item]);

  const isEditable = item?.status === BudgetStatus.DRAFT;
  const isApproved = item?.status === BudgetStatus.APPROVED;
  const isLocked = item?.status === BudgetStatus.LOCKED;

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateBudget({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", id] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast("تم تحديث الموازنة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveBudget({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", id] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast("تم اعتماد الموازنة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const lockMutation = useMutation({
    mutationFn: () => lockBudget({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", id] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast("تم قفل الموازنة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockBudget({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", id] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast("تم فتح قفل الموازنة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!isEditable) {
      showToast("لا يمكن تعديل موازنة معتمدة أو مقفلة", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name,
        year,
        department: department || undefined,
        description: description || undefined,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/finance/budgets" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="الموازنات">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الموازنات">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">الموازنة غير موجودة</div>
          <button onClick={() => navigate({ to: "/finance/budgets" })} className="text-primary hover:underline text-sm">
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
        <FormSection title="بيانات الموازنة">
          <FormRow>
            <FormField label="اسم الموازنة" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} disabled={!isEditable} />
            </FormField>
            <FormField label="السنة المالية" required>
              <FormInput value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" disabled={!isEditable} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الإدارة / القسم">
              <FormInput value={department} onChange={(e) => setDepartment(e.target.value)} disabled={!isEditable} />
            </FormField>
            <FormField label="الحالة">
              <FormInput value={label("budgetStatus", item.status)} disabled />
            </FormField>
          </FormRow>
          <FormField label="وصف">
            <FormTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={!isEditable} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "lines",
      label: "بنود الموازنة",
      content: (
        <FormSection title="بنود الموازنة" description={isEditable ? "يمكن تعديل البنود قبل الاعتماد" : "للقراءة فقط"}>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الحساب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">مخطط</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">فعلي</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">فرق</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-24">% استخدام</th>
                  </tr>
                </thead>
                <tbody>
                  {serverLines.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">لا توجد بنود</td></tr>
                  ) : serverLines.map((l: BudgetLine) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{l.lineNumber}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs font-mono text-muted-foreground tabular-nums">{l.accountCode || "—"}</div>
                        <div className="text-sm">{l.accountName || "—"}</div>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-left">{fmtSAR(l.plannedAmount)}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-left">{fmtSAR(l.actualAmount || 0)}</td>
                      <td className={`px-3 py-2 font-mono tabular-nums text-left ${(l.variance || 0) < 0 ? "text-destructive" : "text-success"}`}>
                        {fmtSAR(l.variance || 0)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-left">{((l.utilization || 0)).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totals && (
              <div className="border-t bg-muted/30 px-3 py-3 flex items-center justify-end gap-4 text-sm font-bold tabular-nums">
                <span>إجمالي مخطط: <span className="text-foreground">{fmtSAR(totals.planned)}</span></span>
                <span>إجمالي فعلي: <span className="text-foreground">{fmtSAR(totals.actual)}</span></span>
                <span className={totals.variance < 0 ? "text-destructive" : "text-success"}>فرق: {fmtSAR(totals.variance)}</span>
                <span>نسبة الاستخدام: <span className="text-foreground">{(totals.utilization || 0).toFixed(1)}%</span></span>
              </div>
            )}
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} disabled={!isEditable} />
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
            <FormSummaryLine label="الحالة" value={label("budgetStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
            <FormSummaryLine label="اعتمد بواسطة" value={item.approvedBy || "—"} />
            <FormSummaryLine label="تاريخ الاعتماد" value={item.approvedAt || "—"} />
            <FormSummaryLine label="قفل بواسطة" value={item.lockedBy || "—"} />
            <FormSummaryLine label="تاريخ القفل" value={item.lockedAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الموازنات" breadcrumb={["المالية", "الموازنات", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/budgets" },
          { label: "الموازنات", to: "/finance/budgets" },
          { label: item.name },
        ]}
        title={`موازنة: ${item.name}`}
        subtitle={`${year} · ${department || "بدون قسم"} · ${fmtSAR(item.amount)}`}
        draftNumber={item.id}
        status={{ label: label("budgetStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={!isEditable}
        readonlyReason={
          isLocked ? "الموازنة مقفلة. لفتحها استخدم إجراء فتح القفل."
            : isApproved ? "الموازنة معتمدة. البنود للقراءة فقط."
            : ""
        }
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel={isEditable ? "حفظ ومتابعة" : "للقراءة فقط"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={isEditable}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/budgets" })}
        extraActions={
          isEditable ? (
            <button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px]"
            >
              اعتماد
            </button>
          ) : isApproved ? (
            isLocked ? (
              <button
                type="button"
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
              >
                فتح القفل
              </button>
            ) : (
              <button
                type="button"
                onClick={() => lockMutation.mutate()}
                disabled={lockMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-primary px-3 py-2 text-sm font-semibold hover:bg-primary/20 transition-colors min-h-[40px]"
              >
                قفل الموازنة
              </button>
            )
          ) : null
        }
      />
    </AppShell>
  );
}
