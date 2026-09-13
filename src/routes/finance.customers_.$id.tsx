import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getFinanceCustomer, getCustomerLedger } from "@/lib/api/customers-finance";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/finance/customers_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل العميل — ثواب" }] }),
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { id } = useParams({ from: "/finance/customers_/$id" });
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "statement">("overview");
  const canUpdate = userCan(user, "finance.customer.update");
  const canLedger = userCan(user, "finance.customer.ledger.view");

  const q = useQuery({ queryKey: ["fin-customer", id], queryFn: () => getFinanceCustomer(id) });
  const ledgerQ = useQuery({
    queryKey: ["fin-customer-ledger", id],
    queryFn: () => getCustomerLedger(id),
    enabled: canLedger,
    retry: false,
  });
  const d = q.data;
  const back = () => nav({ to: "/finance/customers" });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    const mv = ledgerQ.data?.movements || [];
    return {
      title: "كشف حساب عميل",
      subtitle: it.name,
      date: new Date().toISOString().slice(0, 10),
      orientation: "landscape",
      entity: {
        name: it.name,
        lines: [
          it.customerCode ? `الرمز: ${it.customerCode}` : "",
          it.taxNumber ? `الرقم الضريبي: ${it.taxNumber}` : "",
          it.phone ? `الهاتف: ${it.phone}` : "",
        ].filter(Boolean),
      },
      meta: [
        { label: "الرصيد المدين", value: fmtSAR(d!.balance.receivableBalance) },
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
        balance: m.receivableBalance,
      })),
      totals: [
        {
          label: "الرصيد المدين",
          value: d!.balance.receivableBalance,
          type: "money",
          strong: true,
        },
      ],
      signature: true,
      fileBase: `customer-statement-${it.customerCode || it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `العميل ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط العميل", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "العملاء", d?.item?.name || "عميل"]}
      title={d?.item?.name || "العميل"}
      actions={
        <>
          {d && canLedger && <DocumentActions document={buildDoc} />}
          {d && canUpdate && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/finance/customers/$id/edit", params: { id } as any })}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات العميل</div>
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
              <KV label="الرصيد المدين" value={fmtSAR(d.balance.receivableBalance)} />
              <KV label="إجمالي المدين" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="إجمالي الدائن" value={fmtSAR(d.balance.periodCredit)} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              الرصيد المدين محسوب من سطور الذمم المدينة المرتبطة بالعميل في الأستاذ العام
              (مُرحّلة/معكوسة) — لا رصيد مخزّن.
            </div>
          </Card>

          <div className="flex gap-1.5">
            {(["overview", "statement"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              >
                {t === "overview" ? "نظرة عامة" : "كشف الحساب"}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <Card className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <KV label="الرمز" value={d.item.customerCode || "—"} />
                <KV label="الرقم الضريبي" value={d.item.taxNumber || "—"} />
                <KV label="السجل التجاري" value={d.item.commercialRegistration || "—"} />
                <KV label="العملة" value={d.item.currency} />
                <KV label="الهاتف" value={d.item.phone || "—"} />
                <KV label="البريد" value={d.item.email || "—"} />
                <KV
                  label="مدة السداد"
                  value={d.item.paymentTermsDays != null ? `${d.item.paymentTermsDays} يوم` : "—"}
                />
                <KV label="جهة الاتصال" value={d.item.contactPerson || "—"} />
                <KV label="العنوان" value={d.item.address || "—"} />
              </div>
            </Card>
          ) : !canLedger ? (
            <EmptyState title="لا تملك صلاحية عرض كشف الحساب" description="" />
          ) : ledgerQ.isLoading ? (
            <div className="text-xs text-muted-foreground p-4">جارٍ التحميل…</div>
          ) : (ledgerQ.data?.movements.length ?? 0) === 0 ? (
            <EmptyState title="لا توجد حركات" description="لا توجد حركات على ذمم هذا العميل." />
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
                          {fmtSAR(m.receivableBalance)}
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
