import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, SectionTitle, Btn, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Download, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { showToast, ExportButton } from "@/components/erp/actions";

type RegionItem = { n: string; b: number; v: number };

export const Route = createFileRoute("/distribution")({
  head: () => ({ meta: [{ title: "تقارير التوزيع — ثواب" }] }),
  component: () => {
    const [regions] = useState<RegionItem[]>([
      { n: "الرياض", b: 4120, v: 980000 },
      { n: "مكة المكرمة", b: 2840, v: 720000 },
      { n: "المدينة المنورة", b: 1240, v: 320000 },
      { n: "عسير", b: 1640, v: 410000 },
      { n: "الشرقية", b: 1420, v: 380000 },
      { n: "تبوك", b: 480, v: 120000 },
      { n: "حائل", b: 380, v: 90000 },
      { n: "جازان", b: 720, v: 180000 },
    ]);
    const max = Math.max(...regions.map((r) => r.b));

    const exportData = regions.map((r) => ({
      المنطقة: r.n,
      "عدد المستفيدين": r.b,
      "قيمة المساعدات": r.v,
    }));

    return (
      <AppShell
        breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "تقارير التوزيع"]}
        title="تقارير التوزيع الجغرافي"
        actions={
          <>
            <ExportButton data={exportData} filename="distribution.csv" />
            <Btn variant="outline" onClick={() => showToast("تم تصدير التقرير", "success")}>
              <Download size={15} /> تصدير تقرير
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="تقارير التوزيع الجغرافي" count={`${regions.length} منطقة`} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionTitle title="توزيع المستفيدين حسب المنطقة" hint="إجمالي 12,846 مستفيد" />
            <div className="space-y-3">
              {regions.map((r) => (
                <div key={r.n}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium flex items-center gap-1">
                      <MapPin size={12} />
                      {r.n}
                    </span>
                    <span className="tabular-nums">
                      {fmtNum(r.b)} مستفيد · {fmtSAR(r.v)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-primary to-info"
                      style={{ width: `${(r.b / max) * 100}%` }}
                    />
                  </div>
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
                  <div className="flex justify-between text-sm">
                    <span>{r.n}</span>
                    <span className="font-bold tabular-nums">{r.v}%</span>
                  </div>
                  <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${r.c}`} style={{ width: `${r.v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </AppShell>
    );
  },
});
