import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
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
import { getProjects } from "@/lib/api/projects";
import { createJournalEntry, JOURNAL_FUNDS, type JournalFund } from "@/lib/api/journal";

export const Route = createFileRoute("/finance/journal/new")({
  head: () => ({ meta: [{ title: "قيد يومية جديد — ثواب" }] }),
  component: NewJournalPage,
});

interface DraftLine {
  key: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

function newLine(key: string): DraftLine {
  return { key, accountId: "", description: "", debit: 0, credit: 0 };
}

function NewJournalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: accData } = useQuery({
    queryKey: ["accounts-postable"],
    queryFn: () => getAccounts({ limit: 1000 }),
  });
  const accounts = (accData?.items || []).filter((a) => a.postable);

  const { data: projData } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: () => getProjects({ limit: 200 }),
  });
  const projects = projData?.items || [];

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [fund, setFund] = useState<JournalFund>("غير مقيد");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine("l1"), newLine("l2")]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const validate = () => {
    if (!description.trim()) return "وصف القيد مطلوب";
    if (lines.length < 2) return "القيد يحتاج سطرين على الأقل";
    if (Math.abs(totals.diff) > 0.001) return `القيد غير متوازن (الفرق ${fmtSAR(totals.diff)})`;
    if (lines.some((l) => !l.accountId)) return "كل سطر يحتاج حساب";
    if (totals.debit <= 0) return "إجمالي المدين يجب أن يكون أكبر من صفر";
    return null;
  };

  const handleSave = async (andClose: boolean) => {
    const err = validate();
    if (err) {
      showToast(err, "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createJournalEntry({
        date,
        description: description.trim(),
        fund,
        projectId: projectId || null,
        currency: "SAR",
        notes,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          description: l.description || undefined,
          debit: l.debit || 0,
          credit: l.credit || 0,
        })),
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast(`تم إنشاء القيد ${created.number}`, "success");
      if (andClose) navigate({ to: "/finance/journal" });
      else navigate({ to: "/finance/journal/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const addLine = () => setLines([...lines, newLine(`l${Date.now()}`)]);
  const removeLine = (key: string) =>
    setLines(lines.length > 2 ? lines.filter((l) => l.key !== key) : lines);
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const tabs: EnterpriseTab[] = [
    {
      id: "lines",
      label: "بنود القيد",
      content: (
        <FormSection title="بنود القيد اليومية" description="يجب أن يتساوى إجمالي المدين مع إجمالي الدائن">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الحساب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">البيان</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">مدين</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">دائن</th>
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
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          placeholder="بيان السطر"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.debit || ""}
                          onChange={(e) =>
                            updateLine(l.key, {
                              debit: parseFloat(e.target.value) || 0,
                              credit: 0,
                            })
                          }
                          placeholder="0"
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.credit || ""}
                          onChange={(e) =>
                            updateLine(l.key, {
                              credit: parseFloat(e.target.value) || 0,
                              debit: 0,
                            })
                          }
                          placeholder="0"
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length <= 2}
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
                إضافة سطر
              </button>
              <div className="flex items-center gap-4 text-sm font-bold tabular-nums">
                <span>مدين: <span className="text-foreground">{fmtSAR(totals.debit)}</span></span>
                <span>دائن: <span className="text-foreground">{fmtSAR(totals.credit)}</span></span>
                <span className={totals.diff === 0 ? "text-success" : "text-destructive"}>
                  فرق: {fmtSAR(totals.diff)}
                </span>
              </div>
            </div>
          </div>
          {Math.abs(totals.diff) > 0.001 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium flex items-center gap-2 mt-3">
              <AlertCircle size={14} />
              القيد غير متوازن. يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "header",
      label: "بيانات القيد",
      content: (
        <FormSection title="بيانات القيد">
          <FormRow>
            <FormField label="تاريخ القيد">
              <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="نوع الصندوق">
              <FormSelect value={fund} onChange={(e) => setFund(e.target.value as JournalFund)}>
                {JOURNAL_FUNDS.map((f) => (<option key={f} value={f}>{f}</option>))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="وصف القيد" required>
            <FormInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: قيد تحصيل تبرعات شهر محرم" />
          </FormField>
          <FormField label="المشروع" hint="اختياري - لربط القيد بمشروع">
            <FormSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— خارج مشروع —</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </FormSelect>
          </FormField>
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
    <AppShell title="قيود اليومية" breadcrumb={["المالية", "قيود اليومية", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/journal" },
          { label: "قيود اليومية", to: "/finance/journal" },
          { label: "قيد جديد" },
        ]}
        title="قيد يومية جديد"
        subtitle="أنشئ قيداً متوازناً (إجمالي المدين = إجمالي الدائن)"
        draftNumber="مسودة جديدة"
        status={{ label: "مسودة", tone: "info" }}
        tabs={tabs}
        defaultTab="lines"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/journal" })}
      />
    </AppShell>
  );
}
