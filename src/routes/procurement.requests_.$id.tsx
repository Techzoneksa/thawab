import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Send, Check, Undo2, X, XCircle, Pencil } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import { PurchaseRequestStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import {
  getPurchaseRequest,
  submitPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  returnPurchaseRequestToDraft,
  cancelPurchaseRequest,
} from "@/lib/api/purchase-requests";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/requests_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل طلب شراء — ثواب" }] }),
  component: PurchaseRequestDetailPage,
});

function PurchaseRequestDetailPage() {
  const { id } = useParams({ from: "/procurement/requests_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reasonOpen, setReasonOpen] = useState(false);

  const q = useQuery({
    queryKey: ["purchaseRequest", id],
    queryFn: () => getPurchaseRequest(id),
  });
  const d = q.data;
  const r = d?.item;
  const st = r?.status;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchaseRequest", id] });
    qc.invalidateQueries({ queryKey: ["purchaseRequests"] });
  };

  const submitMut = useMutation({
    mutationFn: submitPurchaseRequest,
    onSuccess: () => {
      showToast("تم إرسال الطلب للموافقة", "success");
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const approveMut = useMutation({
    mutationFn: approvePurchaseRequest,
    onSuccess: () => {
      showToast("تم اعتماد الطلب بنجاح", "success");
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const rejectMut = useMutation({
    mutationFn: rejectPurchaseRequest,
    onSuccess: () => {
      showToast("تم رفض الطلب", "success");
      setReasonOpen(false);
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const returnMut = useMutation({
    mutationFn: returnPurchaseRequestToDraft,
    onSuccess: () => {
      showToast("تم إرجاع الطلب للمسودة", "success");
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const cancelMut = useMutation({
    mutationFn: cancelPurchaseRequest,
    onSuccess: () => {
      showToast("تم إلغاء الطلب", "success");
      invalidate();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const uid = { userId: user?.id, userName: user?.name };
  const back = () => nav({ to: "/procurement/requests" });
  const canEdit = st === PurchaseRequestStatus.DRAFT || st === PurchaseRequestStatus.REJECTED;

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "طلب شراء",
      number: v.id,
      date: v.deliveryDate || v.createdAt?.slice(0, 10),
      orientation: "portrait",
      entity: { name: v.requester || "—" },
      meta: [
        { label: "الحالة", value: label("purchaseRequestStatus", v.status) },
        { label: "الإدارة", value: v.department },
        { label: "الأولوية", value: label("priority", v.priority) },
        { label: "تاريخ التوريد", value: v.deliveryDate || "—" },
      ],
      columns: [
        { key: "subject", label: "الموضوع", width: "40%" },
        { key: "department", label: "الإدارة" },
        { key: "priority", label: "الأولوية" },
        { key: "amount", label: "المبلغ", type: "money" },
      ],
      rows: [
        {
          subject: v.subject,
          department: v.department,
          priority: label("priority", v.priority),
          amount: v.amount,
        },
      ],
      totals: [{ label: "الإجمالي", value: v.amount, type: "money", strong: true }],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `purchase-request-${v.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `طلب شراء ${r?.subject || ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط الطلب", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  const busy =
    submitMut.isPending ||
    approveMut.isPending ||
    rejectMut.isPending ||
    returnMut.isPending ||
    cancelMut.isPending;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "طلبات الشراء", r?.subject || "طلب"]}
      title={`طلب شراء: ${r?.subject || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !d || !r ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات الطلب</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{r.id}</div>
              <Badge tone={statusTone(r.status)}>{label("purchaseRequestStatus", r.status)}</Badge>
            </div>
            <div className="text-base font-bold">{r.subject}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="الإدارة" value={r.department} />
              <KV label="الأولوية" value={label("priority", r.priority)} />
              <KV label="مقدم الطلب" value={r.requester || "—"} />
              <KV label="المبلغ" value={fmtSAR(r.amount)} />
              <KV label="تاريخ التوريد" value={r.deliveryDate || "—"} />
            </div>
          </Card>

          <Card className="p-4 bg-primary/10">
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              أوامر الشراء المرتبطة
            </div>
            <div className="text-base font-bold tabular-nums">{fmtSAR(d.orderCount)}</div>
          </Card>

          {r.notes ? (
            <Card className="p-4">
              <div className="text-xs font-bold mb-1">ملاحظات</div>
              <div className="text-sm whitespace-pre-wrap">{r.notes}</div>
            </Card>
          ) : null}

          <Card className="p-3 flex flex-wrap gap-1.5">
            {canEdit && (
              <Btn
                variant="outline"
                onClick={() => nav({ to: "/procurement/requests/$id/edit", params: { id } as any })}
              >
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {st === PurchaseRequestStatus.DRAFT && (
              <Btn
                variant="primary"
                disabled={busy}
                onClick={() => submitMut.mutate({ id, ...uid })}
              >
                <Send size={14} /> إرسال للموافقة
              </Btn>
            )}
            {st === PurchaseRequestStatus.SUBMITTED && (
              <>
                <Btn
                  variant="primary"
                  disabled={busy}
                  onClick={() => approveMut.mutate({ id, ...uid })}
                >
                  <Check size={14} /> اعتماد
                </Btn>
                <Btn variant="outline" disabled={busy} onClick={() => setReasonOpen(true)}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === PurchaseRequestStatus.APPROVED && (
              <Btn
                variant="outline"
                disabled={busy}
                onClick={() => returnMut.mutate({ id, ...uid })}
              >
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {st === PurchaseRequestStatus.REJECTED && (
              <Btn
                variant="outline"
                disabled={busy}
                onClick={() => returnMut.mutate({ id, ...uid })}
              >
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {st !== PurchaseRequestStatus.ORDERED && st !== PurchaseRequestStatus.CANCELLED && (
              <Btn
                variant="outline"
                disabled={busy}
                onClick={() => cancelMut.mutate({ id, ...uid })}
              >
                <XCircle size={14} /> إلغاء
              </Btn>
            )}
          </Card>
        </div>
      )}

      {reasonOpen && (
        <ReasonDialog
          title={`رفض الطلب: ${r?.subject || ""}`}
          onCancel={() => setReasonOpen(false)}
          onConfirm={(reason) => rejectMut.mutate({ id, reason, ...uid })}
          loading={rejectMut.isPending}
        />
      )}
    </AppShell>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ReasonDialog({
  title,
  onCancel,
  onConfirm,
  loading,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [r, setR] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">{title}</div>
        <div className="rounded-lg bg-warning/10 p-3 text-xs mb-2">
          سيتم رفض الطلب وإضافة السبب إلى الملاحظات.
        </div>
        <textarea
          className="inp"
          rows={3}
          placeholder="اذكر سبب الرفض (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد الرفض
          </Btn>
        </div>
      </div>
    </div>
  );
}
