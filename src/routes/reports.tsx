import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, FilterBar, Select } from "@/components/erp/AppShell";
import { REPORT_CATEGORIES } from "@/data/sample";
import * as Icons from "lucide-react";
import { FileText, Download, Printer, FileSpreadsheet, FileType } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "مركز التقارير — ثواب" }] }),
  component: Page,
});

function Page() {
  return (
    <AppShell breadcrumb={["الرئيسية", "التقارير والحوكمة", "مركز التقارير"]} title="مركز التقارير"
      actions={<Btn variant="primary"><FileText size={15} />تقرير مخصص</Btn>}
    >
      <FilterBar>
        <Select label="الفترة" options={["اليوم", "هذا الأسبوع", "هذا الشهر", "هذا الربع", "هذا العام", "مخصصة"]} />
        <Select label="المشروع" options={["جميع المشاريع", "كفالة الأيتام", "إفطار صائم", "كسوة الشتاء"]} />
        <Select label="المتبرع" options={["الكل", "أفراد", "شركات", "مؤسسات"]} />
        <Select label="المستفيد" options={["جميع الفئات", "أيتام", "أرامل", "مرضى"]} />
        <Select label="الفرع" options={["جميع الفروع", "الرياض", "جدة", "الدمام"]} />
        <Select label="نوع الصندوق" options={["جميع الأموال", "مقيد", "غير مقيد", "أوقاف"]} />
      </FilterBar>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORT_CATEGORIES.map((cat) => {
          const Icon = (Icons as any)[cat.icon] || FileText;
          return (
            <Card key={cat.title} className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon size={18} /></div>
                <h3 className="font-bold">{cat.title}</h3>
              </div>
              <ul className="space-y-1.5">
                {cat.items.map((item) => (
                  <li key={item} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted text-sm">
                    <span>{item}</span>
                    <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
                      <button title="PDF" className="rounded p-1 hover:bg-background"><FileType size={13} /></button>
                      <button title="Excel" className="rounded p-1 hover:bg-background"><FileSpreadsheet size={13} /></button>
                      <button title="طباعة" className="rounded p-1 hover:bg-background"><Printer size={13} /></button>
                      <button title="تنزيل" className="rounded p-1 hover:bg-background"><Download size={13} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
