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
import { Plus, PackageSearch, Eye, CheckCircle, Trash2, Send, Lock, Search } from "lucide-react";
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
  getStocktakes,
  createStocktake,
  submitStocktake,
  approveStocktake,
  closeStocktake,
  deleteStocktake,
  STOCKTAKE_STATUSES,
  type Stocktake,
} from "@/lib/api/stocktake";
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { getInventoryItems, type InventoryItem } from "@/lib/api/inventory-items";

export const Route = createFileRoute("/inventory/stocktake")({
  head: () => ({ meta: [{ title: "الجرد — ثواب" }] }),
  component: Page,
});

interface StocktakeLineDraft {
  itemId: string;
  countedQuantity: string;
  notes: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stocktake | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    st: Stocktake;
    action: "submit" | "approve" | "close";
  } | null>(null);

  const [formName, setFormName] = useState("");
  const [formWarehouseId, setFormWarehouseId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<StocktakeLineDraft[]>([
    { itemId: "", countedQuantity: "", notes: "" },
  ]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stocktakes", { search: searchQuery, status: statusFilter }],
    queryFn: () => getStocktakes({ status: statusFilter }),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses-all"],
    queryFn: () => getWarehouses({}),
  });

  const { data: itemsData } = useQuery({
    queryKey: ["inventoryItems-all"],
    queryFn: () => getInventoryItems({}),
  });

  const detailQuery = useQuery({
    queryKey: ["stocktakeDetail", detailId],
    queryFn: async () =>
      detailId
        ? await fetch(`/api/inventory/stocktake?id=${detailId}`).then((r) => r.json())
        : null,
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: createStocktake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم إضافة الجرد بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const submitMutation = useMutation({
    mutationFn: submitStocktake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم إرسال الجرد للاعتماد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: approveStocktake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم اعتماد الجرد وإنشاء التسويات تلقائياً", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMutation = useMutation({
    mutationFn: closeStocktake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم إغلاق الجرد", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStocktake,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم حذف الجرد", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setFormName("");
    setFormWarehouseId("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setFormLines([{ itemId: "", countedQuantity: "", notes: "" }]);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return showToast("يرجى إدخال اسم الجرد", "error");
    if (!formDate.trim()) return showToast("يرجى تحديد تاريخ الجرد", "error");
    const validLines = formLines.filter((l) => l.itemId && parseFloat(l.countedQuantity) >= 0);
    if (validLines.length === 0) {
      return showToast("يرجى إضافة صنف واحد على الأقل", "error");
    }
    createMutation.mutate({
      name: formName,
      warehouseId: formWarehouseId || undefined,
      date: formDate,
      notes: formNotes,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        countedQuantity: parseFloat(l.countedQuantity) || 0,
        notes: l.notes,
      })),
      userId: user?.id,
      userName: user?.name,
    });
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const warehouses = warehousesData?.items || [];
  const inventoryItems = itemsData?.items || [];

  const stats = {
    draft: items.filter((s) => s.status === "مسودة").length,
    pending: items.filter((s) => s.status === "بانتظار الاعتماد").length,
    approved: items.filter((s) => s.status === "معتمد").length,
    closed: items.filter((s) => s.status === "مغلق").length,
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الجرد"]}
      title="عمليات الجرد"
      actions={
        <>
          <ExportButton
            data={items.map((s) => ({
              id: s.id,
              name: s.name,
              warehouseId: s.warehouseId || "",
              date: s.date,
              approvedBy: s.approvedBy || "",
              approvedAt: s.approvedAt || "",
              status: s.status,
            }))}
            filename="stocktakes.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            جرد جديد
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي عمليات الجرد</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">مسودة</div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtSAR(stats.draft)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">بانتظار الاعتماد</div>
          <div className="text-base lg:text-xl font-extrabold text-info tabular-nums">
            {fmtSAR(stats.pending)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">معتمد + مغلق</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.approved + stats.closed)}
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
          {STOCKTAKE_STATUSES.map((s) => (
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

      <MobilePageHeader title="عمليات الجرد" count={`${total} عملية`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جرد المخزون"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["stocktakes"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عمليات جرد"
          description="ابدأ بإنشاء أول عملية جرد لمطابقة المخزون الفعلي مع النظام"
          action={
            <Btn variant="primary" onClick={openAdd}>
              جرد جديد
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الاسم", "المستودع", "التاريخ", "الحالة", ""]}
          rows={items}
          renderRow={(s) => (
            <>
              <Td>
                <button
                  onClick={() => setDetailId(s.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  <PackageSearch size={13} className="inline ms-1 text-primary" />
                  {s.name}
                </button>
                <div className="text-xs text-muted-foreground font-mono">{s.id}</div>
              </Td>
              <Td className="text-xs">
                {warehouses.find((w) => w.id === s.warehouseId)?.name || "كل المستودعات"}
              </Td>
              <Td className="font-mono text-xs">{s.date}</Td>
              <Td>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getStocktakeActions(s, setDetailId, setActionTarget, setDeleteTarget)}
                />
              </Td>
            </>
          )}
          mobileCard={(s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
              </div>
              <button
                onClick={() => setDetailId(s.id)}
                className="font-semibold text-right hover:text-primary"
              >
                {s.name}
              </button>
              <div className="text-xs text-muted-foreground mt-1">
                {warehouses.find((w) => w.id === s.warehouseId)?.name || "كل المستودعات"} · {s.date}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => setDetailId(s.id)}
                >
                  تفاصيل
                </button>
                {s.status === "مسودة" && (
                  <button
                    className="flex-1 rounded-lg bg-primary/15 text-primary text-xs font-semibold py-2 min-h-[36px]"
                    onClick={() =>
                      submitMutation.mutate({
                        id: s.id,
                        userId: user?.id,
                        userName: user?.name,
                      })
                    }
                  >
                    إرسال للاعتماد
                  </button>
                )}
                {s.status === "بانتظار الاعتماد" && (
                  <button
                    className="flex-1 rounded-lg bg-success/15 text-success text-xs font-semibold py-2 min-h-[36px]"
                    onClick={() => setActionTarget({ st: s, action: "approve" })}
                  >
                    اعتماد
                  </button>
                )}
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="جرد جديد"
        onSave={handleSave}
        loading={createMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم الجرد *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="مثال: جرد شهري - المستودع الرئيسي"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">المستودع</label>
              <select
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formWarehouseId}
                onChange={(e) => setFormWarehouseId(e.target.value)}
              >
                <option value="">— كل المستودعات —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ الجرد *</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              الأصناف المُعدودة *
            </label>
            {formLines.map((l, i) => (
              <Card key={i} className="p-3 mb-2 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">سطر {i + 1}</span>
                  {formLines.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-destructive"
                      onClick={() => setFormLines(formLines.filter((_, idx) => idx !== i))}
                    >
                      إزالة
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <select
                    className="w-full rounded-lg border bg-background p-2 text-sm"
                    value={l.itemId}
                    onChange={(e) => {
                      const newLines = [...formLines];
                      newLines[i] = { ...l, itemId: e.target.value };
                      setFormLines(newLines);
                    }}
                  >
                    <option value="">— اختر الصنف —</option>
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.sku || it.id})
                        {it.warehouseId && formWarehouseId && it.warehouseId !== formWarehouseId
                          ? ` ⚠ مستودع آخر`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 items-center">
                    <input
                      className="flex-1 rounded-lg border bg-background p-2 text-sm"
                      type="number"
                      value={l.countedQuantity}
                      onChange={(e) => {
                        const newLines = [...formLines];
                        newLines[i] = { ...l, countedQuantity: e.target.value };
                        setFormLines(newLines);
                      }}
                      placeholder="الكمية المعدودة"
                    />
                    {l.itemId && (
                      <span className="text-xs text-muted-foreground">
                        بالنظام:{" "}
                        {fmtSAR(inventoryItems.find((it) => it.id === l.itemId)?.quantity || 0)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            <Btn
              variant="outline"
              className="w-full"
              onClick={() =>
                setFormLines([...formLines, { itemId: "", countedQuantity: "", notes: "" }])
              }
            >
              <Plus size={14} />
              إضافة سطر
            </Btn>
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
        title={`تفاصيل الجرد: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={detailQuery.data.item.status} />
              <DetailRow label="التاريخ" value={detailQuery.data.item.date} />
              <DetailRow
                label="المستودع"
                value={
                  warehouses.find((w) => w.id === detailQuery.data.item.warehouseId)?.name ||
                  "كل المستودعات"
                }
              />
              <DetailRow label="اعتمد بواسطة" value={detailQuery.data.item.approvedBy || "—"} />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-2">سطور الجرد</div>
              <div className="space-y-1">
                {detailQuery.data.lines.map(
                  (l: {
                    itemId: string;
                    systemQuantity: number;
                    countedQuantity: number;
                    difference: number;
                    notes: string;
                  }) => {
                    const item = inventoryItems.find((it) => it.id === l.itemId);
                    return (
                      <div
                        key={l.itemId}
                        className="text-xs py-1 border-b last:border-0 flex justify-between"
                      >
                        <div>
                          <div className="font-semibold">{item?.name || l.itemId}</div>
                          <div className="text-muted-foreground">
                            بالنظام: {fmtSAR(l.systemQuantity)} · معدود: {fmtSAR(l.countedQuantity)}
                          </div>
                        </div>
                        <div className="text-left">
                          <div
                            className={`font-bold ${
                              l.difference > 0
                                ? "text-success"
                                : l.difference < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {l.difference > 0 ? "+" : ""}
                            {fmtSAR(l.difference)}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
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
        open={!!actionTarget && actionTarget.action === "submit"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            submitMutation.mutate({
              id: actionTarget.st.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
          setActionTarget(null);
        }}
        title="إرسال للاعتماد"
        message={`هل تريد إرسال الجرد "${actionTarget?.st.name}" للاعتماد؟`}
        confirmText="إرسال"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "approve"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            approveMutation.mutate({
              id: actionTarget.st.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="اعتماد الجرد"
        message={
          actionTarget
            ? `هل تريد اعتماد الجرد "${actionTarget.st.name}"؟ سيتم إنشاء تسويات تلقائية للأصناف التي بها فروق وتحديث المخزون.`
            : ""
        }
        confirmText="اعتماد"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "close"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            closeMutation.mutate({
              id: actionTarget.st.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="إغلاق الجرد"
        message={`هل تريد إغلاق الجرد "${actionTarget?.st.name}"؟`}
        confirmText="إغلاق"
        cancelText="إلغاء"
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
          deleteTarget ? `هل تريد حذف الجرد "${deleteTarget.name}"؟ يمكن حذف المسودات فقط.` : ""
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

function getStocktakeActions(
  s: Stocktake,
  setDetailId: (id: string) => void,
  setActionTarget: (t: { st: Stocktake; action: "submit" | "approve" | "close" }) => void,
  setDeleteTarget: (s: Stocktake) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(s.id) }];

  if (s.status === "مسودة") {
    actions.push({
      label: "إرسال للاعتماد",
      icon: Send,
      onClick: () => setActionTarget({ st: s, action: "submit" }),
    });
    actions.push({
      label: "حذف",
      icon: Trash2,
      variant: "destructive",
      onClick: () => setDeleteTarget(s),
    });
  }

  if (s.status === "بانتظار الاعتماد") {
    actions.push({
      label: "اعتماد",
      icon: CheckCircle,
      onClick: () => setActionTarget({ st: s, action: "approve" }),
    });
  }

  if (s.status === "معتمد") {
    actions.push({
      label: "إغلاق",
      icon: Lock,
      onClick: () => setActionTarget({ st: s, action: "close" }),
    });
  }

  return actions;
}
