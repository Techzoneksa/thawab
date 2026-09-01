import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Table, Td } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { getArAging, getArAgingByCustomer } from "@/lib/api/sales-invoices";

export const Route = createFileRoute("/finance/ar-aging")({
  head: () => ({ meta: [{ title: "أعمار الذمم المدينة — ثواب" }] }),
  component: Page,
});

const BUCKET_ORDER = ["current", "d1_30", "d31_60", "d61_90", "d90plus"] as const;
const BUCKET_LABELS: Record<string, string> = {
  current: "غير مستحق / جارٍ",
  d1_30: "1–30 يوم",
  d31_60: "31–60 يوم",
  d61_90: "61–90 يوم",
  d90plus: "90+ يوم",
};

function Page() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const sumQ = useQuery({
    queryKey: ["ar-aging", asOf],
    queryFn: () => getArAging({ asOfDate: asOf }),
  });
  const byCustQ = useQuery({
    queryKey: ["ar-aging-by-customer", asOf],
    queryFn: () => getArAgingByCustomer({ asOfDate: asOf, limit: 100 }),
  });

  const buckets = sumQ.data?.summary?.buckets;
  const total = sumQ.data?.summary?.total ?? 0;
  const rec = sumQ.data?.reconciliation;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "أعمار الذمم المدينة"]}
      title="أعمار الذمم المدينة"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-sm text-muted-foreground">كما في تاريخ</label>
        <input
          type="date"
          className="inp !w-44"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
        />
        <span className="ms-auto text-sm">
          إجمالي المتبقي: <b className="tabular-nums">{fmtSAR(total)}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {BUCKET_ORDER.map((b) => (
          <Card key={b} className="p-3">
            <div className="text-xs text-muted-foreground">{BUCKET_LABELS[b]}</div>
            <div className="text-lg font-extrabold mt-1 tabular-nums">
              {fmtSAR(buckets?.[b] ?? 0)}
            </div>
          </Card>
        ))}
      </div>

      {rec && (
        <Card className="p-4 mb-4">
          <div className="text-sm font-bold mb-2">
            مطابقة الأعمار مع الأستاذ العام (الذمم المدينة)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <KV label="متبقي الفواتير المُرحَّلة" value={fmtSAR(rec.agingOutstanding)} />
            <KV label="إجمالي أستاذ العملاء" value={fmtSAR(rec.subledgerTotal)} />
            <KV label="رصيد الذمم (أستاذ)" value={fmtSAR(rec.arGl)} />
            <KV
              label="الحالة"
              value={Math.abs(rec.difference) < 0.005 ? "مطابِق ✓" : "غير مطابِق ✗"}
              tone={Math.abs(rec.difference) < 0.005 ? "ok" : "bad"}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            متبقي الفواتير المُرحَّلة = رصيد الذمم المدينة في الأستاذ العام. الفرق يجب أن يكون صفراً
            (لا توجد تسوية مقبوضات في هذه المرحلة).
          </div>
        </Card>
      )}

      <div className="text-sm font-bold mb-2">حسب العميل</div>
      <Table
        columns={["العميل", "غير مستحق", "1–30", "31–60", "61–90", "90+", "الإجمالي"]}
        rows={byCustQ.data?.items || []}
        renderRow={(r: any) => (
          <>
            <Td className="text-xs font-medium">
              {r.customerCode ? `${r.customerCode} — ` : ""}
              {r.customerName}
            </Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.buckets.current)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.buckets.d1_30)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.buckets.d31_60)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.buckets.d61_90)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.buckets.d90plus)}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(r.total)}</Td>
          </>
        )}
      />
      {(byCustQ.data?.items?.length ?? 0) === 0 && (
        <div className="text-center text-sm text-muted-foreground py-6">
          لا توجد ذمم مدينة قائمة
        </div>
      )}
    </AppShell>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-bold tabular-nums ${tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
