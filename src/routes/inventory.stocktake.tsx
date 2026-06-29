import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Plus, PackageSearch } from "lucide-react";

export const Route = createFileRoute("/inventory/stocktake")({
  head: () => ({ meta: [{ title: "الجرد — ثواب" }] }),
  component: () => {
    const rows = [
      { id: "STK-014", w: "المستودع الرئيسي", date: "1446/10/01", items: 1240, diff: -8, status: "مكتمل" },
      { id: "STK-013", w: "مستودع كسوة الشتاء", date: "1446/09/15", items: 1840, diff: 0, status: "مكتمل" },
      { id: "STK-012", w: "مستودع الأدوية", date: "1446/09/01", items: 86, diff: -2, status: "مكتمل" },
      { id: "STK-015", w: "مستودع الفرع - جدة", date: "—", items: 0, diff: 0, status: "مجدول" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المخزون", "الجرد"]} title="الجرد الدوري"
        actions={<Btn variant="primary"><Plus size={15} />جرد جديد</Btn>}
      >
        <Table
          columns={["الرقم", "المستودع", "التاريخ", "عدد الأصناف", "الفروقات", "الحالة"]}
          rows={rows}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td className="font-semibold"><PackageSearch size={13} className="inline ms-1 text-primary" />{r.w}</Td>
              <Td className="text-muted-foreground">{r.date}</Td>
              <Td className="tabular-nums">{r.items}</Td>
              <Td className={`tabular-nums font-bold ${r.diff < 0 ? "text-destructive" : r.diff > 0 ? "text-success" : ""}`}>{r.diff}</Td>
              <Td><Badge tone={r.status === "مكتمل" ? "success" : "warning"}>{r.status}</Badge></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
