import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td } from "@/components/erp/AppShell";
import { DONORS, fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Download, Search, UserPlus } from "lucide-react";

export const Route = createFileRoute("/donors")({
  head: () => ({ meta: [{ title: "المتبرعون — ثواب" }] }),
  component: Page,
});

function tagTone(t: string) { return t === "ذهبي" ? "warning" : t === "فضي" ? "info" : "muted"; }

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "التبرعات والمتبرعون", "المتبرعون"]} title="إدارة المتبرعين (CRM)"
      actions={<><Btn variant="outline"><Download size={15} />تصدير</Btn><Btn variant="primary"><UserPlus size={15} />متبرع جديد</Btn></>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { l: "إجمالي المتبرعين", v: fmtNum(18_420) },
          { l: "متبرعون نشطون هذا الشهر", v: fmtNum(4_120) },
          { l: "متبرعون متكررون", v: fmtNum(2_840) },
          { l: "متوسط التبرع", v: fmtSAR(420) },
        ].map((s) => (
          <Card key={s.l} className="p-4">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="text-xl font-extrabold mt-1">{s.v}</div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm" placeholder="بحث باسم المتبرع، الجوال، الهوية..." />
        </div>
        <Select label="النوع" options={["الكل", "فرد", "شركة", "مؤسسة"]} />
        <Select label="التصنيف" options={["الكل", "ذهبي", "فضي", "برونزي"]} />
        <Select label="المدينة" options={["الكل", "الرياض", "جدة", "الدمام", "مكة المكرمة"]} />
        <Select label="متكرر" options={["الكل", "نعم", "لا"]} />
      </FilterBar>

      <Table
        columns={["الرقم", "اسم المتبرع", "النوع", "المدينة", "إجمالي التبرعات", "عدد العمليات", "متكرر", "التصنيف", ""]}
        rows={DONORS}
        renderRow={(d) => (
          <>
            <Td className="font-mono text-xs">{d.id}</Td>
            <Td>
              <Link to="/donors/$id" params={{ id: d.id }} className="font-semibold hover:text-primary">{d.name}</Link>
            </Td>
            <Td><Badge tone="info">{d.type}</Badge></Td>
            <Td className="text-muted-foreground">{d.city}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(d.total)}</Td>
            <Td className="tabular-nums">{d.donations}</Td>
            <Td>{d.recurring ? <Badge tone="success">نعم</Badge> : <Badge>لا</Badge>}</Td>
            <Td><Badge tone={tagTone(d.tag)}>{d.tag}</Badge></Td>
            <Td><Link to="/donors/$id" params={{ id: d.id }} className="text-primary text-xs font-semibold">عرض ←</Link></Td>
          </>
        )}
      />
    </AppShell>
  );
}
