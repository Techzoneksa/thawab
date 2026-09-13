import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, X } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  receiptSettlement,
  allocationCandidates,
  allocate,
  unallocate,
} from "@/lib/api/ar-allocation";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/finance/customer-receipts_/$id")({
  head: () => ({ meta: [{ title: "تخصيص التحصيل — ثواب" }] }),
  component: ReceiptDetailPage,
});

const METHOD_LABEL: Record<string, string> = { bank: "بنك", cash: "نقد" };

function ReceiptDetailPage() {
  const { id } = useParams({ from: "/finance/customer-receipts_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = userCan(user, "finance.customer_receipt_allocation.manage");
  const [q, setQ] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const settleQ = useQuery({
    queryKey: ["receipt-settlement", id],
    queryFn: () => receiptSettlement(id),
  });
  const candQ = useQuery({
    queryKey: ["ar-alloc-candidates", id, q],
    queryFn: () => allocationCandidates(id, q || undefined),
    enabled: canManage,
  });

  const refresh = () => {
    settleQ.refetch();
    candQ.refetch();
    qc.invalidateQueries({ queryKey: ["customer-receipts"] });
    qc.invalidateQueries({ queryKey: ["ar-aging"] });
  };

  const allocMut = useMutation({
    mutationFn: (v: { invoiceId: string; amount: number }) => allocate(id, v.invoiceId, v.amount),
    onSuccess: () => {
      showToast("تم التخصيص", "success");
      setAmounts({});
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const unallocMut = useMutation({
    mutationFn: (invoiceId: string) => unallocate(id, invoiceId),
    onSuccess: () => {
      showToast("تم إلغاء التخصيص", "success");
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const s = settleQ.data;
  const unapplied = s?.unapplied ?? 0;
  const back = () => nav({ to: "/finance/customer-receipts" });

  const buildDoc = (): DocumentDefinition => ({
    title: "سند قبض",
    number: s.receiptId,
    date: s.receiptDate,
    orientation: "portrait",
    entity: {
      name: s.customerName || s.customerId,
      lines: [s.customerCode ? `الرمز: ${s.customerCode}` : ""].filter(Boolean),
    },
    meta: [
      { label: "طريقة التحصيل", value: METHOD_LABEL[s.receiptMethod] || s.receiptMethod || "—" },
      { label: "المرجع", value: s.reference || "—" },
    ],
    columns: [
      { key: "invoice", label: "الفاتورة", width: "40%" },
      { key: "date", label: "التاريخ", type: "date" },
      { key: "amount", label: "المبلغ المُخصَّص", type: "money" },
    ],
    rows: (s.allocations || []).map((a: any) => ({
      invoice: a.invoiceNumber,
      date: a.invoiceDate,
      amount: a.amount,
    })),
    totals: [
      { label: "قيمة التحصيل", value: s.arCredit, type: "money", strong: true },
      { label: "المُخصَّص", value: s.allocated, type: "money" },
      { label: "غير المُخصَّص", value: s.unapplied, type: "money" },
    ],
    notes: s.note || undefined,
    signature: true,
    fileBase: `customer-receipt-${s.receiptId}`,
  });

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: `سند قبض ${id}`, url });
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
      breadcrumb={["الرئيسية", "المالية", "تحصيل العملاء", id]}
      title={`سند قبض: ${id}`}
      actions={
        <>
          {s && <DocumentActions document={buildDoc} />}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {settleQ.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !s ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات السند</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV label="العميل" value={s.customerName || s.customerId} />
              <KV label="التاريخ" value={s.receiptDate} />
              <KV label="الطريقة" value={METHOD_LABEL[s.receiptMethod] || s.receiptMethod || "—"} />
              <KV label="المرجع" value={s.reference || "—"} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <KV label="قيمة التحصيل" value={fmtSAR(s.arCredit)} />
              <KV label="المُخصَّص" value={fmtSAR(s.allocated)} />
              <KV
                label="غير المُخصَّص"
                value={fmtSAR(unapplied)}
                tone={unapplied > 0.005 ? "warn" : "ok"}
              />
            </div>
            <div className="text-[10px] text-muted-foreground">
              التخصيص توزيعٌ للتحصيل على الفواتير — لا يُنشئ أي قيد محاسبي. قيمة التحصيل مستمدّة من
              الطرف الدائن للذمم في القيد المُرحَّل.
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-bold mb-2">التخصيصات الحالية</div>
            {(s.allocations || []).length === 0 ? (
              <div className="text-xs text-muted-foreground">لا توجد تخصيصات بعد</div>
            ) : (
              <div className="space-y-1.5">
                {(s.allocations || []).map((a: any) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                  >
                    <span className="font-mono text-xs">{a.invoiceNumber}</span>
                    <span className="text-xs text-muted-foreground">{a.invoiceDate}</span>
                    <span className="ms-auto tabular-nums font-semibold">{fmtSAR(a.amount)}</span>
                    {canManage && (
                      <button
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"
                        title="إلغاء التخصيص"
                        onClick={() => unallocMut.mutate(a.salesInvoiceId)}
                        disabled={unallocMut.isPending}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {canManage && (
            <Card className="p-4">
              <div className="text-sm font-bold mb-1.5">
                فواتير قابلة للتخصيص (نفس العميل، مُرحَّلة، عليها متبقٍ)
              </div>
              <input
                className="inp w-full mb-2"
                placeholder="ابحث برقم الفاتورة / مرجع العميل…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="space-y-1.5">
                {(candQ.data?.items || []).map((c: any) => (
                  <div key={c.id} className="rounded-lg border px-2.5 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs font-semibold">{c.invoiceNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        استحقاق {c.dueDate || "—"}
                      </span>
                      <span className="ms-auto text-xs">
                        متبقٍ <b className="tabular-nums">{fmtSAR(c.outstanding)}</b>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input
                        className="inp !h-8 text-sm"
                        inputMode="decimal"
                        placeholder="المبلغ"
                        value={amounts[c.id] ?? ""}
                        onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                      />
                      <Btn
                        variant="outline"
                        onClick={() =>
                          allocMut.mutate({
                            invoiceId: c.id,
                            amount: Number(amounts[c.id] ?? Math.min(unapplied, c.outstanding)),
                          })
                        }
                        disabled={allocMut.isPending}
                      >
                        تخصيص
                      </Btn>
                      <button
                        className="text-[11px] text-primary whitespace-nowrap"
                        onClick={() =>
                          setAmounts((p) => ({
                            ...p,
                            [c.id]: String(Math.min(unapplied, c.outstanding)),
                          }))
                        }
                      >
                        الأقصى
                      </button>
                    </div>
                  </div>
                ))}
                {(candQ.data?.items?.length ?? 0) === 0 && (
                  <div className="text-xs text-muted-foreground py-2">
                    لا توجد فواتير قابلة للتخصيص
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums mt-0.5 ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
