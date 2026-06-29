import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { ASSETS, fmtSAR } from "@/data/sample";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "الأصول الثابتة — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الموارد", "الأصول الثابتة"]} title="الأصول الثابتة"
      actions={<Btn variant="primary"><Plus size={15} />أصل جديد</Btn>}
    >
      <Table
        columns={["الرقم", "الأصل", "الفئة", "الموقع", "التكلفة", "الإهلاك السنوي", "المشروع", "الحالة"]}
        rows={ASSETS}
        renderRow={(a) => (
          <>
            <Td className="font-mono text-xs">{a.id}</Td>
            <Td className="font-semibold">{a.name}</Td>
            <Td><Badge tone="info">{a.category}</Badge></Td>
            <Td className="text-muted-foreground">{a.location}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(a.cost)}</Td>
            <Td className="tabular-nums">{fmtSAR(a.depYear)}</Td>
            <Td className="font-mono text-xs">{a.project}</Td>
            <Td><Badge tone={statusTone(a.status)}>{a.status}</Badge></Td>
          </>
        )}
      />
    </AppShell>
  ),
});
