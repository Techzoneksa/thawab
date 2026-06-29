import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { SUPPLIERS, fmtSAR } from "@/data/sample";
import { Plus, Star } from "lucide-react";

export const Route = createFileRoute("/procurement/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المشتريات", "الموردون"]} title="سجل الموردين"
      actions={<Btn variant="primary"><Plus size={15} />مورد جديد</Btn>}
    >
      <Table
        columns={["الرقم", "اسم المورد", "الفئة", "الجوال", "الرصيد", "التقييم"]}
        rows={SUPPLIERS}
        renderRow={(s) => (
          <>
            <Td className="font-mono text-xs">{s.id}</Td>
            <Td className="font-semibold">{s.name}</Td>
            <Td><Badge tone="info">{s.category}</Badge></Td>
            <Td className="font-mono text-xs text-muted-foreground">{s.phone}</Td>
            <Td className="tabular-nums">{fmtSAR(s.balance)}</Td>
            <Td><span className="inline-flex items-center gap-1 text-warning-foreground"><Star size={14} className="fill-warning text-warning" />{s.rating}</span></Td>
          </>
        )}
      />
    </AppShell>
  ),
});
