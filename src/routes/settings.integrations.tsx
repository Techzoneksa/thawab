import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, Btn, statusTone } from "@/components/erp/AppShell";
import { INTEGRATIONS } from "@/data/sample";
import { Plug, Settings as Cog, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "التكاملات — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "الإعدادات", "التكاملات"]} title="مركز التكاملات"
      actions={<Btn variant="primary"><Plug size={15} />تكامل جديد</Btn>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {INTEGRATIONS.map((it) => (
          <Card key={it.name} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Plug size={20} /></div>
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{it.name}</h3>
                  <div className="text-xs text-muted-foreground">{it.category}</div>
                </div>
              </div>
              <Badge tone={statusTone(it.status)}>{it.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{it.info}</p>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-1 text-xs text-success font-medium"><CheckCircle2 size={14} /> آمن ومتوافق مع متطلبات الجهات الرقابية</div>
              <Btn variant="outline"><Cog size={14} />إدارة</Btn>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
