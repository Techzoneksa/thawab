import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { MapPin, Plus } from "lucide-react";

export const Route = createFileRoute("/settings/branches")({
  head: () => ({ meta: [{ title: "الفروع — ثواب" }] }),
  component: () => {
    const br = [
      { n: "الفرع الرئيسي - الرياض", mgr: "د. عبدالله السبيعي", emp: 32, prj: 18 },
      { n: "فرع جدة", mgr: "أ. محمد العمري", emp: 14, prj: 7 },
      { n: "فرع الدمام", mgr: "أ. خالد الدوسري", emp: 10, prj: 5 },
      { n: "فرع أبها", mgr: "أ. سعيد الغامدي", emp: 8, prj: 4 },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "الإعدادات", "الفروع"]} title="فروع الجمعية"
        actions={<Btn variant="primary"><Plus size={15} />فرع جديد</Btn>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {br.map((b) => (
            <Card key={b.n} className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin size={20} /></div>
                <div className="min-w-0 flex-1"><h3 className="font-bold truncate">{b.n}</h3><div className="text-xs text-muted-foreground">المدير: {b.mgr}</div></div>
                <Badge tone="success">نشط</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-center">
                <div className="rounded-lg bg-muted/60 p-2"><div className="text-[11px] text-muted-foreground">الموظفون</div><div className="font-bold mt-0.5">{b.emp}</div></div>
                <div className="rounded-lg bg-muted/60 p-2"><div className="text-[11px] text-muted-foreground">المشاريع</div><div className="font-bold mt-0.5">{b.prj}</div></div>
              </div>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  },
});
