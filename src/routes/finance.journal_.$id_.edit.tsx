import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertCircle } from "lucide-react";
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
import { Fund, JournalStatus } from "@/lib/enums";
import { getAccounts } from "@/lib/api/accounts";
import { getProjects } from "@/lib/api/projects";
import {
  getJournalEntry,
  updateJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
  cancelJournalEntry,
  type JournalFund,
  type JournalLine,
} from "@/lib/api/journal";

export const Route = createFileRoute("/finance/journal_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل قيد — ثواب" }] }),
  component: EditJournalPage,
});

interface DraftLine {
  key: string;
  id?: string;
  accountId: string;
  description: string;
  debit: number;
  credit: number;
}

function fromServerLine(l: JournalLine, key: string): DraftLine {
  return {
    key,
    id: l.id,
    accountId: l.accountId,
    description: l.description || "",
    debit: l.debit || 0,
    credit: l.credit || 0,
  };
}

function newLine(key: string): DraftLine {
  return { key, accountId: "", description: "", debit: 0, credit: 0 };
}

function EditJournalPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: () => getJournalEntry(id),
    enabled: !!id,
  });

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

  const item = payload?.item;
  const serverLines = payload?.lines || [];

  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [fund, setFund] = useState<JournalFund>(Fund.UNRESTRICTED);
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setDate(item.date || "");
      setDescription(item.description || "");
      setFund(item.fund as JournalFund);
      setProjectId(item.projectId || "");
      setNotes(item.notes || "");
      setLines(
        serverLines.length > 0
          ? serverLines.map((l, i) => fromServerLine(l, `l${i}`))
          : [newLine("l1"), newLine("l2")],
      );
    }
  }, [item, serverLines]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const isEditable = item?.status === JournalStatus.DRAFT;

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateJournalEntry({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast("تم تحديث القيد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const postMutation = useMutation({
    mutationFn: () => postJournalEntry({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast("تم ترحيل القيد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const reverseMutation = useMutation({
    mutationFn: () => reverseJournalEntry({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast("تم عكس القيد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelJournalEntry({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast("تم إلغاء القيد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!isEditable) {
      showToast("لا يمكن تعديل قيد مرحّل", "error");
      return;
    }
    if (Math.abs(totals.diff) > 0.001) {
      showToast(`القيد غير متوازن (الفرق ${fmtSAR(totals.diff)})`, "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        date,
        description: description.trim(),
        fund,
        projectId: projectId || null,
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
      if (andClose) navigate({ to: "/finance/journal" });
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

  if (isLoading) {
    return (
      <AppShell title="قيود اليومية">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="قيود اليومية">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">القيد غير موجود</div>
          <button
            onClick={() => navigate({ to: "/finance/journal" })}
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
      label: "بنود القيد",
      content: (
        <FormSection
          title="بنود القيد"
          description={
            isEditable
              ? "يجب أن يتساوى إجمالي المدين مع إجمالي الدائن"
              : "للقراءة فقط — القيد مرحّل"
          }
        >
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
                          disabled={!isEditable}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px] disabled:opacity-60"
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
                          disabled={!isEditable}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px] disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.debit || ""}
                          onChange={(e) =>
                            updateLine(l.key, { debit: parseFloat(e.target.value) || 0, credit: 0 })
                          }
                          disabled={!isEditable}
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px] disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.credit || ""}
                          onChange={(e) =>
                            updateLine(l.key, { credit: parseFloat(e.target.value) || 0, debit: 0 })
                          }
                          disabled={!isEditable}
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px] disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          disabled={!isEditable || lines.length <= 2}
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
              {isEditable ? (
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors min-h-[36px]"
                >
                  <Plus size={14} />
                  إضافة سطر
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-4 text-sm font-bold tabular-nums">
                <span>
                  مدين: <span className="text-foreground">{fmtSAR(totals.debit)}</span>
                </span>
                <span>
                  دائن: <span className="text-foreground">{fmtSAR(totals.credit)}</span>
                </span>
                <span className={totals.diff === 0 ? "text-success" : "text-destructive"}>
                  فرق: {fmtSAR(totals.diff)}
                </span>
              </div>
            </div>
          </div>
          {isEditable && Math.abs(totals.diff) > 0.001 && (
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
            <FormField label="رقم القيد">
              <FormInput value={item.number} disabled dir="ltr" />
            </FormField>
            <FormField label="تاريخ القيد">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
                disabled={!isEditable}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="نوع الصندوق">
              <FormSelect
                value={fund}
                onChange={(e) => setFund(e.target.value as JournalFund)}
                disabled={!isEditable}
              >
                {options("fund").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="المشروع">
              <FormSelect
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!isEditable}
              >
                <option value="">— خارج مشروع —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="وصف القيد" required>
            <FormInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isEditable}
            />
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
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              disabled={!isEditable}
            />
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
            <FormSummaryLine label="الحالة" value={label("journalStatus", item.status)} />
            <FormSummaryLine label="أنشأ بواسطة" value={item.createdBy || "—"} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={item.updatedAt} />
            <FormSummaryLine label="رحّل بواسطة" value={item.postedBy || "—"} />
            <FormSummaryLine label="تاريخ الترحيل" value={item.postedAt || "—"} />
            <FormSummaryLine label="عكس بواسطة" value={item.reversedBy || "—"} />
            <FormSummaryLine label="تاريخ العكس" value={item.reversedAt || "—"} />
            <FormSummaryLine label="عكس القيد" value={item.reversedOf || "—"} />
          </div>
          {payload?.reversedOf && (
            <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">عكس القيد:</span>{" "}
              <span className="font-semibold">#{payload.reversedOf.number}</span>{" "}
              <span className="text-muted-foreground">— {payload.reversedOf.description}</span>
            </div>
          )}
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="قيود اليومية" breadcrumb={["المالية", "قيود اليومية", item.number]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/journal" },
          { label: "قيود اليومية", to: "/finance/journal" },
          { label: item.number },
        ]}
        title={`قيد يومية: ${item.number}`}
        subtitle={`${description} · ${fmtSAR(item.amount)}`}
        draftNumber={item.number}
        status={{ label: label("journalStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={!isEditable}
        readonlyReason={
          !isEditable
            ? `القيد ${label("journalStatus", item.status)} - يمكن فقط عكسه أو إلغاؤه`
            : ""
        }
        tabs={tabs}
        defaultTab="lines"
        loading={saving || updateMutation.isPending}
        primaryLabel={isEditable ? "حفظ ومتابعة" : "للقراءة فقط"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={isEditable}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/journal" })}
        extraActions={
          isEditable ? (
            <button
              type="button"
              onClick={() => postMutation.mutate()}
              disabled={postMutation.isPending || Math.abs(totals.diff) > 0.001}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px] disabled:opacity-50"
            >
              ترحيل القيد
            </button>
          ) : item.status === JournalStatus.POSTED ? (
            <>
              <button
                type="button"
                onClick={() => reverseMutation.mutate()}
                disabled={reverseMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-warning/30 bg-warning/10 text-warning px-3 py-2 text-sm font-semibold hover:bg-warning/20 transition-colors min-h-[40px]"
              >
                عكس القيد
              </button>
            </>
          ) : item.status === JournalStatus.DRAFT ? (
            <button
              type="button"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/20 transition-colors min-h-[40px]"
            >
              إلغاء القيد
            </button>
          ) : null
        }
      />
    </AppShell>
  );
}
