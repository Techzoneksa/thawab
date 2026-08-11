import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  FilterBar,
  Select,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import * as Icons from "lucide-react";
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
  FileType,
  Filter,
  Plus,
  Clock,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  EntityFormDrawer,
  ExportButton,
  PrintButton,
  EmptyState,
  PrintStyle,
} from "@/components/erp/actions";

// Static UI configuration of available report categories (not business data).
type ReportCategory = { title: string; icon: string; items: string[] };
const REPORT_CATEGORIES: ReportCategory[] = [
  {
    title: "التقارير المالية",
    icon: "Wallet",
    items: ["قائمة المركز المالي", "قائمة الأنشطة", "قائمة التدفقات النقدية", "ميزان المراجعة"],
  },
  {
    title: "تقارير التبرعات",
    icon: "HandCoins",
    items: [
      "التبرعات حسب المشروع",
      "التبرعات حسب المتبرع",
      "التبرعات الشهرية",
      "الإيصالات والشهادات",
    ],
  },
  {
    title: "تقارير المشاريع",
    icon: "FolderKanban",
    items: ["حالة المشاريع", "نسب الإنجاز", "ميزانيات المشاريع", "الأثر والمخرجات"],
  },
  {
    title: "تقارير المستفيدين",
    icon: "Users",
    items: ["سجل المستفيدين", "المساعدات المصروفة", "التوزيع الجغرافي", "الفئات المستهدفة"],
  },
  {
    title: "تقارير المشتريات",
    icon: "ShoppingCart",
    items: ["أوامر الشراء", "الموردون", "تحليل الإنفاق", "أوامر التوريد"],
  },
  {
    title: "تقارير المخزون",
    icon: "Package",
    items: ["حركة المخزون", "أرصدة المخزون", "أصناف تحت حد الطلب", "جرد المستودعات"],
  },
];

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "مركز التقارير — ثواب" }] }),
  component: Page,
});

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("مالي");
  const [formPeriod, setFormPeriod] = useState("شهري");
  const [formFormat, setFormFormat] = useState("PDF");

  const filtered =
    typeFilter === "الكل"
      ? REPORT_CATEGORIES
      : REPORT_CATEGORIES.filter((c) => c.title.includes(typeFilter));

  const handleCreateReport = () => {
    if (!formName.trim()) {
      showToast("الرجاء إدخال اسم التقرير", "error");
      return;
    }
    showToast(`تم إنشاء التقرير "${formName}" بنجاح`, "success");
    setCreateOpen(false);
    setFormName("");
  };

  const handleSchedule = (name: string) => {
    showToast(`تمت جدولة التقرير "${name}" بنجاح`, "info");
  };

  const handleExportCat = (cat: (typeof REPORT_CATEGORIES)[0]) => {
    const data = cat.items.map((item, i) => ({
      الرقم: i + 1,
      التقرير: item,
      التصنيف: cat.title,
    }));
    const csv = [
      "الرقم,التقرير,التصنيف",
      ...data.map((d) => `${d.الرقم},${d.التقرير},${d.التصنيف}`),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;bom" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cat.title}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("تم تصدير التقرير بنجاح", "success");
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "مركز التقارير"]}
      title="مركز التقارير"
      actions={
        <>
          <PrintButton />
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> إنشاء تقرير
          </Btn>
        </>
      }
    >
      <PrintStyle />
      <FilterBar>
        <Select
          label="الفترة"
          options={["اليوم", "هذا الأسبوع", "هذا الشهر", "هذا الربع", "هذا العام", "مخصصة"]}
        />
        <Select
          label="المشروع"
          options={["جميع المشاريع", "كفالة الأيتام", "إفطار صائم", "كسوة الشتاء"]}
        />
        <Select label="المتبرع" options={["الكل", "أفراد", "شركات", "مؤسسات"]} />
        <Select label="المستفيد" options={["جميع الفئات", "أيتام", "أرامل", "مرضى"]} />
        <Select label="الفرع" options={["جميع الفروع", "الرياض", "جدة", "الدمام"]} />
        <Select label="نوع الصندوق" options={["جميع الأموال", "مقيد", "غير مقيد", "أوقاف"]} />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
        {filtered.map((cat) => {
          const Icon =
            (Icons as Record<string, React.ComponentType<{ size?: number }>>)[cat.icon] || FileText;
          return (
            <Card key={cat.title} className="p-4 lg:p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="grid h-9 w-9 lg:h-10 lg:w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon size={16} />
                </div>
                <h3 className="font-bold text-sm lg:text-base">{cat.title}</h3>
              </div>
              <ul className="space-y-1.5">
                {cat.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted text-sm"
                  >
                    <span className="truncate ml-2 text-xs lg:text-sm">{item}</span>
                    <div className="flex items-center gap-0.5 lg:gap-1 shrink-0">
                      <button
                        title="PDF"
                        onClick={() => showToast(`جاري تجهيز ${item} بصيغة PDF`, "info")}
                        className="rounded-lg p-2 hover:bg-background active:bg-muted min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <FileType size={13} />
                      </button>
                      <button
                        title="Excel"
                        onClick={() => handleExportCat(cat)}
                        className="rounded-lg p-2 hover:bg-background active:bg-muted min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <FileSpreadsheet size={13} />
                      </button>
                      <button
                        title="طباعة"
                        onClick={() => window.print()}
                        className="rounded-lg p-2 hover:bg-background active:bg-muted min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Printer size={13} />
                      </button>
                      <button
                        title="تنزيل"
                        onClick={() => handleExportCat(cat)}
                        className="rounded-lg p-2 hover:bg-background active:bg-muted min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        title="جدولة"
                        onClick={() => handleSchedule(item)}
                        className="rounded-lg p-2 hover:bg-background active:bg-muted min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Clock size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <EntityFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="إنشاء تقرير جديد"
        onSave={handleCreateReport}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">اسم التقرير</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="اسم التقرير"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">النوع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
          >
            <option>مالي</option>
            <option>تبرعات</option>
            <option>مشاريع</option>
            <option>مستفيدين</option>
            <option>منح</option>
            <option>مشتريات</option>
            <option>مخزون</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الفترة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formPeriod}
            onChange={(e) => setFormPeriod(e.target.value)}
          >
            <option>شهري</option>
            <option>ربعي</option>
            <option>نصف سنوي</option>
            <option>سنوي</option>
            <option>مخصص</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">التنسيق</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formFormat}
            onChange={(e) => setFormFormat(e.target.value)}
          >
            <option>PDF</option>
            <option>Excel</option>
            <option>CSV</option>
          </select>
        </div>
      </EntityFormDrawer>

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفترة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]">
              <option>هذا الشهر</option>
              <option>هذا الربع</option>
              <option>هذا العام</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]">
              <option>جميع المشاريع</option>
              <option>كفالة الأيتام</option>
              <option>إفطار صائم</option>
              <option>كسوة الشتاء</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">نوع التقرير</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>مالي</option>
              <option>تبرعات</option>
              <option>مشاريع</option>
              <option>مستفيدين</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
