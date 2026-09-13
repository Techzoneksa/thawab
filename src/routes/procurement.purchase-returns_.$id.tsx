import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Send, Check, Undo2, X, RotateCcw } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getPurchaseReturn, purchaseReturnAction } from "@/lib/api/purchase-returns";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/purchase-returns_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل مرتجع مشتريات — ثواب" }] }),
  component: PurchaseReturnDetailPage,
});

const STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "مُرسَل", tone: "info" },
  approved: { label: "معتمد", tone: "primary" },
  rejected: { label: "مرفوض", tone: "destructive" },
  posted: { label: "مُرحَّل", tone: "success" },
  reversed: { label: "معكوس", tone: "warning" },
};

type PurchaseReturnActionType = "submit" | "approve" | "return" | "reject" | "post" | "reverse";

function PurchaseReturnDetailPage() {
  const { id } = useParams({ from: "/procurement/purchase-returns_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reason, setReason] = useState<{ action: PurchaseReturnActionType; title: string } | null>(
    null,
  );

  const q = useQuery({ queryKey: ["purchase-return", id], queryFn: () => getPurchaseReturn(id) });
  const d = q.data;
  const can = (perm: string) => userCan(user, perm);

  const actionMut = useMutation({
    mutationFn: (p: { action: PurchaseReturnActionType; reason?: string }) =>
      purchaseReturnAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["purchase-return", id] });
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/procurement/purchase-returns" });
  const st = d?.item?.status;
  const act = (action: PurchaseReturnActionType, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "مرتجع مشتريات",
      number: v.returnNumber,
      date: v.returnDate,
      orientation: "portrait",
      entity: { name: d!.supplier?.name || v.supplierId || d!.grn?.grnNumber || v.goodsReceiptId },
      meta: [
        { label: "الحالة", value: STATUS[v.status]?.label || v.status },
        { label: "سند الاستلام", value: d!.grn?.grnNumber || v.goodsReceiptId },
        { label: "السبب", value: v.reason || "—" },
      ],
      columns: [
        { key: "description", label: "الوصف", width: "60%" },
        { key: "quantity", label: "الكمية", type: "number" },
        { key: "value", label: "قيمة GRNI", type: "money" },
      ],
      rows: (d!.lines || []).map((l: any) => ({
        description: l.description || l.goodsReceiptLineId,
        quantity: l.quantityReturned,
        value: l.lineValue,
      })),
      totals: [{ label: "إجمالي القيمة", value: v.totalValue, type: "money", strong: true }],
      notes: v.reason || undefined,
      signature: true,
      fileBase: `purchase-return-${v.returnNumber}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `مرتجع ${d?.item?.returnNumber || ""}`;
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
      showToast("تم نسخ رابط المرتجع", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "مرتجعات المشتريات", d?.item?.returnNumber || "مرتجع"]}
      title={`مرتجع مشتريات: ${d?.item?.returnNumber || ""}`}
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
      ) : !d ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب المرتجع</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{d.item.returnNumber}</div>
              <Badge tone={STATUS[st]?.tone || "muted"}>{STATUS[st]?.label || st}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV label="سند الاستلام" value={d.grn?.grnNumber || d.item.goodsReceiptId} />
              <KV label="التاريخ" value={d.item.returnDate} />
              <KV label="القيمة" value={fmtSAR(d.item.totalValue)} />
              <KV label="السبب" value={d.item.reason || "—"} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">سطور المرتجع</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">الوصف</th>
                    <th className="py-1 pe-2">الكمية</th>
                    <th className="py-1 pe-2">قيمة GRNI</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.lines || []).map((l: any) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2">{l.description || l.goodsReceiptLineId}</td>
                      <td className="py-1 pe-2 tabular-nums">{l.quantityReturned}</td>
                      <td className="py-1 pe-2 tabular-nums">{fmtSAR(l.lineValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="text-[11px] text-muted-foreground">
            الترحيل: مدين بضاعة مستلمة لم تُفوتر (GRNI) / دائن حساب الاستلام الأصلي، ويخفّض المخزون
            — لا يمس الذمم الدائنة أو الضريبة.
          </div>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === "draft" && can("procurement.purchase_return.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.purchase_return.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.purchase_return.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض المرتجع")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("procurement.purchase_return.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("procurement.purchase_return.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس المرتجع")}>
                <RotateCcw size={14} /> عكس
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
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
