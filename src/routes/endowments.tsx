import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { ENDOWMENTS, fmtSAR } from "@/data/sample";
import { Landmark, Plus } from "lucide-react";

export const Route = createFileRoute("/endowments")({
  head: () => ({ meta: [{ title: "الأوقاف — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المنح والأوقاف", "الأوقاف"]} title="إدارة الأوقاف"
      actions={<Btn variant="primary"><Plus size={15} />وقف جديد</Btn>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { l: "إجمالي قيمة الأوقاف", v: fmtSAR(9_040_000) },
          { l: "عوائد متوقعة سنوياً", v: fmtSAR(798_000) },
          { l: "عدد الأوقاف", v: "4" },
          { l: "نسبة العائد", v: "8.8%" },
        ].map((s) => <Card key={s.l} className="p-4"><div className="text-xs text-muted-foreground">{s.l}</div><div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div></Card>)}
      </div>
      <Table
        columns={["الرقم", "اسم الوقف", "النوع", "القيمة", "العائد السنوي", "الحالة"]}
        rows={ENDOWMENTS}
        renderRow={(w) => (
          <>
            <Td className="font-mono text-xs">{w.id}</Td>
            <Td className="font-semibold"><Landmark size={13} className="inline ms-1 text-primary" />{w.name}</Td>
            <Td><Badge tone="info">{w.type}</Badge></Td>
            <Td className="tabular-nums font-bold">{fmtSAR(w.value)}</Td>
            <Td className="tabular-nums text-success font-semibold">{fmtSAR(w.yearReturn)}</Td>
            <Td><Badge tone={statusTone(w.status)}>{w.status}</Badge></Td>
          </>
        )}
      />
    </AppShell>
  ),
});
