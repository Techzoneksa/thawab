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
import { useState, useCallback } from "react";
import { Combobox } from "@/components/erp/Combobox";
import { EmptyState } from "@/components/erp/actions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";
import { getLedgerMovements, type LedgerMovement, type LedgerOptions } from "@/lib/api/ledger";

export const Route = createFileRoute("/finance/ledger")({
  head: () => ({ meta: [{ title: "دفتر الأستاذ" }] }),
  component: Page,
});

function fmt(n: number) {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type LedgerAccount = LedgerOptions["accounts"][number];
// Stable fallback: a fresh [] each render would re-trigger the picker's search.
const EMPTY_OPTIONS: LedgerOptions = { accounts: [], costCenters: [], projects: [] };

const toLatinDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * Account filter you can TYPE into: account number (exact → prefix → contains)
 * or name. Enter picks the best match, so "1101 ⏎" selects account 1101.
 * Searches the account list the ledger API already returned (no extra request).
 */
function AccountPicker({
  accounts,
  value,
  onChange,
  stacked,
}: {
  accounts: LedgerAccount[];
  value: string;
  onChange: (id: string) => void;
  stacked?: boolean;
}) {
  const search = useCallback(
    async (raw: string) => {
      const q = toLatinDigits(raw).trim().toLowerCase();
      if (!q) return { items: accounts.slice(0, 50) };
      const rank = (a: LedgerAccount) => {
        const code = a.code.toLowerCase();
        if (code === q) return 0;
        if (code.startsWith(q)) return 1;
        if (code.includes(q)) return 2;
        if (a.name.toLowerCase().includes(q)) return 3;
        return -1;
      };
      const items = accounts
        .map((a) => ({ a, r: rank(a) }))
        .filter((x) => x.r >= 0)
        .sort((x, y) => x.r - y.r || x.a.code.localeCompare(y.a.code))
        .slice(0, 50)
        .map((x) => x.a);
      return { items };
    },
    [accounts],
  );
  const selected = accounts.find((a) => a.id === value);
  return (
    <div className={stacked ? "" : "flex items-center gap-2 text-sm"}>
      <span
        className={
          stacked
            ? "text-xs font-semibold text-muted-foreground"
            : "text-muted-foreground whitespace-nowrap"
        }
      >
        الحساب{stacked ? "" : ":"}
      </span>
      <Combobox<LedgerAccount>
        className={stacked ? "mt-1" : "min-w-[260px]"}
        value={value}
        displayValue={selected ? `${selected.code} — ${selected.name}` : ""}
        placeholder="كل الحسابات — اكتب رقم الحساب أو اسمه"
        search={search}
        getId={(a) => a.id}
        getLabel={(a) => `${a.code} — ${a.name}`}
        onSelect={(a) => onChange(a?.id || "")}
      />
    </div>
  );
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
  const options = data?.options || EMPTY_OPTIONS;

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

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    const acc = options.accounts.find((a) => a.id === accountId);
    if (acc) filters.push({ label: "الحساب", value: `${acc.code} — ${acc.name}` });
    const cc = options.costCenters.find((c) => c.id === costCenterId);
    if (cc) filters.push({ label: "مركز التكلفة", value: cc.name });
    const proj = options.projects.find((p) => p.id === projectId);
    if (proj) filters.push({ label: "المشروع", value: proj.name });
    if (dateFrom) filters.push({ label: "من", value: dateFrom });
    if (dateTo) filters.push({ label: "إلى", value: dateTo });
    if (search) filters.push({ label: "بحث", value: search });
    const hasCostCenter = movements.some((m) => m.costCenterName);
    const hasProject = movements.some((m) => m.projectName);
    return {
      title: "دفتر الأستاذ العام",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "date", label: "التاريخ", type: "date", width: "9%" },
        { key: "entryNumber", label: "رقم القيد", width: "10%" },
        { key: "accountCode", label: "رقم الحساب", width: "8%" },
        { key: "accountName", label: "اسم الحساب", width: "15%" },
        { key: "description", label: "الوصف", width: "24%" },
        ...(hasCostCenter ? [{ key: "costCenter", label: "مركز التكلفة" }] : []),
        ...(hasProject ? [{ key: "project", label: "المشروع" }] : []),
        { key: "debit", label: "مدين", type: "money" },
        { key: "credit", label: "دائن", type: "money" },
        { key: "balance", label: "الرصيد", type: "money" },
      ],
      rows: movements.map((m: LedgerMovement) => ({
        date: m.date,
        entryNumber: m.entryNumber,
        accountCode: m.accountCode,
        accountName: m.accountName,
        description: m.description,
        costCenter: m.costCenterName || "",
        project: m.projectName || "",
        debit: m.debit,
        credit: m.credit,
        balance: m.runningBalance,
      })),
      totals: [
        { label: "الرصيد الافتتاحي", value: balances.opening },
        { label: "إجمالي المدين", value: totals.debit },
        { label: "إجمالي الدائن", value: totals.credit },
        { label: "الرصيد الختامي", value: balances.closing, strong: true },
      ],
      fileBase: `ledger-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "دفتر الأستاذ"]}
      title="دفتر الأستاذ العام (General Ledger)"
      actions={
        <>
          <DocumentActions document={buildDoc} />
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
        <AccountPicker accounts={options.accounts} value={accountId} onChange={setAccountId} />
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
          columns={["التاريخ", "القيد", "رقم الحساب", "اسم الحساب", "الوصف", "مدين", "دائن", "الرصيد"]}
          rows={movements}
          renderRow={(m: LedgerMovement) => (
            <>
              <Td className="font-mono text-xs">{m.date}</Td>
              <Td>
                <span className="font-mono text-xs text-info">{m.entryNumber}</span>
              </Td>
              <Td className="font-mono text-xs">{m.accountCode}</Td>
              <Td>
                <div className="text-xs font-semibold">{m.accountName}</div>
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
          <AccountPicker accounts={options.accounts} value={accountId} onChange={setAccountId} stacked />
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
