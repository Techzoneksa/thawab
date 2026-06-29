import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, Btn, Table, Td, FilterBar, Select } from "@/components/erp/AppShell";
import { CHART_OF_ACCOUNTS, fmtSAR } from "@/data/sample";
import { Download } from "lucide-react";

export const Route = createFileRoute("/finance/ledger")({
  head: () => ({ meta: [{ title: "دفتر الأستاذ — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المالية", "دفتر الأستاذ"]} title="دفتر الأستاذ"
      actions={<Btn variant="outline"><Download size={15} />تصدير</Btn>}
    >
      <FilterBar>
        <Select label="الحساب" options={CHART_OF_ACCOUNTS.map((a) => `${a.code} ${a.name}`)} />
        <Select label="الفترة" options={["هذا الشهر", "هذا الربع", "هذا العام"]} />
        <Select label="نوع الصندوق" options={["الكل", "مقيد", "غير مقيد", "أوقاف"]} />
      </FilterBar>
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-right"><th className="px-4 py-3 font-semibold">التاريخ</th><th className="px-4 py-3 font-semibold">رقم القيد</th><th className="px-4 py-3 font-semibold">البيان</th><th className="px-4 py-3 font-semibold">مدين</th><th className="px-4 py-3 font-semibold">دائن</th><th className="px-4 py-3 font-semibold">الرصيد</th></tr>
          </thead>
          <tbody>
            {[
              { d: "1446/10/01", id: "JV-2406-0150", b: "رصيد افتتاحي", dr: 0, cr: 0, bal: 6_840_000 },
              { d: "1446/10/03", id: "JV-2406-0152", b: "تبرع بنكي - حملة كفالة", dr: 320_000, cr: 0, bal: 7_160_000 },
              { d: "1446/10/05", id: "JV-2406-0158", b: "صرف موردين - سلال غذائية", dr: 0, cr: 47_300, bal: 7_112_700 },
              { d: "1446/10/08", id: "JV-2406-0164", b: "تبرع بنكي - حملة كسوة الشتاء", dr: 280_000, cr: 0, bal: 7_392_700 },
              { d: "1446/10/10", id: "JV-2406-0183", b: "رواتب الإدارة - شوال", dr: 0, cr: 312_400, bal: 7_080_300 },
              { d: "1446/10/10", id: "JV-2406-0184", b: "عوائد وقفية ربعية", dr: 180_000, cr: 0, bal: 7_260_300 },
              { d: "1446/10/11", id: "JV-2406-0185", b: "تبرع نقدي - إفطار صائم", dr: 32_000, cr: 0, bal: 7_292_300 },
              { d: "1446/10/12", id: "JV-2406-0188", b: "تبرع بنكي - مؤسسة الراجحي", dr: 600_000, cr: 0, bal: 7_892_300 },
            ].map((r, i) => (
              <tr key={i} className="border-t hover:bg-muted/40">
                <td className="px-4 py-2 text-muted-foreground">{r.d}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-4 py-2">{r.b}</td>
                <td className="px-4 py-2 tabular-nums text-success">{r.dr ? fmtSAR(r.dr) : "—"}</td>
                <td className="px-4 py-2 tabular-nums text-destructive">{r.cr ? fmtSAR(r.cr) : "—"}</td>
                <td className="px-4 py-2 tabular-nums font-bold">{fmtSAR(r.bal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  ),
});
