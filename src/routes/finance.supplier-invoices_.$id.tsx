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
import { invoiceSettlement } from "@/lib/api/ap-allocation";
import {
  getSupplierInvoice,
  supplierInvoiceAction,
  type SupplierInvoiceAction,
} from "@/lib/api/supplier-invoices";
import type { DocumentDefinition } from "@/lib/documents/types";
import { SI_STATUS, Timeline, Row, KV, ReasonDialog } from "./finance.supplier-invoices";

export const Route = createFileRoute("/finance/supplier-invoices_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل فاتورة مورد — ثواب" }] }),
  component: SupplierInvoiceDetailPage,
});

function SupplierInvoiceDetailPage() {
  const { id } = useParams({ from: "/finance/supplier-invoices_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reason, setReason] = useState<{ action: SupplierInvoiceAction; title: string } | null>(
    null,
  );

  const q = useQuery({ queryKey: ["supplier-invoice", id], queryFn: () => getSupplierInvoice(id) });
  const d = q.data;
  const canAlloc = userCan(user, "finance.supplier_payment_allocation.view");
  const settleQ = useQuery({
    queryKey: ["invoice-settlement", id],
    queryFn: () => invoiceSettlement(id),
    enabled: canAlloc && d?.item.status === "posted",
    retry: false,
  });

  const actionMut = useMutation({
    mutationFn: (p: { action: SupplierInvoiceAction; reason?: string }) =>
      supplierInvoiceAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["supplier-invoice", id] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/finance/supplier-invoices" });
  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: SupplierInvoiceAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "فاتورة مورد",
      number: v.invoiceNumber,
      date: v.invoiceDate,
      orientation: "portrait",
      entity: { name: d!.supplier?.name || v.supplierId },
      meta: [
        { label: "الحالة", value: SI_STATUS[v.status]?.label || v.status },
        { label: "رقم فاتورة المورد", value: v.supplierInvoiceNumber || "—" },
        { label: "تاريخ الاستحقاق", value: v.dueDate || "—" },
        { label: "مرجع خارجي", value: v.externalReference || "—" },
      ],
      columns: [
        { key: "account", label: "الحساب", width: "36%" },
        { key: "qty", label: "كمية", type: "number" },
        { key: "price", label: "سعر", type: "money" },
        { key: "net", label: "صافي", type: "money" },
        { key: "tax", label: "ضريبة", type: "money" },
      ],
      rows: d!.lines.map((l) => {
        const alloc = (d!.allocations || []).find((a) => a.supplierInvoiceLineId === l.id);
        const matched = l.accountingMode === "grn_matched";
        return {
          account: `${matched ? `مطابقة استلام ${alloc?.grnNumber || ""}` : l.accountId}${l.description ? " — " + l.description : ""}`,
          qty: l.quantity,
          price: l.unitPrice,
          net: l.lineSubtotal,
          tax: l.taxAmount || 0,
        };
      }),
      totals: [
        { label: "الصافي", value: v.subtotal, type: "money" },
        { label: "ضريبة المدخلات", value: v.taxAmount, type: "money" },
        { label: "الإجمالي المستحق", value: v.totalAmount, type: "money", strong: true },
      ],
      notes: v.description || undefined,
      signature: true,
      fileBase: `supplier-invoice-${v.invoiceNumber}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `فاتورة مورد ${d?.item?.invoiceNumber || ""}`;
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
      showToast("تم نسخ رابط الفاتورة", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير الموردين", d?.item?.invoiceNumber || "فاتورة"]}
      title={`فاتورة مورد: ${d?.item?.invoiceNumber || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && st !== "draft" && (
            <Btn
              variant="ghost"
              onClick={() =>
                nav({ to: "/finance/supplier-invoices/$id/print", params: { id } as any })
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
        <div className="p-8 text-center text-destructive">تعذّر جلب الفاتورة</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{d.item.invoiceNumber}</div>
              <Badge tone={SI_STATUS[d.item.status]?.tone || "muted"}>
                {SI_STATUS[d.item.status]?.label || d.item.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="المورد" value={d.supplier?.name || d.item.supplierId} />
              <KV label="رقم فاتورة المورد" value={d.item.supplierInvoiceNumber || "—"} />
              <KV label="تاريخ الفاتورة" value={d.item.invoiceDate} />
              <KV label="تاريخ الاستحقاق" value={d.item.dueDate || "—"} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="مرجع خارجي" value={d.item.externalReference || "—"} />
            </div>
            {d.item.description ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                {d.item.description}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">بنود الفاتورة</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">الحساب</th>
                    <th className="py-1 pe-2 text-left">كمية</th>
                    <th className="py-1 pe-2 text-left">سعر</th>
                    <th className="py-1 pe-2 text-left">صافي</th>
                    <th className="py-1 pe-2 text-left">ضريبة</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const alloc = (d.allocations || []).find(
                      (a) => a.supplierInvoiceLineId === l.id,
                    );
                    const matched = l.accountingMode === "grn_matched";
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="py-1 pe-2 font-mono text-[11px]">
                          {matched ? (
                            <span className="inline-block rounded bg-primary/10 px-1 text-[10px] font-sans">
                              مطابقة استلام {alloc?.grnNumber || ""}
                            </span>
                          ) : (
                            l.accountId
                          )}
                          {l.description ? (
                            <div className="text-muted-foreground font-sans">{l.description}</div>
                          ) : null}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums">{l.quantity}</td>
                        <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                        <td className="py-1 pe-2 text-left tabular-nums">
                          {fmtSAR(l.lineSubtotal)}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.taxAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="الصافي" value={d.item.subtotal} />
              <Row label="الضريبة (مدخلات)" value={d.item.taxAmount} />
              <Row label="الإجمالي المستحق" value={d.item.totalAmount} bold />
            </div>
          </Card>

          {d.journal ? (
            <div className="rounded-lg border bg-success/5 px-3 py-2 text-xs">
              القيد المُرحَّل: <span className="font-mono font-semibold">{d.journal.number}</span>
            </div>
          ) : null}

          {canAlloc && d.item.status === "posted" && settleQ.data ? (
            <Card className="p-4">
              <div className="text-xs font-bold mb-2">تسوية الدفعات (تخصيص)</div>
              <div className="grid grid-cols-3 gap-2">
                <KV label="الأصل" value={fmtSAR(settleQ.data.originalPayable)} />
                <KV label="المُخصَّص" value={fmtSAR(settleQ.data.allocated)} />
                <KV label="المتبقي" value={fmtSAR(settleQ.data.outstanding)} />
              </div>
              {(settleQ.data.allocations || []).length > 0 && (
                <table className="w-full text-[11px] mt-2">
                  <thead className="text-muted-foreground text-right">
                    <tr>
                      <th className="py-1 pe-2">الدفعة</th>
                      <th className="py-1 pe-2">التاريخ</th>
                      <th className="py-1 pe-2">المبلغ المُخصَّص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleQ.data.allocations.map((a: any) => (
                      <tr key={a.id} className="border-t">
                        <td className="py-1 pe-2 font-mono">{a.supplierPaymentId}</td>
                        <td className="py-1 pe-2 tabular-nums">{a.paymentDate}</td>
                        <td className="py-1 pe-2 tabular-nums font-semibold">{fmtSAR(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="text-[10px] text-muted-foreground mt-2">
                التخصيص بيانات تسوية — لا يُنشئ قيداً محاسبياً. المتبقي = الأصل − إجمالي التخصيصات.
              </div>
            </Card>
          ) : null}

          <Card className="p-4">
            <Timeline history={d.history} />
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === "draft" && can("finance.supplier_invoice.update_draft") && (
              <Btn
                variant="outline"
                onClick={() =>
                  nav({ to: "/finance/supplier-invoices/$id/edit", params: { id } as any })
                }
              >
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {st === "draft" && can("finance.supplier_invoice.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.supplier_invoice.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.supplier_invoice.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض الفاتورة")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("finance.supplier_invoice.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("finance.supplier_invoice.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس الفاتورة")}>
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
