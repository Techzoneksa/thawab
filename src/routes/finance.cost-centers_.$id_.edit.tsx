import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/lib/api/auth";
import { label, options } from "@/lib/i18n/labels";
import { CostCenterStatus as CostCenterStatusEnum } from "@/lib/enums";
import {
  getCostCenter,
  updateCostCenter,
  deactivateCostCenter,
  activateCostCenter,
  type CostCenterStatus,
} from "@/lib/api/cost-centers";

export const Route = createFileRoute("/finance/cost-centers_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مركز تكلفة — ثواب" }] }),
  component: EditCostCenterPage,
});

function EditCostCenterPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["cost-center", id],
    queryFn: () => getCostCenter(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [budget, setBudget] = useState("0");
  const [spent, setSpent] = useState("0");
  const [status, setStatus] = useState<CostCenterStatus>(CostCenterStatusEnum.ACTIVE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setManager(item.manager || "");
      setBudget(String(item.budget));
      setSpent(String(item.spent));
      setStatus(item.status as CostCenterStatus);
      setDescription(item.description || "");
      setNotes(item.notes || "");
    }
  }, [item]);

  const budgetNum = parseFloat(budget) || 0;
  const spentNum = parseFloat(spent) || 0;
  const remaining = useMemo(() => budgetNum - spentNum, [budgetNum, spentNum]);
  const pct = budgetNum > 0 ? Math.round((spentNum / budgetNum) * 100) : 0;

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateCostCenter({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-center", id] });
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast("تم تحديث مركز التكلفة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "deactivate" | "activate") => {
      const fn = action === "deactivate" ? deactivateCostCenter : activateCostCenter;
      return fn({ id, userId: user?.id, userName: user?.name });
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["cost-center", id] });
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast(
        action === "deactivate" ? "تم إيقاف مركز التكلفة" : "تم تفعيل مركز التكلفة",
        "success",
      );
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم المركز", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        manager,
        budget: budgetNum,
        spent: spentNum,
        status,
        description,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/finance/cost-centers" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="مراكز التكلفة">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="مراكز التكلفة">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">مركز التكلفة غير موجود</div>
          <button
            onClick={() => navigate({ to: "/finance/cost-centers" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const isActive = item.status === CostCenterStatusEnum.ACTIVE;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات مركز التكلفة">
          <FormRow>
            <FormField label="الرمز">
              <FormInput value={item.code} dir="ltr" disabled />
            </FormField>
            <FormField label="الاسم" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المسؤول">
              <FormInput value={manager} onChange={(e) => setManager(e.target.value)} />
            </FormField>
            <FormField label="الحالة">
              <FormSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as CostCenterStatus)}
              >
                {options("costCenterStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الوصف">
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "budget",
      label: "الموازنة",
      content: (
        <FormSection title="موازنة المركز">
          <FormRow>
            <FormField label="الموازنة (ر.س)">
              <FormInput
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="المصروف (ر.س)">
              <FormInput
                type="number"
                value={spent}
                onChange={(e) => setSpent(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <div className="rounded-xl border bg-card p-4 mt-2">
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-sm font-bold tabular-nums">{pct}%</span>
            </div>
            <div className="mt-3 space-y-0">
              <FormSummaryLine label="الموازنة" value={fmtSAR(budgetNum)} />
              <FormSummaryLine label="المصروف" value={fmtSAR(spentNum)} />
              <FormSummaryLine
                label="المتبقي"
                value={fmtSAR(remaining)}
                tone={remaining < 0 ? "destructive" : "success"}
              />
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "usage",
      label: "الاستخدام",
      content: (
        <FormSection title="استخدام المركز في القيود والموازنات">
          <div className="space-y-0">
            <FormSummaryLine label="عدد القيود المرتبطة" value={payload?.journalUsage ?? 0} />
            <FormSummaryLine label="عدد الموازنات المرتبطة" value={payload?.budgetUsage ?? 0} />
            <FormSummaryLine
              label="قابل للحذف"
              value={payload?.hasUsage ? "لا — مستخدم في قيود/موازنات" : "نعم"}
              tone={payload?.hasUsage ? "warning" : "success"}
            />
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
            <FormSummaryLine label="الحالة" value={label("costCenterStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="مراكز التكلفة" breadcrumb={["المالية", "مراكز التكلفة", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/cost-centers" },
          { label: "مراكز التكلفة", to: "/finance/cost-centers" },
          { label: item.name },
        ]}
        title={`مركز التكلفة: ${item.name}`}
        subtitle={`${item.code} · ${fmtSAR(item.budget)} موازنة · ${pct}% مصروف`}
        draftNumber={item.code}
        status={{ label: label("costCenterStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/cost-centers" })}
        extraActions={
          isActive ? (
            <button
              type="button"
              onClick={() => statusMutation.mutate("deactivate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
            >
              إيقاف المركز
            </button>
          ) : (
            <button
              type="button"
              onClick={() => statusMutation.mutate("activate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 text-success px-3 py-2 text-sm font-semibold hover:bg-success/20 transition-colors min-h-[40px]"
            >
              تفعيل المركز
            </button>
          )
        }
      />
    </AppShell>
  );
}
