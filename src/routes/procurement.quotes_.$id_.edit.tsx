import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, Archive } from "lucide-react";
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
import { QuoteStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import {
  getQuote,
  updateQuote,
  acceptQuote,
  rejectQuote,
  deleteQuote,
  type Quote,
} from "@/lib/api/quotes";
import { fmtSAR } from "@/data/sample";

export const Route = createFileRoute("/procurement/quotes_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل عرض سعر — ثواب" }] }),
  component: EditQuotePage,
});

function EditQuotePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["quoteDetail", id],
    queryFn: () => getQuote(id),
  });

  const item: Quote | undefined = detailQuery.data?.item;

  const [supplier, setSupplier] = useState("");
  const [price, setPrice] = useState("");
  const [delivery, setDelivery] = useState("");
  const [warranty, setWarranty] = useState("");
  const [rating, setRating] = useState("0");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<string>(QuoteStatus.PENDING);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<"accept" | "reject" | "delete" | null>(null);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setSupplier(item.supplier);
    setPrice(String(item.price || 0));
    setDelivery(item.delivery || "");
    setWarranty(item.warranty || "");
    setRating(String(item.rating || 0));
    setValidUntil(item.validUntil || "");
    setStatus(item.status || QuoteStatus.PENDING);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const isReadOnly =
    !!item && (item.status === QuoteStatus.ACCEPTED || item.status === QuoteStatus.REJECTED);

  const handleSave = async () => {
    if (isReadOnly) {
      showToast("لا يمكن تعديل عرض مقبول أو مرفوض", "error");
      return;
    }
    const errs: string[] = [];
    if (!supplier.trim()) errs.push("اسم المورد مطلوب");
    if (!price || parseFloat(price) <= 0) errs.push("السعر يجب أن يكون أكبر من صفر");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateQuote({
        id,
        supplier: supplier.trim(),
        price: parseFloat(price) || 0,
        delivery: delivery || undefined,
        warranty: warranty || undefined,
        rating: parseFloat(rating) || 0,
        validUntil: validUntil || undefined,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quoteDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditQuery = useQuery({
    queryKey: ["quoteAudit", id],
    queryFn: () => getAuditEntries({ entityType: "عرض سعر", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات العرض",
      content: (
        <FormSection title="بيانات عرض السعر">
          <FormRow>
            <FormField label="المورد" required error={errors[0]}>
              <FormInput value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </FormField>
            <FormField label="السعر" required error={errors[1]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="مدة التسليم">
              <FormInput value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </FormField>
            <FormField label="الضمان">
              <FormInput value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التقييم" hint="من 1 إلى 5">
              <FormInput
                type="number"
                min="0"
                max="5"
                step="0.5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="صالح حتى">
              <FormInput
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("quoteStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص العرض">
          <FormSummaryLine label="المورد" value={item.supplier} />
          <FormSummaryLine label="السعر" value={fmtSAR(item.price)} />
          <FormSummaryLine
            label="الحالة"
            value={label("quoteStatus", item.status)}
            tone={
              item.status === QuoteStatus.ACCEPTED
                ? "success"
                : item.status === QuoteStatus.REJECTED
                  ? "destructive"
                  : "warning"
            }
          />
          <FormSummaryLine label="التقييم" value={`${item.rating || 0} / 5`} />
          <FormSummaryLine label="صالح حتى" value={item.validUntil || "—"} />
          <FormSummaryLine label="مدة التسليم" value={item.delivery || "—"} />
          <FormSummaryLine label="الضمان" value={item.warranty || "—"} />
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
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا العرض.</div>
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

  const acceptMut = useMutation({
    mutationFn: () => acceptQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quoteDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["quoteAudit", id] });
      showToast("تم قبول العرض", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quoteDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["quoteAudit", id] });
      showToast("تم رفض العرض", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      showToast("تم حذف العرض", "success");
      navigate({ to: "/procurement/quotes" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="عروض الأسعار" breadcrumb={["المشتريات", "عروض الأسعار"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="عروض الأسعار" breadcrumb={["المشتريات", "عروض الأسعار"]}>
        <div className="text-center py-12 text-muted-foreground">العرض غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="عروض الأسعار" breadcrumb={["المشتريات", "عروض الأسعار", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "عروض الأسعار", to: "/procurement/quotes" },
          { label: item.supplier },
        ]}
        title={item.supplier}
        subtitle={`${fmtSAR(item.price)} · ${item.delivery || ""}`}
        draftNumber={item.id}
        status={{ label: label("quoteStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={isReadOnly}
        readonlyReason={
          isReadOnly
            ? "هذا العرض مقبول أو مرفوض. لا يمكن تعديله بعد الآن للحفاظ على سلامة سجلات المنافسة."
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
            {item.status === QuoteStatus.PENDING && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction("accept")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors min-h-[40px]"
                >
                  <Check size={15} /> قبول
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors min-h-[40px]"
                >
                  <X size={15} /> رفض
                </button>
              </>
            )}
            {item.status === QuoteStatus.PENDING && (
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
        onCancel={() => navigate({ to: "/procurement/quotes" })}
      />

      <ConfirmDialog
        open={confirmAction === "accept"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => acceptMut.mutate()}
        title="قبول عرض السعر"
        message={`هل تريد قبول عرض "${item.supplier}" بسعر ${fmtSAR(item.price)}؟ سيتم ترميزه كعرض فائز ولن تستطيع تعديله بعد الآن.`}
        confirmText="قبول العرض"
        cancelText="إلغاء"
        loading={acceptMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "reject"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => rejectMut.mutate()}
        title="رفض عرض السعر"
        message={`هل تريد رفض عرض "${item.supplier}"؟`}
        confirmText="رفض"
        cancelText="تراجع"
        variant="destructive"
        loading={rejectMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف عرض السعر"
        message={`هل تريد حذف عرض "${item.supplier}"؟ هذا الإجراء لا يمكن التراجع عنه.`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
