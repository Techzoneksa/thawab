import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { EMPLOYEES, fmtSAR } from "@/data/sample";
import { Plus, Briefcase, Calendar, FileText, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/hr")({
  head: () => ({ meta: [{ title: "الموارد البشرية — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الموارد", "الموارد البشرية"]} title="الموارد البشرية"
      actions={<Btn variant="primary"><Plus size={15} />موظف جديد</Btn>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { l: "إجمالي الموظفين", v: "64", i: Briefcase },
          { l: "في إجازة", v: "4", i: Calendar },
          { l: "إجمالي الرواتب الشهرية", v: fmtSAR(420_000), i: FileText },
          { l: "متوسط الراتب", v: fmtSAR(14_200), i: BarChart3 },
        ].map((s) => (
          <Card key={s.l} className="p-4 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><s.i size={18} /></div>
            <div className="min-w-0"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-lg font-extrabold tabular-nums truncate">{s.v}</div></div>
          </Card>
        ))}
      </div>
      <Table
        columns={["الرقم", "الموظف", "الإدارة", "المسمى الوظيفي", "الراتب", "تاريخ التعيين", "الحالة"]}
        rows={EMPLOYEES}
        renderRow={(e) => (
          <>
            <Td className="font-mono text-xs">{e.id}</Td>
            <Td className="font-semibold">{e.name}</Td>
            <Td>{e.dept}</Td>
            <Td className="text-muted-foreground">{e.title}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(e.salary)}</Td>
            <Td className="text-muted-foreground">{e.joined}هـ</Td>
            <Td><Badge tone={statusTone(e.status)}>{e.status}</Badge></Td>
          </>
        )}
      />
    </AppShell>
  ),
});
