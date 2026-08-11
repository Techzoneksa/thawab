import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Plus, Search, Filter, Eye, Pencil, Trash2, CheckCircle, Lock, Unlock } from "lucide-react";
import { useState, useEffect } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { label, options } from "@/lib/i18n/labels";
import { BudgetStatus } from "@/lib/enums";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { getCostCenters, type CostCenter } from "@/lib/api/cost-centers";
import {
  getBudgets,
  getBudget,
  deleteBudget,
  approveBudget,
  lockBudget,
  unlockBudget,
  type Budget,
  type BudgetLine,
} from "@/lib/api/budgets";

export const Route = createFileRoute("/finance/budgets")({
  head: () => ({ meta: [{ title: "الموازنات — ثواب" }] }),
  component: Page,
});

interface DraftLine {
  accountId: string;
  costCenterId: string;
  plannedAmount: string;
  notes: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    name: string;
    action: "approve" | "lock" | "unlock";
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["budgets", { search: searchQuery, status: statusFilter, year: yearFilter }],
    queryFn: () => getBudgets({ search: searchQuery, status: statusFilter, year: yearFilter }),
  });

  const budgets = data?.items || [];
  const total = data?.total || 0;

  const { data: detailData } = useQuery({
    queryKey: ["budget", detailId],
    queryFn: () => (detailId ? getBudget(detailId) : Promise.resolve(null)),
    enabled: !!detailId,
  });

  // Derive available years from data + a few defaults
  const years = Array.from(new Set(budgets.map((b: Budget) => b.year))).sort();
  const yearOptions = ["الكل", ...(years.length ? years : ["1446", "1447", "1448"])];

  const openAdd = () => navigate({ to: "/finance/budgets/new" });

  const openEdit = (b: Budget) => {
    if (b.status !== BudgetStatus.DRAFT) {
      showToast("لا يمكن تعديل موازنة معتمدة أو مقفلة. افتح التفاصيل لعرض السجل أو تنفيذ إجراء.", "error");
      return;
    }
    navigate({ to: "/finance/budgets/$id/edit", params: { id: b.id } });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast("تم حذف الموازنة بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const actionMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "approve" | "lock" | "unlock";
      userId?: string;
      userName?: string;
    }) => {
      const fns = {
        approve: approveBudget,
        lock: lockBudget,
        unlock: unlockBudget,
      };
      return fns[vars.action]({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      const labels = {
        approve: "تم اعتماد الموازنة",
        lock: "تم قفل الموازنة",
        unlock: "تم فتح قفل الموازنة",
      };
      showToast(labels[vars.action], "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleActionConfirm = () => {
    if (actionTarget) {
      actionMutation.mutate({
        id: actionTarget.id,
        action: actionTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const stats = [
    { label: "إجمالي الموازنات", value: fmtNum(total) },
    {
      label: "معتمدة",
      value: budgets.filter((b: Budget) => b.status === BudgetStatus.APPROVED).length,
    },
    {
      label: "مقفلة",
      value: budgets.filter((b: Budget) => b.status === BudgetStatus.LOCKED).length,
    },
    {
      label: "إجمالي المخطط",
      value: fmtSAR(budgets.reduce((s: number, b: Budget) => s + b.amount, 0)),
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموازنات"]}
      title="الموازنات"
      actions={
        <>
          <ExportButton
            data={budgets as unknown as Record<string, unknown>[]}
            filename="الموازنات.csv"
          />
          <PrintButton />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> موازنة جديدة
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالاسم أو القسم أو السنة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...options("budgetStatus").map((o) => o.label)]}
          value={statusFilter ? label("budgetStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("budgetStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Select
          label="السنة"
          options={yearOptions}
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="الموازنات"
        count={`${fmtNum(total)} موازنة`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل الموازنات"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["budgets"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="لا توجد موازنات"
          description="ابدأ بإضافة أول موازنة"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة موازنة
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الموازنة", "السنة", "القسم", "المخطط", "المصروف", "الحالة", ""]}
          rows={budgets}
          renderRow={(b: Budget) => {
            const pct = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
            return (
              <>
                <Td>
                  <button
                    onClick={() => setDetailId(b.id)}
                    className="font-semibold hover:text-primary text-right"
                  >
                    {b.name}
                  </button>
                </Td>
                <Td className="font-mono text-xs">{b.year}</Td>
                <Td className="text-xs">{b.department || "—"}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(b.amount)}</Td>
                <Td>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{pct}%</span>
                  </div>
                </Td>
                <Td>
                  <Badge tone={statusTone(b.status)}>{label("budgetStatus", b.status)}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={getBudgetActions(
                      b,
                      setDetailId,
                      openEdit,
                      setDeleteTarget,
                      setActionTarget,
                    )}
                  />
                </Td>
              </>
            );
          }}
          mobileCard={(b: Budget) => {
            const pct = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
            return (
              <Card key={b.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setDetailId(b.id)}
                      className="text-sm font-bold hover:text-primary text-right"
                    >
                      {b.name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {b.year} · {b.department || "—"}
                    </div>
                  </div>
                  <Badge tone={statusTone(b.status)}>{label("budgetStatus", b.status)}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums">{pct}%</span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">المخطط: {fmtSAR(b.amount)}</span>
                  <span className="font-bold">المنصرف: {fmtSAR(b.spent)}</span>
                </div>
              </Card>
            );
          }}
        />
      )}

      <EntityFormDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`الموازنة: ${detailData?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="السنة" value={detailData.item.year} />
              <DetailRow label="الحالة" value={label("budgetStatus", detailData.item.status)} />
              <DetailRow label="القسم" value={detailData.item.department || "—"} />
              <DetailRow label="العملة" value={detailData.item.currency} />
            </div>
            {detailData.item.description && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">الوصف</div>
                <div className="text-sm mt-1">{detailData.item.description}</div>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                مقارنة المخطط بالفعلي
              </div>
              <div className="space-y-2">
                {detailData.lines.length === 0 ? (
                  <div className="text-xs text-muted-foreground">لا توجد سطور</div>
                ) : (
                  detailData.lines.map((l: BudgetLine) => (
                    <div key={l.id} className="rounded-lg border p-2 bg-muted/30">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold">
                          {l.accountCode} - {l.accountName}
                        </span>
                        <span className="text-muted-foreground">{l.costCenterName || ""}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded bg-info/10 p-1.5 text-center">
                          <div className="text-muted-foreground">المخطط</div>
                          <div className="font-bold tabular-nums">{fmtSAR(l.plannedAmount)}</div>
                        </div>
                        <div className="rounded bg-success/10 p-1.5 text-center">
                          <div className="text-success">الفعلي</div>
                          <div className="font-bold tabular-nums text-success">
                            {fmtSAR(l.actualAmount)}
                          </div>
                        </div>
                        <div
                          className={`rounded p-1.5 text-center ${
                            (l.variance || 0) < 0 ? "bg-destructive/10" : "bg-warning/10"
                          }`}
                        >
                          <div className="text-muted-foreground">الفرق</div>
                          <div className="font-bold tabular-nums">{fmtSAR(l.variance || 0)}</div>
                        </div>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${(l.utilization || 0) > 90 ? "bg-destructive" : (l.utilization || 0) > 70 ? "bg-warning" : "bg-success"}`}
                          style={{ width: `${Math.min(100, l.utilization || 0)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 text-center">
                        {l.utilization || 0}% استخدام
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Card className="p-3 bg-primary/10">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-muted-foreground">إجمالي المخطط</div>
                  <div className="font-bold tabular-nums">{fmtSAR(detailData.totals.planned)}</div>
                </div>
                <div className="text-center">
                  <div className="text-success">إجمالي الفعلي</div>
                  <div className="font-bold tabular-nums text-success">
                    {fmtSAR(detailData.totals.actual)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">الفرق</div>
                  <div className="font-bold tabular-nums">{fmtSAR(detailData.totals.variance)}</div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الموازنة"
        message="لا يمكن حذف موازنة معتمدة أو مقفلة."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={handleActionConfirm}
        title={
          actionTarget
            ? actionTarget.action === "approve"
              ? "اعتماد الموازنة"
              : actionTarget.action === "lock"
                ? "قفل الموازنة"
                : "فتح قفل الموازنة"
            : ""
        }
        message={
          actionTarget
            ? `هل تريد ${actionTarget.action === "approve" ? "اعتماد" : actionTarget.action === "lock" ? "قفل" : "فتح قفل"} الموازنة "${actionTarget.name}"؟`
            : ""
        }
        confirmText={
          actionTarget
            ? actionTarget.action === "approve"
              ? "اعتماد"
              : actionTarget.action === "lock"
                ? "قفل"
                : "فتح"
            : ""
        }
        cancelText="إلغاء"
        variant="default"
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("budgetStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">السنة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function getBudgetActions(
  b: Budget,
  setDetailId: (id: string) => void,
  openEdit: (b: Budget) => void,
  setDeleteTarget: (id: string) => void,
  setActionTarget: (t: { id: string; name: string; action: "approve" | "lock" | "unlock" }) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(b.id) }];

  if (b.status === BudgetStatus.DRAFT) {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(b) });
    actions.push({
      label: "اعتماد",
      icon: CheckCircle,
      onClick: () => setActionTarget({ id: b.id, name: b.name, action: "approve" }),
    });
    actions.push({
      label: "حذف",
      icon: Trash2,
      onClick: () => setDeleteTarget(b.id),
      variant: "destructive",
    });
  }

  if (b.status === BudgetStatus.APPROVED) {
    actions.push({
      label: "قفل",
      icon: Lock,
      onClick: () => setActionTarget({ id: b.id, name: b.name, action: "lock" }),
    });
  }

  if (b.status === BudgetStatus.LOCKED) {
    actions.push({
      label: "فتح القفل",
      icon: Unlock,
      onClick: () => setActionTarget({ id: b.id, name: b.name, action: "unlock" }),
    });
  }

  return actions;
}
