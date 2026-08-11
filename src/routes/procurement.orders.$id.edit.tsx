import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Package, Lock, Ban, Archive, Truck } from "lucide-react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormTextarea,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import { PurchaseOrderStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import {
  getPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  receivePurchaseOrder,
  deletePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/api/purchase-orders";

export const Route = createFileRoute("/procurement/orders/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل أمر شراء — ثواب" }] }),
  component: EditOrderPage,
});

interface ReceiptEntry {
  lineId: string;
  orderedQty: number;
  alreadyReceivedQty: number;
  receivingQty: number;
}

function EditOrderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["purchaseOrderDetail", id],
    queryFn: () => getPurchaseOrder(id),
  });

  const item: PurchaseOrder | undefined = detailQuery.data?.item;
  const lines: PurchaseOrderLine[] = detailQuery.data?.lines ?? [];

  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<
    "approve" | "cancel" | "close" | "delete" | "receive" | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [receiptEntries, setReceiptEntries] = useState<ReceiptEntry[]>([]);

  if (item && !hydrated) {
    setSubject(item.subject);
    setDate(item.date);
    setDeliveryDate(item.deliveryDate || "");
    setNotes(item.notes || "");
    setHydrated(true);
  }

  if (item && receiptEntries.length === 0 && lines.length > 0) {
    setReceiptEntries(
      lines.map((l) => ({
        lineId: l.id,
        orderedQty: l.quantity,
        alreadyReceivedQty: l.receivedQuantity,
        receivingQty: 0,
      })),
    );
  }

  const isReadOnly =
    !!item &&
    (item.status === PurchaseOrderStatus.CLOSED ||
      item.status === PurchaseOrderStatus.CANCELLED ||
      item.status === PurchaseOrderStatus.RECEIVED);
  const canApprove = item?.status === PurchaseOrderStatus.DRAFT;
  const canReceive =
    item?.status === PurchaseOrderStatus.SENT || item?.status === PurchaseOrderStatus.PARTIAL;
  const canClose =
    item?.status === PurchaseOrderStatus.RECEIVED || item?.status === PurchaseOrderStatus.PARTIAL;
  const canCancel =
    item?.status !== PurchaseOrderStatus.CANCELLED && item?.status !== PurchaseOrderStatus.CLOSED;

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0),
    [lines],
  );
  const receivedAmount = item?.receivedAmount ?? 0;

  const handleSave = async () => {
    if (isReadOnly) {
      showToast("لا يمكن تعديل أمر مغلق أو ملغي أو مكتمل الاستلام", "error");
      return;
    }
    if (item?.status !== PurchaseOrderStatus.DRAFT) {
      showToast("لا يمكن تعديل أمر الشراء إلا في حالة المسودة", "error");
      return;
    }
    const errs: string[] = [];
    if (!subject.trim()) errs.push("موضوع أمر الشراء مطلوب");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updatePurchaseOrder({
        id,
        subject: subject.trim(),
        date,
        deliveryDate: deliveryDate || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async () => {
    const validEntries = receiptEntries.filter((r) => r.receivingQty > 0);
    if (validEntries.length === 0) {
      showToast("أدخل كمية استلام واحدة على الأقل", "error");
      return;
    }
    try {
      await receivePurchaseOrder({
        id,
        receipts: validEntries.map((r) => ({
          lineId: r.lineId,
          receivedQty: r.receivingQty,
        })),
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderAudit", id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم تسجيل الاستلام", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الاستلام", "error");
    }
  };

  const auditQuery = useQuery({
    queryKey: ["purchaseOrderAudit", id],
    queryFn: () => getAuditEntries({ entityType: "أمر شراء", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الأمر",
      content: (
        <FormSection title="بيانات أمر الشراء">
          <FormField label="موضوع أمر الشراء" required error={errors[0]}>
            <FormInput value={subject} onChange={(e) => setSubject(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="تاريخ الأمر">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="تاريخ التوريد المتوقع">
              <FormInput
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                dir="ltr"
              />
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
      label: "بنود الأمر",
      badge: lines.length,
      content: (
        <FormSection title="بنود أمر الشراء">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الوصف</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-24">الكمية</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-20">الوحدة</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">السعر</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">الإجمالي</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">مستلم</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 tabular-nums">{l.quantity}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.unit || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtSAR(l.unitPrice)}</td>
                      <td className="px-3 py-2 font-bold tabular-nums">
                        {fmtSAR(l.quantity * l.unitPrice)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <span
                          className={
                            l.receivedQuantity >= l.quantity
                              ? "text-success font-bold"
                              : l.receivedQuantity > 0
                                ? "text-warning font-semibold"
                                : "text-muted-foreground"
                          }
                        >
                          {l.receivedQuantity} / {l.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30">
                    <td colSpan={5} className="px-3 py-3 text-left font-semibold">
                      الإجمالي
                    </td>
                    <td className="px-3 py-3 font-bold tabular-nums">{fmtSAR(total)}</td>
                    <td className="px-3 py-3 font-bold tabular-nums text-success">
                      {fmtSAR(receivedAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "receive",
      label: "استلام البنود",
      badge: canReceive ? receiptEntries.filter((r) => r.receivingQty > 0).length : undefined,
      content: !canReceive ? (
        <FormSection title="استلام البنود">
          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground text-center">
            لا يمكن تسجيل استلام في الحالة الحالية ({label("purchaseOrderStatus", item?.status)}).
            اعتمد الأمر أولاً ثم سجل الاستلام.
          </div>
        </FormSection>
      ) : (
        <FormSection title="استلام البنود">
          <div className="rounded-lg bg-info/10 border border-info/30 px-3 py-2 text-xs mb-3">
            أدخل الكميات المستلمة فعليًا. سيتم تحديث الكمية في المخزون تلقائيًا بعد التأكيد.
          </div>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الوصف</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">مطلوب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">
                      مستلم سابقًا
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">
                      استلام الآن
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receiptEntries.map((r) => {
                    const line = lines.find((l) => l.id === r.lineId);
                    const remaining = r.orderedQty - r.alreadyReceivedQty;
                    return (
                      <tr key={r.lineId} className="border-t">
                        <td className="px-3 py-2">{line?.description}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.orderedQty} {line?.unit || ""}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {r.alreadyReceivedQty} {line?.unit || ""}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={remaining}
                            value={r.receivingQty || ""}
                            onChange={(e) =>
                              setReceiptEntries(
                                receiptEntries.map((x) =>
                                  x.lineId === r.lineId
                                    ? { ...x, receivingQty: parseFloat(e.target.value) || 0 }
                                    : x,
                                ),
                              )
                            }
                            dir="ltr"
                            placeholder="0"
                            className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                          />
                          <div className="text-[10px] text-muted-foreground mt-1">
                            المتبقي: {remaining} {line?.unit || ""}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/30 px-3 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction("receive")}
                disabled={!receiptEntries.some((r) => r.receivingQty > 0)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 min-h-[40px]"
              >
                <Truck size={15} /> تأكيد الاستلام
              </button>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص أمر الشراء">
          <FormSummaryLine label="الموضوع" value={item.subject} />
          <FormSummaryLine label="المورد" value={item.supplierId ? "مرتبط" : "—"} />
          <FormSummaryLine
            label="الحالة"
            value={label("purchaseOrderStatus", item.status)}
            tone={statusTone(item.status)}
          />
          <FormSummaryLine label="تاريخ الأمر" value={item.date} />
          <FormSummaryLine label="تاريخ التوريد" value={item.deliveryDate || "—"} />
          <FormSummaryLine label="إجمالي الأمر" value={fmtSAR(total)} />
          <FormSummaryLine
            label="المستلم حتى الآن"
            value={fmtSAR(receivedAmount)}
            tone={receivedAmount >= total ? "success" : "warning"}
          />
          <FormSummaryLine
            label="المتبقي"
            value={fmtSAR(Math.max(0, total - receivedAmount))}
            tone={total - receivedAmount > 0 ? "warning" : "success"}
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
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا الأمر.</div>
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

  const approveMut = useMutation({
    mutationFn: () => approvePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderAudit", id] });
      showToast("تم اعتماد أمر الشراء", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelPurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderAudit", id] });
      showToast("تم إلغاء أمر الشراء", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMut = useMutation({
    mutationFn: () => closePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderAudit", id] });
      showToast("تم إغلاق الأمر", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      showToast("تم حذف الأمر", "success");
      navigate({ to: "/procurement/orders" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="أوامر الشراء" breadcrumb={["المشتريات", "أوامر الشراء"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="أوامر الشراء" breadcrumb={["المشتريات", "أوامر الشراء"]}>
        <div className="text-center py-12 text-muted-foreground">أمر الشراء غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="أوامر الشراء" breadcrumb={["المشتريات", "أوامر الشراء", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "أوامر الشراء", to: "/procurement/orders" },
          { label: item.subject },
        ]}
        title={item.subject}
        subtitle={`${fmtSAR(total)} · مستلم ${fmtSAR(receivedAmount)}`}
        draftNumber={item.id}
        status={{ label: label("purchaseOrderStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={isReadOnly}
        readonlyReason={
          isReadOnly
            ? `أمر الشراء في حالة "${label("purchaseOrderStatus", item.status)}". هذا السجل مغلق للتعديل.`
            : item.status !== PurchaseOrderStatus.DRAFT
              ? "لا يمكن تعديل البيانات إلا في حالة المسودة. يمكنك تسجيل الاستلام من تبويب 'استلام البنود'."
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
                <Lock size={15} /> إغلاق الأمر
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => setConfirmAction("cancel")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Ban size={15} /> إلغاء
              </button>
            )}
            {item.status === PurchaseOrderStatus.DRAFT && (
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
        onCancel={() => navigate({ to: "/procurement/orders" })}
      />

      <ConfirmDialog
        open={confirmAction === "approve"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => approveMut.mutate()}
        title="اعتماد أمر الشراء"
        message={`هل تريد اعتماد أمر الشراء "${item.subject}"؟ بعد الاعتماد يمكنك تسجيل الاستلام.`}
        confirmText="اعتماد"
        cancelText="تراجع"
        loading={approveMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "close"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => closeMut.mutate()}
        title="إغلاق الأمر"
        message={`هل تريد إغلاق أمر الشراء "${item.subject}"؟ الإغلاق يعني اكتمال الاستلام وعدم توقع أي حركات إضافية.`}
        confirmText="إغلاق"
        cancelText="تراجع"
        loading={closeMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => cancelMut.mutate()}
        title="إلغاء أمر الشراء"
        message={`هل تريد إلغاء أمر الشراء "${item.subject}"؟`}
        confirmText="إلغاء"
        cancelText="تراجع"
        variant="destructive"
        loading={cancelMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف أمر الشراء"
        message={`هل تريد حذف أمر الشراء "${item.subject}" نهائيًا؟`}
        confirmText="حذف"
        cancelText="تراجع"
        variant="destructive"
        loading={deleteMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "receive"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleReceive}
        title="تأكيد الاستلام"
        message={`هل تريد تسجيل استلام ${receiptEntries.filter((r) => r.receivingQty > 0).length} بندًا؟ سيتم تحديث المخزون تلقائيًا.`}
        confirmText="تأكيد"
        cancelText="تراجع"
      />
    </AppShell>
  );
}
