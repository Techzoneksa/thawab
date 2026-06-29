import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  Td,
  FilterBar,
  Select,
  MobileTable,
  MobilePageHeader,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { CHART_OF_ACCOUNTS, fmtSAR } from "@/data/sample";
import {
  showToast,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
  PrintStyle,
} from "@/components/erp/actions";
import { Download, Filter, Eye, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/finance/ledger")({
  head: () => ({ meta: [{ title: "دفتر الأستاذ — ثواب" }] }),
  component: Page,
});

const initialLedgerRows = [
  {
    d: "1446/10/01",
    id: "JV-2406-0150",
    b: "رصيد افتتاحي",
    dr: 0,
    cr: 0,
    bal: 6_840_000,
    status: "مرحّل",
  },
  {
    d: "1446/10/03",
    id: "JV-2406-0152",
    b: "تبرع بنكي - حملة كفالة",
    dr: 320_000,
    cr: 0,
    bal: 7_160_000,
    status: "مرحّل",
  },
  {
    d: "1446/10/05",
    id: "JV-2406-0158",
    b: "صرف موردين - سلال غذائية",
    dr: 0,
    cr: 47_300,
    bal: 7_112_700,
    status: "مرحّل",
  },
  {
    d: "1446/10/08",
    id: "JV-2406-0164",
    b: "تبرع بنكي - حملة كسوة الشتاء",
    dr: 280_000,
    cr: 0,
    bal: 7_392_700,
    status: "مرحّل",
  },
  {
    d: "1446/10/10",
    id: "JV-2406-0183",
    b: "رواتب الإدارة - شوال",
    dr: 0,
    cr: 312_400,
    bal: 7_080_300,
    status: "مرحّل",
  },
  {
    d: "1446/10/10",
    id: "JV-2406-0184",
    b: "عوائد وقفية ربعية",
    dr: 180_000,
    cr: 0,
    bal: 7_260_300,
    status: "مرحّل",
  },
  {
    d: "1446/10/11",
    id: "JV-2406-0185",
    b: "تبرع نقدي - إفطار صائم",
    dr: 32_000,
    cr: 0,
    bal: 7_292_300,
    status: "مرحّل",
  },
  {
    d: "1446/10/12",
    id: "JV-2406-0188",
    b: "تبرع بنكي - مؤسسة الراجحي",
    dr: 600_000,
    cr: 0,
    bal: 7_892_300,
    status: "مرحّل",
  },
  {
    d: "1446/10/13",
    id: "JV-2406-0190",
    b: "تسوية بنكية (بانتظار الترحيل)",
    dr: 0,
    cr: 24_500,
    bal: 7_867_800,
    status: "مسودة",
  },
];

function Page() {
  const [rows, setRows] = useState(initialLedgerRows);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountFilter, setAccountFilter] = useState("الكل");
  const [periodFilter, setPeriodFilter] = useState("الكل");
  const [fundFilter, setFundFilter] = useState("الكل");
  const [detailRow, setDetailRow] = useState<(typeof initialLedgerRows)[0] | null>(null);

  const hasDraft = rows.some((r) => r.status === "مسودة");

  const filtered = rows.filter((r) => {
    if (accountFilter !== "الكل" && !r.b.toLowerCase().includes(accountFilter.toLowerCase()))
      return false;
    return true;
  });

  const handlePostAll = () => {
    setRows((prev) => prev.map((r) => (r.status === "مسودة" ? { ...r, status: "مرحّل" } : r)));
    showToast("تم ترحيل جميع القيود المعلقة", "success");
  };

  const exportData = filtered.map((r) => ({
    التاريخ: r.d,
    "رقم القيد": r.id,
    البيان: r.b,
    مدين: r.dr || "—",
    دائن: r.cr || "—",
    الرصيد: r.bal,
    الحالة: r.status,
  }));

  const accountOptions = ["الكل", ...CHART_OF_ACCOUNTS.map((a) => `${a.code} ${a.name}`)];

  return (
    <>
      <PrintStyle />
      <AppShell
        breadcrumb={["الرئيسية", "المالية", "دفتر الأستاذ"]}
        title="دفتر الأستاذ"
        actions={
          <>
            <ExportButton data={exportData} filename="ledger.csv" />
            <PrintButton />
            {hasDraft && (
              <Btn variant="primary" onClick={handlePostAll}>
                <ArrowUpDown size={15} />
                ترحيل
              </Btn>
            )}
          </>
        }
      >
        <FilterBar>
          <Select
            label="الحساب"
            options={accountOptions}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          />
          <Select
            label="الفترة"
            options={["الكل", "هذا الشهر", "هذا الربع", "هذا العام"]}
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          />
          <Select
            label="نوع الصندوق"
            options={["الكل", "مقيد", "غير مقيد", "أوقاف"]}
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
          />
        </FilterBar>

        <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
          <Select
            label="الحساب"
            options={accountOptions}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          />
          <Select
            label="الفترة"
            options={["الكل", "هذا الشهر", "هذا الربع", "هذا العام"]}
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          />
          <Select
            label="نوع الصندوق"
            options={["الكل", "مقيد", "غير مقيد", "أوقاف"]}
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
          />
        </MobileFilterDrawer>

        <>
          <MobilePageHeader
            title="دفتر الأستاذ"
            count={`${filtered.length} قيد`}
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
            columns={["التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد", ""]}
            rows={filtered}
            renderRow={(r) => (
              <>
                <Td className="text-muted-foreground">{r.d}</Td>
                <Td className="font-mono text-xs">{r.id}</Td>
                <Td>{r.b}</Td>
                <Td className="tabular-nums text-success">{r.dr ? fmtSAR(r.dr) : "—"}</Td>
                <Td className="tabular-nums text-destructive">{r.cr ? fmtSAR(r.cr) : "—"}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(r.bal)}</Td>
                <Td>
                  <ActionMenu
                    actions={[{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailRow(r) }]}
                  />
                </Td>
              </>
            )}
            mobileCard={(r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{r.d}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                </div>
                <div className="text-sm">{r.b}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-success">مدين: {r.dr ? fmtSAR(r.dr) : "—"}</span>
                  <span className="text-xs text-destructive">
                    دائن: {r.cr ? fmtSAR(r.cr) : "—"}
                  </span>
                </div>
                <div className="text-sm font-bold mt-1">الرصيد: {fmtSAR(r.bal)}</div>
                <div className="mt-2 pt-2 border-t">
                  <button
                    className="text-primary text-xs font-semibold"
                    onClick={() => setDetailRow(r)}
                  >
                    عرض التفاصيل
                  </button>
                </div>
              </Card>
            )}
          />
        </>
      </AppShell>

      <EntityFormDrawer
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title="تفاصيل القيد"
        onSave={() => setDetailRow(null)}
        saveText="إغلاق"
      >
        {detailRow && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">رقم القيد</span>
                <div className="font-semibold font-mono">{detailRow.id}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">التاريخ</span>
                <div className="font-semibold">{detailRow.d}</div>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">البيان</span>
              <div className="font-semibold">{detailRow.b}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">مدين</span>
                <div className="font-semibold text-success">
                  {detailRow.dr ? fmtSAR(detailRow.dr) : "—"}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">دائن</span>
                <div className="font-semibold text-destructive">
                  {detailRow.cr ? fmtSAR(detailRow.cr) : "—"}
                </div>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الرصيد</span>
              <div className="font-bold text-lg">{fmtSAR(detailRow.bal)}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الحالة</span>
              <div>
                <Badge tone={detailRow.status === "مرحّل" ? "success" : "warning"}>
                  {detailRow.status}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </EntityFormDrawer>
    </>
  );
}
