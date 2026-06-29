import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td, statusTone } from "@/components/erp/AppShell";
import { BENEFICIARIES, fmtNum } from "@/data/sample";
import { Plus, Download, Search, UserPlus } from "lucide-react";

export const Route = createFileRoute("/beneficiaries")({
  head: () => ({ meta: [{ title: "المستفيدون — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المستفيدون"]} title="قاعدة بيانات المستفيدين"
      actions={<><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><UserPlus size={15} />إضافة مستفيد</Btn></>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[
          { l: "إجمالي المستفيدين", v: fmtNum(12_846) },
          { l: "مستحقون", v: fmtNum(9_420) },
          { l: "قيد الدراسة", v: fmtNum(820) },
          { l: "موقوفون", v: fmtNum(240) },
          { l: "هذا الشهر", v: fmtNum(412) },
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
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث باسم المستفيد، رقم الهوية، الجوال..." />
        </div>
        <Select label="الفئة" options={["الكل", "أيتام", "أرامل", "أسر متعففة", "مرضى", "أسر منتجة"]} />
        <Select label="الحالة" options={["الكل", "مستحق", "قيد الدراسة", "موقوف"]} />
        <Select label="المدينة" options={["الكل", "الرياض", "جدة", "أبها", "الطائف", "المدينة المنورة"]} />
        <Select label="المشروع" options={["الكل", "كفالة الأيتام", "السلال الغذائية", "علاج المرضى"]} />
      </FilterBar>

      <Table
        columns={["الرقم", "اسم المستفيد", "الفئة", "أفراد الأسرة", "المدينة", "الحالة", "آخر مساعدة", "المشروع", ""]}
        rows={BENEFICIARIES}
        renderRow={(b) => (
          <>
            <Td className="font-mono text-xs">{b.id}</Td>
            <Td className="font-semibold">{b.name}</Td>
            <Td><Badge tone="info">{b.category}</Badge></Td>
            <Td className="tabular-nums">{b.family}</Td>
            <Td className="text-muted-foreground">{b.city}</Td>
            <Td><Badge tone={statusTone(b.status)}>{b.status}</Badge></Td>
            <Td className="text-muted-foreground">{b.lastAid}</Td>
            <Td className="text-xs">{b.project}</Td>
            <Td><button className="text-primary text-xs font-semibold">عرض الملف ←</button></Td>
          </>
        )}
      />
    </AppShell>
  );
}
