import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, SectionTitle } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";

export const Route = createFileRoute("/endowment-returns")({
  head: () => ({ meta: [{ title: "عوائد الأوقاف — ثواب" }] }),
  component: () => {
    const data = [
      { q: "Q1 1446", v: 192_000 },
      { q: "Q2 1446", v: 204_000 },
      { q: "Q3 1446", v: 218_000 },
      { q: "Q4 1446 (متوقع)", v: 184_000 },
    ];
    const max = Math.max(...data.map((d) => d.v));
    return (
      <AppShell breadcrumb={["الرئيسية", "المنح والأوقاف", "عوائد الأوقاف"]} title="عوائد الأوقاف الاستثمارية">
        <Card className="p-5">
          <SectionTitle title="العوائد الربعية للسنة 1446هـ" hint={`إجمالي محقق: ${fmtSAR(798_000)}`} />
          <div className="flex items-end gap-6 h-60">
            {data.map((d) => (
              <div key={d.q} className="flex-1 flex flex-col items-center gap-2">
                <div className="text-xs font-bold tabular-nums">{fmtSAR(d.v)}</div>
                <div className="w-full bg-gradient-to-t from-primary to-info/70 rounded-t" style={{ height: `${(d.v / max) * 90}%` }} />
                <div className="text-xs text-muted-foreground">{d.q}</div>
              </div>
            ))}
          </div>
        </Card>
      </AppShell>
    );
  },
});
