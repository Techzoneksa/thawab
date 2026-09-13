import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Printer, Send, Check, Undo2, X, Ban, Pencil } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  getPurchaseOrder,
  purchaseOrderAction,
  type PurchaseOrderAction,
} from "@/lib/api/governed-purchase-orders";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/purchase-orders_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل أمر شراء — ثواب" }] }),
  component: PurchaseOrderDetailPage,
});

const PO_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد — بانتظار الإصدار", tone: "primary" },
  issued: { label: "صادر", tone: "success" },
  rejected: { label: "مرفوض", tone: "destructive" },
  cancelled: { label: "ملغى", tone: "warning" },
};

const NO_ACCOUNTING = "هذا الأمر لا يُنشئ قيدًا محاسبيًا ولا يؤثر على المخزون أو ذمم الموردين.";

function PurchaseOrderDetailPage() {
  const { id } = useParams({ from: "/procurement/purchase-orders_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reason, setReason] = useState<{ action: PurchaseOrderAction; title: string } | null>(null);

  const q = useQuery({ queryKey: ["purchase-order", id], queryFn: () => getPurchaseOrder(id) });
  const d = q.data;

  const actionMut = useMutation({
    mutationFn: (p: { action: PurchaseOrderAction; reason?: string }) =>
      purchaseOrderAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/procurement/purchase-orders" });
  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: PurchaseOrderAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "أمر شراء",
      number: v.poNumber || v.id,
      date: v.date,
      orientation: "portrait",
      entity: { name: d!.supplier?.name || v.supplierId || "—" },
      meta: [
        { label: "الحالة", value: PO_STATUS[v.status]?.label || v.status },
        { label: "الموضوع", value: v.subject },
        { label: "التسليم المتوقع", value: v.deliveryDate || "—" },
        { label: "مرجع المورد", value: v.supplierReference || "—" },
      ],
      columns: [
        { key: "item", label: "البند", width: "36%" },
        { key: "qty", label: "كمية", type: "number" },
        { key: "price", label: "سعر", type: "money" },
        { key: "tax", label: "ضريبة", type: "money" },
        { key: "total", label: "الإجمالي", type: "money" },
      ],
      rows: d!.lines.map((l) => ({
        item: `${l.description || "—"}${l.unit ? " · " + l.unit : ""}`,
        qty: l.quantity,
        price: l.unitPrice,
        tax: l.taxAmount || 0,
        total: l.lineTotal,
      })),
      totals: [
        { label: "الصافي", value: v.subtotal, type: "money" },
        { label: "الضريبة", value: v.taxAmount, type: "money" },
        { label: "إجمالي قيمة الالتزام", value: v.totalAmount, type: "money", strong: true },
      ],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `purchase-order-${v.poNumber || v.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `أمر شراء ${d?.item?.poNumber || ""}`;
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
      showToast("تم نسخ رابط أمر الشراء", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء", d?.item?.poNumber || "أمر شراء"]}
      title={`أمر شراء: ${d?.item?.poNumber || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && st !== "draft" && (
            <Btn
              variant="ghost"
              onClick={() =>
                nav({ to: "/procurement/purchase-orders/$id/print", params: { id } as any })
              }
            >
              <Printer size={15} /> طباعة A4
            </Btn>
          )}
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
      ) : !d ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب أمر الشراء</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{d.item.poNumber}</div>
              <Badge tone={PO_STATUS[d.item.status]?.tone || "muted"}>
                {PO_STATUS[d.item.status]?.label || d.item.status}
              </Badge>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              {NO_ACCOUNTING}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="المورد" value={d.supplier?.name || d.item.supplierId || "—"} />
              <KV label="الموضوع" value={d.item.subject} />
              <KV label="تاريخ الأمر" value={d.item.date} />
              <KV label="التسليم المتوقع" value={d.item.deliveryDate || "—"} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="مرجع المورد" value={d.item.supplierReference || "—"} />
            </div>
            {d.item.notes ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">{d.item.notes}</div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">البنود</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">البند</th>
                    <th className="py-1 pe-2 text-left">كمية</th>
                    <th className="py-1 pe-2 text-left">سعر</th>
                    <th className="py-1 pe-2 text-left">صافي</th>
                    <th className="py-1 pe-2 text-left">ضريبة</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2">{l.description || "—"}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">
                        {l.quantity} {l.unit || ""}
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineSubtotal)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.taxAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="الصافي" value={d.item.subtotal} />
              <Row label="الضريبة" value={d.item.taxAmount} />
              <Row label="إجمالي الالتزام" value={d.item.totalAmount} bold />
            </div>
          </Card>

          <Card className="p-4">
            <Timeline history={d.history} />
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === "draft" && can("procurement.po.update_draft") && (
              <Btn
                variant="outline"
                onClick={() =>
                  nav({ to: "/procurement/purchase-orders/$id/edit", params: { id } as any })
                }
              >
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {st === "draft" && can("procurement.po.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.po.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.po.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض الأمر")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("procurement.po.reject") && (
              <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {st === "approved" && can("procurement.po.issue") && (
              <Btn variant="primary" onClick={() => act("issue", false, "")}>
                <Check size={14} /> إصدار
              </Btn>
            )}
            {st === "issued" && can("procurement.po.cancel") && (
              <Btn variant="outline" onClick={() => act("cancel", true, "إلغاء الأمر الصادر")}>
                <Ban size={14} /> إلغاء
              </Btn>
            )}
          </Card>
        </div>
      )}

      {reason && (
        <ReasonDialog
          title={reason.title}
          onCancel={() => setReason(null)}
          onConfirm={(r) => actionMut.mutate({ action: reason.action, reason: r })}
          loading={actionMut.isPending}
        />
      )}
    </AppShell>
  );
}

function Timeline({
  history,
}: {
  history: { id: string; action: string; userName: string; reason: string; createdAt: string }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    issue: "إصدار",
    cancel: "إلغاء",
  };
  if (!history?.length) return null;
  return (
    <div>
      <div className="text-xs font-bold mb-2">سجل الإجراءات</div>
      <ol className="space-y-1.5">
        {history.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <span className="font-semibold">{LABEL[e.action] || e.action}</span>
              <span className="text-muted-foreground"> — {e.userName} · </span>
              <span className="tabular-nums text-muted-foreground">
                {String(e.createdAt).slice(0, 16).replace("T", " ")}
              </span>
              {e.reason ? <div className="text-muted-foreground">السبب: {e.reason}</div> : null}
            </div>
          </li>
        ))}
      </ol>
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
        <textarea
          className="inp"
          rows={3}
          placeholder="اكتب السبب (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-base font-extrabold" : "font-semibold"}`}>
        {fmtSAR(value)}
      </span>
    </div>
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
