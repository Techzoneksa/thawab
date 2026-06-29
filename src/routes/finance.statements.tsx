import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, SectionTitle } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Download, Printer, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/finance/statements")({
  head: () => ({ meta: [{ title: "القوائم المالية — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المالية", "القوائم المالية"]} title="القوائم المالية للجمعيات الخيرية"
      actions={<><Btn variant="outline"><Printer size={15} />طباعة</Btn><Btn variant="primary"><Download size={15} />تنزيل PDF</Btn></>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <SectionTitle title="قائمة المركز المالي" hint="كما في 30 شوال 1446هـ" />
          <table className="w-full text-sm">
            <tbody>
              <tr><td colSpan={2} className="font-bold pt-3 pb-1 border-b">الأصول</td></tr>
              <tr><td className="py-1.5 pr-4">النقد والبنوك</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(7_636_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">حسابات مدينة</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(420_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">مخزون</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(840_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">أصول ثابتة (صافي)</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(6_120_000)}</td></tr>
              <tr className="font-bold border-t"><td className="py-2 pr-4">إجمالي الأصول</td><td className="py-2 text-left tabular-nums">{fmtSAR(15_016_000)}</td></tr>

              <tr><td colSpan={2} className="font-bold pt-3 pb-1 border-b">الالتزامات وصافي الأصول</td></tr>
              <tr><td className="py-1.5 pr-4">حسابات دائنة</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(820_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">مستحقات أخرى</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(420_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">أموال غير مقيدة</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(6_596_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">أموال مقيدة بغرض</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(5_680_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">أموال الأوقاف</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(1_500_000)}</td></tr>
              <tr className="font-bold border-t"><td className="py-2 pr-4">إجمالي الالتزامات وصافي الأصول</td><td className="py-2 text-left tabular-nums">{fmtSAR(15_016_000)}</td></tr>
            </tbody>
          </table>
        </Card>

        <Card className="p-6">
          <SectionTitle title="قائمة الأنشطة" hint="عن الفترة المنتهية في 30 شوال 1446هـ" />
          <table className="w-full text-sm">
            <tbody>
              <tr><td colSpan={2} className="font-bold pt-3 pb-1 border-b">الإيرادات</td></tr>
              <tr><td className="py-1.5 pr-4">تبرعات نقدية</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(14_220_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">تبرعات عينية</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(3_400_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">عوائد الأوقاف</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(980_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">المنح</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(3_540_000)}</td></tr>
              <tr className="font-bold border-t"><td className="py-2 pr-4">إجمالي الإيرادات</td><td className="py-2 text-left tabular-nums">{fmtSAR(22_140_000)}</td></tr>

              <tr><td colSpan={2} className="font-bold pt-3 pb-1 border-b">المصروفات</td></tr>
              <tr><td className="py-1.5 pr-4">مصروفات البرامج</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(13_220_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">مصروفات إدارية</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(2_180_000)}</td></tr>
              <tr><td className="py-1.5 pr-4">مصروفات جمع التبرعات</td><td className="py-1.5 text-left tabular-nums">{fmtSAR(1_440_000)}</td></tr>
              <tr className="font-bold border-t"><td className="py-2 pr-4">إجمالي المصروفات</td><td className="py-2 text-left tabular-nums">{fmtSAR(16_840_000)}</td></tr>

              <tr className="font-extrabold text-success border-t-2 border-double"><td className="py-3 pr-4">الفائض / (العجز) للفترة</td><td className="py-3 text-left tabular-nums">{fmtSAR(5_300_000)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-6 mt-4">
        <SectionTitle title="نسبة المصروفات حسب الفئة" />
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { l: "مصروفات البرامج", v: 78, c: "bg-success" },
            { l: "مصروفات إدارية", v: 13, c: "bg-warning" },
            { l: "جمع تبرعات", v: 9, c: "bg-info" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-2xl font-extrabold tabular-nums">{s.v}%</div>
              <div className="text-xs text-muted-foreground mb-2">{s.l}</div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${s.c}`} style={{ width: `${s.v}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">نسبة مصروفات البرامج 78% تتجاوز الحد الأدنى المطلوب من المركز الوطني لتنمية القطاع غير الربحي.</p>
      </Card>
    </AppShell>
  ),
});
