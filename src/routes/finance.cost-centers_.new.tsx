import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { createCostCenter, type CostCenterStatus } from "@/lib/api/cost-centers";

export const Route = createFileRoute("/finance/cost-centers_/new")({
  head: () => ({ meta: [{ title: "مركز تكلفة جديد — ثواب" }] }),
  component: NewCostCenterPage,
});

function NewCostCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [budget, setBudget] = useState("0");
  const [spent, setSpent] = useState("0");
  const [status, setStatus] = useState<CostCenterStatus>(CostCenterStatusEnum.ACTIVE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const budgetNum = parseFloat(budget) || 0;
  const spentNum = parseFloat(spent) || 0;
  const remaining = useMemo(() => budgetNum - spentNum, [budgetNum, spentNum]);
  const pct = budgetNum > 0 ? Math.round((spentNum / budgetNum) * 100) : 0;

  const createMutation = useMutation({
    mutationFn: createCostCenter,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!code.trim()) {
      showToast("يرجى إدخال رمز المركز", "error");
      return;
    }
    if (!name.trim()) {
      showToast("يرجى إدخال اسم المركز", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        code: code.trim(),
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
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast(`تم إنشاء مركز التكلفة ${created.name}`, "success");
      if (andClose) navigate({ to: "/finance/cost-centers" });
      else navigate({ to: "/finance/cost-centers/$id/edit", params: { id: created.id } });
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
        <FormSection title="بيانات مركز التكلفة">
          <FormRow>
            <FormField label="الرمز" required>
              <FormInput
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                placeholder="CC-100"
              />
            </FormField>
            <FormField label="الاسم" required>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: إدارة البرامج"
              />
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
    <AppShell title="مراكز التكلفة" breadcrumb={["المالية", "مراكز التكلفة", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/cost-centers" },
          { label: "مراكز التكلفة", to: "/finance/cost-centers" },
          { label: "مركز جديد" },
        ]}
        title="مركز تكلفة جديد"
        subtitle={`${fmtSAR(budgetNum)} موازنة · ${pct}% مصروف`}
        draftNumber="مسودة جديدة"
        status={{ label: label("costCenterStatus", status), tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/cost-centers" })}
      />
    </AppShell>
  );
}
