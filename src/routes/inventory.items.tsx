import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import {
  Plus,
  AlertTriangle,
  Edit,
  Trash2,
  ShoppingCart,
  ArrowRight,
  Eye,
  Search,
  ToggleLeft,
  ToggleRight,
  Package,
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
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  activateInventoryItem,
  deactivateInventoryItem,
  receiveInventoryItem,
  issueInventoryItem,
  adjustInventoryItem,
  transferInventoryItem,
  deleteInventoryItem,
  ITEM_STATUSES,
  type InventoryItem,
} from "@/lib/api/inventory-items";
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";

export const Route = createFileRoute("/inventory/items")({
  head: () => ({ meta: [{ title: "الأصناف — ثواب" }] }),
  component: Page,
});

interface MoveDraft {
  type: "receive" | "issue" | "adjust" | "transfer";
  quantity: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<InventoryItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveDraft>({
    type: "receive",
    quantity: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    notes: "",
  });

  const [formName, setFormName] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formUnit, setFormUnit] = useState("قطعة");
  const [formCategory, setFormCategory] = useState("");
  const [formWarehouseId, setFormWarehouseId] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formMin, setFormMin] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState("نشط");

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "inventoryItems",
      { search: searchQuery, category: categoryFilter, status: statusFilter },
    ],
    queryFn: () =>
      getInventoryItems({ search: searchQuery, category: categoryFilter, status: statusFilter }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses-all"],
    queryFn: () => getWarehouses({}),
  });

  const detailQuery = useQuery({
    queryKey: ["inventoryItemDetail", detailId],
    queryFn: async () =>
      detailId ? await fetch(`/api/inventory/items?id=${detailId}`).then((r) => r.json()) : null,
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: createInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم إضافة الصنف بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
      showToast("تم تحديث الصنف بنجاح", "success");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const activateMutation = useMutation({
    mutationFn: activateInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم تفعيل الصنف", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم تعطيل الصنف", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const receiveMutation = useMutation({
    mutationFn: receiveInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
      showToast("تم استلام الصنف وتحديث المخزون", "success");
      setMoveTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const issueMutation = useMutation({
    mutationFn: issueInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
      showToast("تم صرف الصنف وتحديث المخزون", "success");
      setMoveTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const adjustMutation = useMutation({
    mutationFn: adjustInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
      showToast("تم تسوية الصنف", "success");
      setMoveTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const transferMutation = useMutation({
    mutationFn: transferInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
      showToast("تم تحويل الصنف بين المستودعات", "success");
      setMoveTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم حذف الصنف", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setEditing(null);
    setFormName("");
    setFormSku("");
    setFormUnit("قطعة");
    setFormCategory("");
    setFormWarehouseId("");
    setFormQty("0");
    setFormMin("0");
    setFormPrice("0");
    setFormNotes("");
    setFormStatus("نشط");
    setFormOpen(true);
  };

  const openEdit = (i: InventoryItem) => {
    setEditing(i);
    setFormName(i.name);
    setFormSku(i.sku || "");
    setFormUnit(i.unit);
    setFormCategory(i.category || "");
    setFormWarehouseId(i.warehouseId || "");
    setFormMin(String(i.minQuantity || 0));
    setFormPrice(String(i.price || 0));
    setFormNotes(i.notes || "");
    setFormStatus(i.status || "نشط");
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return showToast("يرجى إدخال اسم الصنف", "error");
    if (!formUnit.trim()) return showToast("يرجى إدخال الوحدة", "error");
    const payload = {
      name: formName,
      sku: formSku,
      unit: formUnit,
      category: formCategory,
      warehouseId: formWarehouseId || undefined,
      minQuantity: parseFloat(formMin) || 0,
      price: parseFloat(formPrice) || 0,
      notes: formNotes,
      status: formStatus,
      userId: user?.id,
      userName: user?.name,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate({
        ...payload,
        quantity: parseFloat(formQty) || 0,
      });
    }
  };

  const openMove = (i: InventoryItem, type: MoveDraft["type"]) => {
    setMoveTarget(i);
    setMoveDraft({
      type,
      quantity: "",
      fromWarehouseId: i.warehouseId || "",
      toWarehouseId: "",
      notes: "",
    });
  };

  const handleMove = () => {
    if (!moveTarget) return;
    const qty = parseFloat(moveDraft.quantity) || 0;
    if (qty <= 0) return showToast("يرجى إدخال كمية صحيحة", "error");

    const base = {
      id: moveTarget.id,
      quantity: qty,
      notes: moveDraft.notes,
      userId: user?.id,
      userName: user?.name,
    };

    if (moveDraft.type === "receive") {
      receiveMutation.mutate({ ...base, warehouseId: moveTarget.warehouseId || undefined });
    } else if (moveDraft.type === "issue") {
      issueMutation.mutate({ ...base, warehouseId: moveTarget.warehouseId || undefined });
    } else if (moveDraft.type === "adjust") {
      adjustMutation.mutate({ ...base, warehouseId: moveTarget.warehouseId || undefined });
    } else if (moveDraft.type === "transfer") {
      if (!moveDraft.fromWarehouseId || !moveDraft.toWarehouseId) {
        return showToast("يرجى تحديد المستودع المصدر والهدف", "error");
      }
      transferMutation.mutate({
        ...base,
        fromWarehouseId: moveDraft.fromWarehouseId,
        toWarehouseId: moveDraft.toWarehouseId,
      });
    }
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const warehouses = warehousesData?.items || [];

  const stats = {
    total: items.length,
    active: items.filter((i) => i.status === "نشط").length,
    lowStock: items.filter((i) => i.quantity <= i.minQuantity && i.quantity > 0).length,
    outOfStock: items.filter((i) => i.quantity === 0).length,
    totalValue: items.reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0),
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الأصناف"]}
      title="إدارة الأصناف"
      actions={
        <>
          <ExportButton
            data={items.map((i) => ({
              id: i.id,
              name: i.name,
              sku: i.sku,
              unit: i.unit,
              category: i.category,
              warehouseId: i.warehouseId || "",
              quantity: i.quantity,
              minQuantity: i.minQuantity,
              price: i.price,
              status: i.status,
            }))}
            filename="inventory-items.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة صنف
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الأصناف</div>
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
          <div className="text-xs text-muted-foreground mb-1">منخفض / نفد</div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtSAR(stats.lowStock + stats.outOfStock)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">قيمة المخزون</div>
          <div className="text-base lg:text-xl font-extrabold text-primary tabular-nums">
            {fmtSAR(stats.totalValue)}
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
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option>الكل</option>
          <option>مساعدات</option>
          <option>مواد غذائية</option>
          <option>أجهزة</option>
          <option>قرطاسية</option>
          <option>معدات</option>
        </select>
        <select
          className="rounded-lg border bg-background py-1.5 px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>الكل</option>
          {ITEM_STATUSES.map((s) => (
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

      <MobilePageHeader title="إدارة الأصناف" count={`${total} صنف`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب الأصناف"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["inventoryItems"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد أصناف"
          description="ابدأ بإضافة أول صنف للمخزون"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة صنف
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["SKU", "الصنف", "الفئة", "الكمية", "السعر", "الحالة", ""]}
          rows={items}
          renderRow={(i) => (
            <>
              <Td className="font-mono text-xs">{i.sku || i.id}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(i.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {i.name}
                </button>
                <div className="text-xs text-muted-foreground">
                  {warehouses.find((w) => w.id === i.warehouseId)?.name || "بدون مستودع"}
                </div>
              </Td>
              <Td>{i.category ? <Badge tone="info">{i.category}</Badge> : "—"}</Td>
              <Td className="tabular-nums font-bold">
                <span className={stockTone(i.quantity, i.minQuantity)}>
                  {fmtSAR(i.quantity)} {i.unit}
                </span>
                {i.quantity <= i.minQuantity && i.quantity > 0 && (
                  <AlertTriangle size={11} className="inline ms-1 text-warning" />
                )}
                {i.quantity === 0 && (
                  <AlertTriangle size={11} className="inline ms-1 text-destructive" />
                )}
              </Td>
              <Td className="tabular-nums">{fmtSAR(i.price)}</Td>
              <Td>
                <Badge tone={statusTone(i.status)}>{i.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getItemActions(
                    i,
                    setDetailId,
                    openEdit,
                    openMove,
                    activateMutation,
                    deactivateMutation,
                    setDeleteTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(i) => (
            <Card key={i.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{i.sku || i.id}</span>
              </div>
              <button
                onClick={() => setDetailId(i.id)}
                className="font-semibold text-right hover:text-primary"
              >
                {i.name}
              </button>
              <div className="text-xs text-muted-foreground mt-1">
                {warehouses.find((w) => w.id === i.warehouseId)?.name || "بدون مستودع"}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`tabular-nums font-bold ${stockTone(i.quantity, i.minQuantity)}`}>
                  {fmtSAR(i.quantity)} {i.unit}
                </span>
                <span className="text-xs text-muted-foreground">
                  الحد الأدنى: {fmtSAR(i.minQuantity)}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openMove(i, "receive")}
                >
                  استلام
                </button>
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openMove(i, "issue")}
                >
                  صرف
                </button>
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openEdit(i)}
                >
                  تعديل
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
        title={editing ? "تعديل صنف" : "إضافة صنف جديد"}
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
              placeholder="اسم الصنف"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">SKU</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formSku}
                onChange={(e) => setFormSku(e.target.value)}
                placeholder="مثال: FOOD-001"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">الوحدة *</label>
              <select
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
              >
                <option>قطعة</option>
                <option>كرتون</option>
                <option>كيلو</option>
                <option>لتر</option>
                <option>متر</option>
                <option>صندوق</option>
                <option>عبوة</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="مثال: مساعدات"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المستودع</label>
              <select
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formWarehouseId}
                onChange={(e) => setFormWarehouseId(e.target.value)}
              >
                <option value="">— بدون مستودع —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  الرصيد الافتتاحي
                </label>
                <input
                  className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                  type="number"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">السعر</label>
                <input
                  className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          {editing && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">السعر</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                type="number"
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحد الأدنى</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formMin}
              onChange={(e) => setFormMin(e.target.value)}
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
              {ITEM_STATUSES.map((s) => (
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
        open={!!detailId && !formOpen && !moveTarget}
        onClose={() => setDetailId(null)}
        title={`تفاصيل الصنف: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="SKU" value={detailQuery.data.item.sku || "—"} />
              <DetailRow label="الفئة" value={detailQuery.data.item.category || "—"} />
              <DetailRow label="الوحدة" value={detailQuery.data.item.unit} />
              <DetailRow label="الحالة" value={detailQuery.data.item.status} />
              <DetailRow
                label="الكمية"
                value={`${fmtSAR(detailQuery.data.item.quantity)} ${detailQuery.data.item.unit}`}
              />
              <DetailRow
                label="الحد الأدنى"
                value={`${fmtSAR(detailQuery.data.item.minQuantity)} ${detailQuery.data.item.unit}`}
              />
              <DetailRow label="السعر" value={fmtSAR(detailQuery.data.item.price)} />
              <DetailRow
                label="المستودع"
                value={
                  warehouses.find((w) => w.id === detailQuery.data.item.warehouseId)?.name || "—"
                }
              />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-1">ارتباطات الصنف</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-muted-foreground">حركات المخزون</div>
                  <div className="font-bold text-base">
                    {fmtSAR(detailQuery.data.movementCount)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">سطور أوامر شراء</div>
                  <div className="font-bold text-base">{fmtSAR(detailQuery.data.poLineCount)}</div>
                </div>
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

      <EntityFormDrawer
        open={!!moveTarget && !detailId}
        onClose={() => setMoveTarget(null)}
        title={`${moveTarget?.name || ""} — حركة مخزون`}
        onSave={handleMove}
        loading={
          receiveMutation.isPending ||
          issueMutation.isPending ||
          adjustMutation.isPending ||
          transferMutation.isPending
        }
      >
        {moveTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {(["receive", "issue", "adjust", "transfer"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-lg border p-2 text-xs font-bold transition-colors ${
                    moveDraft.type === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                  onClick={() => setMoveDraft({ ...moveDraft, type: t })}
                >
                  {t === "receive"
                    ? "استلام"
                    : t === "issue"
                      ? "صرف"
                      : t === "adjust"
                        ? "تسوية"
                        : "تحويل"}
                </button>
              ))}
            </div>
            <Card className="p-3 bg-info/10 text-sm">
              <div className="font-bold text-info mb-1">
                {moveDraft.type === "receive"
                  ? "📥 استلام"
                  : moveDraft.type === "issue"
                    ? "📤 صرف"
                    : moveDraft.type === "adjust"
                      ? "⚖ تسوية"
                      : "🔄 تحويل"}
              </div>
              <div className="text-xs">
                الرصيد الحالي: {fmtSAR(moveTarget.quantity)} {moveTarget.unit}
                {moveDraft.type === "issue" && moveTarget.quantity === 0 && (
                  <div className="text-destructive font-bold mt-1">
                    ⚠ لا يمكن الصرف — الرصيد صفر
                  </div>
                )}
              </div>
            </Card>
            {moveDraft.type === "transfer" ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    من المستودع *
                  </label>
                  <select
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={moveDraft.fromWarehouseId}
                    onChange={(e) =>
                      setMoveDraft({ ...moveDraft, fromWarehouseId: e.target.value })
                    }
                  >
                    <option value="">— اختر —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    إلى المستودع *
                  </label>
                  <select
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={moveDraft.toWarehouseId}
                    onChange={(e) => setMoveDraft({ ...moveDraft, toWarehouseId: e.target.value })}
                  >
                    <option value="">— اختر —</option>
                    {warehouses
                      .filter((w) => w.id !== moveDraft.fromWarehouseId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {moveDraft.type === "adjust" ? "الرصيد الجديد *" : "الكمية *"}
              </label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={moveDraft.quantity}
                onChange={(e) => setMoveDraft({ ...moveDraft, quantity: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={moveDraft.notes}
                onChange={(e) => setMoveDraft({ ...moveDraft, notes: e.target.value })}
              />
            </div>
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
            ? `هل تريد حذف الصنف "${deleteTarget.name}"؟ لا يمكن الحذف إذا كان مرتبطاً بحركات أو أوامر شراء.`
            : ""
        }
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}

function stockTone(qty: number, min: number): string {
  if (qty === 0) return "text-destructive";
  if (qty <= min) return "text-warning";
  return "";
}

function statusTone(s: string): "success" | "muted" | "destructive" | "warning" {
  if (s === "نشط") return "success";
  if (s === "مغلق") return "destructive";
  return "muted";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function getItemActions(
  i: InventoryItem,
  setDetailId: (id: string) => void,
  openEdit: (i: InventoryItem) => void,
  openMove: (i: InventoryItem, type: "receive" | "issue" | "adjust" | "transfer") => void,
  activateMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  deactivateMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  setDeleteTarget: (i: InventoryItem) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(i.id) },
    { label: "تعديل", icon: Edit, onClick: () => openEdit(i) },
  ];

  if (i.status !== "مغلق") {
    actions.push({ label: "استلام", icon: ShoppingCart, onClick: () => openMove(i, "receive") });
    actions.push({ label: "صرف", icon: ArrowRight, onClick: () => openMove(i, "issue") });
    actions.push({ label: "تسوية", icon: Package, onClick: () => openMove(i, "adjust") });
    actions.push({ label: "تحويل", icon: ArrowRight, onClick: () => openMove(i, "transfer") });
  }

  if (i.status === "نشط") {
    actions.push({
      label: "تعطيل",
      icon: ToggleLeft,
      onClick: () => deactivateMutation.mutate({ id: i.id }),
    });
  } else {
    actions.push({
      label: "تفعيل",
      icon: ToggleRight,
      onClick: () => activateMutation.mutate({ id: i.id }),
    });
  }

  actions.push({
    label: "حذف",
    icon: Trash2,
    variant: "destructive",
    onClick: () => setDeleteTarget(i),
  });

  return actions;
}
