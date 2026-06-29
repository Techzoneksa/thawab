import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, SectionTitle, Btn } from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Download, MapPin } from "lucide-react";

export const Route = createFileRoute("/distribution")({
  head: () => ({ meta: [{ title: "تقارير التوزيع — ثواب" }] }),
  component: () => {
    const regions = [
      { n: "الرياض", b: 4_120, v: 980_000 },
      { n: "مكة المكرمة", b: 2_840, v: 720_000 },
      { n: "المدينة المنورة", b: 1_240, v: 320_000 },
      { n: "عسير", b: 1_640, v: 410_000 },
      { n: "الشرقية", b: 1_420, v: 380_000 },
      { n: "تبوك", b: 480, v: 120_000 },
      { n: "حائل", b: 380, v: 90_000 },
      { n: "جازان", b: 720, v: 180_000 },
    ];
    const max = Math.max(...regions.map((r) => r.b));
    return (
      <AppShell breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "تقارير التوزيع"]} title="تقارير التوزيع الجغرافي"
        actions={<Btn variant="outline"><Download size={15} />تصدير</Btn>}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionTitle title="توزيع المستفيدين حسب المنطقة" hint="إجمالي 12,846 مستفيد" />
            <div className="space-y-3">
              {regions.map((r) => (
                <div key={r.n}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-medium flex items-center gap-1"><MapPin size={12} />{r.n}</span><span className="tabular-nums">{fmtNum(r.b)} مستفيد · {fmtSAR(r.v)}</span></div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-gradient-to-l from-primary to-info" style={{ width: `${(r.b / max) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle title="توزيع المساعدات حسب الفئة" />
            <div className="grid grid-cols-2 gap-3">
              {[
                { n: "أيتام", v: 38, c: "bg-primary" },
                { n: "أسر متعففة", v: 24, c: "bg-info" },
                { n: "أرامل", v: 16, c: "bg-success" },
                { n: "مرضى", v: 12, c: "bg-warning" },
                { n: "أسر منتجة", v: 7, c: "bg-chart-5" },
                { n: "أخرى", v: 3, c: "bg-muted-foreground" },
              ].map((r) => (
                <div key={r.n} className="rounded-lg border p-3">
                  <div className="flex justify-between text-sm"><span>{r.n}</span><span className="font-bold tabular-nums">{r.v}%</span></div>
                  <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${r.c}`} style={{ width: `${r.v}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </AppShell>
    );
  },
});
