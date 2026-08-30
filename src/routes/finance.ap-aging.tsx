import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Table, Td } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { apAging, apAgingBySupplier } from "@/lib/api/ap-allocation";

export const Route = createFileRoute("/finance/ap-aging")({
  head: () => ({ meta: [{ title: "أعمار الذمم الدائنة — ثواب" }] }),
  component: Page,
});

const BUCKET_LABELS: Record<string, string> = {
  NOT_DUE: "غير مستحق",
  D1_30: "1–30 يوم",
  D31_60: "31–60 يوم",
  D61_90: "61–90 يوم",
  D91_PLUS: "91+ يوم",
  NO_DUE_DATE: "بدون تاريخ استحقاق",
};
const BUCKET_ORDER = ["NOT_DUE", "D1_30", "D31_60", "D61_90", "D91_PLUS", "NO_DUE_DATE"];

function Page() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const sumQ = useQuery({
    queryKey: ["ap-aging", asOf],
    queryFn: () => apAging({ asOfDate: asOf }),
  });
  const bySupQ = useQuery({
    queryKey: ["ap-aging-by-supplier", asOf],
    queryFn: () => apAgingBySupplier({ asOfDate: asOf, limit: 100 }),
  });

  const buckets = sumQ.data?.summary?.buckets || {};
  const total = sumQ.data?.summary?.totalOutstanding ?? 0;
  const rec = sumQ.data?.reconciliation;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "أعمار الذمم الدائنة"]}
      title="أعمار الذمم الدائنة"
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {BUCKET_ORDER.map((b) => (
          <Card key={b} className="p-3">
            <div className="text-xs text-muted-foreground">{BUCKET_LABELS[b]}</div>
            <div className="text-lg font-extrabold mt-1 tabular-nums">
              {fmtSAR(buckets[b]?.amount ?? 0)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {buckets[b]?.count ?? 0} فاتورة
            </div>
          </Card>
        ))}
      </div>

      {rec && (
        <Card className="p-4 mb-4">
          <div className="text-sm font-bold mb-2">
            مطابقة الأعمار مع الأستاذ العام (الذمم الدائنة)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <KV label="متبقي الفواتير" value={fmtSAR(rec.agedInvoiceOutstanding)} />
            <KV label="دفعات غير مُخصَّصة" value={`(${fmtSAR(rec.unappliedPayments)})`} />
            <KV label="ذمم أخرى" value={fmtSAR(rec.otherAp)} />
            <KV label="رصيد الذمم (أستاذ)" value={fmtSAR(rec.apGl)} />
            <KV
              label="الحالة"
              value={rec.reconciled ? "مطابِق ✓" : "غير مطابِق ✗"}
              tone={rec.reconciled ? "ok" : "bad"}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            متبقي الفواتير − الدفعات غير المُخصَّصة + الذمم الأخرى = رصيد الذمم في الأستاذ العام.
            الدفعات غير المُخصَّصة تظهر منفصلة ولا تُدرَج ضمن شرائح الفواتير.
          </div>
        </Card>
      )}

      <div className="text-sm font-bold mb-2">حسب المورد</div>
      <Table
        columns={[
          "المورد",
          "غير مستحق",
          "1–30",
          "31–60",
          "61–90",
          "91+",
          "بدون استحقاق",
          "الإجمالي",
        ]}
        rows={bySupQ.data?.items || []}
        renderRow={(r: any) => (
          <>
            <Td className="text-xs font-medium">
              {r.supplierCode ? `${r.supplierCode} — ` : ""}
              {r.name}
            </Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.notDue)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.d1_30)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.d31_60)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.d61_90)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.d91Plus)}</Td>
            <Td className="tabular-nums text-xs">{fmtSAR(r.noDueDate)}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(r.total)}</Td>
          </>
        )}
      />
      {(bySupQ.data?.items?.length ?? 0) === 0 && (
        <div className="text-center text-sm text-muted-foreground py-6">
          لا توجد ذمم دائنة قائمة
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
