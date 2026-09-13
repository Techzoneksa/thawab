import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import {
  ArrowRight,
  Share2,
  Printer,
  Send,
  Check,
  Undo2,
  X,
  RotateCcw,
  BookCheck,
} from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getGoodsReceipt, transitionGoodsReceipt } from "@/lib/api/goods-receipts";
import type { DocumentDefinition } from "@/lib/documents/types";
import { GRN_STATUS } from "./procurement.goods-receipts";

const GRNI_NOTE =
  "سند الاستلام يقيّد: مدين المستلَم (مخزون/مصروف/أصل) / دائن «بضاعة مستلمة لم تُفوتر (GRNI)». لا يمس الذمم الدائنة ولا رصيد المورد.";

type ReasonAction = "return" | "reject" | "reverse";

export const Route = createFileRoute("/procurement/goods-receipts_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل سند استلام — ثواب" }] }),
  component: GoodsReceiptDetailPage,
});

function GoodsReceiptDetailPage() {
  const { id } = useParams({ from: "/procurement/goods-receipts_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");

  const q = useQuery({ queryKey: ["goods-receipt", id], queryFn: () => getGoodsReceipt(id) });
  const d = q.data;
  const status = d?.item.status;
  const can = (p: string) => userCan(user, p);

  const act = useMutation({
    mutationFn: (vars: {
      action: "submit" | "approve" | "return" | "reject" | "post" | "reverse";
      reason?: string;
    }) => transitionGoodsReceipt(id, vars.action, vars.reason),
    onSuccess: (_r, vars) => {
      const msg: Record<string, string> = {
        submit: "تم الإرسال للاعتماد",
        approve: "تم اعتماد سند الاستلام",
        return: "تمت إعادة السند للمسودة",
        reject: "تم رفض السند",
        post: "تم ترحيل سند الاستلام",
        reverse: "تم عكس سند الاستلام",
      };
      showToast(msg[vars.action] || "تم", "success");
      qc.invalidateQueries({ queryKey: ["goods-receipt", id] });
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      setReasonAction(null);
      setReason("");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/procurement/goods-receipts" });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "سند استلام",
      number: v.grnNumber,
      date: v.receiptDate,
      orientation: "portrait",
      entity: { name: d!.supplier?.name || d!.po?.poNumber || v.purchaseOrderId },
      meta: [
        { label: "الحالة", value: GRN_STATUS[v.status]?.label || v.status },
        { label: "أمر الشراء", value: d!.po?.poNumber || v.purchaseOrderId },
        { label: "العملة", value: v.currency },
      ],
      columns: [
        { key: "item", label: "البند", width: "40%" },
        { key: "type", label: "النوع" },
        { key: "qty", label: "كمية", type: "number" },
        { key: "price", label: "سعر", type: "money" },
        { key: "total", label: "القيمة", type: "money" },
      ],
      rows: d!.lines.map((l) => ({
        item: l.description || "—",
        type: l.lineType,
        qty: l.quantityReceived,
        price: l.unitPrice,
        total: l.lineValue,
      })),
      totals: [{ label: "إجمالي القيمة (GRNI)", value: v.totalValue, type: "money", strong: true }],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `goods-receipt-${v.grnNumber}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `سند استلام ${d?.item?.grnNumber || ""}`;
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
      showToast("تم نسخ رابط سند الاستلام", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "سندات الاستلام", d?.item?.grnNumber || "سند استلام"]}
      title={`سند استلام: ${d?.item?.grnNumber || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && status !== "draft" && (
            <Btn
              variant="ghost"
              onClick={() =>
                nav({ to: "/procurement/goods-receipts/$id/print", params: { id } as any })
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
        <div className="p-8 text-center text-destructive">تعذّر جلب سند الاستلام</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{d.item.grnNumber}</div>
              <Badge tone={GRN_STATUS[d.item.status]?.tone || "muted"}>
                {GRN_STATUS[d.item.status]?.label || d.item.status}
              </Badge>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              {GRNI_NOTE}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KV label="أمر الشراء" value={d.po?.poNumber || d.item.purchaseOrderId} />
              <KV label="المورد" value={d.supplier?.name || "—"} />
              <KV label="تاريخ الاستلام" value={d.item.receiptDate} />
              <KV label="القيمة (GRNI)" value={fmtSAR(d.item.totalValue)} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">البنود المستلمة</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">البند</th>
                    <th className="py-1 pe-2 text-left">كمية</th>
                    <th className="py-1 pe-2 text-left">سعر</th>
                    <th className="py-1 pe-2 text-left">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2">
                        {l.description || "—"}
                        <span className="text-[10px] text-muted-foreground"> ({l.lineType})</span>
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">{l.quantityReceived}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {d.matchSummary ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px]">
              <div className="font-semibold text-muted-foreground mb-1">مطابقة الفوترة (GRNI)</div>
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <div>
                  <div className="text-[10px] text-muted-foreground">قيمة الاستلام</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.receivedValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">مفوتَر/مطابَق</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.invoicedValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">GRNI المتبقّي</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.remainingValue)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {d.item.status === "reversed" && d.item.reversalReason ? (
            <div className="rounded-lg border bg-warning/5 px-3 py-2 text-xs">
              سبب العكس: {d.item.reversalReason}
            </div>
          ) : null}

          <Card className="p-4">
            <Timeline history={d.history} />
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {status === "draft" && can("procurement.grn.submit") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "submit" })}
              >
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {status === "submitted" && can("procurement.grn.approve") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "approve" })}
              >
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {status === "submitted" && can("procurement.grn.reject") && (
              <>
                <Btn
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => setReasonAction("return")}
                >
                  <Undo2 size={14} /> إعادة للمسودة
                </Btn>
                <Btn
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => setReasonAction("reject")}
                >
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {status === "approved" && can("procurement.grn.reject") && (
              <Btn
                variant="outline"
                disabled={act.isPending}
                onClick={() => setReasonAction("return")}
              >
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {status === "approved" && can("procurement.grn.post") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "post" })}
              >
                <BookCheck size={14} /> ترحيل
              </Btn>
            )}
            {status === "posted" && can("procurement.grn.reverse") && (
              <Btn
                variant="outline"
                disabled={act.isPending}
                onClick={() => setReasonAction("reverse")}
              >
                <RotateCcw size={14} /> عكس
              </Btn>
            )}
          </Card>
        </div>
      )}

      {reasonAction && (
        <ReasonDialog
          action={reasonAction}
          reason={reason}
          setReason={setReason}
          loading={act.isPending}
          onCancel={() => {
            setReasonAction(null);
            setReason("");
          }}
          onConfirm={() => act.mutate({ action: reasonAction, reason })}
        />
      )}
    </AppShell>
  );
}

function ReasonDialog({
  action,
  reason,
  setReason,
  loading,
  onCancel,
  onConfirm,
}: {
  action: ReasonAction;
  reason: string;
  setReason: (v: string) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">
          {action === "reverse"
            ? "عكس سند الاستلام"
            : action === "reject"
              ? "رفض سند الاستلام"
              : "إعادة السند للمسودة"}
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">
          {action === "reverse"
            ? "سيتم عكس القيد وربط أستاذ GRNI وحركة المخزون معاً (لن يصبح المخزون سالباً)."
            : "يُرجى بيان السبب."}
        </div>
        <textarea
          className="inp"
          rows={3}
          placeholder="السبب (مطلوب)…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" disabled={!reason.trim() || loading} onClick={onConfirm}>
            تأكيد
          </Btn>
        </div>
      </div>
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

function Timeline({
  history,
}: {
  history: { id: string; action: string; userName: string; reason: string; createdAt: string }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء مسودة",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    post: "ترحيل الاستلام",
    reverse: "عكس",
  };
  if (!history?.length) return null;
  return (
    <>
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
    </>
  );
}
