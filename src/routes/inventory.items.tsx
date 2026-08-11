import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  getInventoryItems,
  activateInventoryItem,
  deactivateInventoryItem,
  receiveInventoryItem,
  issueInventoryItem,
  adjustInventoryItem,
  transferInventoryItem,
  deleteInventoryItem,
  type InventoryItem,
} from "@/lib/api/inventory-items";
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { InventoryItemStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

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
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
    navigate({ to: "/inventory/items/new" });
  };

  const openEdit = (i: InventoryItem) => {
    navigate({ to: "/inventory/items/$id/edit", params: { id: i.id } });
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
    active: items.filter((i) => i.status === InventoryItemStatus.ACTIVE).length,
    lowStock: items.filter((i) => i.quantity <= i.minQuantity && i.quantity > 0).length,
    outOfStock: items.filter((i) => i.quantity === 0).length,
    totalValue: items.reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0),
  };

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (categoryFilter) filters.push({ label: "الفئة", value: categoryFilter });
    if (statusFilter)
      filters.push({ label: "الحالة", value: label("inventoryItemStatus", statusFilter) });
    return {
      title: "أصناف المخزون",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "name", label: "الصنف" },
        { key: "sku", label: "SKU" },
        { key: "unit", label: "الوحدة" },
        { key: "quantity", label: "الكمية", type: "number" },
        { key: "minQuantity", label: "الحد الأدنى", type: "number" },
        { key: "price", label: "السعر", type: "money" },
        { key: "status", label: "الحالة" },
      ],
      rows: items.map((i) => ({
        name: i.name,
        sku: i.sku || "—",
        unit: i.unit,
        quantity: i.quantity,
        minQuantity: i.minQuantity,
        price: i.price,
        status: label("inventoryItemStatus", i.status),
      })),
      totals: [{ label: "قيمة المخزون", value: stats.totalValue }],
      fileBase: `inventory-items-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الأصناف"]}
      title="إدارة الأصناف"
      actions={
        <>
          <DocumentActions document={buildDoc} />
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
          <option value="">الكل</option>
          <option>مساعدات</option>
          <option>مواد غذائية</option>
          <option>أجهزة</option>
          <option>قرطاسية</option>
          <option>معدات</option>
        </select>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground whitespace-nowrap">الحالة:</span>
          <div className="relative">
            <select
              className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("inventoryItemStatus").map((o) => (
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
                  onClick={() => navigate({ to: "/inventory/items/$id/edit", params: { id: i.id } })}
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
                <Badge tone={statusTone(i.status)}>
                  {label("inventoryItemStatus", i.status)}
                </Badge>
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
                <Badge tone={statusTone(i.status)}>
                  {label("inventoryItemStatus", i.status)}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{i.sku || i.id}</span>
              </div>
              <button
                onClick={() => navigate({ to: "/inventory/items/$id/edit", params: { id: i.id } })}
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
        open={!!detailId && !moveTarget}
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
              <DetailRow
                label="الحالة"
                value={label("inventoryItemStatus", detailQuery.data.item.status)}
              />
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
  if (s === InventoryItemStatus.ACTIVE) return "success";
  if (s === InventoryItemStatus.INACTIVE) return "destructive";
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

  if (i.status !== InventoryItemStatus.INACTIVE) {
    actions.push({ label: "استلام", icon: ShoppingCart, onClick: () => openMove(i, "receive") });
    actions.push({ label: "صرف", icon: ArrowRight, onClick: () => openMove(i, "issue") });
    actions.push({ label: "تسوية", icon: Package, onClick: () => openMove(i, "adjust") });
    actions.push({ label: "تحويل", icon: ArrowRight, onClick: () => openMove(i, "transfer") });
  }

  if (i.status === InventoryItemStatus.ACTIVE) {
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
