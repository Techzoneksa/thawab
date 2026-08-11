import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Check, X, RotateCcw, Ban, Archive } from "lucide-react";
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
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import { PurchaseRequestStatus, Priority } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import {
  getPurchaseRequest,
  updatePurchaseRequest,
  submitPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  returnPurchaseRequestToDraft,
  cancelPurchaseRequest,
  deletePurchaseRequest,
  type PurchaseRequest,
} from "@/lib/api/purchase-requests";

const DEPARTMENTS = [
  "إدارة المساعدات",
  "تقنية المعلومات",
  "إدارة المشاريع",
  "الإدارة المالية",
  "المشتريات",
];

export const Route = createFileRoute("/procurement/requests/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل طلب شراء — ثواب" }] }),
  component: EditRequestPage,
});

function EditRequestPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["purchaseRequestDetail", id],
    queryFn: () => getPurchaseRequest(id),
  });

  const item: PurchaseRequest | undefined = detailQuery.data?.item;
  const orderCount = detailQuery.data?.orderCount ?? 0;

  const [subject, setSubject] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState<string>(Priority.MEDIUM);
  const [requester, setRequester] = useState("");
  const [amount, setAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "submit" | "approve" | "return" | "cancel" | "delete" | "reject" | null
  >(null);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setSubject(item.subject);
    setDepartment(item.department);
    setPriority(item.priority || Priority.MEDIUM);
    setRequester(item.requester || "");
    setAmount(String(item.amount || 0));
    setDeliveryDate(item.deliveryDate || "");
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const editableStatuses: string[] = [
    PurchaseRequestStatus.DRAFT,
    PurchaseRequestStatus.REJECTED,
  ];
  const isEditable = !!item && editableStatuses.includes(item.status);

  const handleSave = async () => {
    if (!isEditable) {
      showToast("لا يمكن تعديل طلب في هذه الحالة. أعده إلى المسودة أولاً.", "error");
      return;
    }
    const errs: string[] = [];
    if (!subject.trim()) errs.push("موضوع الطلب مطلوب");
    if (!department.trim()) errs.push("الإدارة مطلوبة");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updatePurchaseRequest({
        id,
        subject: subject.trim(),
        department,
        priority,
        requester: requester || undefined,
        amount: parseFloat(amount) || 0,
        deliveryDate: deliveryDate || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditQuery = useQuery({
    queryKey: ["purchaseRequestAudit", id],
    queryFn: () => getAuditEntries({ entityType: "طلب شراء", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الطلب",
      content: (
        <FormSection title="بيانات طلب الشراء">
          <FormField label="موضوع الطلب" required error={errors[0]}>
            <FormInput value={subject} onChange={(e) => setSubject(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="الإدارة" required error={errors[1]}>
              <FormSelect value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الأولوية">
              <FormSelect value={priority} onChange={(e) => setPriority(e.target.value)}>
                {options("priority").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="مقدم الطلب">
              <FormInput value={requester} onChange={(e) => setRequester(e.target.value)} />
            </FormField>
            <FormField label="المبلغ التقديري" hint="ر.س">
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="تاريخ التوريد المطلوب">
            <FormInput
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص الطلب">
          <FormSummaryLine label="الموضوع" value={item.subject} />
          <FormSummaryLine label="الإدارة" value={item.department} />
          <FormSummaryLine label="الأولوية" value={label("priority", item.priority)} />
          <FormSummaryLine
            label="الحالة"
            value={label("purchaseRequestStatus", item.status)}
            tone={statusTone(item.status)}
          />
          <FormSummaryLine label="المبلغ" value={fmtSAR(item.amount)} />
          <FormSummaryLine label="تاريخ التوريد" value={item.deliveryDate || "—"} />
          <FormSummaryLine
            label="أوامر شراء مرتبطة"
            value={String(orderCount)}
            tone={orderCount > 0 ? "success" : "default"}
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
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا الطلب.</div>
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
    mutationFn: () => submitPurchaseRequest({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestAudit", id] });
      showToast("تم إرسال الطلب للموافقة", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMut = useMutation({
    mutationFn: () => approvePurchaseRequest({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestAudit", id] });
      showToast("تم اعتماد الطلب", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMut = useMutation({
    mutationFn: () =>
      rejectPurchaseRequest({
        id,
        reason: rejectReason,
        userId: user?.id,
        userName: user?.name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestAudit", id] });
      showToast("تم رفض الطلب", "success");
      setConfirmAction(null);
      setRejectReason("");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const returnMut = useMutation({
    mutationFn: () => returnPurchaseRequestToDraft({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestAudit", id] });
      showToast("تم إرجاع الطلب للمسودة", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelPurchaseRequest({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequestAudit", id] });
      showToast("تم إلغاء الطلب", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePurchaseRequest({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم حذف الطلب", "success");
      navigate({ to: "/procurement/requests" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="طلبات الشراء" breadcrumb={["المشتريات", "طلبات الشراء"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="طلبات الشراء" breadcrumb={["المشتريات", "طلبات الشراء"]}>
        <div className="text-center py-12 text-muted-foreground">الطلب غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="طلبات الشراء" breadcrumb={["المشتريات", "طلبات الشراء", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "طلبات الشراء", to: "/procurement/requests" },
          { label: item.subject },
        ]}
        title={item.subject}
        subtitle={`${item.department} · ${fmtSAR(item.amount)}`}
        draftNumber={item.id}
        status={{
          label: label("purchaseRequestStatus", item.status),
          tone: statusTone(item.status),
        }}
        isReadOnly={!isEditable}
        readonlyReason={
          !isEditable
            ? `الطلب في حالة "${label("purchaseRequestStatus", item.status)}". أعده إلى المسودة أولاً لتعديله.`
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
            {item.status === PurchaseRequestStatus.DRAFT && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction("submit")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors min-h-[40px]"
                >
                  <Send size={15} /> إرسال للموافقة
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction("delete")}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
                >
                  <Archive size={15} /> حذف
                </button>
              </>
            )}
            {item.status === PurchaseRequestStatus.SUBMITTED && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction("approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors min-h-[40px]"
                >
                  <Check size={15} /> اعتماد
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
            {(item.status === PurchaseRequestStatus.APPROVED ||
              item.status === PurchaseRequestStatus.REJECTED) && (
              <button
                type="button"
                onClick={() => setConfirmAction("return")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px]"
              >
                <RotateCcw size={15} /> إعادة للمسودة
              </button>
            )}
            {item.status !== PurchaseRequestStatus.CANCELLED &&
              item.status !== PurchaseRequestStatus.ORDERED && (
              <button
                type="button"
                onClick={() => setConfirmAction("cancel")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Ban size={15} /> إلغاء
              </button>
            )}
            {item.status === PurchaseRequestStatus.CANCELLED && (
              <button
                type="button"
                onClick={() => setConfirmAction("delete")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Archive size={15} /> حذف نهائي
              </button>
            )}
          </>
        }
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/procurement/requests" })}
      />

      <ConfirmDialog
        open={confirmAction === "submit"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => submitMut.mutate()}
        title="إرسال للموافقة"
        message={`هل تريد إرسال الطلب "${item.subject}" للموافقة؟ لن تستطيع تعديله بعد ذلك حتى تتم الموافقة أو الرفض.`}
        confirmText="إرسال"
        cancelText="تراجع"
        loading={submitMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "approve"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => approveMut.mutate()}
        title="اعتماد الطلب"
        message={`هل تريد اعتماد الطلب "${item.subject}"؟ بعد الاعتماد يمكنك تحويله إلى أمر شراء.`}
        confirmText="اعتماد"
        cancelText="تراجع"
        loading={approveMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "reject"}
        onClose={() => {
          setConfirmAction(null);
          setRejectReason("");
        }}
        onConfirm={() => rejectMut.mutate()}
        title="رفض الطلب"
        message={`هل تريد رفض الطلب "${item.subject}"؟ سيتم تسجيل السبب في الملاحظات.`}
        confirmText="تأكيد الرفض"
        cancelText="تراجع"
        variant="destructive"
        loading={rejectMut.isPending}
      >
        <div className="mt-3 space-y-1.5 text-right">
          <label className="text-xs font-semibold text-muted-foreground">سبب الرفض</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="اذكر سبب الرفض..."
            className="w-full rounded-lg border bg-background p-2.5 text-sm"
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "return"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => returnMut.mutate()}
        title="إعادة للمسودة"
        message={`هل تريد إعادة الطلب "${item.subject}" إلى المسودة؟`}
        confirmText="إعادة للمسودة"
        cancelText="تراجع"
        loading={returnMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => cancelMut.mutate()}
        title="إلغاء الطلب"
        message={`هل تريد إلغاء الطلب "${item.subject}"؟ هذا الإجراء لا يمكن التراجع عنه إلا بإعادة الطلب إلى المسودة.`}
        confirmText="إلغاء"
        cancelText="تراجع"
        variant="destructive"
        loading={cancelMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف الطلب"
        message={`هل تريد حذف الطلب "${item.subject}"؟ هذا الإجراء لا يمكن التراجع عنه.`}
        confirmText="حذف"
        cancelText="تراجع"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
