import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td, statusTone } from "@/components/erp/AppShell";
import { JOURNAL_ENTRIES, fmtSAR } from "@/data/sample";
import { Plus, Download, Filter, Printer, Search } from "lucide-react";

export const Route = createFileRoute("/finance/journal")({
  head: () => ({ meta: [{ title: "قيود اليومية — ثواب" }] }),
  component: Page,
});

function Page() {
  const totals = JOURNAL_ENTRIES.reduce((a, j) => a + j.amount, 0);
  return (
    <AppShell breadcrumb={["الرئيسية", "المالية", "قيود اليومية"]} title="قيود اليومية"
      actions={<><Btn variant="outline"><Printer size={15} />طباعة</Btn><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><Plus size={15} />قيد جديد</Btn></>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { l: "قيود الشهر", v: "1,248" },
          { l: "قيد الاعتماد", v: "12", tone: "warning" },
          { l: "إجمالي مدين", v: fmtSAR(totals) },
          { l: "إجمالي دائن", v: fmtSAR(totals) },
        ].map((s) => (
          <Card key={s.l} className="p-4">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث برقم القيد أو الوصف..." />
        </div>
        <Select label="نوع الصندوق" options={["الكل", "مقيد", "غير مقيد", "أوقاف"]} />
        <Select label="المركز/المشروع" options={["الكل", "PRJ-014", "PRJ-015", "PRJ-017", "إداري"]} />
        <Select label="الحالة" options={["الكل", "مرحّل", "بانتظار الموافقة", "ملغى", "مسودة"]} />
        <Select label="الفترة" options={["هذا الشهر", "الشهر السابق", "هذا الربع", "هذا العام"]} />
        <Btn variant="ghost"><Filter size={15} /> متقدم</Btn>
      </FilterBar>

      <Table
        columns={["رقم القيد", "التاريخ", "الوصف", "ح/ مدين", "ح/ دائن", "المبلغ", "نوع الصندوق", "المشروع", "الحالة", ""]}
        rows={JOURNAL_ENTRIES}
        renderRow={(j) => (
          <>
            <Td className="font-mono text-xs">{j.id}</Td>
            <Td className="text-muted-foreground">{j.date}</Td>
            <Td className="max-w-[280px] truncate">{j.desc}</Td>
            <Td className="text-xs">{j.debit}</Td>
            <Td className="text-xs">{j.credit}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(j.amount)}</Td>
            <Td><Badge tone={j.fund === "مقيد" ? "info" : j.fund === "أوقاف" ? "primary" : "muted"}>{j.fund}</Badge></Td>
            <Td className="font-mono text-xs">{j.project}</Td>
            <Td><Badge tone={statusTone(j.status)}>{j.status}</Badge></Td>
            <Td><button className="text-primary text-xs font-semibold">عرض ←</button></Td>
          </>
        )}
      />
    </AppShell>
  );
}
