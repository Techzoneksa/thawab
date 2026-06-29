import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  FilterBar,
  Select,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { AUDIT_LOG } from "@/data/sample";
import { Download, Search, Filter, Eye } from "lucide-react";
import {
  showToast,
  EntityFormDrawer,
  ExportButton,
  PrintButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "سجل التدقيق — ثواب" }] }),
  component: Page,
});

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [auditLog, setAuditLog] = useState([...AUDIT_LOG, ...AUDIT_LOG]);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState("الكل");
  const [actionFilter, setActionFilter] = useState("الكل");
  const [periodFilter, setPeriodFilter] = useState("الكل");
  const [detailTarget, setDetailTarget] = useState<(typeof AUDIT_LOG)[0] | null>(null);

  const filtered = auditLog.filter((a) => {
    if (userFilter !== "الكل" && a.user !== userFilter) return false;
    if (
      actionFilter !== "الكل" &&
      !a.action.includes(actionFilter.replace("نشاء", "شاء").replace("عديل", "عديل"))
    ) {
      const actionMap: Record<string, string[]> = {
        إنشاء: ["إنشاء"],
        تعديل: ["تعديل", "تحديث"],
        حذف: ["حذف"],
        اعتماد: ["اعتماد"],
        "تسجيل دخول": ["تسجيل"],
      };
      const keywords = actionMap[actionFilter] || [actionFilter];
      if (!keywords.some((k) => a.action.includes(k))) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !a.user.toLowerCase().includes(q) &&
        !a.action.toLowerCase().includes(q) &&
        !a.entity.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "سجل التدقيق"]}
      title="سجل التدقيق (Audit Trail)"
      actions={
        <>
          <ExportButton data={auditLog} filename="سجل_التدقيق.csv" />
          <PrintButton />
          <Btn variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter size={15} /> تصفية
          </Btn>
        </>
      }
    >
      <FilterBar>
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالمستخدم أو الإجراء..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="المستخدم"
          options={["الكل", "سارة الزهراني", "محمد الغامدي", "فهد العتيبي", "النظام"]}
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        />
        <Select
          label="نوع الإجراء"
          options={["الكل", "إنشاء", "تعديل", "حذف", "اعتماد", "تسجيل دخول"]}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <Select
          label="الفترة"
          options={["اليوم", "أمس", "هذا الأسبوع", "هذا الشهر"]}
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
        />
      </FilterBar>

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-xl border bg-background py-2.5 pr-9 pl-3 text-sm min-h-[44px]"
            placeholder="بحث بالمستخدم أو الإجراء..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="المستخدم"
          options={["الكل", "سارة الزهراني", "محمد الغامدي", "فهد العتيبي", "النظام"]}
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        />
        <Select
          label="نوع الإجراء"
          options={["الكل", "إنشاء", "تعديل", "حذف", "اعتماد", "تسجيل دخول"]}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
        <Select
          label="الفترة"
          options={["اليوم", "أمس", "هذا الأسبوع", "هذا الشهر"]}
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
        />
      </MobileFilterDrawer>

      <>
        <MobilePageHeader
          title="سجل التدقيق"
          count={`${filtered.length} سجل`}
          action={
            <button
              className="min-h-[44px] min-w-[44px] grid place-items-center"
              onClick={() => setFilterOpen(true)}
            >
              <Filter size={18} />
            </button>
          }
        />
        <MobileTable
          columns={["الوقت", "المستخدم", "الإجراء", "الكيان", "IP", ""]}
          rows={filtered}
          renderRow={(a) => (
            <>
              <Td className="font-mono text-xs text-muted-foreground">{a.time}</Td>
              <Td className="font-semibold">{a.user}</Td>
              <Td>{a.action}</Td>
              <Td className="font-mono text-xs">{a.entity}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{a.ip}</Td>
              <Td>
                <button
                  onClick={() => setDetailTarget(a)}
                  className="text-primary text-xs font-semibold"
                >
                  تفاصيل ←
                </button>
              </Td>
            </>
          )}
          mobileCard={(a) => (
            <Card key={`${a.entity}-${a.time}`} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{a.user}</span>
                <span className="text-xs text-muted-foreground">{a.time}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>{a.action}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.entity}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="font-mono text-xs text-muted-foreground">{a.ip}</span>
                <button
                  onClick={() => setDetailTarget(a)}
                  className="text-primary text-xs font-semibold"
                >
                  تفاصيل ←
                </button>
              </div>
            </Card>
          )}
        />
      </>

      <EntityFormDrawer
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="تفاصيل السجل"
        onSave={() => setDetailTarget(null)}
        saveText="إغلاق"
      >
        {detailTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">المستخدم</span>
                <div className="font-semibold">{detailTarget.user}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">الإجراء</span>
                <div className="font-semibold">{detailTarget.action}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">الكيان</span>
                <div className="font-mono text-sm">{detailTarget.entity}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">الوقت</span>
                <div className="font-semibold">{detailTarget.time}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">IP</span>
                <div className="font-mono text-sm">{detailTarget.ip}</div>
              </div>
            </div>
          </div>
        )}
      </EntityFormDrawer>
    </AppShell>
  );
}
