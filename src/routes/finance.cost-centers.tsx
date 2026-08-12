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
import { Plus, Search, Filter, Eye, Pencil, Trash2, Pause, Play } from "lucide-react";
import { useState } from "react";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";
import { useAuth } from "@/lib/api/auth";
import { label, options } from "@/lib/i18n/labels";
import { CostCenterStatus as CostCenterStatusEnum } from "@/lib/enums";
import {
  getCostCenters,
  deleteCostCenter,
  deactivateCostCenter,
  activateCostCenter,
  type CostCenter,
} from "@/lib/api/cost-centers";

export const Route = createFileRoute("/finance/cost-centers")({
  head: () => ({ meta: [{ title: "مراكز التكلفة — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    name: string;
    action: "deactivate" | "activate";
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cost-centers", { search: searchQuery, status: statusFilter }],
    queryFn: () => getCostCenters({ search: searchQuery, status: statusFilter }),
  });

  const costCenters = data?.items || [];
  const total = data?.total || 0;

  const openAdd = () => navigate({ to: "/finance/cost-centers/new" });
  const openEdit = (c: CostCenter) =>
    navigate({ to: "/finance/cost-centers/$id/edit", params: { id: c.id } });

  const deleteMutation = useMutation({
    mutationFn: deleteCostCenter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast("تم حذف مركز التكلفة بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "deactivate" | "activate";
      userId?: string;
      userName?: string;
    }) => {
      const fn = vars.action === "deactivate" ? deactivateCostCenter : activateCostCenter;
      return fn({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast(
        vars.action === "deactivate" ? "تم إيقاف مركز التكلفة" : "تم تفعيل مركز التكلفة",
        "success",
      );
      setStatusTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleStatusConfirm = () => {
    if (statusTarget) {
      statusMutation.mutate({
        id: statusTarget.id,
        action: statusTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter)
      filters.push({ label: "الحالة", value: label("costCenterStatus", statusFilter) });
    return {
      title: "مراكز التكلفة",
      date: today,
      filters,
      columns: [
        { key: "code", label: "الرمز", width: "16%" },
        { key: "name", label: "الاسم", width: "34%" },
        { key: "budget", label: "الموازنة", type: "money" },
        { key: "spent", label: "المصروف", type: "money" },
        { key: "status", label: "الحالة", width: "16%" },
      ],
      rows: costCenters.map((c: CostCenter) => ({
        code: c.code,
        name: c.name,
        budget: c.budget,
        spent: c.spent,
        status: label("costCenterStatus", c.status),
      })),
      fileBase: `cost-centers-${today}`,
    };
  };

  const stats = [
    { label: "إجمالي المراكز", value: fmtNum(total) },
    {
      label: "مراكز نشطة",
      value: costCenters.filter((c: CostCenter) => c.status === CostCenterStatusEnum.ACTIVE).length,
    },
    {
      label: "إجمالي الموازنات",
      value: fmtSAR(costCenters.reduce((s: number, c: CostCenter) => s + c.budget, 0)),
    },
    {
      label: "إجمالي المصروف",
      value: fmtSAR(costCenters.reduce((s: number, c: CostCenter) => s + c.spent, 0)),
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "مراكز التكلفة"]}
      title="مراكز التكلفة"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> مركز جديد
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
            placeholder="بحث بالرمز أو الاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...options("costCenterStatus").map((o) => o.label)]}
          value={statusFilter ? label("costCenterStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("costCenterStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
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
        title="مراكز التكلفة"
        count={`${fmtNum(total)} مركز`}
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
          description="حدث خطأ أثناء تحميل مراكز التكلفة"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["cost-centers"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : costCenters.length === 0 ? (
        <EmptyState
          title="لا توجد مراكز تكلفة"
          description="ابدأ بإضافة أول مركز"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مركز
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرمز", "الاسم", "المسؤول", "الموازنة", "المصروف", "الحالة", ""]}
          rows={costCenters}
          renderRow={(c: CostCenter) => {
            const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
            return (
              <>
                <Td className="font-mono text-xs">{c.code}</Td>
                <Td className="font-semibold">{c.name}</Td>
                <Td className="text-muted-foreground">{c.manager || "—"}</Td>
                <Td className="tabular-nums">{fmtSAR(c.budget)}</Td>
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
                  <Badge tone={statusTone(c.status)}>{label("costCenterStatus", c.status)}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={getCostCenterActions(c, setStatusTarget, openEdit, setDeleteTarget)}
                  />
                </Td>
              </>
            );
          }}
          mobileCard={(c: CostCenter) => {
            const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {c.code} · {c.manager || "—"}
                    </div>
                  </div>
                  <Badge tone={statusTone(c.status)}>{label("costCenterStatus", c.status)}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-bold">{pct}%</span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">الموازنة: {fmtSAR(c.budget)}</span>
                  <span className="font-bold">المصروف: {fmtSAR(c.spent)}</span>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-primary text-xs font-semibold"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    className="text-destructive text-xs font-semibold"
                  >
                    حذف
                  </button>
                </div>
              </Card>
            );
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف مركز التكلفة"
        message="لا يمكن حذف مركز تكلفة مستخدم في قيود أو موازنات. أوقف المركز بدلاً من ذلك."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleStatusConfirm}
        title={
          statusTarget
            ? statusTarget.action === "deactivate"
              ? "إيقاف مركز التكلفة"
              : "تفعيل مركز التكلفة"
            : ""
        }
        message={
          statusTarget
            ? `هل تريد ${statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل"} مركز التكلفة "${statusTarget.name}"؟`
            : ""
        }
        confirmText={statusTarget ? (statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل") : ""}
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
              {options("costCenterStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function getCostCenterActions(
  c: CostCenter,
  setStatusTarget: (t: { id: string; name: string; action: "deactivate" | "activate" }) => void,
  openEdit: (c: CostCenter) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    {
      label: "عرض التفاصيل",
      icon: Eye,
      onClick: () => showToast(`${c.code} - ${c.name}`, "info"),
    },
  ];
  actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(c) });
  if (c.status === CostCenterStatusEnum.ACTIVE) {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () =>
        setStatusTarget({ id: c.id, name: `${c.code} - ${c.name}`, action: "deactivate" }),
    });
  } else if (c.status === CostCenterStatusEnum.INACTIVE) {
    actions.push({
      label: "تفعيل",
      icon: Play,
      onClick: () =>
        setStatusTarget({ id: c.id, name: `${c.code} - ${c.name}`, action: "activate" }),
    });
  }
  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => setDeleteTarget(c.id),
    variant: "destructive",
  });
  return actions;
}
