import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, Btn } from "@/components/erp/AppShell";
import { CHART_OF_ACCOUNTS, fmtSAR } from "@/data/sample";
import { Plus, Download, ChevronLeft, Search } from "lucide-react";

export const Route = createFileRoute("/finance/accounts")({
  head: () => ({ meta: [{ title: "دليل الحسابات — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "المالية", "دليل الحسابات"]} title="دليل الحسابات"
      actions={<><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><Plus size={15} />حساب جديد</Btn></>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1 p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث عن حساب..." />
          </div>
          <div className="space-y-1 text-sm">
            {CHART_OF_ACCOUNTS.map((a) => (
              <button key={a.code} className={`w-full text-right rounded-md py-1.5 px-2 hover:bg-muted transition-colors flex items-center gap-2 ${a.level === 1 ? "font-bold" : ""}`} style={{ paddingRight: `${a.level * 12 + 8}px` }}>
                <ChevronLeft size={12} className="text-muted-foreground shrink-0" />
                <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">1102 · أصل</div>
              <h2 className="text-xl font-extrabold">البنوك</h2>
              <p className="text-sm text-muted-foreground mt-1">الحسابات البنكية للجمعية بجميع فروعها وعملاتها.</p>
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground">الرصيد الحالي</div>
              <div className="text-2xl font-extrabold tabular-nums">{fmtSAR(7_552_000)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { l: "نوع الحساب", v: "أصل متداول" },
              { l: "العملة", v: "ر.س - SAR" },
              { l: "نوع الصندوق", v: "متعدد" },
              { l: "حالة الحساب", v: "نشط" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-muted/50 p-3">
                <div className="text-[11px] text-muted-foreground">{s.l}</div>
                <div className="font-semibold text-sm mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="font-bold mb-2">الحسابات الفرعية</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-semibold">الرمز</th>
                    <th className="px-3 py-2 font-semibold">اسم الحساب</th>
                    <th className="px-3 py-2 font-semibold">البنك</th>
                    <th className="px-3 py-2 font-semibold">الرصيد</th>
                    <th className="px-3 py-2 font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { c: "110201", n: "حساب التبرعات العام", b: "مصرف الراجحي", v: 4_120_000 },
                    { c: "110202", n: "حساب كفالة الأيتام (مقيد)", b: "البنك الأهلي السعودي", v: 1_840_000 },
                    { c: "110203", n: "حساب التشغيل", b: "بنك الرياض", v: 980_000 },
                    { c: "110204", n: "حساب الأوقاف", b: "بنك الإنماء", v: 612_000 },
                  ].map((r) => (
                    <tr key={r.c} className="border-t hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs">{r.c}</td>
                      <td className="px-3 py-2 font-semibold">{r.n}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.b}</td>
                      <td className="px-3 py-2 tabular-nums font-bold">{fmtSAR(r.v)}</td>
                      <td className="px-3 py-2"><Badge tone="success">نشط</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
