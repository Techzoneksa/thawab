import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  FilterBar,
  Select,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtNum } from "@/data/sample";
import {
  Plus,
  Search,
  Filter,
  Lock,
  Unlock,
  Trash2,
  Eye,
  Calendar,
  GitBranch,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";
import { useAuth } from "@/lib/api/auth";
import { label, options } from "@/lib/i18n/labels";
import { FiscalPeriodStatus } from "@/lib/enums";
import { getPeriods, deletePeriod, type FiscalPeriod } from "@/lib/api/periods";

export const Route = createFileRoute("/finance/closing")({
  head: () => ({ meta: [{ title: "الإقفال المالي — ثواب" }] }),
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["periods", { search: searchQuery, status: statusFilter }],
    queryFn: () => getPeriods({ search: searchQuery, status: statusFilter }),
  });

  const periods = data?.items || [];
  const total = data?.total || 0;

  const deleteMutation = useMutation({
    mutationFn: deletePeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم حذف الفترة المالية بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/finance/closing/new" });
  const openEdit = (p: FiscalPeriod) =>
    navigate({ to: "/finance/closing/$id/edit", params: { id: p.id } });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter)
      filters.push({ label: "الحالة", value: label("fiscalPeriodStatus", statusFilter) });
    return {
      title: "الفترات المالية",
      date: today,
      filters,
      columns: [
        { key: "name", label: "الفترة", width: "40%" },
        { key: "startDate", label: "تاريخ البداية", type: "date" },
        { key: "endDate", label: "تاريخ النهاية", type: "date" },
        { key: "status", label: "الحالة", width: "20%" },
      ],
      rows: periods.map((p: FiscalPeriod) => ({
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        status: label("fiscalPeriodStatus", p.status),
      })),
      fileBase: `fiscal-periods-${today}`,
    };
  };

  const stats = {
    open: periods.filter((p: FiscalPeriod) => p.status === FiscalPeriodStatus.OPEN).length,
    closed: periods.filter((p: FiscalPeriod) => p.status === FiscalPeriodStatus.CLOSED).length,
    reopened: periods.filter((p: FiscalPeriod) => !!p.reopenedAt).length,
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الإقفال المالي"]}
      title="الإقفال المالي للفترات"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> فترة جديدة
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <GitBranch size={13} /> إجمالي الفترات
          </div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtNum(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar size={13} /> مفتوحة
          </div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtNum(stats.open)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Lock size={13} /> مقفلة
          </div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtNum(stats.closed)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Unlock size={13} /> معاد فتحتها
          </div>
          <div className="text-base lg:text-xl font-extrabold text-info tabular-nums">
            {fmtNum(stats.reopened)}
          </div>
        </Card>
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...options("fiscalPeriodStatus").map((o) => o.label)]}
          value={statusFilter ? label("fiscalPeriodStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("fiscalPeriodStatus").find((o) => o.label === v)?.value ?? ""),
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
        title="الفترات المالية"
        count={`${fmtNum(total)} فترة`}
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
          description="حدث خطأ أثناء جلب الفترات المالية"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["periods"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : periods.length === 0 ? (
        <EmptyState
          title="لا توجد فترات مالية"
          description="ابدأ بإضافة أول فترة مالية (شهرية أو ربع سنوية أو سنوية)"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة فترة
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الفترة", "البداية", "النهاية", "الحالة", "أُقفلت بواسطة", ""]}
          rows={periods}
          renderRow={(p: FiscalPeriod) => (
            <>
              <Td>
                <button
                  onClick={() => openEdit(p)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {p.name}
                </button>
                {p.notes && (
                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {p.notes}
                  </div>
                )}
              </Td>
              <Td className="font-mono text-xs">{p.startDate}</Td>
              <Td className="font-mono text-xs">{p.endDate}</Td>
              <Td>
                <Badge tone={statusTone(p.status)}>{label("fiscalPeriodStatus", p.status)}</Badge>
              </Td>
              <Td className="text-xs">
                {p.closedByName ? (
                  <div>
                    <div className="font-semibold">{p.closedByName}</div>
                    <div className="text-muted-foreground">{p.closedAt}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
              <Td>
                <ActionMenu actions={getPeriodActions(p, openEdit, setDeleteTarget)} />
              </Td>
            </>
          )}
          mobileCard={(p: FiscalPeriod) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  onClick={() => openEdit(p)}
                  className="text-sm font-bold hover:text-primary text-right"
                >
                  {p.name}
                </button>
                <Badge tone={statusTone(p.status)}>{label("fiscalPeriodStatus", p.status)}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <span>
                  <Calendar size={11} className="inline ml-1" />
                  {p.startDate}
                </span>
                <span>→</span>
                <span>{p.endDate}</span>
              </div>
              {p.closedByName && (
                <div className="text-xs text-muted-foreground">
                  أُقفلت بواسطة: {p.closedByName} · {p.closedAt}
                </div>
              )}
            </Card>
          )}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الفترة المالية"
        message="سيتم حذف الفترة المالية نهائياً. لا يمكن حذف الفترات المقفلة."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
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
              {options("fiscalPeriodStatus").map((o) => (
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

function getPeriodActions(
  p: FiscalPeriod,
  openEdit: (p: FiscalPeriod) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    {
      label: p.status === FiscalPeriodStatus.OPEN ? "عرض / تعديل" : "عرض التفاصيل",
      icon: p.status === FiscalPeriodStatus.OPEN ? Pencil : Eye,
      onClick: () => openEdit(p),
    },
  ];

  if (p.status === FiscalPeriodStatus.OPEN) {
    actions.push({
      label: "حذف",
      icon: Trash2,
      onClick: () => setDeleteTarget(p.id),
      variant: "destructive",
    });
  }

  return actions;
}
