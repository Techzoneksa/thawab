import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Card, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { GRANTS, fmtSAR } from "@/data/sample";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "المنح — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المنح والأوقاف", "المنح"]} title="إدارة المنح"
      actions={<Btn variant="primary"><Plus size={15} />منحة جديدة</Btn>}
    >
      <Table
        columns={["الرقم", "الجهة المانحة", "المشروع", "قيمة المنحة", "المصروف", "النسبة", "ينتهي في", "الحالة"]}
        rows={GRANTS}
        renderRow={(g) => {
          const pct = Math.round((g.disbursed / g.amount) * 100);
          return (
            <>
              <Td className="font-mono text-xs">{g.id}</Td>
              <Td className="font-semibold">{g.donor}</Td>
              <Td>{g.project}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(g.amount)}</Td>
              <Td className="tabular-nums">{fmtSAR(g.disbursed)}</Td>
              <Td><div className="flex items-center gap-2 w-32"><div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div><span className="text-xs">{pct}%</span></div></Td>
              <Td className="text-muted-foreground">{g.end}</Td>
              <Td><Badge tone={statusTone(g.status)}>{g.status}</Badge></Td>
            </>
          );
        }}
      />
    </AppShell>
  ),
});
