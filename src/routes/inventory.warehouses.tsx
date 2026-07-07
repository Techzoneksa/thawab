import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  activateWarehouse,
  deactivateWarehouse,
  deleteWarehouse,
  WAREHOUSE_STATUSES,
  type Warehouse,
} from "@/lib/api/warehouses";

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formManager, setFormManager] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState("نشط");

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

  const createMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast("تم إضافة المستودع بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateWarehouse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseDetail"] });
      showToast("تم تحديث المستودع بنجاح", "success");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
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
    setEditing(null);
    setFormName("");
    setFormLocation("");
    setFormManager("");
    setFormCapacity("0");
    setFormNotes("");
    setFormStatus("نشط");
    setFormOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setFormName(w.name);
    setFormLocation(w.location || "");
    setFormManager(w.manager || "");
    setFormCapacity(String(w.capacity || 0));
    setFormNotes(w.notes || "");
    setFormStatus(w.status || "نشط");
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return showToast("يرجى إدخال اسم المستودع", "error");
    const payload = {
      name: formName,
      location: formLocation,
      manager: formManager,
      capacity: parseFloat(formCapacity) || 0,
      notes: formNotes,
      status: formStatus,
      userId: user?.id,
      userName: user?.name,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleToggle = (w: Warehouse) => {
    if (w.status === "نشط") {
      deactivateMutation.mutate({ id: w.id, userId: user?.id, userName: user?.name });
    } else {
      activateMutation.mutate({ id: w.id, userId: user?.id, userName: user?.name });
    }
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    active: items.filter((w) => w.status === "نشط").length,
    inactive: items.filter((w) => w.status === "موقوف").length,
    totalCapacity: items.reduce((s, w) => s + (w.capacity || 0), 0),
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "المستودعات"]}
      title="المستودعات"
      actions={
        <>
          <ExportButton
            data={items.map((w) => ({
              id: w.id,
              name: w.name,
              location: w.location,
              manager: w.manager,
              capacity: w.capacity,
              status: w.status,
              notes: w.notes,
            }))}
            filename="warehouses.csv"
          />
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
        <select
          className="rounded-lg border bg-background py-1.5 px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>الكل</option>
          {WAREHOUSE_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
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
                  onClick={() => setDetailId(w.id)}
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
                <Badge tone={statusTone(w.status)}>{w.status}</Badge>
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
                <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                <span className="text-xs text-muted-foreground">السعة: {fmtSAR(w.capacity)}</span>
              </div>
              <button
                onClick={() => setDetailId(w.id)}
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
                  {w.status === "نشط" ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل مستودع" : "إضافة مستودع جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم المستودع"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">الموقع</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="المدينة، الحي"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المسؤول</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formManager}
                onChange={(e) => setFormManager(e.target.value)}
                placeholder="اسم المسؤول"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">السعة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formCapacity}
              onChange={(e) => setFormCapacity(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              {WAREHOUSE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!detailId && !formOpen}
        onClose={() => setDetailId(null)}
        title={`تفاصيل المستودع: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={detailQuery.data.item.status} />
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
      label: w.status === "نشط" ? "تعطيل" : "تفعيل",
      icon: w.status === "نشط" ? ToggleLeft : ToggleRight,
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
