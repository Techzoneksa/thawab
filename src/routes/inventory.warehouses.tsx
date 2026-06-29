import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { Warehouse, Plus } from "lucide-react";

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — ثواب" }] }),
  component: () => {
    const w = [
      { n: "المستودع الرئيسي - الرياض", m: "حمد العنزي", items: 1240, cap: 85 },
      { n: "مستودع كسوة الشتاء", m: "خالد الدوسري", items: 1840, cap: 62 },
      { n: "مستودع الأدوية", m: "د. أحمد الشهري", items: 86, cap: 28 },
      { n: "مستودع الفرع - جدة", m: "محمد العمري", items: 980, cap: 72 },
      { n: "مستودع حفظ النعمة", m: "ياسر القرني", items: 420, cap: 45 },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المخزون", "المستودعات"]} title="المستودعات"
        actions={<Btn variant="primary"><Plus size={15} />مستودع جديد</Btn>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {w.map((x) => (
            <Card key={x.n} className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Warehouse size={20} /></div>
                <div className="min-w-0 flex-1"><h3 className="font-bold truncate">{x.n}</h3><div className="text-xs text-muted-foreground">المشرف: {x.m}</div></div>
                <Badge tone="success">نشط</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div><div className="text-xs text-muted-foreground">عدد الأصناف</div><div className="font-bold">{x.items}</div></div>
                <div><div className="text-xs text-muted-foreground">نسبة الإشغال</div><div className="font-bold">{x.cap}%</div></div>
              </div>
              <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${x.cap}%` }} /></div>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  },
});
