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
  Eye,
  Printer,
  XCircle,
  PackageCheck,
  Trash2,
  CheckCircle,
  Search,
} from "lucide-react";
import { useState } from "react";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { PurchaseOrderStatus, PurchaseRequestStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import {
  getPurchaseOrders,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  deletePurchaseOrder,
  type PurchaseOrder,
} from "@/lib/api/purchase-orders";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { getPurchaseRequests, type PurchaseRequest } from "@/lib/api/purchase-requests";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    order: PurchaseOrder;
    action: "approve" | "cancel" | "close";
  } | null>(null);

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
    queryFn: () => getPurchaseRequests({ status: PurchaseRequestStatus.APPROVED }),
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

  // Phase 3C.1 cutover: new legacy PO creation is frozen. Direct users to the
  // governed Purchase Orders module (the only supported path for new orders).
  const openAdd = () => {
    navigate({ to: "/procurement/purchase-orders" });
  };

  const openReceive = (o: PurchaseOrder) =>
    navigate({ to: "/procurement/orders/$id/receive", params: { id: o.id } as any });

  const openDetail = (id: string) =>
    navigate({ to: "/procurement/orders/$id", params: { id } as any });

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    draft: items.filter((o) => o.status === PurchaseOrderStatus.DRAFT).length,
    approved: items.filter((o) => o.status === PurchaseOrderStatus.SENT).length,
    partial: items.filter((o) => o.status === PurchaseOrderStatus.PARTIAL).length,
    received: items.filter((o) => o.status === PurchaseOrderStatus.RECEIVED).length,
    closed: items.filter((o) => o.status === PurchaseOrderStatus.CLOSED).length,
    cancelled: items.filter((o) => o.status === PurchaseOrderStatus.CANCELLED).length,
    totalValue: items.reduce((s, o) => s + (o.total || 0), 0),
    total,
  };

  const suppliers = suppliersData?.items || [];
  const approvedRequests = requestsData?.items || [];

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    return {
      title: "أوامر الشراء",
      date: today,
      filters,
      columns: [
        { key: "subject", label: "الموضوع" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "total", label: "الإجمالي", type: "money" },
        { key: "receivedAmount", label: "المستلم", type: "money" },
        { key: "status", label: "الحالة" },
      ],
      rows: items.map((o) => ({
        subject: o.subject,
        date: o.date,
        total: o.total,
        receivedAmount: o.receivedAmount,
        status: label("purchaseOrderStatus", o.status),
      })),
      totals: [
        { label: "إجمالي قيمة الأوامر", value: stats.totalValue },
        {
          label: "إجمالي المستلم",
          value: items.reduce((s, o) => s + (o.receivedAmount || 0), 0),
        },
      ],
      fileBase: `purchase-orders-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء (قديمة)"]}
      title="أوامر الشراء (قديمة)"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            أمر شراء محكوم جديد
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
          title="لا توجد أوامر شراء قديمة"
          description="هذه شاشة تاريخية — أنشئ أوامر الشراء الجديدة من وحدة أوامر الشراء المحكومة"
          action={
            <Btn variant="primary" onClick={openAdd}>
              الانتقال لأوامر الشراء المحكومة
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
                  onClick={() => openDetail(o.id)}
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
                <Badge tone={statusTone(o.status)}>{label("purchaseOrderStatus", o.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getOrderActions(
                    o,
                    navigate,
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
                <Badge tone={statusTone(o.status)}>{label("purchaseOrderStatus", o.status)}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
              </div>
              <button
                onClick={() => openDetail(o.id)}
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
                  onClick={() => openDetail(o.id)}
                >
                  تفاصيل
                </button>
                {(o.status === PurchaseOrderStatus.SENT ||
                  o.status === PurchaseOrderStatus.PARTIAL) && (
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

function getOrderActions(
  o: PurchaseOrder,
  navigate: (opts: { to: string; params: { id: string } }) => void,
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
    {
      label: "عرض التفاصيل",
      icon: Eye,
      onClick: () => navigate({ to: "/procurement/orders/$id", params: { id: o.id } }),
    },
    { label: "طباعة", icon: Printer, onClick: () => window.print() },
  ];

  if (o.status === PurchaseOrderStatus.DRAFT) {
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

  if (o.status === PurchaseOrderStatus.SENT || o.status === PurchaseOrderStatus.PARTIAL) {
    actions.push({
      label: "استلام",
      icon: PackageCheck,
      onClick: () => openReceive(o),
    });
  }

  if (o.status === PurchaseOrderStatus.RECEIVED) {
    actions.push({
      label: "إغلاق",
      icon: XCircle,
      onClick: () => setActionTarget({ order: o, action: "close" }),
    });
  }

  if (o.status !== PurchaseOrderStatus.CANCELLED && o.status !== PurchaseOrderStatus.CLOSED) {
    actions.push({
      label: "إلغاء",
      icon: XCircle,
      onClick: () => setActionTarget({ order: o, action: "cancel" }),
    });
  }

  return actions;
}
