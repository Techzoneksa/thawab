import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td, statusTone } from "@/components/erp/AppShell";
import { PROJECTS, fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Download, LayoutGrid, List } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع والبرامج — ثواب" }] }),
  component: Page,
});

function Page() {
  const [view, setView] = useState<"grid" | "table">("grid");
  return (
    <AppShell breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المشاريع والبرامج"]} title="المشاريع والبرامج"
      actions={<>
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setView("grid")} className={`px-3 py-2 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><LayoutGrid size={15} /></button>
          <button onClick={() => setView("table")} className={`px-3 py-2 ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><List size={15} /></button>
        </div>
        <Btn variant="outline"><Download size={15} />تصدير</Btn>
        <Btn variant="primary"><Plus size={15} />مشروع جديد</Btn>
      </>}
    >
      <FilterBar>
        <Select label="الحالة" options={["الكل", "نشط", "مكتمل", "متأخر", "مقترح"]} />
        <Select label="المدير" options={["الكل", "فهد العتيبي", "سارة الزهراني", "خالد الدوسري"]} />
        <Select label="نوع التمويل" options={["الكل", "مقيد بمشروع", "غير مقيد", "منحة", "وقف"]} />
        <Select label="الفرع" options={["جميع الفروع", "الرياض", "جدة", "الدمام"]} />
      </FilterBar>

      {view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PROJECTS.map((p) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
              <Card className="p-5 hover:border-primary hover:shadow-elevated transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-muted-foreground font-mono">{p.id}</div>
                    <h3 className="font-bold text-base mt-1 truncate">{p.name}</h3>
                    <div className="text-xs text-muted-foreground mt-0.5">المدير: {p.manager}</div>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>نسبة الإنجاز</span>
                    <span className="font-bold tabular-nums">{p.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-primary to-info" style={{ width: `${p.progress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <div className="text-[10px] text-muted-foreground">الميزانية</div>
                    <div className="text-xs font-bold tabular-nums mt-0.5">{fmtSAR(p.budget)}</div>
                  </div>
                  <div className="rounded-lg bg-success/10 p-2">
                    <div className="text-[10px] text-success">التبرعات</div>
                    <div className="text-xs font-bold tabular-nums mt-0.5 text-success">{fmtSAR(p.donations)}</div>
                  </div>
                  <div className="rounded-lg bg-warning/15 p-2">
                    <div className="text-[10px] text-warning-foreground">المنصرف</div>
                    <div className="text-xs font-bold tabular-nums mt-0.5">{fmtSAR(p.spent)}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                  <span>{fmtNum(p.beneficiaries)} مستفيد</span>
                  <span>{p.start} ← {p.end}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Table
          columns={["المشروع", "المدير", "الميزانية", "المنصرف", "التبرعات", "المستفيدون", "الإنجاز", "الحالة"]}
          rows={PROJECTS}
          renderRow={(p) => (
            <>
              <Td><Link to="/projects/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{p.name}</Link><div className="text-[10px] text-muted-foreground font-mono">{p.id}</div></Td>
              <Td className="text-muted-foreground">{p.manager}</Td>
              <Td className="tabular-nums">{fmtSAR(p.budget)}</Td>
              <Td className="tabular-nums">{fmtSAR(p.spent)}</Td>
              <Td className="tabular-nums text-success font-semibold">{fmtSAR(p.donations)}</Td>
              <Td className="tabular-nums">{fmtNum(p.beneficiaries)}</Td>
              <Td><div className="flex items-center gap-2 min-w-[140px]"><div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${p.progress}%` }} /></div><span className="text-xs">{p.progress}%</span></div></Td>
              <Td><Badge tone={statusTone(p.status)}>{p.status}</Badge></Td>
            </>
          )}
        />
      )}
    </AppShell>
  );
}
