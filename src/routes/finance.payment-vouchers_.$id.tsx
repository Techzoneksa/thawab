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
  Pencil,
} from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  getPaymentVoucher,
  paymentVoucherAction,
  type PaymentAction,
} from "@/lib/api/payment-vouchers";
import type { DocumentDefinition } from "@/lib/documents/types";
import { PV_STATUS, Timeline, KV, ReasonDialog } from "./finance.payment-vouchers";

export const Route = createFileRoute("/finance/payment-vouchers_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل سند صرف — ثواب" }] }),
  component: PaymentVoucherDetailPage,
});

function PaymentVoucherDetailPage() {
  const { id } = useParams({ from: "/finance/payment-vouchers_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reason, setReason] = useState<{ action: PaymentAction; title: string } | null>(null);

  const q = useQuery({ queryKey: ["payment-voucher", id], queryFn: () => getPaymentVoucher(id) });
  const d = q.data;

  const actionMut = useMutation({
    mutationFn: (p: { action: PaymentAction; reason?: string }) =>
      paymentVoucherAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["payment-voucher", id] });
      qc.invalidateQueries({ queryKey: ["payment-vouchers"] });
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/finance/payment-vouchers" });
  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: PaymentAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "سند صرف",
      number: v.voucherNumber,
      date: v.voucherDate,
      orientation: "portrait",
      entity: { name: v.payeeName || "—" },
      meta: [
        { label: "الحالة", value: PV_STATUS[v.status]?.label || v.status },
        { label: "العملة", value: v.currency },
        {
          label: "المصدر",
          value: d!.source
            ? `${d!.source.code} (${v.cashboxId ? "صندوق" : "بنك"})`
            : v.cashboxId || v.bankAccountId || "—",
        },
        { label: "مرجع خارجي", value: v.externalReference || "—" },
      ],
      columns: [
        { key: "account", label: "الحساب", width: "40%" },
        { key: "description", label: "البيان", width: "36%" },
        { key: "amount", label: "المبلغ", type: "money" },
      ],
      rows: d!.lines.map((l) => ({
        account: l.accountId,
        description: l.description || "",
        amount: l.amount,
      })),
      totals: [{ label: "الإجمالي", value: v.totalAmount, type: "money", strong: true }],
      notes: v.description || undefined,
      signature: true,
      fileBase: `payment-voucher-${v.voucherNumber}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `سند صرف ${d?.item?.voucherNumber || ""}`;
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
      showToast("تم نسخ الرابط", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "سندات الصرف", d?.item?.voucherNumber || "سند"]}
      title={`سند صرف: ${d?.item?.voucherNumber || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && st !== "draft" && (
            <Btn
              variant="ghost"
              onClick={() =>
                nav({ to: "/finance/payment-vouchers/$id/print", params: { id } as any })
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
        <div className="p-8 text-center text-destructive">تعذّر جلب السند</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{d.item.voucherNumber}</div>
              <Badge tone={PV_STATUS[d.item.status]?.tone || "muted"}>
                {PV_STATUS[d.item.status]?.label || d.item.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="التاريخ" value={d.item.voucherDate} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="المستفيد" value={d.item.payeeName || "—"} />
              <KV
                label="المصدر"
                value={
                  d.source
                    ? `${d.source.code} (${d.item.cashboxId ? "صندوق" : "بنك"})`
                    : d.item.cashboxId || d.item.bankAccountId || "—"
                }
              />
              <KV label="مرجع خارجي" value={d.item.externalReference || "—"} />
              <KV label="الحساب المرتبط" value={d.source?.linkedAccountId || "—"} />
            </div>
            {d.item.description ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                {d.item.description}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">سطور الطرف المدين</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">الحساب</th>
                    <th className="py-1 pe-2">البيان</th>
                    <th className="py-1 pe-2 text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2 font-mono text-xs">{l.accountId}</td>
                      <td className="py-1 pe-2">{l.description || "—"}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-bold">
                    <td className="py-1 pe-2" colSpan={2}>
                      الإجمالي
                    </td>
                    <td className="py-1 pe-2 text-left tabular-nums">
                      {fmtSAR(d.item.totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {d.journal ? (
            <div className="rounded-lg border bg-success/5 px-3 py-2 text-xs">
              القيد المُرحَّل: <span className="font-mono font-semibold">{d.journal.number}</span>
            </div>
          ) : null}

          <Card className="p-4">
            <Timeline history={d.history} />
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === "draft" && can("finance.payment.update_draft") && (
              <Btn
                variant="outline"
                onClick={() =>
                  nav({ to: "/finance/payment-vouchers/$id/edit", params: { id } as any })
                }
              >
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {st === "draft" && can("finance.payment.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.payment.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.payment.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض السند")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("finance.payment.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("finance.payment.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس السند")}>
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
