import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { getAccounts } from "@/lib/api/accounts";
import { createBudget, BUDGET_STATUSES, type BudgetStatus } from "@/lib/api/budgets";

export const Route = createFileRoute("/finance/budgets/new")({
  head: () => ({ meta: [{ title: "موازنة جديدة — ثواب" }] }),
  component: NewBudgetPage,
});

interface DraftLine {
  key: string;
  accountId: string;
  plannedAmount: number;
  notes: string;
}

function newLine(key: string): DraftLine {
  return { key, accountId: "", plannedAmount: 0, notes: "" };
}

function NewBudgetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: accData } = useQuery({
    queryKey: ["accounts-simple"],
    queryFn: () => getAccounts({ limit: 1000 }),
  });
  const accounts = (accData?.items || []).filter((a) => a.postable);

  const currentYear = String(new Date().getFullYear());
  const [name, setName] = useState(`موازنة ${currentYear}`);
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState<BudgetStatus>("مسودة");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine("l1")]);
  const [saving, setSaving] = useState(false);

  const totalPlanned = useMemo(
    () => lines.reduce((s, l) => s + (l.plannedAmount || 0), 0),
    [lines]
  );

  const handleSave = async (andClose: boolean) => {
    if (!name.trim() || !year.trim()) {
      showToast("اسم الموازنة والسنة مطلوبان", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createBudget({
        name: name.trim(),
        year,
        status,
        amount: totalPlanned,
        department: department || undefined,
        currency: "SAR",
        description: description || undefined,
        notes,
        lines: lines.filter((l) => l.accountId).map((l) => ({
          accountId: l.accountId,
          plannedAmount: l.plannedAmount,
          notes: l.notes || undefined,
        })),
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast(`تم إنشاء الموازنة ${created.name}`, "success");
      if (andClose) navigate({ to: "/finance/budgets" });
      else navigate({ to: "/finance/budgets/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => setLines([...lines, newLine(`l${Date.now()}`)]);
  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key));
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الموازنة">
          <FormRow>
            <FormField label="اسم الموازنة" required>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: موازنة تشغيلية 2026" />
            </FormField>
            <FormField label="السنة المالية" required>
              <FormInput value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" placeholder="2026" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الإدارة / القسم">
              <FormInput value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="مثال: الإدارة المالية" />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value as BudgetStatus)}>
                {BUDGET_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="وصف">
            <FormTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "lines",
      label: "بنود الموازنة",
      content: (
        <FormSection title="توزيع المبلغ على الحسابات">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الحساب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-40">المبلغ المخطط</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">ملاحظات</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={l.accountId}
                          onChange={(e) => updateLine(l.key, { accountId: e.target.value })}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                        >
                          <option value="">— اختر —</option>
                          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.code} — {a.name}</option>))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.plannedAmount || ""}
                          onChange={(e) => updateLine(l.key, { plannedAmount: parseFloat(e.target.value) || 0 })}
                          dir="ltr"
                          placeholder="0"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={l.notes}
                          onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length <= 1}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="حذف السطر"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/30 px-3 py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors min-h-[36px]"
              >
                <Plus size={14} />
                إضافة بند
              </button>
              <div className="text-sm font-bold tabular-nums">
                الإجمالي المخطط: <span className="text-foreground">{fmtSAR(totalPlanned)}</span>
              </div>
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
    <AppShell title="الموازنات" breadcrumb={["المالية", "الموازنات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/budgets" },
          { label: "الموازنات", to: "/finance/budgets" },
          { label: "موازنة جديدة" },
        ]}
        title="موازنة جديدة"
        subtitle={`سنة ${year} · ${fmtSAR(totalPlanned)} مخطط`}
        draftNumber="مسودة جديدة"
        status={{ label: status, tone: statusTone(status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/budgets" })}
      />
    </AppShell>
  );
}
