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
  Plus,
  Eye,
  Printer,
  XCircle,
  PackageCheck,
  Trash2,
  CheckCircle,
  Search,
} from "lucide-react";
import { useState } from "react";
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
import {
  getPurchaseOrders,
  createPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  closePurchaseOrder,
  deletePurchaseOrder,
  ORDER_STATUSES,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/api/purchase-orders";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { getPurchaseRequests, type PurchaseRequest } from "@/lib/api/purchase-requests";

export const Route = createFileRoute("/procurement/orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: Page,
});

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  unit: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    order: PurchaseOrder;
    action: "approve" | "cancel" | "close";
  } | null>(null);

  const [formSubject, setFormSubject] = useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formRequestId, setFormRequestId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDelivery, setFormDelivery] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<LineDraft[]>([
    { description: "", quantity: "", unitPrice: "", unit: "" },
  ]);

  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["purchaseOrders", { search: searchQuery }],
    queryFn: () => getPurchaseOrders({ search: searchQuery }),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => getSuppliers({}),
  });

  const { data: requestsData } = useQuery({
    queryKey: ["purchaseRequests-approved"],
    queryFn: () => getPurchaseRequests({ status: "معتمد" }),
  });

  const detailQuery = useQuery({
    queryKey: ["purchaseOrderDetail", detailId],
    queryFn: async () =>
      detailId ? await fetch(`/api/procurement/orders?id=${detailId}`).then((r) => r.json()) : null,
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إنشاء أمر الشراء بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: approvePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      showToast("تم اعتماد أمر الشراء", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إلغاء أمر الشراء", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMutation = useMutation({
    mutationFn: closePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      showToast("تم إغلاق أمر الشراء", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const receiveMutation = useMutation({
    mutationFn: receivePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrderDetail"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم تسجيل الاستلام وتحديث المخزون", "success");
      setReceiveTarget(null);
      setReceiveLines({});
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم حذف أمر الشراء", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setFormSubject("");
    setFormSupplierId("");
    setFormRequestId("");
    setFormDate("");
    setFormDelivery("");
    setFormNotes("");
    setFormLines([{ description: "", quantity: "", unitPrice: "", unit: "" }]);
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formSubject.trim()) return showToast("يرجى إدخال موضوع الأمر", "error");
    const validLines = formLines.filter(
      (l) => l.description.trim() && parseFloat(l.quantity) > 0 && parseFloat(l.unitPrice) >= 0,
    );
    if (validLines.length === 0) {
      return showToast("يرجى إضافة سطر واحد على الأقل ببيانات صحيحة", "error");
    }
    createMutation.mutate({
      supplierId: formSupplierId || undefined,
      requestId: formRequestId || undefined,
      subject: formSubject,
      date: formDate || undefined,
      deliveryDate: formDelivery || undefined,
      notes: formNotes,
      lines: validLines.map((l) => ({
        description: l.description,
        quantity: parseFloat(l.quantity),
        unitPrice: parseFloat(l.unitPrice),
        unit: l.unit,
      })),
      userId: user?.id,
      userName: user?.name,
    });
  };

  const openReceive = (o: PurchaseOrder) => {
    setReceiveTarget(o);
    setReceiveLines({});
  };

  const handleReceive = () => {
    if (!receiveTarget || !detailQuery.data?.lines) return;
    const receipts = (detailQuery.data.lines as PurchaseOrderLine[])
      .filter((l) => {
        const qty = parseFloat(receiveLines[l.id] || "0");
        return qty > 0;
      })
      .map((l) => ({
        lineId: l.id,
        receivedQty: parseFloat(receiveLines[l.id] || "0"),
      }));
    if (receipts.length === 0) {
      return showToast("يرجى إدخال كمية واحدة على الأقل للاستلام", "error");
    }
    receiveMutation.mutate({
      id: receiveTarget.id,
      receipts,
      userId: user?.id,
      userName: user?.name,
    });
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    draft: items.filter((o) => o.status === "مسودة").length,
    approved: items.filter((o) => o.status === "معتمد").length,
    partial: items.filter((o) => o.status === "تم الاستلام جزئيًا").length,
    received: items.filter((o) => o.status === "تم الاستلام").length,
    closed: items.filter((o) => o.status === "مغلق").length,
    cancelled: items.filter((o) => o.status === "ملغي").length,
    totalValue: items.reduce((s, o) => s + (o.total || 0), 0),
    total,
  };

  const suppliers = suppliersData?.items || [];
  const approvedRequests = requestsData?.items || [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء"]}
      title="أوامر الشراء"
      actions={
        <>
          <ExportButton
            data={items.map((o) => ({
              id: o.id,
              supplierId: o.supplierId || "",
              subject: o.subject,
              date: o.date,
              deliveryDate: o.deliveryDate,
              total: o.total,
              receivedAmount: o.receivedAmount,
              status: o.status,
              notes: o.notes,
            }))}
            filename="purchase-orders.csv"
          />
          <PrintButton label="طباعة" />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إنشاء أمر شراء
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الأوامر</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">قيمة الأوامر</div>
          <div className="text-base lg:text-xl font-extrabold text-primary tabular-nums">
            {fmtSAR(stats.totalValue)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">معتمد + قيد الاستلام</div>
          <div className="text-base lg:text-xl font-extrabold text-info tabular-nums">
            {fmtSAR(stats.approved + stats.partial)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">مستلم + مغلق</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.received + stats.closed)}
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
      </div>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader title="أوامر الشراء" count={`${total} أمر`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب أوامر الشراء"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد أوامر شراء"
          description="ابدأ بإنشاء أول أمر شراء"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إنشاء أمر شراء
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرقم", "الموضوع", "المورد", "المبلغ", "الحالة", ""]}
          rows={items}
          renderRow={(o) => (
            <>
              <Td className="font-mono text-xs">{o.id}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(o.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {o.subject}
                </button>
                <div className="text-xs text-muted-foreground">{o.date}</div>
              </Td>
              <Td className="text-xs">
                {suppliers.find((s) => s.id === o.supplierId)?.name || "—"}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(o.total)}</Td>
              <Td>
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getOrderActions(
                    o,
                    setDetailId,
                    setActionTarget,
                    openReceive,
                    setDeleteTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(o) => (
            <Card key={o.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
              </div>
              <button
                onClick={() => setDetailId(o.id)}
                className="font-semibold text-right hover:text-primary"
              >
                {o.subject}
              </button>
              <div className="text-xs text-muted-foreground mt-1">
                {suppliers.find((s) => s.id === o.supplierId)?.name || "—"} · {o.date}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="tabular-nums font-bold">{fmtSAR(o.total)}</span>
                <span className="text-xs text-muted-foreground">
                  مستلم: {fmtSAR(o.receivedAmount)}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => setDetailId(o.id)}
                >
                  تفاصيل
                </button>
                {(o.status === "معتمد" || o.status === "تم الاستلام جزئيًا") && (
                  <button
                    className="flex-1 rounded-lg bg-success/15 text-success text-xs font-semibold py-2 min-h-[36px]"
                    onClick={() => openReceive(o)}
                  >
                    استلام
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
        title="إنشاء أمر شراء جديد"
        onSave={handleSave}
        loading={createMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الموضوع *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSubject}
              onChange={(e) => setFormSubject(e.target.value)}
              placeholder="مثال: سلال غذائية × 1000"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المورد</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSupplierId}
              onChange={(e) => setFormSupplierId(e.target.value)}
            >
              <option value="">— بدون مورد —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">من طلب شراء معتمد</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formRequestId}
              onChange={(e) => setFormRequestId(e.target.value)}
            >
              <option value="">— بدون ربط —</option>
              {approvedRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.subject}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ الأمر</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ التوريد</label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                type="date"
                value={formDelivery}
                onChange={(e) => setFormDelivery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-2 block">
              السطور *
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
                  <input
                    className="w-full rounded-lg border bg-background p-2 text-sm"
                    value={l.description}
                    onChange={(e) => {
                      const newLines = [...formLines];
                      newLines[i] = { ...l, description: e.target.value };
                      setFormLines(newLines);
                    }}
                    placeholder="وصف الصنف"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      className="w-full rounded-lg border bg-background p-2 text-sm"
                      type="number"
                      value={l.quantity}
                      onChange={(e) => {
                        const newLines = [...formLines];
                        newLines[i] = { ...l, quantity: e.target.value };
                        setFormLines(newLines);
                      }}
                      placeholder="الكمية"
                    />
                    <input
                      className="w-full rounded-lg border bg-background p-2 text-sm"
                      value={l.unit}
                      onChange={(e) => {
                        const newLines = [...formLines];
                        newLines[i] = { ...l, unit: e.target.value };
                        setFormLines(newLines);
                      }}
                      placeholder="الوحدة"
                    />
                    <input
                      className="w-full rounded-lg border bg-background p-2 text-sm"
                      type="number"
                      value={l.unitPrice}
                      onChange={(e) => {
                        const newLines = [...formLines];
                        newLines[i] = { ...l, unitPrice: e.target.value };
                        setFormLines(newLines);
                      }}
                      placeholder="السعر"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    الإجمالي:{" "}
                    {fmtSAR((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0))}
                  </div>
                </div>
              </Card>
            ))}
            <Btn
              variant="outline"
              className="w-full"
              onClick={() =>
                setFormLines([
                  ...formLines,
                  { description: "", quantity: "", unitPrice: "", unit: "" },
                ])
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
        open={!!detailId && !formOpen && !receiveTarget}
        onClose={() => setDetailId(null)}
        title={`تفاصيل أمر الشراء: ${detailQuery.data?.item?.subject || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={detailQuery.data.item.status} />
              <DetailRow
                label="المورد"
                value={
                  suppliers.find((s) => s.id === detailQuery.data.item.supplierId)?.name || "—"
                }
              />
              <DetailRow label="التاريخ" value={detailQuery.data.item.date} />
              <DetailRow label="تاريخ التوريد" value={detailQuery.data.item.deliveryDate || "—"} />
              <DetailRow label="الإجمالي" value={fmtSAR(detailQuery.data.item.total)} />
              <DetailRow label="المستلم" value={fmtSAR(detailQuery.data.item.receivedAmount)} />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-2">سطور الأمر</div>
              {(detailQuery.data.lines as PurchaseOrderLine[]).map((l) => (
                <div
                  key={l.id}
                  className="text-xs py-1 border-b last:border-0 flex justify-between"
                >
                  <div>
                    <div className="font-semibold">{l.description}</div>
                    <div className="text-muted-foreground">
                      {l.quantity} {l.unit} × {fmtSAR(l.unitPrice)} ={" "}
                      {fmtSAR(l.quantity * l.unitPrice)}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-muted-foreground">مستلم</div>
                    <div className="font-bold">{l.receivedQuantity || 0}</div>
                  </div>
                </div>
              ))}
            </Card>
            {detailQuery.data.item.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm whitespace-pre-wrap">{detailQuery.data.item.notes}</div>
              </div>
            )}
          </div>
        )}
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!receiveTarget}
        onClose={() => {
          setReceiveTarget(null);
          setReceiveLines({});
        }}
        title={`استلام أصناف الأمر: ${receiveTarget?.id || ""}`}
        onSave={handleReceive}
        loading={receiveMutation.isPending}
        saveText="تأكيد الاستلام"
      >
        {receiveTarget && (
          <div className="space-y-3">
            <div className="rounded-lg bg-info/10 p-3 text-sm">
              <div className="font-bold text-info mb-1">📦 تسجيل الاستلام</div>
              <p className="text-xs">
                أدخل الكميات المستلمة. سيتم تحديث المخزون تلقائياً وإنشاء حركة استلام لكل صنف.
              </p>
            </div>
            <Card className="p-3 bg-muted/30">
              <div className="text-xs font-semibold mb-2">سطور الأمر</div>
              {(detailQuery.data?.lines as PurchaseOrderLine[] | undefined)?.map((l) => {
                const remaining = l.quantity - (l.receivedQuantity || 0);
                return (
                  <div key={l.id} className="text-xs py-2 border-b last:border-0">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold">{l.description}</span>
                      <span className="text-muted-foreground">
                        متبقي: {remaining} {l.unit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="flex-1 rounded-lg border bg-background p-2 text-sm"
                        value={receiveLines[l.id] || ""}
                        onChange={(e) =>
                          setReceiveLines({ ...receiveLines, [l.id]: e.target.value })
                        }
                        placeholder="0"
                        max={remaining}
                      />
                      <span className="text-xs text-muted-foreground">{l.unit}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "approve"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            approveMutation.mutate({
              id: actionTarget.order.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="اعتماد أمر الشراء"
        message={`هل تريد اعتماد أمر الشراء "${actionTarget?.order.subject}"؟`}
        confirmText="اعتماد"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "cancel"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            cancelMutation.mutate({
              id: actionTarget.order.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="إلغاء أمر الشراء"
        message={`هل تريد إلغاء أمر الشراء "${actionTarget?.order.subject}"؟`}
        confirmText="إلغاء"
        cancelText="تراجع"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "close"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            closeMutation.mutate({
              id: actionTarget.order.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        title="إغلاق أمر الشراء"
        message={`هل تريد إغلاق أمر الشراء "${actionTarget?.order.subject}"؟`}
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
          deleteTarget
            ? `هل تريد حذف أمر الشراء "${deleteTarget.subject}"؟ لا يمكن حذف الأوامر التي تم استلامها.`
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

function getOrderActions(
  o: PurchaseOrder,
  setDetailId: (id: string) => void,
  setActionTarget: (t: { order: PurchaseOrder; action: "approve" | "cancel" | "close" }) => void,
  openReceive: (o: PurchaseOrder) => void,
  setDeleteTarget: (o: PurchaseOrder) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(o.id) },
    { label: "طباعة", icon: Printer, onClick: () => window.print() },
  ];

  if (o.status === "مسودة") {
    actions.push({
      label: "اعتماد",
      icon: CheckCircle,
      onClick: () => setActionTarget({ order: o, action: "approve" }),
    });
    actions.push({
      label: "حذف",
      icon: Trash2,
      variant: "destructive",
      onClick: () => setDeleteTarget(o),
    });
  }

  if (o.status === "معتمد" || o.status === "تم الاستلام جزئيًا") {
    actions.push({
      label: "استلام",
      icon: PackageCheck,
      onClick: () => openReceive(o),
    });
  }

  if (o.status === "تم الاستلام") {
    actions.push({
      label: "إغلاق",
      icon: XCircle,
      onClick: () => setActionTarget({ order: o, action: "close" }),
    });
  }

  if (o.status !== "ملغي" && o.status !== "مغلق") {
    actions.push({
      label: "إلغاء",
      icon: XCircle,
      onClick: () => setActionTarget({ order: o, action: "cancel" }),
    });
  }

  return actions;
}
