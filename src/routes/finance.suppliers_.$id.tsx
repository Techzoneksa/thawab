import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listSupplierPaymentsForAlloc,
  listSupplierInvoicesForStatement,
} from "@/lib/api/ap-allocation";
import { getFinanceSupplier, getSupplierLedger } from "@/lib/api/suppliers-finance";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/finance/suppliers_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المورد — ثواب" }] }),
  component: SupplierDetailPage,
});

const ALLOC_BUCKET_LABEL: Record<string, string> = {
  NOT_DUE: "غير مستحق",
  D1_30: "1–30",
  D31_60: "31–60",
  D61_90: "61–90",
  D91_PLUS: "91+",
  NO_DUE_DATE: "بدون استحقاق",
};

function SupplierDetailPage() {
  const { id } = useParams({ from: "/finance/suppliers_/$id" });
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "statement" | "allocation">("overview");
  const canUpdate = userCan(user, "finance.supplier.update");
  const canLedger = userCan(user, "finance.supplier.ledger.view");
  const canAlloc = userCan(user, "finance.supplier_payment_allocation.view");

  const q = useQuery({ queryKey: ["fin-supplier", id], queryFn: () => getFinanceSupplier(id) });
  const ledgerQ = useQuery({
    queryKey: ["fin-supplier-ledger", id],
    queryFn: () => getSupplierLedger(id),
    enabled: canLedger,
    retry: false,
  });
  const invSettleQ = useQuery({
    queryKey: ["fin-supplier-inv-settle", id],
    queryFn: () => listSupplierInvoicesForStatement({ supplierId: id, limit: 200 }),
    enabled: tab === "allocation" && canAlloc,
    retry: false,
  });
  const paySettleQ = useQuery({
    queryKey: ["fin-supplier-pay-settle", id],
    queryFn: () => listSupplierPaymentsForAlloc({ supplierId: id, pageSize: 200 }),
    enabled: tab === "allocation" && canAlloc,
    retry: false,
  });
  const d = q.data;
  const back = () => nav({ to: "/finance/suppliers" });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    const mv = ledgerQ.data?.movements || [];
    return {
      title: "كشف حساب مورد",
      subtitle: it.name,
      date: new Date().toISOString().slice(0, 10),
      orientation: "landscape",
      entity: {
        name: it.name,
        lines: [
          it.supplierCode ? `الرمز: ${it.supplierCode}` : "",
          it.taxNumber ? `الرقم الضريبي: ${it.taxNumber}` : "",
          it.phone ? `الهاتف: ${it.phone}` : "",
        ].filter(Boolean),
      },
      meta: [
        { label: "الرصيد الدائن", value: fmtSAR(d!.balance.payableBalance) },
        { label: "إجمالي المدين", value: fmtSAR(d!.balance.periodDebit) },
        { label: "إجمالي الدائن", value: fmtSAR(d!.balance.periodCredit) },
      ],
      columns: [
        { key: "date", label: "التاريخ", type: "date" },
        { key: "number", label: "القيد" },
        { key: "source", label: "المصدر" },
        { key: "debit", label: "مدين", type: "money" },
        { key: "credit", label: "دائن", type: "money" },
        { key: "balance", label: "الرصيد", type: "money" },
      ],
      rows: mv.map((m) => ({
        date: m.date,
        number: m.number,
        source: m.source,
        debit: m.debit || 0,
        credit: m.credit || 0,
        balance: m.payableBalance,
      })),
      totals: [
        { label: "الرصيد الدائن", value: d!.balance.payableBalance, type: "money", strong: true },
      ],
      signature: true,
      fileBase: `supplier-statement-${it.supplierCode || it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `المورد ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط المورد", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  const tabs = ["overview", "statement", ...(canAlloc ? (["allocation"] as const) : [])] as const;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموردون", d?.item?.name || "مورد"]}
      title={d?.item?.name || "المورد"}
      actions={
        <>
          {d && canLedger && <DocumentActions document={buildDoc} />}
          {d && canUpdate && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/finance/suppliers/$id/edit", params: { id } as any })}
            >
              <Pencil size={15} /> تعديل
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات المورد</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={d.item.status === "active" ? "success" : "muted"}>
                {d.item.status === "active" ? "نشط" : "موقوف"}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <KV label="الرصيد الدائن" value={fmtSAR(d.balance.payableBalance)} />
              <KV label="إجمالي المدين" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="إجمالي الدائن" value={fmtSAR(d.balance.periodCredit)} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              الرصيد الدائن محسوب من سطور الذمم الدائنة المرتبطة بالمورد في الأستاذ العام
              (مُرحّلة/معكوسة) — لا رصيد مخزّن.
            </div>
          </Card>

          <div className="flex gap-1.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              >
                {t === "overview" ? "نظرة عامة" : t === "statement" ? "كشف الحساب" : "التخصيص"}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <Card className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <KV label="الرمز" value={d.item.supplierCode || "—"} />
                <KV label="الرقم الضريبي" value={d.item.taxNumber || "—"} />
                <KV label="السجل التجاري" value={d.item.commercialRegistration || "—"} />
                <KV label="العملة" value={d.item.currency} />
                <KV label="الهاتف" value={d.item.phone || "—"} />
                <KV label="البريد" value={d.item.email || "—"} />
                <KV
                  label="مدة السداد"
                  value={d.item.paymentTermsDays != null ? `${d.item.paymentTermsDays} يوم` : "—"}
                />
                <KV label="البنك" value={d.item.bankName || "—"} />
                <KV label="الآيبان" value={d.item.ibanMasked || "—"} />
              </div>
            </Card>
          ) : tab === "allocation" ? (
            <Card className="p-4">
              <SupplierAllocationTab invQ={invSettleQ} payQ={paySettleQ} canAlloc={canAlloc} />
            </Card>
          ) : !canLedger ? (
            <EmptyState title="لا تملك صلاحية عرض كشف الحساب" description="" />
          ) : ledgerQ.isLoading ? (
            <div className="text-xs text-muted-foreground p-4">جارٍ التحميل…</div>
          ) : (ledgerQ.data?.movements.length ?? 0) === 0 ? (
            <EmptyState title="لا توجد حركات" description="لا توجد حركات على ذمم هذا المورد." />
          ) : (
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-muted-foreground text-right">
                    <tr>
                      <th className="py-1 pe-2">التاريخ</th>
                      <th className="py-1 pe-2">القيد</th>
                      <th className="py-1 pe-2">المصدر</th>
                      <th className="py-1 pe-2 text-left">مدين</th>
                      <th className="py-1 pe-2 text-left">دائن</th>
                      <th className="py-1 pe-2 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQ.data!.movements.map((m) => (
                      <tr key={m.lineId} className="border-t">
                        <td className="py-1 pe-2 tabular-nums">{m.date}</td>
                        <td className="py-1 pe-2 font-mono">{m.number}</td>
                        <td className="py-1 pe-2">{m.source}</td>
                        <td className="py-1 pe-2 text-left tabular-nums">
                          {m.debit ? fmtSAR(m.debit) : "—"}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums">
                          {m.credit ? fmtSAR(m.credit) : "—"}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums font-semibold">
                          {fmtSAR(m.payableBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function SupplierAllocationTab({
  invQ,
  payQ,
  canAlloc,
}: {
  invQ: { data?: { items: any[] }; isLoading: boolean };
  payQ: { data?: { items: any[] }; isLoading: boolean };
  canAlloc: boolean;
}) {
  if (!canAlloc) return <div className="text-xs text-destructive">لا تملك صلاحية عرض التخصيص</div>;
  const invoices = invQ.data?.items ?? [];
  const payments = payQ.data?.items ?? [];
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold mb-1.5">الفواتير المُرحَّلة</div>
        {invQ.isLoading ? (
          <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
        ) : invoices.length === 0 ? (
          <div className="text-xs text-muted-foreground">لا توجد فواتير مُرحَّلة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">الفاتورة</th>
                  <th className="py-1 pe-2">الاستحقاق</th>
                  <th className="py-1 pe-2">الأصل</th>
                  <th className="py-1 pe-2">المُخصَّص</th>
                  <th className="py-1 pe-2">المتبقي</th>
                  <th className="py-1 pe-2">العمر</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 pe-2 font-mono">{r.invoiceNumber}</td>
                    <td className="py-1 pe-2 tabular-nums">{r.dueDate || "—"}</td>
                    <td className="py-1 pe-2 tabular-nums">{fmtSAR(r.originalPayable)}</td>
                    <td className="py-1 pe-2 tabular-nums">{fmtSAR(r.allocated)}</td>
                    <td className="py-1 pe-2 tabular-nums font-semibold">
                      {fmtSAR(r.outstanding)}
                    </td>
                    <td className="py-1 pe-2">
                      {r.outstanding > 0.005 ? (ALLOC_BUCKET_LABEL[r.bucket] ?? r.bucket) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs font-bold mb-1.5">الدفعات المُرحَّلة</div>
        {payQ.isLoading ? (
          <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
        ) : payments.length === 0 ? (
          <div className="text-xs text-muted-foreground">لا توجد دفعات مُرحَّلة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">الدفعة</th>
                  <th className="py-1 pe-2">التاريخ</th>
                  <th className="py-1 pe-2">القيمة</th>
                  <th className="py-1 pe-2">المُخصَّص</th>
                  <th className="py-1 pe-2">غير المُخصَّص</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 pe-2 font-mono">{r.id}</td>
                    <td className="py-1 pe-2 tabular-nums">{r.paymentDate}</td>
                    <td className="py-1 pe-2 tabular-nums">{fmtSAR(r.apDebit)}</td>
                    <td className="py-1 pe-2 tabular-nums">{fmtSAR(r.allocated)}</td>
                    <td className="py-1 pe-2 tabular-nums font-semibold">{fmtSAR(r.unapplied)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        التخصيص بيانات تسوية للسداد على الفواتير — لا يُنشئ قيوداً محاسبية؛ المصدر المحاسبي هو
        الأستاذ العام.
      </div>
    </div>
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
