import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Building2, Plus } from "lucide-react";

export const Route = createFileRoute("/donor-orgs")({
  head: () => ({ meta: [{ title: "الجهات المانحة — ثواب" }] }),
  component: () => {
    const rows = [
      { n: "الصندوق الخيري الوطني", cat: "حكومي", grants: 4, total: 4_800_000, status: "نشط" },
      { n: "صندوق الملك سلمان للإغاثة", cat: "حكومي", grants: 6, total: 8_200_000, status: "نشط" },
      { n: "بنك التنمية الإسلامي", cat: "دولي", grants: 2, total: 1_400_000, status: "نشط" },
      { n: "وزارة الموارد البشرية والتنمية الاجتماعية", cat: "حكومي", grants: 3, total: 1_900_000, status: "نشط" },
      { n: "هيئة الهلال الأحمر السعودي", cat: "شريك", grants: 1, total: 600_000, status: "نشط" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المنح والأوقاف", "الجهات المانحة"]} title="الجهات المانحة"
        actions={<Btn variant="primary"><Plus size={15} />جهة مانحة جديدة</Btn>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <Card key={r.n} className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 size={20} /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{r.n}</h3>
                  <Badge tone="info">{r.cat}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div><div className="text-xs text-muted-foreground">عدد المنح</div><div className="font-bold">{r.grants}</div></div>
                <div><div className="text-xs text-muted-foreground">إجمالي القيمة</div><div className="font-bold tabular-nums">{fmtSAR(r.total)}</div></div>
              </div>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  },
});
