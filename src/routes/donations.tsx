import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td, statusTone } from "@/components/erp/AppShell";
import { DONATIONS, fmtSAR } from "@/data/sample";
import { Download, Plus, Search, Printer, Filter } from "lucide-react";

export const Route = createFileRoute("/donations")({
  head: () => ({ meta: [{ title: "إدارة التبرعات — ثواب" }] }),
  component: Page,
});

function Page() {
  const stats = [
    { label: "تبرعات هذا الشهر", value: fmtSAR(4_582_400), sub: "+12.4%" },
    { label: "تبرعات نقدية", value: fmtSAR(1_240_000), sub: "27%" },
    { label: "تحويلات بنكية", value: fmtSAR(2_842_000), sub: "62%" },
    { label: "تبرعات عينية", value: fmtSAR(500_400), sub: "11%" },
  ];
  return (
    <AppShell breadcrumb={["الرئيسية", "التبرعات والمتبرعون", "التبرعات"]} title="إدارة التبرعات"
      actions={<><Btn variant="outline"><Printer size={15} />طباعة</Btn><Btn variant="outline"><Download size={15} />تصدير Excel</Btn><Btn variant="primary"><Plus size={15} />تسجيل تبرع جديد</Btn></>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-xl font-extrabold mt-1 tabular-nums">{s.value}</div>
            <div className="text-xs text-success font-semibold mt-1">{s.sub}</div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث برقم التبرع، اسم المتبرع، المشروع..." />
        </div>
        <Select label="القناة" options={["الكل", "البوابة الإلكترونية", "تطبيق الجوال", "مقر الجمعية", "تحويل بنكي", "تبرع متكرر"]} />
        <Select label="طريقة الدفع" options={["الكل", "نقدي", "مدى", "تحويل بنكي", "Apple Pay", "STC Pay", "صك عيني"]} />
        <Select label="المشروع" options={["الكل", "كفالة الأيتام", "إفطار صائم", "السلال الغذائية", "كسوة الشتاء"]} />
        <Select label="الحالة" options={["الكل", "مكتمل", "بانتظار التحقق", "مسترد"]} />
        <Btn variant="ghost"><Filter size={15} /> تصفية متقدمة</Btn>
      </FilterBar>

      <Table
        columns={["رقم التبرع", "المتبرع", "المشروع / الحملة", "المبلغ", "طريقة الدفع", "القناة", "التاريخ", "الحالة", ""]}
        rows={DONATIONS}
        renderRow={(d) => (
          <>
            <Td className="font-mono text-xs">{d.id}</Td>
            <Td className="font-semibold">{d.donor}</Td>
            <Td>{d.project}</Td>
            <Td className="tabular-nums font-bold text-success">{fmtSAR(d.amount)}</Td>
            <Td>{d.method}</Td>
            <Td className="text-muted-foreground">{d.channel}</Td>
            <Td className="text-muted-foreground">{d.date}</Td>
            <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
            <Td><Link to="/donors" className="text-primary text-xs font-semibold">ملف المتبرع ←</Link></Td>
          </>
        )}
      />

      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
        <span>عرض 1-8 من 22,418 تبرع</span>
        <div className="flex gap-1">
          <button className="rounded border px-2 py-1">السابق</button>
          <button className="rounded bg-primary text-primary-foreground px-3 py-1">1</button>
          <button className="rounded border px-3 py-1">2</button>
          <button className="rounded border px-3 py-1">3</button>
          <button className="rounded border px-2 py-1">التالي</button>
        </div>
      </div>
    </AppShell>
  );
}
