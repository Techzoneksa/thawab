import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, FilterBar, Select, Table, Td } from "@/components/erp/AppShell";
import { AUDIT_LOG } from "@/data/sample";
import { Download, Search } from "lucide-react";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "سجل التدقيق — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "التقارير والحوكمة", "سجل التدقيق"]} title="سجل التدقيق (Audit Trail)"
      actions={<Btn variant="outline"><Download size={15} />تصدير</Btn>}
    >
      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث بالمستخدم أو الإجراء..." />
        </div>
        <Select label="المستخدم" options={["الكل", "سارة الزهراني", "محمد الغامدي", "فهد العتيبي", "النظام"]} />
        <Select label="نوع الإجراء" options={["الكل", "إنشاء", "تعديل", "حذف", "اعتماد", "تسجيل دخول"]} />
        <Select label="الفترة" options={["اليوم", "أمس", "هذا الأسبوع", "هذا الشهر"]} />
      </FilterBar>

      <Table
        columns={["الوقت", "المستخدم", "الإجراء", "الكيان", "IP", ""]}
        rows={[...AUDIT_LOG, ...AUDIT_LOG]}
        renderRow={(a) => (
          <>
            <Td className="font-mono text-xs text-muted-foreground">{a.time}</Td>
            <Td className="font-semibold">{a.user}</Td>
            <Td>{a.action}</Td>
            <Td className="font-mono text-xs">{a.entity}</Td>
            <Td className="font-mono text-xs text-muted-foreground">{a.ip}</Td>
            <Td><button className="text-primary text-xs font-semibold">تفاصيل ←</button></Td>
          </>
        )}
      />
    </AppShell>
  );
}
