import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus, Edit, Trash2, Eye, Search, ChevronDown } from "lucide-react";
import { useState } from "react";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getFixedAssets, deleteFixedAsset, type FixedAsset } from "@/lib/api/assets";
import { AssetStatus as AssetStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "الأصول الثابتة — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "fixedAssets",
      { search: searchQuery, status: statusFilter, category: categoryFilter },
    ],
    queryFn: () =>
      getFixedAssets({ search: searchQuery, status: statusFilter, category: categoryFilter }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      showToast("تم حذف الأصل", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    navigate({ to: "/assets/new" });
  };

  const openEdit = (a: FixedAsset) => {
    if (a.status === AssetStatusEnum.DISPOSED) {
      showToast(`لا يمكن تعديل أصل في حالة ${label("assetStatus", a.status)}`, "error");
      return;
    }
    navigate({ to: "/assets/$id/edit", params: { id: a.id } });
  };

  const items = data?.items || [];
  const total = data?.total || 0;

  const stats = {
    active: items.filter((a) => a.status === AssetStatusEnum.ACTIVE).length,
    maintenance: items.filter((a) => a.status === AssetStatusEnum.UNDER_MAINTENANCE).length,
    disposed: items.filter((a) => a.status === AssetStatusEnum.DISPOSED).length,
    totalCost: items.reduce((s, a) => s + (a.cost || 0), 0),
    totalDepreciation: items.reduce((s, a) => s + (a.accumulatedDepreciation || 0), 0),
    totalBookValue: items.reduce(
      (s, a) => s + ((a.cost || 0) - (a.accumulatedDepreciation || 0)),
      0,
    ),
    total,
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter) filters.push({ label: "الحالة", value: label("assetStatus", statusFilter) });
    if (categoryFilter && categoryFilter !== "الكل")
      filters.push({ label: "الفئة", value: categoryFilter });
    return {
      title: "الأصول الثابتة",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "code", label: "الرمز" },
        { key: "name", label: "الاسم" },
        { key: "category", label: "الفئة" },
        { key: "cost", label: "التكلفة", type: "money" },
        { key: "accumulatedDepreciation", label: "الإهلاك المتراكم", type: "money" },
        { key: "status", label: "الحالة" },
        { key: "condition", label: "الحالة الفنية" },
      ],
      rows: items.map((a) => ({
        code: a.code || "—",
        name: a.name,
        category: a.category || "—",
        cost: a.cost,
        accumulatedDepreciation: a.accumulatedDepreciation,
        status: label("assetStatus", a.status),
        condition: a.condition ? label("assetCondition", a.condition) : "—",
      })),
      totals: [
        { label: "إجمالي التكلفة", value: stats.totalCost },
        { label: "إجمالي الإهلاك المتراكم", value: stats.totalDepreciation },
      ],
      fileBase: `fixed-assets-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الأصول"]}
      title="الأصول الثابتة"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة أصل
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الأصول</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">التكلفة الإجمالية</div>
          <div className="text-base lg:text-xl font-extrabold text-primary tabular-nums">
            {fmtSAR(stats.totalCost)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الإهلاك</div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtSAR(stats.totalDepreciation)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">القيمة الدفترية</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.totalBookValue)}
          </div>
        </Card>
      </div>

      <div className="lg:flex items-center gap-2 mb-3 hidden">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground whitespace-nowrap">الحالة:</span>
          <div className="relative">
            <select
              className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("assetStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
            />
          </div>
        </div>
        <select
          className="rounded-lg border bg-background py-1.5 px-3 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option>الكل</option>
          <option>أجهزة مكتبية</option>
          <option>أجهزة حاسب</option>
          <option>معدات</option>
          <option>سيارات</option>
          <option>أثاث</option>
          <option>مباني</option>
        </select>
      </div>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader title="الأصول الثابتة" count={`${total} أصل`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب الأصول"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["fixedAssets"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد أصول"
          description="ابدأ بإضافة أول أصل ثابت لمتابعة إهلاكه وصيانته"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة أصل
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الاسم", "الفئة", "التكلفة", "القيمة الدفترية", "الحالة", ""]}
          rows={items}
          renderRow={(a) => {
            const bookValue = (a.cost || 0) - (a.accumulatedDepreciation || 0);
            return (
              <>
                <Td>
                  <button
                    onClick={() => navigate({ to: "/assets/$id", params: { id: a.id } as any })}
                    className="font-semibold hover:text-primary text-right"
                  >
                    {a.name}
                  </button>
                  <div className="text-xs text-muted-foreground font-mono">{a.code || a.id}</div>
                </Td>
                <Td>{a.category ? <Badge tone="info">{a.category}</Badge> : "—"}</Td>
                <Td className="tabular-nums">{fmtSAR(a.cost)}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(bookValue)}</Td>
                <Td>
                  <Badge tone={statusTone(a.status)}>{label("assetStatus", a.status)}</Badge>
                </Td>
                <Td>
                  <ActionMenu actions={getAssetActions(a, navigate, openEdit, setDeleteTarget)} />
                </Td>
              </>
            );
          }}
          mobileCard={(a) => {
            const bookValue = (a.cost || 0) - (a.accumulatedDepreciation || 0);
            return (
              <Card key={a.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={statusTone(a.status)}>{label("assetStatus", a.status)}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{a.code || a.id}</span>
                </div>
                <button
                  onClick={() => navigate({ to: "/assets/$id", params: { id: a.id } as any })}
                  className="font-semibold text-right hover:text-primary"
                >
                  {a.name}
                </button>
                <div className="text-xs text-muted-foreground mt-1">
                  {a.location || "—"} · {a.responsiblePerson || "بدون مسؤول"}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">التكلفة</div>
                    <div className="font-bold tabular-nums">{fmtSAR(a.cost)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">القيمة الدفترية</div>
                    <div className="font-bold text-success tabular-nums">{fmtSAR(bookValue)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">الإهلاك المتراكم</div>
                    <div className="tabular-nums">{fmtSAR(a.accumulatedDepreciation)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">الحالة</div>
                    <div>{a.condition ? label("assetCondition", a.condition) : "—"}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                    onClick={() => navigate({ to: "/assets/$id", params: { id: a.id } as any })}
                  >
                    تفاصيل
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
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({
              id: deleteTarget.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="تأكيد الحذف"
        message={
          deleteTarget
            ? `هل تريد حذف الأصل "${deleteTarget.name}"؟ لا يمكن الحذف إذا كان مرتبطاً بحركات أو إهلاك.`
            : ""
        }
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}

function getAssetActions(
  a: FixedAsset,
  navigate: (opts: { to: string; params: { id: string } }) => void,
  openEdit: (a: FixedAsset) => void,
  setDeleteTarget: (a: FixedAsset) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    {
      label: "عرض التفاصيل",
      icon: Eye,
      onClick: () => navigate({ to: "/assets/$id", params: { id: a.id } }),
    },
  ];

  const readOnly = a.status === AssetStatusEnum.DISPOSED;

  if (!readOnly) {
    actions.push({ label: "تعديل", icon: Edit, onClick: () => openEdit(a) });
  }

  if (!readOnly && !a.accumulatedDepreciation) {
    actions.push({
      label: "حذف",
      icon: Trash2,
      variant: "destructive",
      onClick: () => setDeleteTarget(a),
    });
  }

  return actions;
}
