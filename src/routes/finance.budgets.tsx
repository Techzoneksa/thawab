import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus, Download } from "lucide-react";

export const Route = createFileRoute("/finance/budgets")({
  head: () => ({ meta: [{ title: "الموازنات — ثواب" }] }),
  component: () => {
    const rows = [
      { dept: "إدارة المشاريع", budget: 8_400_000, spent: 5_120_000, period: "1446" },
      { dept: "إدارة المساعدات", budget: 12_200_000, spent: 7_840_000, period: "1446" },
      { dept: "الإدارة المالية", budget: 1_800_000, spent: 980_000, period: "1446" },
      { dept: "الموارد البشرية", budget: 2_400_000, spent: 1_640_000, period: "1446" },
      { dept: "تقنية المعلومات", budget: 1_200_000, spent: 720_000, period: "1446" },
      { dept: "العلاقات العامة", budget: 900_000, spent: 410_000, period: "1446" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المالية", "الموازنات"]} title="الموازنات السنوية"
        actions={<><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><Plus size={15} />موازنة جديدة</Btn></>}
      >
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60"><tr className="text-right">
              <th className="px-4 py-3 font-semibold">الإدارة</th>
              <th className="px-4 py-3 font-semibold">السنة المالية</th>
              <th className="px-4 py-3 font-semibold">الموازنة المعتمدة</th>
              <th className="px-4 py-3 font-semibold">المنصرف الفعلي</th>
              <th className="px-4 py-3 font-semibold">المتبقي</th>
              <th className="px-4 py-3 font-semibold">نسبة التنفيذ</th>
              <th className="px-4 py-3 font-semibold">الحالة</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const pct = Math.round((r.spent / r.budget) * 100);
                const status = pct > 90 ? "تجاوز متوقع" : pct > 70 ? "متقدم" : "ضمن المخطط";
                return (
                  <tr key={r.dept} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold">{r.dept}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.period}هـ</td>
                    <td className="px-4 py-3 tabular-nums">{fmtSAR(r.budget)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtSAR(r.spent)}</td>
                    <td className="px-4 py-3 tabular-nums text-success">{fmtSAR(r.budget - r.spent)}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2 w-40"><div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} /></div><span className="text-xs tabular-nums">{pct}%</span></div></td>
                    <td className="px-4 py-3"><Badge tone={pct > 90 ? "destructive" : pct > 70 ? "warning" : "success"}>{status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </AppShell>
    );
  },
});
