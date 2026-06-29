import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { CAMPAIGNS, fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Megaphone } from "lucide-react";

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{ title: "حملات التبرع — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "التبرعات", "الحملات"]} title="حملات التبرع"
      actions={<Btn variant="primary"><Plus size={15} />حملة جديدة</Btn>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CAMPAIGNS.map((c) => {
          const pct = Math.round((c.raised / c.target) * 100);
          return (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Megaphone size={20} /></div>
                  <div className="min-w-0">
                    <h3 className="font-bold truncate">{c.name}</h3>
                    <div className="text-xs text-muted-foreground font-mono">{c.id}</div>
                  </div>
                </div>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1"><span className="font-semibold tabular-nums">{fmtSAR(c.raised)}</span><span className="text-muted-foreground">من {fmtSAR(c.target)}</span></div>
                <div className="h-3 rounded-full bg-muted overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-success" : "bg-gradient-to-l from-primary to-info"}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                <div className="text-xs text-muted-foreground mt-1">{pct}% من الهدف · {fmtNum(c.donors)} متبرع · حتى {c.end}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  ),
});
