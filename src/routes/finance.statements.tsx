import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  FilterBar,
  SectionTitle,
  MobileTable,
  Td,
  statusTone,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
  Table,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { useState } from "react";
import {
  showToast,
  ExportButton,
  PrintButton,
  PrintStyle,
  EmptyState,
} from "@/components/erp/actions";
import { Filter, FileBarChart, Calendar, RefreshCw } from "lucide-react";
import {
  getTrialBalance,
  getIncomeExpense,
  getFinancialPosition,
  getBudgetVsActual,
  type TrialBalanceRow,
  type IncomeExpenseRow,
  type FinancialPositionRow,
} from "@/lib/api/financial-statements";
import { getCostCenters, type CostCenter } from "@/lib/api/cost-centers";
import { getProjects, type Project } from "@/lib/api/projects";
import { label } from "@/lib/i18n/labels";
import { AccountClassification } from "@/lib/enums";

export const Route = createFileRoute("/finance/statements")({
  head: () => ({ meta: [{ title: "القوائم المالية — ثواب" }] }),
  component: Page,
});

type TabKey = "trial-balance" | "income-expense" | "financial-position" | "budget-vs-actual";

const TABS: { key: TabKey; label: string }[] = [
  { key: "trial-balance", label: "ميزان المراجعة" },
  { key: "income-expense", label: "الإيرادات والمصروفات" },
  { key: "financial-position", label: "المركز المالي" },
  { key: "budget-vs-actual", label: "الفعلي مقابل الموازنة" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function defaultStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>("trial-balance");
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(todayISO());
  const [asOf, setAsOf] = useState(todayISO());
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const filterParams = {
    startDate: activeTab === "financial-position" ? undefined : startDate,
    endDate: activeTab === "financial-position" ? undefined : endDate,
    asOf: activeTab === "financial-position" ? asOf : undefined,
    costCenterId: costCenterId || undefined,
    projectId: projectId || undefined,
  };

  const tbQuery = useQuery({
    queryKey: ["statement", "trial-balance", { startDate, endDate, costCenterId, projectId }],
    queryFn: () =>
      getTrialBalance({
        startDate,
        endDate,
        costCenterId: costCenterId || undefined,
        projectId: projectId || undefined,
      }),
    enabled: activeTab === "trial-balance",
  });

  const ieQuery = useQuery({
    queryKey: ["statement", "income-expense", { startDate, endDate, costCenterId, projectId }],
    queryFn: () =>
      getIncomeExpense({
        startDate,
        endDate,
        costCenterId: costCenterId || undefined,
        projectId: projectId || undefined,
      }),
    enabled: activeTab === "income-expense",
  });

  const fpQuery = useQuery({
    queryKey: ["statement", "financial-position", { asOf, costCenterId, projectId }],
    queryFn: () =>
      getFinancialPosition({
        asOf,
        costCenterId: costCenterId || undefined,
        projectId: projectId || undefined,
      }),
    enabled: activeTab === "financial-position",
  });

  const baQuery = useQuery({
    queryKey: ["statement", "budget-vs-actual", { startDate, endDate }],
    queryFn: () => getBudgetVsActual({ startDate, endDate }),
    enabled: activeTab === "budget-vs-actual",
  });

  const { data: ccData } = useQuery({
    queryKey: ["cost-centers", { search: "" }],
    queryFn: () => getCostCenters({}),
  });
  const ccList: CostCenter[] = ccData?.items || [];

  const { data: projData } = useQuery({
    queryKey: ["projects", { search: "" }],
    queryFn: () => getProjects({}),
  });
  const projectList: Array<{ id: string; name: string }> = (projData?.items || []).map(
    (p: Project) => ({ id: p.id, name: p.name }),
  );

  const isLoading =
    activeTab === "trial-balance"
      ? tbQuery.isLoading
      : activeTab === "income-expense"
        ? ieQuery.isLoading
        : activeTab === "financial-position"
          ? fpQuery.isLoading
          : baQuery.isLoading;

  const error =
    activeTab === "trial-balance"
      ? tbQuery.error
      : activeTab === "income-expense"
        ? ieQuery.error
        : activeTab === "financial-position"
          ? fpQuery.error
          : baQuery.error;

  const refreshAll = () => {
    tbQuery.refetch();
    ieQuery.refetch();
    fpQuery.refetch();
    baQuery.refetch();
    showToast("تم تحديث القوائم المالية", "success");
  };

  const exportData = (): Record<string, unknown>[] => {
    if (activeTab === "trial-balance" && tbQuery.data && tbQuery.data.type === "trial-balance") {
      return tbQuery.data.rows.map((r: TrialBalanceRow) => ({
        الرمز: r.accountCode,
        الحساب: r.accountName,
        النوع: label("accountClassification", r.accountType),
        "إجمالي مدين": fmtSAR(r.totalDebit),
        "إجمالي دائن": fmtSAR(r.totalCredit),
        "رصيد (مدين)": r.isDebit ? fmtSAR(r.balance) : "—",
        "رصيد (دائن)": !r.isDebit ? fmtSAR(r.balance) : "—",
      }));
    }
    if (activeTab === "income-expense" && ieQuery.data && ieQuery.data.type === "income-expense") {
      const rows: Record<string, unknown>[] = [];
      ieQuery.data.revenues.forEach((r: IncomeExpenseRow) => {
        rows.push({
          القسم: "إيرادات",
          الرمز: r.accountCode,
          الحساب: r.accountName,
          المبلغ: fmtSAR(Math.max(0, r.netAmount)),
        });
      });
      ieQuery.data.expenses.forEach((r: IncomeExpenseRow) => {
        rows.push({
          القسم: "مصروفات",
          الرمز: r.accountCode,
          الحساب: r.accountName,
          المبلغ: fmtSAR(Math.max(0, r.netAmount)),
        });
      });
      return rows;
    }
    if (
      activeTab === "financial-position" &&
      fpQuery.data &&
      fpQuery.data.type === "financial-position"
    ) {
      const rows: Record<string, unknown>[] = [];
      fpQuery.data.assets.forEach((r: FinancialPositionRow) =>
        rows.push({
          القسم: "أصول",
          الرمز: r.accountCode,
          الحساب: r.accountName,
          الرصيد: fmtSAR(r.balance),
        }),
      );
      fpQuery.data.liabilities.forEach((r: FinancialPositionRow) =>
        rows.push({
          القسم: "التزامات",
          الرمز: r.accountCode,
          الحساب: r.accountName,
          الرصيد: fmtSAR(r.balance),
        }),
      );
      fpQuery.data.equity.forEach((r: FinancialPositionRow) =>
        rows.push({
          القسم: "حقوق ملكية",
          الرمز: r.accountCode,
          الحساب: r.accountName,
          الرصيد: fmtSAR(r.balance),
        }),
      );
      return rows;
    }
    if (
      activeTab === "budget-vs-actual" &&
      baQuery.data &&
      baQuery.data.type === "budget-vs-actual"
    ) {
      const rows: Record<string, unknown>[] = [];
      baQuery.data.budgets.forEach((b) => {
        b.lines.forEach((l) => {
          rows.push({
            الموازنة: b.budget.name,
            "السطر رقم": l.lineNumber,
            المخطط: fmtSAR(l.plannedAmount),
            الفعلي: fmtSAR(l.actualAmount),
            الفرق: fmtSAR(l.variance),
            "نسبة الاستخدام": `${l.utilization}%`,
          });
        });
      });
      return rows;
    }
    return [];
  };

  return (
    <>
      <PrintStyle />
      <AppShell
        breadcrumb={["الرئيسية", "المالية", "القوائم المالية"]}
        title="القوائم المالية"
        actions={
          <>
            <Btn variant="outline" onClick={refreshAll}>
              <RefreshCw size={15} />
              تحديث
            </Btn>
            <ExportButton data={exportData()} filename={`statement-${activeTab}.csv`} />
            <PrintButton />
          </>
        }
      >
        <MobilePageHeader
          title="القوائم المالية"
          count={TABS.find((t) => t.key === activeTab)?.label}
        />

        <FilterBar>
          {activeTab !== "financial-position" ? (
            <>
              <DateField label="من" value={startDate} onChange={setStartDate} />
              <DateField label="إلى" value={endDate} onChange={setEndDate} />
            </>
          ) : (
            <DateField label="كما في" value={asOf} onChange={setAsOf} />
          )}
          <select
            className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
          >
            <option value="">كل مراكز التكلفة</option>
            {ccList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
          <select
            className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">كل المشاريع</option>
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
            <Filter size={15} />
          </Btn>
        </FilterBar>

        <div className="lg:hidden flex items-center gap-2 mb-3">
          <MobileSearchInput placeholder="بحث في القائمة..." />
        </div>

        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 flex-nowrap mb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[36px] ${
                t.key === activeTab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <EmptyState
            title="خطأ في تحميل البيانات"
            description="حدث خطأ أثناء جلب القائمة المالية"
            action={
              <Btn variant="primary" onClick={refreshAll}>
                إعادة المحاولة
              </Btn>
            }
          />
        ) : (
          <>
            {activeTab === "trial-balance" && tbQuery.data?.type === "trial-balance" && (
              <TrialBalanceView data={tbQuery.data} />
            )}
            {activeTab === "income-expense" && ieQuery.data?.type === "income-expense" && (
              <IncomeExpenseView data={ieQuery.data} />
            )}
            {activeTab === "financial-position" && fpQuery.data?.type === "financial-position" && (
              <FinancialPositionView data={fpQuery.data} />
            )}
            {activeTab === "budget-vs-actual" && baQuery.data?.type === "budget-vs-actual" && (
              <BudgetVsActualView data={baQuery.data} />
            )}
          </>
        )}

        <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
          <div className="space-y-4">
            {activeTab !== "financial-position" ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">من تاريخ</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">إلى تاريخ</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">كما في تاريخ</label>
                <input
                  type="date"
                  className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">مركز التكلفة</label>
              <select
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
              >
                <option value="">كل مراكز التكلفة</option>
                {ccList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
              <select
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">كل المشاريع</option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </MobileFilterDrawer>
      </AppShell>
    </>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <input
        type="date"
        className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ============ TRIAL BALANCE ============
function TrialBalanceView({
  data,
}: {
  data: {
    rows: TrialBalanceRow[];
    totals: { totalDebit: number; totalCredit: number; balanced: boolean; variance: number };
  };
}) {
  if (data.rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد بيانات"
        description="لم يتم ترحيل أي قيود في هذه الفترة. قم بإضافة وترحيل القيود أولاً."
        icon={<FileBarChart size={28} />}
      />
    );
  }
  return (
    <Card className="p-4 lg:p-6">
      <SectionTitle
        title="ميزان المراجعة"
        hint={`من ${data.rows.length} حساب · ${data.totals.balanced ? "متوازن ✓" : "غير متوازن ⚠"}`}
        action={
          <Badge tone={data.totals.balanced ? "success" : "destructive"}>
            {data.totals.balanced ? "متوازن" : "غير متوازن"}
          </Badge>
        }
      />
      <MobileTable
        columns={["الرمز", "الحساب", "النوع", "مدين", "دائن", "الرصيد"]}
        rows={data.rows}
        renderRow={(r) => (
          <>
            <Td className="font-mono text-xs">{r.accountCode}</Td>
            <Td>{r.accountName}</Td>
            <Td>
              <Badge tone={typeTone(r.accountType)}>
                {label("accountClassification", r.accountType)}
              </Badge>
            </Td>
            <Td className="tabular-nums">{fmtSAR(r.totalDebit)}</Td>
            <Td className="tabular-nums">{fmtSAR(r.totalCredit)}</Td>
            <Td className="tabular-nums font-bold">
              {r.isDebit ? fmtSAR(r.balance) : fmtSAR(r.balance)}
            </Td>
          </>
        )}
        mobileCard={(r) => (
          <Card key={r.accountId} className="p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-muted-foreground">{r.accountCode}</div>
                <div className="text-sm font-bold truncate">{r.accountName}</div>
              </div>
              <Badge tone={typeTone(r.accountType)}>
                {label("accountClassification", r.accountType)}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-muted-foreground">مدين</div>
                <div className="font-bold tabular-nums">{fmtSAR(r.totalDebit)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">دائن</div>
                <div className="font-bold tabular-nums">{fmtSAR(r.totalCredit)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">الرصيد</div>
                <div className="font-bold tabular-nums">{fmtSAR(r.balance)}</div>
              </div>
            </div>
          </Card>
        )}
      />
      <div className="mt-4 grid grid-cols-3 gap-3 p-3 rounded-lg bg-primary/10 text-sm">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">إجمالي المدين</div>
          <div className="font-bold tabular-nums">{fmtSAR(data.totals.totalDebit)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">إجمالي الدائن</div>
          <div className="font-bold tabular-nums">{fmtSAR(data.totals.totalCredit)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">الفرق</div>
          <div
            className={`font-bold tabular-nums ${data.totals.balanced ? "text-success" : "text-destructive"}`}
          >
            {fmtSAR(Math.abs(data.totals.variance))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============ INCOME / EXPENSE ============
function IncomeExpenseView({
  data,
}: {
  data: {
    revenues: IncomeExpenseRow[];
    expenses: IncomeExpenseRow[];
    totals: { totalRevenue: number; totalExpense: number; surplus: number; deficit: boolean };
  };
}) {
  if (data.revenues.length === 0 && data.expenses.length === 0) {
    return (
      <EmptyState
        title="لا توجد إيرادات أو مصروفات"
        description="لم يتم ترحيل أي قيود إيرادات/مصروفات في هذه الفترة"
        icon={<FileBarChart size={28} />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <Card className="p-4 lg:p-6">
        <SectionTitle title="الإيرادات" hint={`${data.revenues.length} حساب إيرادات`} />
        {data.revenues.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            لا توجد إيرادات مرحّلة في هذه الفترة
          </div>
        ) : (
          <Table
            columns={["الرمز", "الحساب", "المبلغ"]}
            rows={data.revenues}
            renderRow={(r) => (
              <>
                <Td className="font-mono text-xs">{r.accountCode}</Td>
                <Td>{r.accountName}</Td>
                <Td className="tabular-nums font-bold text-success">
                  {fmtSAR(Math.max(0, r.netAmount))}
                </Td>
              </>
            )}
          />
        )}
        <div className="mt-3 p-3 rounded-lg bg-success/10 text-sm flex justify-between items-center">
          <span className="font-bold">إجمالي الإيرادات</span>
          <span className="font-bold tabular-nums text-success text-lg">
            {fmtSAR(data.totals.totalRevenue)}
          </span>
        </div>
      </Card>

      <Card className="p-4 lg:p-6">
        <SectionTitle title="المصروفات" hint={`${data.expenses.length} حساب مصروفات`} />
        {data.expenses.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            لا توجد مصروفات مرحّلة في هذه الفترة
          </div>
        ) : (
          <Table
            columns={["الرمز", "الحساب", "المبلغ"]}
            rows={data.expenses}
            renderRow={(r) => (
              <>
                <Td className="font-mono text-xs">{r.accountCode}</Td>
                <Td>{r.accountName}</Td>
                <Td className="tabular-nums font-bold text-destructive">
                  {fmtSAR(Math.max(0, r.netAmount))}
                </Td>
              </>
            )}
          />
        )}
        <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-sm flex justify-between items-center">
          <span className="font-bold">إجمالي المصروفات</span>
          <span className="font-bold tabular-nums text-destructive text-lg">
            {fmtSAR(data.totals.totalExpense)}
          </span>
        </div>
      </Card>

      <Card className={`p-4 lg:p-6 ${data.totals.deficit ? "bg-destructive/10" : "bg-success/10"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">
              {data.totals.deficit ? "عجز الفترة" : "فائض الفترة"}
            </div>
            <div className="text-2xl font-extrabold tabular-nums">
              {fmtSAR(Math.abs(data.totals.surplus))}
            </div>
          </div>
          <Badge tone={data.totals.deficit ? "destructive" : "success"}>
            {data.totals.deficit ? "عجز" : "فائض"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          الإيرادات ({fmtSAR(data.totals.totalRevenue)}) − المصروفات (
          {fmtSAR(data.totals.totalExpense)})
        </p>
      </Card>
    </div>
  );
}

// ============ FINANCIAL POSITION ============
function FinancialPositionView({
  data,
}: {
  data: {
    assets: FinancialPositionRow[];
    liabilities: FinancialPositionRow[];
    equity: FinancialPositionRow[];
    periodSurplus: number;
    totals: {
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
      totalEquityWithSurplus: number;
      totalLiabilitiesAndEquity: number;
      balanced: boolean;
    };
  };
}) {
  if (data.assets.length === 0 && data.liabilities.length === 0 && data.equity.length === 0) {
    return (
      <EmptyState
        title="لا توجد أرصدة"
        description="لا توجد حسابات أصول أو التزامات أو حقوق ملكية مرحّلة في هذه الفترة"
        icon={<FileBarChart size={28} />}
      />
    );
  }
  return (
    <div className="space-y-4">
      <PositionSection
        title="الأصول"
        tone="success"
        rows={data.assets}
        total={data.totals.totalAssets}
      />
      <PositionSection
        title="الالتزامات"
        tone="destructive"
        rows={data.liabilities}
        total={data.totals.totalLiabilities}
      />
      <PositionSection
        title="حقوق الملكية"
        tone="info"
        rows={data.equity}
        total={data.totals.totalEquity}
      />

      <Card className="p-4 lg:p-6 bg-primary/10">
        <SectionTitle title="ملخص قائمة المركز المالي" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <SummaryRow
            label="إجمالي الأصول"
            value={fmtSAR(data.totals.totalAssets)}
            tone="success"
          />
          <SummaryRow
            label="إجمالي الالتزامات"
            value={fmtSAR(data.totals.totalLiabilities)}
            tone="destructive"
          />
          <SummaryRow label="إجمالي حقوق الملكية" value={fmtSAR(data.totals.totalEquity)} />
          <SummaryRow
            label={data.periodSurplus >= 0 ? "فائض الفترة المضاف" : "عجز الفترة المخصوم"}
            value={fmtSAR(Math.abs(data.periodSurplus))}
            tone={data.periodSurplus >= 0 ? "success" : "destructive"}
          />
          <SummaryRow
            label="إجمالي الالتزامات وحقوق الملكية"
            value={fmtSAR(data.totals.totalLiabilitiesAndEquity)}
            bold
          />
          <SummaryRow
            label="الحالة"
            value={data.totals.balanced ? "متوازن ✓" : "غير متوازن ⚠"}
            tone={data.totals.balanced ? "success" : "destructive"}
            bold
          />
        </div>
      </Card>
    </div>
  );
}

function PositionSection({
  title,
  tone,
  rows,
  total,
}: {
  title: string;
  tone: "success" | "destructive" | "info";
  rows: FinancialPositionRow[];
  total: number;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-4 lg:p-6">
        <SectionTitle title={title} />
        <div className="text-xs text-muted-foreground py-4 text-center">
          لا توجد حسابات في هذه الفئة
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4 lg:p-6">
      <SectionTitle title={title} hint={`${rows.length} حساب`} />
      <MobileTable
        columns={["الرمز", "الحساب", "الرصيد"]}
        rows={rows}
        renderRow={(r) => (
          <>
            <Td className="font-mono text-xs">{r.accountCode}</Td>
            <Td>{r.accountName}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(r.balance)}</Td>
          </>
        )}
        mobileCard={(r) => (
          <Card className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-muted-foreground">{r.accountCode}</div>
                <div className="text-sm font-bold truncate">{r.accountName}</div>
              </div>
              <div className="font-bold tabular-nums">{fmtSAR(r.balance)}</div>
            </div>
          </Card>
        )}
      />
      <div
        className={`mt-3 p-3 rounded-lg text-sm flex justify-between items-center bg-${tone}/10`}
      >
        <span className="font-bold">إجمالي {title}</span>
        <span className={`font-bold tabular-nums text-${tone} text-lg`}>{fmtSAR(total)}</span>
      </div>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-extrabold text-base" : "font-bold"} ${
          tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ============ BUDGET vs ACTUAL ============
function BudgetVsActualView({
  data,
}: {
  data: {
    budgets: Array<{
      budget: { id: string; name: string; year: string; status: string; currency: string };
      lines: Array<{
        id: string;
        lineNumber: number;
        plannedAmount: number;
        actualAmount: number;
        variance: number;
        utilization: number;
      }>;
      totals: { planned: number; actual: number; variance: number; utilization: number };
    }>;
  };
}) {
  if (data.budgets.length === 0) {
    return (
      <EmptyState
        title="لا توجد موازنات معتمدة"
        description="لم يتم اعتماد أي موازنة بعد. اعتمد موازنة أولاً لمقارنة الفعلي بها."
        icon={<FileBarChart size={28} />}
      />
    );
  }
  return (
    <div className="space-y-4">
      {data.budgets.map((b) => (
        <Card key={b.budget.id} className="p-4 lg:p-6">
          <SectionTitle
            title={b.budget.name}
            hint={`سنة ${b.budget.year} · ${label("budgetStatus", b.budget.status)}`}
            action={
              <Badge tone={statusTone(b.budget.status)}>
                {label("budgetStatus", b.budget.status)}
              </Badge>
            }
          />
          {b.lines.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              لا توجد سطور في هذه الموازنة
            </div>
          ) : (
            <MobileTable
              columns={["#", "المخطط", "الفعلي", "الفرق", "الاستخدام"]}
              rows={b.lines}
              renderRow={(l) => (
                <>
                  <Td className="font-mono text-xs">{l.lineNumber}</Td>
                  <Td className="tabular-nums">{fmtSAR(l.plannedAmount)}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(l.actualAmount)}</Td>
                  <Td
                    className={`tabular-nums ${
                      l.variance < 0 ? "text-destructive font-bold" : "text-warning"
                    }`}
                  >
                    {fmtSAR(l.variance)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${
                            l.utilization > 90
                              ? "bg-destructive"
                              : l.utilization > 70
                                ? "bg-warning"
                                : "bg-success"
                          }`}
                          style={{ width: `${Math.min(100, l.utilization)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">{l.utilization}%</span>
                    </div>
                  </Td>
                </>
              )}
              mobileCard={(l) => (
                <Card className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">سطر {l.lineNumber}</span>
                    <span className="text-xs font-bold tabular-nums">{l.utilization}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div
                      className={`h-full ${
                        l.utilization > 90
                          ? "bg-destructive"
                          : l.utilization > 70
                            ? "bg-warning"
                            : "bg-success"
                      }`}
                      style={{ width: `${Math.min(100, l.utilization)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">المخطط</div>
                      <div className="font-bold tabular-nums">{fmtSAR(l.plannedAmount)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">الفعلي</div>
                      <div className="font-bold tabular-nums">{fmtSAR(l.actualAmount)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">الفرق</div>
                      <div
                        className={`font-bold tabular-nums ${
                          l.variance < 0 ? "text-destructive" : "text-warning"
                        }`}
                      >
                        {fmtSAR(l.variance)}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            />
          )}
          <div className="mt-3 grid grid-cols-4 gap-3 p-3 rounded-lg bg-primary/10 text-xs">
            <div className="text-center">
              <div className="text-muted-foreground">المخطط</div>
              <div className="font-bold tabular-nums">{fmtSAR(b.totals.planned)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">الفعلي</div>
              <div className="font-bold tabular-nums text-success">{fmtSAR(b.totals.actual)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">الفرق</div>
              <div
                className={`font-bold tabular-nums ${
                  b.totals.variance < 0 ? "text-destructive" : "text-warning"
                }`}
              >
                {fmtSAR(b.totals.variance)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">الاستخدام</div>
              <div className="font-bold tabular-nums">{b.totals.utilization}%</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function typeTone(
  type: string,
): "success" | "destructive" | "info" | "muted" | "warning" | "primary" {
  if (type === AccountClassification.REVENUE) return "success";
  if (type === AccountClassification.EXPENSE) return "destructive";
  if (type === AccountClassification.ASSET) return "info";
  if (type === AccountClassification.LIABILITY) return "warning";
  if (type === AccountClassification.EQUITY) return "primary";
  return "muted";
}
