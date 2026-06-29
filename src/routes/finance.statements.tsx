import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, SectionTitle, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { showToast, ExportButton, PrintButton, PrintStyle } from "@/components/erp/actions";
import { Download, Printer, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/finance/statements")({
  head: () => ({ meta: [{ title: "القوائم المالية — ثواب" }] }),
  component: Page,
});

const balanceSheetData = [
  { البيان: "النقد والبنوك", القيمة: 7_636_000 },
  { البيان: "حسابات مدينة", القيمة: 420_000 },
  { البيان: "مخزون", القيمة: 840_000 },
  { البيان: "أصول ثابتة (صافي)", القيمة: 6_120_000 },
  { البيان: "إجمالي الأصول", القيمة: 15_016_000, isTotal: true },
  { البيان: "حسابات دائنة", القيمة: 820_000 },
  { البيان: "مستحقات أخرى", القيمة: 420_000 },
  { البيان: "أموال غير مقيدة", القيمة: 6_596_000 },
  { البيان: "أموال مقيدة بغرض", القيمة: 5_680_000 },
  { البيان: "أموال الأوقاف", القيمة: 1_500_000 },
  { البيان: "إجمالي الالتزامات وصافي الأصول", القيمة: 15_016_000, isTotal: true },
];

const incomeStatementData = [
  { البيان: "تبرعات نقدية", القيمة: 14_220_000 },
  { البيان: "تبرعات عينية", القيمة: 3_400_000 },
  { البيان: "عوائد الأوقاف", القيمة: 980_000 },
  { البيان: "المنح", القيمة: 3_540_000 },
  { البيان: "إجمالي الإيرادات", القيمة: 22_140_000, isTotal: true },
  { البيان: "مصروفات البرامج", القيمة: 13_220_000 },
  { البيان: "مصروفات إدارية", القيمة: 2_180_000 },
  { البيان: "مصروفات جمع التبرعات", القيمة: 1_440_000 },
  { البيان: "إجمالي المصروفات", القيمة: 16_840_000, isTotal: true },
  { البيان: "الفائض / (العجز) للفترة", القيمة: 5_300_000, isTotal: true },
];

function Page() {
  return (
    <>
      <PrintStyle />
      <AppShell
        breadcrumb={["الرئيسية", "المالية", "القوائم المالية"]}
        title="القوائم المالية للجمعيات الخيرية"
        actions={
          <>
            <PrintButton />
            <Btn
              variant="primary"
              onClick={() => showToast("تم إنشاء القائمة المالية بنجاح", "success")}
            >
              <FileBarChart size={15} />
              إنشاء قائمة
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="القوائم المالية للجمعيات الخيرية" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6">
            <SectionTitle
              title="قائمة المركز المالي"
              hint="كما في 30 شوال 1446هـ"
              action={
                <ExportButton data={balanceSheetData} filename="balance-sheet.csv" label="تصدير" />
              }
            />
            <table className="w-full text-sm">
              <tbody>
                {balanceSheetData.map((row, i) => (
                  <tr key={i} className={row.isTotal ? "font-bold border-t" : ""}>
                    <td className={`py-1.5 ${row.isTotal ? "" : "pr-4"}`}>{row.البيان}</td>
                    <td className="py-1.5 text-left tabular-nums">{fmtSAR(row.القيمة)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end">
              <PrintButton label="طباعة القائمة" />
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle
              title="قائمة الأنشطة"
              hint="عن الفترة المنتهية في 30 شوال 1446هـ"
              action={
                <ExportButton
                  data={incomeStatementData}
                  filename="income-statement.csv"
                  label="تصدير"
                />
              }
            />
            <table className="w-full text-sm">
              <tbody>
                {incomeStatementData.map((row, i) => (
                  <tr key={i} className={row.isTotal ? "font-bold border-t" : ""}>
                    <td
                      className={`py-1.5 ${row.البيان === "الفائض / (العجز) للفترة" ? "text-success font-extrabold" : ""} ${row.isTotal ? "" : "pr-4"}`}
                    >
                      {row.البيان}
                    </td>
                    <td
                      className={`py-1.5 text-left tabular-nums ${row.البيان === "الفائض / (العجز) للفترة" ? "text-success font-extrabold" : ""}`}
                    >
                      {fmtSAR(row.القيمة)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end">
              <PrintButton label="طباعة القائمة" />
            </div>
          </Card>
        </div>

        <Card className="p-6 mt-4">
          <SectionTitle
            title="نسبة المصروفات حسب الفئة"
            action={
              <ExportButton
                data={[
                  { الفئة: "مصروفات البرامج", النسبة: "78%" },
                  { الفئة: "مصروفات إدارية", النسبة: "13%" },
                  { الفئة: "جمع تبرعات", النسبة: "9%" },
                ]}
                filename="expense-ratios.csv"
                label="تصدير"
              />
            }
          />
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { l: "مصروفات البرامج", v: 78, c: "bg-success" },
              { l: "مصروفات إدارية", v: 13, c: "bg-warning" },
              { l: "جمع تبرعات", v: 9, c: "bg-info" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl font-extrabold tabular-nums">{s.v}%</div>
                <div className="text-xs text-muted-foreground mb-2">{s.l}</div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${s.c}`} style={{ width: `${s.v}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            نسبة مصروفات البرامج 78% تتجاوز الحد الأدنى المطلوب من المركز الوطني لتنمية القطاع غير
            الربحي.
          </p>
        </Card>
      </AppShell>
    </>
  );
}
