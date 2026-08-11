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
import {
  Warehouse as WarehouseIcon,
  Plus,
  Edit,
  Trash2,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  EntityFormDrawer,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getWarehouses,
  activateWarehouse,
  deactivateWarehouse,
  deleteWarehouse,
  type Warehouse,
} from "@/lib/api/warehouses";
import { WarehouseStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["warehouses", { search: searchQuery, status: statusFilter }],
    queryFn: () => getWarehouses({ search: searchQuery, status: statusFilter }),
  });

  const detailQuery = useQuery({
    queryKey: ["warehouseDetail", detailId],
    queryFn: async () =>
      detailId
        ? await fetch(`/api/inventory/warehouses?id=${detailId}`).then((r) => r.json())
        : null,
    enabled: !!detailId,
  });

  const activateMutation = useMutation({
    mutationFn: activateWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast("تم تفعيل المستودع", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast("تم تعطيل المستودع", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast("تم حذف المستودع", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    navigate({ to: "/inventory/warehouses/new" });
  };

  const openEdit = (w: Warehouse) => {
    navigate({ to: "/inventory/warehouses/$id/edit", params: { id: w.id } });
  };

  const handleToggle = (w: Warehouse) => {
    if (w.status === WarehouseStatus.ACTIVE) {
      deactivateMutation.mutate({ id: w.id, userId: user?.id, userName: user?.name });
    } else {
      activateMutation.mutate({ id: w.id, userId: user?.id, userName: user?.name });
    }
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    active: items.filter((w) => w.status === WarehouseStatus.ACTIVE).length,
    inactive: items.filter((w) => w.status === WarehouseStatus.INACTIVE).length,
    totalCapacity: items.reduce((s, w) => s + (w.capacity || 0), 0),
    total,
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter)
      filters.push({ label: "الحالة", value: label("warehouseStatus", statusFilter) });
    return {
      title: "المستودعات",
      date: today,
      filters,
      columns: [
        { key: "name", label: "الاسم" },
        { key: "location", label: "الموقع" },
        { key: "manager", label: "المسؤول" },
        { key: "status", label: "الحالة" },
      ],
      rows: items.map((w) => ({
        name: w.name,
        location: w.location || "—",
        manager: w.manager || "—",
        status: label("warehouseStatus", w.status),
      })),
      fileBase: `warehouses-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "المستودعات"]}
      title="المستودعات"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة مستودع
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي المستودعات</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">نشط</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.active)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">موقوف</div>
          <div className="text-base lg:text-xl font-extrabold text-muted-foreground tabular-nums">
            {fmtSAR(stats.inactive)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">السعة الإجمالية</div>
          <div className="text-base lg:text-xl font-extrabold text-primary tabular-nums">
            {fmtSAR(stats.totalCapacity)}
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
              {options("warehouseStatus").map((o) => (
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
      </div>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader title="المستودعات" count={`${total} مستودع`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب المستودعات"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["warehouses"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد مستودعات"
          description="ابدأ بإضافة أول مستودع لتخزين الأصناف"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مستودع
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الاسم", "الموقع", "المسؤول", "السعة", "الحالة", ""]}
          rows={items}
          renderRow={(w) => (
            <>
              <Td>
                <button
                  onClick={() =>
                    navigate({ to: "/inventory/warehouses/$id/edit", params: { id: w.id } })
                  }
                  className="font-semibold hover:text-primary text-right"
                >
                  <WarehouseIcon size={13} className="inline ms-1 text-primary" />
                  {w.name}
                </button>
              </Td>
              <Td className="text-muted-foreground">{w.location || "—"}</Td>
              <Td className="text-xs">{w.manager || "—"}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(w.capacity)}</Td>
              <Td>
                <Badge tone={statusTone(w.status)}>{label("warehouseStatus", w.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getWarehouseActions(
                    w,
                    setDetailId,
                    openEdit,
                    handleToggle,
                    setDeleteTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(w) => (
            <Card key={w.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(w.status)}>{label("warehouseStatus", w.status)}</Badge>
                <span className="text-xs text-muted-foreground">السعة: {fmtSAR(w.capacity)}</span>
              </div>
              <button
                onClick={() =>
                  navigate({ to: "/inventory/warehouses/$id/edit", params: { id: w.id } })
                }
                className="font-semibold text-right hover:text-primary"
              >
                {w.name}
              </button>
              <div className="text-xs text-muted-foreground mt-1">
                {w.location || "—"} · {w.manager || "بدون مسؤول"}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openEdit(w)}
                >
                  تعديل
                </button>
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => handleToggle(w)}
                >
                  {w.status === WarehouseStatus.ACTIVE ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`تفاصيل المستودع: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow
                label="الحالة"
                value={label("warehouseStatus", detailQuery.data.item.status)}
              />
              <DetailRow label="الموقع" value={detailQuery.data.item.location || "—"} />
              <DetailRow label="المسؤول" value={detailQuery.data.item.manager || "—"} />
              <DetailRow label="السعة" value={fmtSAR(detailQuery.data.item.capacity)} />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                إحصائيات المستودع
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatBox label="عدد الأصناف" value={fmtSAR(detailQuery.data.itemCount)} />
                <StatBox label="إجمالي الحركات" value={fmtSAR(detailQuery.data.movementCount)} />
                <StatBox label="إجمالي الكمية" value={fmtSAR(detailQuery.data.totalQty)} />
                <StatBox
                  label="نسبة الإشغال"
                  value={`${detailQuery.data.item.capacity > 0 ? Math.round((detailQuery.data.totalQty / detailQuery.data.item.capacity) * 100) : 0}%`}
                />
              </div>
            </Card>
            {detailQuery.data.item.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm">{detailQuery.data.item.notes}</div>
              </div>
            )}
          </div>
        )}
      </EntityFormDrawer>

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
            ? `هل تريد حذف المستودع "${deleteTarget.name}"؟ لا يمكن الحذف إذا كان يحتوي على أصناف أو حركات.`
            : ""
        }
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

function getWarehouseActions(
  w: Warehouse,
  setDetailId: (id: string) => void,
  openEdit: (w: Warehouse) => void,
  handleToggle: (w: Warehouse) => void,
  setDeleteTarget: (w: Warehouse) => void,
) {
  return [
    { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(w.id) },
    { label: "تعديل", icon: Edit, onClick: () => openEdit(w) },
    {
      label: w.status === WarehouseStatus.ACTIVE ? "تعطيل" : "تفعيل",
      icon: w.status === WarehouseStatus.ACTIVE ? ToggleLeft : ToggleRight,
      onClick: () => handleToggle(w),
    },
    {
      label: "حذف",
      icon: Trash2,
      variant: "destructive" as const,
      onClick: () => setDeleteTarget(w),
    },
  ];
}
