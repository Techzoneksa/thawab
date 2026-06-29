import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Btn, Badge, Table, Td, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/procurement/orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: () => {
    const rows = [
      { id: "PO-2406-0124", sup: "شركة تموين السعودية", subject: "سلال غذائية × 1000", amount: 82_400, date: "1446/10/12", status: "قيد التنفيذ" },
      { id: "PO-2406-0123", sup: "مؤسسة العلا للتجهيزات", subject: "بطانيات شتوية × 2000", amount: 96_000, date: "1446/10/08", status: "تم الاستلام" },
      { id: "PO-2406-0122", sup: "شركة الحلول التقنية", subject: "أجهزة حاسب × 6", amount: 38_400, date: "1446/10/10", status: "قيد التنفيذ" },
      { id: "PO-2406-0121", sup: "مؤسسة البناء المتكامل", subject: "مواد بناء مسجد القرية", amount: 64_500, date: "1446/10/05", status: "تم الاستلام" },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء"]} title="أوامر الشراء"
        actions={<Btn variant="primary"><Plus size={15} />أمر شراء جديد</Btn>}
      >
        <Table
          columns={["الرقم", "المورد", "الموضوع", "المبلغ", "التاريخ", "الحالة"]}
          rows={rows}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td className="font-semibold">{r.sup}</Td>
              <Td>{r.subject}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
              <Td className="text-muted-foreground">{r.date}</Td>
              <Td><Badge tone={r.status === "تم الاستلام" ? "success" : "warning"}>{r.status}</Badge></Td>
            </>
          )}
        />
      </AppShell>
    );
  },
});
