import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Check, Lock, Archive } from "lucide-react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import {
  getStocktake,
  updateStocktake,
  submitStocktake,
  approveStocktake,
  closeStocktake,
  deleteStocktake,
  type Stocktake,
  type StocktakeLine,
} from "@/lib/api/stocktake";
import { StocktakeStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";

export const Route = createFileRoute("/inventory/stocktake_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل جرد — ثواب" }] }),
  component: EditStocktakePage,
});

function EditStocktakePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["stocktakeDetail", id],
    queryFn: () => getStocktake(id),
  });

  const item: Stocktake | undefined = detailQuery.data?.item;
  const lines: StocktakeLine[] = detailQuery.data?.lines ?? [];

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<
    "submit" | "approve" | "close" | "delete" | null
  >(null);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setDate(item.date);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const isReadOnly =
    !!item &&
    (item.status === StocktakeStatus.COMPLETED || item.status === StocktakeStatus.CANCELLED);
  const canSubmit = item?.status === StocktakeStatus.DRAFT;
  const canApprove = item?.status === StocktakeStatus.COUNTING;
  const canClose = item?.status === StocktakeStatus.COMPLETED;

  const stats = lines.reduce(
    (acc, l) => {
      acc.sys += l.systemQuantity;
      acc.cnt += l.countedQuantity;
      acc.diff += l.difference;
      return acc;
    },
    { sys: 0, cnt: 0, diff: 0 },
  );
  const diffLineCount = lines.filter((l) => l.difference !== 0).length;

  const handleSave = async () => {
    if (isReadOnly) {
      showToast("لا يمكن تعديل جرد معتمد أو مغلق", "error");
      return;
    }
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم الجرد مطلوب");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateStocktake({
        id,
        name: name.trim(),
        date,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditQuery = useQuery({
    queryKey: ["stocktakeAudit", id],
    queryFn: () => getAuditEntries({ entityType: "جرد", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الجرد",
      content: (
        <FormSection title="بيانات الجرد">
          <FormField label="اسم الجرد" required error={errors[0]}>
            <FormInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="التاريخ">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="المستودع">
              <FormInput value={item?.warehouseId ? "—" : "كل المستودعات"} disabled />
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "lines",
      label: "بنود الجرد",
      badge: lines.length,
      content: (
        <FormSection title="بنود الجرد">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الصنف</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">نظامي</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">فعلي</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-20">الفرق</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.itemId}</td>
                      <td className="px-3 py-2 tabular-nums">{l.systemQuantity}</td>
                      <td className="px-3 py-2 tabular-nums font-bold">{l.countedQuantity}</td>
                      <td
                        className={`px-3 py-2 tabular-nums font-bold ${
                          l.difference === 0
                            ? "text-muted-foreground"
                            : l.difference > 0
                              ? "text-success"
                              : "text-destructive"
                        }`}
                      >
                        {l.difference > 0 ? `+${l.difference}` : l.difference}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{l.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={2} className="px-3 py-3 text-left font-semibold">
                      الإجمالي
                    </td>
                    <td className="px-3 py-3 font-bold tabular-nums">{stats.sys}</td>
                    <td className="px-3 py-3 font-bold tabular-nums">{stats.cnt}</td>
                    <td
                      className={`px-3 py-3 font-bold tabular-nums ${
                        stats.diff === 0 ? "" : stats.diff > 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {stats.diff > 0 ? `+${stats.diff}` : stats.diff}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          {diffLineCount > 0 &&
            item?.status !== StocktakeStatus.COMPLETED &&
            item?.status !== StocktakeStatus.CANCELLED && (
            <div className="mt-3 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning-foreground">
              ⚠ يوجد {diffLineCount} بندًا بفرق بين الكمية النظامية والفعلية. سيتم إنشاء حركة تسوية
              تلقائيًا عند الاعتماد.
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص الجرد">
          <FormSummaryLine label="اسم الجرد" value={item.name} />
          <FormSummaryLine
            label="الحالة"
            value={label("stocktakeStatus", item.status)}
            tone={statusTone(item.status)}
          />
          <FormSummaryLine label="التاريخ" value={item.date} />
          <FormSummaryLine label="عدد الأصناف" value={String(lines.length)} />
          <FormSummaryLine label="إجمالي النظامي" value={String(stats.sys)} />
          <FormSummaryLine label="إجمالي الفعلي" value={String(stats.cnt)} />
          <FormSummaryLine
            label="إجمالي الفرق"
            value={stats.diff > 0 ? `+${stats.diff}` : String(stats.diff)}
            tone={stats.diff === 0 ? "success" : "destructive"}
          />
          <FormSummaryLine
            label="بنود بحاجة لتسوية"
            value={String(diffLineCount)}
            tone={diffLineCount > 0 ? "warning" : "success"}
          />
          <FormSummaryLine label="اعتمد بواسطة" value={item.approvedBy || "—"} />
          <FormSummaryLine
            label="تاريخ الاعتماد"
            value={item.approvedAt?.slice(0, 16).replace("T", " ") || "—"}
          />
        </FormSection>
      ) : null,
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      badge: auditQuery.data?.items.length,
      content: (
        <FormSection title="سجل العمليات">
          {auditQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">جاري التحميل...</div>
          ) : (auditQuery.data?.items ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا الجرد.</div>
          ) : (
            <ul className="space-y-2">
              {(auditQuery.data?.items ?? []).map((e) => (
                <li key={e.id} className="rounded-lg border bg-card px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{e.action}</span>
                    <span className="text-muted-foreground font-mono">
                      {e.timestamp?.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">{e.description}</div>
                  <div className="text-muted-foreground mt-0.5">المستخدم: {e.userName || "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      ),
    },
  ];

  const submitMut = useMutation({
    mutationFn: () => submitStocktake({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeAudit", id] });
      showToast("تم إرسال الجرد للاعتماد", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMut = useMutation({
    mutationFn: () => approveStocktake({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeAudit", id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم اعتماد الجرد. حركات التسوية أُنشئت تلقائيًا.", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMut = useMutation({
    mutationFn: () => closeStocktake({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeAudit", id] });
      showToast("تم قفل الجرد", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteStocktake({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم حذف الجرد", "success");
      navigate({ to: "/inventory/stocktake" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الجرد" breadcrumb={["المخزون", "الجرد"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الجرد" breadcrumb={["المخزون", "الجرد"]}>
        <div className="text-center py-12 text-muted-foreground">الجرد غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الجرد" breadcrumb={["المخزون", "الجرد", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "الجرد", to: "/inventory/stocktake" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${lines.length} صنف · فرق ${stats.diff > 0 ? `+${stats.diff}` : stats.diff}`}
        draftNumber={item.id}
        status={{ label: label("stocktakeStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={isReadOnly}
        readonlyReason={
          isReadOnly
            ? `الجرد في حالة "${label("stocktakeStatus", item.status)}". لا يمكن تعديله.`
            : undefined
        }
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={false}
        extraActions={
          <>
            {canSubmit && (
              <button
                type="button"
                onClick={() => setConfirmAction("submit")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors min-h-[40px]"
              >
                <Send size={15} /> إرسال للاعتماد
              </button>
            )}
            {canApprove && (
              <button
                type="button"
                onClick={() => setConfirmAction("approve")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors min-h-[40px]"
              >
                <Check size={15} /> اعتماد
              </button>
            )}
            {canClose && (
              <button
                type="button"
                onClick={() => setConfirmAction("close")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm font-medium text-info hover:bg-info/20 transition-colors min-h-[40px]"
              >
                <Lock size={15} /> قفل الجرد
              </button>
            )}
            {(item.status === StocktakeStatus.DRAFT ||
              item.status === StocktakeStatus.COUNTING) && (
              <button
                type="button"
                onClick={() => setConfirmAction("delete")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Archive size={15} /> حذف
              </button>
            )}
          </>
        }
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/inventory/stocktake" })}
      />

      <ConfirmDialog
        open={confirmAction === "submit"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => submitMut.mutate()}
        title="إرسال للاعتماد"
        message={`هل تريد إرسال الجرد "${item.name}" للاعتماد؟ لن تستطيع تعديله بعد ذلك.`}
        confirmText="إرسال"
        cancelText="تراجع"
        loading={submitMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "approve"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => approveMut.mutate()}
        title="اعتماد الجرد"
        message={`هل تريد اعتماد الجرد "${item.name}"؟ سيتم إنشاء حركة تسوية تلقائيًا لكل بند فيه فرق بين الكمية النظامية والفعلية.`}
        confirmText="اعتماد"
        cancelText="تراجع"
        loading={approveMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "close"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => closeMut.mutate()}
        title="قفل الجرد"
        message={`هل تريد قفل الجرد "${item.name}"؟ بعد القفل يصبح نهائيًا.`}
        confirmText="قفل"
        cancelText="تراجع"
        loading={closeMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف الجرد"
        message={`هل تريد حذف الجرد "${item.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`}
        confirmText="حذف"
        cancelText="تراجع"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
