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
  Plus,
  Edit,
  Trash2,
  Eye,
  Wrench,
  ArrowRight,
  XCircle,
  TrendingDown,
  Search,
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
  getFixedAssets,
  transferFixedAsset,
  maintainFixedAsset,
  returnFromMaintenance,
  depreciateFixedAsset,
  disposeFixedAsset,
  sellFixedAsset,
  deleteFixedAsset,
  type FixedAsset,
} from "@/lib/api/assets";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { AssetStatus as AssetStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "الأصول الثابتة — ثواب" }] }),
  component: Page,
});

interface DepreciationDraft {
  amount: string;
  date: string;
  notes: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    asset: FixedAsset;
    action: "depreciate" | "transfer" | "maintain" | "returnMaintenance" | "dispose" | "sell";
  } | null>(null);

  const [depDraft, setDepDraft] = useState<DepreciationDraft>({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [transferDraft, setTransferDraft] = useState({
    toLocation: "",
    toResponsible: "",
    reason: "",
    notes: "",
  });
  const [maintainDraft, setMaintainDraft] = useState({
    cost: "",
    reason: "",
    notes: "",
  });
  const [sellDraft, setSellDraft] = useState({
    salePrice: "",
    buyer: "",
    notes: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "fixedAssets",
      { search: searchQuery, status: statusFilter, category: categoryFilter },
    ],
    queryFn: () =>
      getFixedAssets({ search: searchQuery, status: statusFilter, category: categoryFilter }),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => getSuppliers({}),
  });

  const detailQuery = useQuery({
    queryKey: ["fixedAssetDetail", detailId],
    queryFn: async () =>
      detailId ? await fetch(`/api/assets?id=${detailId}`).then((r) => r.json()) : null,
    enabled: !!detailId,
  });

  const transferMutation = useMutation({
    mutationFn: transferFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم نقل الأصل بنجاح", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const maintainMutation = useMutation({
    mutationFn: maintainFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم تسجيل الصيانة", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const returnMaintenanceMutation = useMutation({
    mutationFn: returnFromMaintenance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم إنهاء الصيانة وإعادة الأصل للعمل", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const depreciateMutation = useMutation({
    mutationFn: depreciateFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم تسجيل الإهلاك بنجاح", "success");
      setActionTarget(null);
      setDepDraft({ amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const disposeMutation = useMutation({
    mutationFn: disposeFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم استبعاد الأصل", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const sellMutation = useMutation({
    mutationFn: sellFixedAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail"] });
      showToast("تم تسجيل بيع الأصل", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
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
  const suppliers = suppliersData?.items || [];

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
                    onClick={() => navigate({ to: "/assets/$id/edit", params: { id: a.id } })}
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
                  <ActionMenu
                    actions={getAssetActions(
                      a,
                      navigate,
                      openEdit,
                      setActionTarget,
                      setDeleteTarget,
                    )}
                  />
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
                  onClick={() => navigate({ to: "/assets/$id/edit", params: { id: a.id } })}
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
                    onClick={() => navigate({ to: "/assets/$id/edit", params: { id: a.id } })}
                  >
                    تفاصيل
                  </button>
                  {a.status === AssetStatusEnum.ACTIVE && (
                    <button
                      className="flex-1 rounded-lg bg-warning/15 text-warning text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => setActionTarget({ asset: a, action: "depreciate" })}
                    >
                      إهلاك
                    </button>
                  )}
                </div>
              </Card>
            );
          }}
        />
      )}

      <EntityFormDrawer
        open={!!detailId && !actionTarget}
        onClose={() => setDetailId(null)}
        title={`تفاصيل الأصل: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الرمز" value={detailQuery.data.item.code || "—"} />
              <DetailRow label="الفئة" value={detailQuery.data.item.category || "—"} />
              <DetailRow label="الحالة" value={label("assetStatus", detailQuery.data.item.status)} />
              <DetailRow
                label="الحالة الفنية"
                value={
                  detailQuery.data.item.condition
                    ? label("assetCondition", detailQuery.data.item.condition)
                    : "—"
                }
              />
              <DetailRow label="الموقع" value={detailQuery.data.item.location || "—"} />
              <DetailRow label="المسؤول" value={detailQuery.data.item.responsiblePerson || "—"} />
              <DetailRow label="التكلفة" value={fmtSAR(detailQuery.data.item.cost)} />
              <DetailRow
                label="الإهلاك المتراكم"
                value={fmtSAR(detailQuery.data.item.accumulatedDepreciation)}
              />
              <DetailRow label="القيمة الدفترية" value={fmtSAR(detailQuery.data.bookValue)} />
              <DetailRow
                label="العمر الإنتاجي"
                value={`${detailQuery.data.item.usefulLifeMonths} شهر`}
              />
              <DetailRow
                label="القيمة المتبقية"
                value={fmtSAR(detailQuery.data.item.salvageValue)}
              />
              <DetailRow
                label="طريقة الإهلاك"
                value={label("depreciationMethod", detailQuery.data.item.depreciationMethod)}
              />
              <DetailRow label="تاريخ الشراء" value={detailQuery.data.item.purchaseDate || "—"} />
              <DetailRow
                label="المورد"
                value={
                  suppliers.find((s) => s.id === detailQuery.data.item.supplierId)?.name || "—"
                }
              />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-1">سجل الأصل</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-muted-foreground">قيود الإهلاك</div>
                  <div className="font-bold text-base">
                    {fmtSAR(detailQuery.data.depreciationCount)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">حركات/تحويلات</div>
                  <div className="font-bold text-base">
                    {fmtSAR(detailQuery.data.movementCount)}
                  </div>
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
        open={!!actionTarget && actionTarget.action === "depreciate"}
        onClose={() => setActionTarget(null)}
        title={`إهلاك الأصل: ${actionTarget?.asset.name || ""}`}
        onSave={() => {
          if (actionTarget) {
            const amt = parseFloat(depDraft.amount) || 0;
            if (amt <= 0) return showToast("يرجى إدخال مبلغ إهلاك صحيح", "error");
            depreciateMutation.mutate({
              id: actionTarget.asset.id,
              amount: amt,
              date: depDraft.date,
              notes: depDraft.notes,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        loading={depreciateMutation.isPending}
        saveText="تأكيد الإهلاك"
      >
        {actionTarget && (
          <div className="space-y-3">
            <Card className="p-3 bg-warning/10">
              <div className="text-xs font-bold text-warning mb-1">معلومات الإهلاك</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  التكلفة: <b>{fmtSAR(actionTarget.asset.cost)}</b>
                </div>
                <div>
                  الإهلاك المتراكم: <b>{fmtSAR(actionTarget.asset.accumulatedDepreciation)}</b>
                </div>
                <div>
                  القيمة الدفترية:{" "}
                  <b className="text-success">
                    {fmtSAR(actionTarget.asset.cost - actionTarget.asset.accumulatedDepreciation)}
                  </b>
                </div>
                <div>
                  القيمة المتبقية: <b>{fmtSAR(actionTarget.asset.salvageValue)}</b>
                </div>
                <div className="col-span-2">
                  الحد الأقصى للإهلاك المتبقي:{" "}
                  <b>
                    {fmtSAR(
                      actionTarget.asset.cost -
                        actionTarget.asset.accumulatedDepreciation -
                        (actionTarget.asset.salvageValue || 0),
                    )}
                  </b>
                </div>
              </div>
            </Card>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">مبلغ الإهلاك *</label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={depDraft.amount}
                onChange={(e) => setDepDraft({ ...depDraft, amount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ الإهلاك</label>
              <input
                type="date"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={depDraft.date}
                onChange={(e) => setDepDraft({ ...depDraft, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={depDraft.notes}
                onChange={(e) => setDepDraft({ ...depDraft, notes: e.target.value })}
              />
            </div>
          </div>
        )}
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!actionTarget && actionTarget.action === "transfer"}
        onClose={() => setActionTarget(null)}
        title={`نقل الأصل: ${actionTarget?.asset.name || ""}`}
        onSave={() => {
          if (actionTarget) {
            transferMutation.mutate({
              id: actionTarget.asset.id,
              toLocation: transferDraft.toLocation,
              toResponsible: transferDraft.toResponsible,
              reason: transferDraft.reason,
              notes: transferDraft.notes,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        loading={transferMutation.isPending}
        saveText="تأكيد النقل"
      >
        {actionTarget && (
          <div className="space-y-3">
            <Card className="p-3 bg-info/10 text-xs">
              <div className="font-bold text-info mb-1">الموقع الحالي</div>
              <div>الموقع: {actionTarget.asset.location || "—"}</div>
              <div>المسؤول: {actionTarget.asset.responsiblePerson || "—"}</div>
            </Card>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">الموقع الجديد</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={transferDraft.toLocation}
                onChange={(e) => setTransferDraft({ ...transferDraft, toLocation: e.target.value })}
                placeholder="الموقع الجديد"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المسؤول الجديد</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={transferDraft.toResponsible}
                onChange={(e) =>
                  setTransferDraft({ ...transferDraft, toResponsible: e.target.value })
                }
                placeholder="اسم المسؤول الجديد"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">سبب النقل</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={transferDraft.reason}
                onChange={(e) => setTransferDraft({ ...transferDraft, reason: e.target.value })}
                placeholder="سبب النقل"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={transferDraft.notes}
                onChange={(e) => setTransferDraft({ ...transferDraft, notes: e.target.value })}
              />
            </div>
          </div>
        )}
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!actionTarget && actionTarget.action === "maintain"}
        onClose={() => setActionTarget(null)}
        title={`صيانة الأصل: ${actionTarget?.asset.name || ""}`}
        onSave={() => {
          if (actionTarget) {
            maintainMutation.mutate({
              id: actionTarget.asset.id,
              cost: parseFloat(maintainDraft.cost) || 0,
              reason: maintainDraft.reason,
              notes: maintainDraft.notes,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        loading={maintainMutation.isPending}
        saveText="تسجيل الصيانة"
      >
        {actionTarget && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تكلفة الصيانة</label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={maintainDraft.cost}
                onChange={(e) => setMaintainDraft({ ...maintainDraft, cost: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">سبب/وصف الصيانة</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={maintainDraft.reason}
                onChange={(e) => setMaintainDraft({ ...maintainDraft, reason: e.target.value })}
                placeholder="مثال: صيانة دورية، إصلاح عطل..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={maintainDraft.notes}
                onChange={(e) => setMaintainDraft({ ...maintainDraft, notes: e.target.value })}
              />
            </div>
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "returnMaintenance"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            returnMaintenanceMutation.mutate({
              id: actionTarget.asset.id,
              condition: detailQuery.data?.item?.condition,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="إنهاء الصيانة"
        message={`هل تريد إعادة الأصل "${actionTarget?.asset.name}" للعمل بعد الصيانة؟`}
        confirmText="إعادة للعمل"
        cancelText="إلغاء"
      />

      <EntityFormDrawer
        open={!!actionTarget && actionTarget.action === "sell"}
        onClose={() => setActionTarget(null)}
        title={`بيع الأصل: ${actionTarget?.asset.name || ""}`}
        onSave={() => {
          if (actionTarget) {
            sellMutation.mutate({
              id: actionTarget.asset.id,
              salePrice: parseFloat(sellDraft.salePrice) || 0,
              buyer: sellDraft.buyer,
              notes: sellDraft.notes,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        loading={sellMutation.isPending}
        saveText="تأكيد البيع"
      >
        {actionTarget && (
          <div className="space-y-3">
            <Card className="p-3 bg-warning/10 text-xs">
              <div>
                القيمة الدفترية الحالية:{" "}
                <b>
                  {fmtSAR(actionTarget.asset.cost - actionTarget.asset.accumulatedDepreciation)}
                </b>
              </div>
            </Card>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">سعر البيع</label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={sellDraft.salePrice}
                onChange={(e) => setSellDraft({ ...sellDraft, salePrice: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المشتري</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={sellDraft.buyer}
                onChange={(e) => setSellDraft({ ...sellDraft, buyer: e.target.value })}
                placeholder="اسم المشتري"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={sellDraft.notes}
                onChange={(e) => setSellDraft({ ...sellDraft, notes: e.target.value })}
              />
            </div>
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "dispose"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            disposeMutation.mutate({
              id: actionTarget.asset.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="استبعاد الأصل"
        message={`هل تريد استبعاد الأصل "${actionTarget?.asset.name}"؟ سيصبح read-only ويحتفظ به النظام للسجل التاريخي.`}
        confirmText="استبعاد"
        cancelText="تراجع"
        variant="destructive"
      />

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function getAssetActions(
  a: FixedAsset,
  navigate: (opts: { to: string; params: { id: string } }) => void,
  openEdit: (a: FixedAsset) => void,
  setActionTarget: (t: {
    asset: FixedAsset;
    action: "depreciate" | "transfer" | "maintain" | "returnMaintenance" | "dispose" | "sell";
  }) => void,
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
      onClick: () => navigate({ to: "/assets/$id/edit", params: { id: a.id } }),
    },
  ];

  const readOnly = a.status === AssetStatusEnum.DISPOSED;

  if (!readOnly) {
    actions.push({ label: "تعديل", icon: Edit, onClick: () => openEdit(a) });
    actions.push({
      label: "تسجيل إهلاك",
      icon: TrendingDown,
      onClick: () => setActionTarget({ asset: a, action: "depreciate" }),
    });
    actions.push({
      label: "نقل",
      icon: ArrowRight,
      onClick: () => setActionTarget({ asset: a, action: "transfer" }),
    });
    if (a.status !== AssetStatusEnum.UNDER_MAINTENANCE) {
      actions.push({
        label: "تسجيل صيانة",
        icon: Wrench,
        onClick: () => setActionTarget({ asset: a, action: "maintain" }),
      });
    } else {
      actions.push({
        label: "إنهاء الصيانة",
        icon: Wrench,
        onClick: () => setActionTarget({ asset: a, action: "returnMaintenance" }),
      });
    }
    actions.push({
      label: "بيع",
      icon: TrendingDown,
      onClick: () => setActionTarget({ asset: a, action: "sell" }),
    });
    actions.push({
      label: "استبعاد",
      icon: XCircle,
      onClick: () => setActionTarget({ asset: a, action: "dispose" }),
    });
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
