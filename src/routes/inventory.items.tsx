import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { INVENTORY_ITEMS } from "@/data/sample";
import { Plus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/inventory/items")({
  head: () => ({ meta: [{ title: "الأصناف — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "المخزون", "الأصناف"]} title="الأصناف والمخزون"
      actions={<Btn variant="primary"><Plus size={15} />صنف جديد</Btn>}
    >
      <Table
        columns={["الكود", "الصنف", "المستودع", "الكمية", "الوحدة", "الحد الأدنى", "تاريخ الانتهاء", "الحالة"]}
        rows={INVENTORY_ITEMS}
        renderRow={(it) => {
          const low = it.qty < it.min;
          return (
            <>
              <Td className="font-mono text-xs">{it.sku}</Td>
              <Td className="font-semibold">{it.name}</Td>
              <Td className="text-muted-foreground">{it.warehouse}</Td>
              <Td className={`tabular-nums font-bold ${low ? "text-destructive" : ""}`}>{it.qty}</Td>
              <Td>{it.unit}</Td>
              <Td className="tabular-nums text-muted-foreground">{it.min}</Td>
              <Td className="text-muted-foreground">{it.expiry}</Td>
              <Td>{low ? <Badge tone="destructive"><AlertTriangle size={11} className="inline ms-1" />منخفض</Badge> : <Badge tone="success">طبيعي</Badge>}</Td>
            </>
          );
        }}
      />
    </AppShell>
  ),
});
