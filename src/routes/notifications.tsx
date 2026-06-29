import { createFileRoute } from "@tanstack/react-router";
import { ListPage } from "@/components/erp/ListPage";
import { ALERTS } from "@/data/sample";
import { AppShell, Card, Badge } from "@/components/erp/AppShell";
import { Bell, AlertTriangle, Info, CheckCircle2, BellRing } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "التنبيهات — ثواب" }] }),
  component: () => {
    const icon = { destructive: AlertTriangle, warning: BellRing, info: Info, success: CheckCircle2 } as const;
    return (
      <AppShell breadcrumb={["الرئيسية", "التنبيهات"]} title="مركز التنبيهات">
        <Card className="p-2">
          <ul className="divide-y">
            {[...ALERTS, ...ALERTS, ...ALERTS].map((a, i) => {
              const Icon = icon[a.tone as keyof typeof icon] || Info;
              return (
                <li key={i} className="flex items-start gap-3 p-4 hover:bg-muted/50">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${a.tone === "destructive" ? "bg-destructive/10 text-destructive" : a.tone === "warning" ? "bg-warning/20 text-warning-foreground" : a.tone === "success" ? "bg-success/10 text-success" : "bg-info/10 text-info"}`}><Icon size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{a.text}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.time}</div>
                  </div>
                  <Badge tone={a.tone as any}>جديد</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      </AppShell>
    );
  },
});
