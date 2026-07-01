import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  FilterBar,
  Select,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { Filter, BookOpen } from "lucide-react";
import { useState, useEffect } from "react";
import { ExportButton, PrintButton, EmptyState } from "@/components/erp/actions";
import { getLedgerMovements, type LedgerMovement } from "@/lib/api/ledger";

export const Route = createFileRoute("/finance/ledger")({
  head: () => ({ meta: [{ title: "دفتر الأستاذ — ثواب" }] }),
  component: Page,
});

function fmt(n: number) {
  return new Intl.NumberFormat("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function Page() {
  const [accountId, setAccountId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ledger", { accountId, costCenterId, projectId, dateFrom, dateTo, search }],
    queryFn: () =>
      getLedgerMovements({ accountId, costCenterId, projectId, dateFrom, dateTo, search }),
    staleTime: 30_000,
  });

  const movements = data?.movements || [];
  const totals = data?.totals || { debit: 0, credit: 0, net: 0 };
  const balances = data?.balances || { opening: 0, closing: 0 };
  const options = data?.options || { accounts: [], costCenters: [], projects: [] };

  const summary = [
    {
      label: "الرصيد الافتتاحي",
      value: balances.opening,
      tone: balances.opening >= 0 ? "success" : "destructive",
    },
    { label: "إجمالي المدين", value: totals.debit, tone: "info" },
    { label: "إجمالي الدائن", value: totals.credit, tone: "warning" },
    { label: "صافي الحركة", value: totals.net, tone: totals.net >= 0 ? "success" : "destructive" },
    {
      label: "الرصيد الختامي",
      value: balances.closing,
      tone: balances.closing >= 0 ? "success" : "destructive",
    },
  ];

  const exportRows = movements.map((m) => ({
    التاريخ: m.date,
    "رقم القيد": m.entryNumber,
    الحساب: `${m.accountCode} — ${m.accountName}`,
    الوصف: m.description,
    "مركز التكلفة": m.costCenterName,
    المشروع: m.projectName,
    مدين: m.debit,
    دائن: m.credit,
    الرصيد: m.runningBalance,
    ملاحظات: m.notes,
  }));

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "دفتر الأستاذ"]}
      title="دفتر الأستاذ العام (General Ledger)"
      actions={
        <>
          <ExportButton
            data={exportRows as unknown as Record<string, unknown>[]}
            filename="دفتر_الأستاذ.csv"
          />
          <PrintButton />
          <Btn variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter size={15} /> تصفية
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {summary.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div
              className={`text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate ${
                s.tone === "success"
                  ? "text-success"
                  : s.tone === "destructive"
                    ? "text-destructive"
                    : s.tone === "warning"
                      ? "text-warning"
                      : "text-info"
              }`}
            >
              {fmt(s.value)}
            </div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <Select
          label="الحساب"
          options={["كل الحساتب", ...options.accounts.map((a) => `${a.code} — ${a.name}`)]}
          value={
            accountId
              ? options.accounts.find((a) => a.id === accountId)
                ? `${options.accounts.find((a) => a.id === accountId)!.code} — ${options.accounts.find((a) => a.id === accountId)!.name}`
                : "كل الحسابات"
              : "كل الحسابات"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "كل الحسابات") setAccountId("");
            else {
              const a = options.accounts.find((x) => `${x.code} — ${x.name}` === v);
              setAccountId(a?.id || "");
            }
          }}
        />
        <Select
          label="مركز التكلفة"
          options={["كل المراكز", ...options.costCenters.map((c) => c.name)]}
          value={
            costCenterId
              ? options.costCenters.find((c) => c.id === costCenterId)?.name || "كل المراكز"
              : "كل المراكز"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "كل المراكز") setCostCenterId("");
            else {
              const c = options.costCenters.find((x) => x.name === v);
              setCostCenterId(c?.id || "");
            }
          }}
        />
        <Select
          label="المشروع"
          options={["كل المشاريع", ...options.projects.map((p) => p.name)]}
          value={
            projectId
              ? options.projects.find((p) => p.id === projectId)?.name || "كل المشاريع"
              : "كل المشاريع"
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === "كل المشاريع") setProjectId("");
            else {
              const p = options.projects.find((x) => x.name === v);
              setProjectId(p?.id || "");
            }
          }}
        />
        <div className="hidden lg:flex items-center gap-2">
          <input
            type="date"
            className="rounded-lg border bg-background px-3 py-1.5 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">إلى</span>
          <input
            type="date"
            className="rounded-lg border bg-background px-3 py-1.5 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث برقم القيد أو الوصف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="دفتر الأستاذ"
        count={`${movements.length} حركة`}
        action={
          <button
            className="min-h-[44px] min-w-[44px] grid place-items-center"
            onClick={() => setFilterOpen(true)}
          >
            <Filter size={18} />
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل دفتر الأستاذ"
          action={
            <Btn
              variant="primary"
              onClick={() => {
                window.location.reload();
              }}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : movements.length === 0 ? (
        <EmptyState
          title="لا توجد حركات"
          description={
            accountId
              ? "لا توجد قيود مرحّلة تطابق الفلاتر المختارة."
              : "لم يتم ترحيل أي قيود بعد. ارحل قيود اليومية من صفحة «القيود» لعرض الحركات هنا."
          }
        />
      ) : (
        <MobileTable
          columns={["التاريخ", "القيد", "الحساب", "الوصف", "مدين", "دائن", "الرصيد"]}
          rows={movements}
          renderRow={(m: LedgerMovement) => (
            <>
              <Td className="font-mono text-xs">{m.date}</Td>
              <Td>
                <span className="font-mono text-xs text-info">{m.entryNumber}</span>
              </Td>
              <Td>
                <div className="text-xs">
                  <span className="font-mono text-muted-foreground">{m.accountCode}</span>
                  <span className="font-semibold mx-1">{m.accountName}</span>
                </div>
                {(m.costCenterName || m.projectName) && (
                  <div className="text-[10px] text-muted-foreground">
                    {m.costCenterName && <span>{m.costCenterName}</span>}
                    {m.costCenterName && m.projectName && <span> • </span>}
                    {m.projectName && <span>{m.projectName}</span>}
                  </div>
                )}
              </Td>
              <Td className="text-xs max-w-xs truncate">{m.description}</Td>
              <Td className="tabular-nums font-semibold">{m.debit > 0 ? fmt(m.debit) : "—"}</Td>
              <Td className="tabular-nums font-semibold">{m.credit > 0 ? fmt(m.credit) : "—"}</Td>
              <Td
                className={`tabular-nums font-bold ${
                  m.runningBalance >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {fmt(m.runningBalance)}
              </Td>
            </>
          )}
          mobileCard={(m: LedgerMovement) => (
            <Card key={m.lineId} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs">{m.date}</span>
                <span className="font-mono text-xs text-info">{m.entryNumber}</span>
              </div>
              <div className="text-sm font-semibold mb-1">
                <span className="font-mono text-muted-foreground">{m.accountCode}</span>
                <span className="mx-1">{m.accountName}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mb-2">{m.description}</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">مدين</div>
                  <div className="font-semibold tabular-nums">
                    {m.debit > 0 ? fmt(m.debit) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">دائن</div>
                  <div className="font-semibold tabular-nums">
                    {m.credit > 0 ? fmt(m.credit) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">الرصيد</div>
                  <div
                    className={`font-bold tabular-nums ${
                      m.runningBalance >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {fmt(m.runningBalance)}
                  </div>
                </div>
              </div>
              {(m.costCenterName || m.projectName) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.costCenterName && <Badge tone="muted">{m.costCenterName}</Badge>}
                  {m.projectName && <Badge tone="info">{m.projectName}</Badge>}
                </div>
              )}
            </Card>
          )}
        />
      )}

      <Card className="mt-3 p-3 bg-muted/30 flex items-start gap-2">
        <BookOpen size={14} className="mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-xs text-muted-foreground">
          دفتر الأستاذ يعرض القيود <strong>المرحّلة</strong> فقط (يستثني المسودة والإلغاء والعكس).
          الرصيد الجاري يُحسب تراكمياً عبر الفترة المختارة.
          {accountId && dateFrom && (
            <span>
              {" "}
              الرصيد الافتتاحي يشمل جميع الحركات المرحّلة للحساب قبل <strong>{dateFrom}</strong>.
            </span>
          )}
        </div>
      </Card>

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <Select
            label="الحساب"
            options={["كل الحسابات", ...options.accounts.map((a) => `${a.code} — ${a.name}`)]}
            value={
              accountId
                ? options.accounts.find((a) => a.id === accountId)
                  ? `${options.accounts.find((a) => a.id === accountId)!.code} — ${options.accounts.find((a) => a.id === accountId)!.name}`
                  : "كل الحسابات"
                : "كل الحسابات"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "كل الحسابات") setAccountId("");
              else {
                const a = options.accounts.find((x) => `${x.code} — ${x.name}` === v);
                setAccountId(a?.id || "");
              }
            }}
          />
          <Select
            label="مركز التكلفة"
            options={["كل المراكز", ...options.costCenters.map((c) => c.name)]}
            value={
              costCenterId
                ? options.costCenters.find((c) => c.id === costCenterId)?.name || "كل المراكز"
                : "كل المراكز"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "كل المراكز") setCostCenterId("");
              else {
                const c = options.costCenters.find((x) => x.name === v);
                setCostCenterId(c?.id || "");
              }
            }}
          />
          <Select
            label="المشروع"
            options={["كل المشاريع", ...options.projects.map((p) => p.name)]}
            value={
              projectId
                ? options.projects.find((p) => p.id === projectId)?.name || "كل المشاريع"
                : "كل المشاريع"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "كل المشاريع") setProjectId("");
              else {
                const p = options.projects.find((x) => x.name === v);
                setProjectId(p?.id || "");
              }
            }}
          />
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ من</label>
            <input
              type="date"
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ إلى</label>
            <input
              type="date"
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">بحث</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              placeholder="رقم القيد أو الوصف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
