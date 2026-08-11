import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
  FilterBar,
  Select,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import {
  Plus,
  ClipboardList,
  Filter,
  Search,
  Eye,
  Edit,
  Trash2,
  XCircle,
  CheckCircle,
  ArrowRight,
  Send,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  EntityFormDrawer,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { PurchaseRequestStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import {
  getPurchaseRequests,
  getPurchaseRequest,
  submitPurchaseRequest,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  returnPurchaseRequestToDraft,
  cancelPurchaseRequest,
  deletePurchaseRequest,
  type PurchaseRequest,
} from "@/lib/api/purchase-requests";

export const Route = createFileRoute("/procurement/requests")({
  head: () => ({ meta: [{ title: "طلبات الشراء — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequest | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    req: PurchaseRequest;
    action: "reject" | "return" | "cancel";
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const detailQuery = useQuery({
    queryKey: ["purchaseRequest", detailId],
    queryFn: () => getPurchaseRequest(detailId!),
    enabled: !!detailId,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "purchaseRequests",
      { search: searchQuery, status: statusFilter, department: departmentFilter },
    ],
    queryFn: () =>
      getPurchaseRequests({
        search: searchQuery,
        status: statusFilter,
        department: departmentFilter,
      }),
  });

  const submitMutation = useMutation({
    mutationFn: submitPurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إرسال الطلب للموافقة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: approvePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم اعتماد الطلب بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectPurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم رفض الطلب", "success");
      setActionTarget(null);
      setRejectReason("");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const returnMutation = useMutation({
    mutationFn: returnPurchaseRequestToDraft,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إرجاع الطلب للمسودة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelPurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إلغاء الطلب", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم حذف الطلب", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/procurement/requests/new" });

  const openEdit = (r: PurchaseRequest) => {
    if (
      r.status !== PurchaseRequestStatus.DRAFT &&
      r.status !== PurchaseRequestStatus.REJECTED
    ) {
      showToast("لا يمكن تعديل طلب في حالة حالية. أعده إلى المسودة أولاً.", "error");
      return;
    }
    navigate({ to: "/procurement/requests/$id/edit", params: { id: r.id } });
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    draft: items.filter((r) => r.status === PurchaseRequestStatus.DRAFT).length,
    pending: items.filter((r) => r.status === PurchaseRequestStatus.SUBMITTED).length,
    approved: items.filter((r) => r.status === PurchaseRequestStatus.APPROVED).length,
    rejected: items.filter((r) => r.status === PurchaseRequestStatus.REJECTED).length,
    converted: items.filter((r) => r.status === PurchaseRequestStatus.ORDERED).length,
    cancelled: items.filter((r) => r.status === PurchaseRequestStatus.CANCELLED).length,
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "طلبات الشراء"]}
      title="طلبات الشراء"
      actions={
        <>
          <ExportButton
            data={items.map((r) => ({
              id: r.id,
              subject: r.subject,
              department: r.department,
              priority: r.priority,
              requester: r.requester,
              amount: r.amount,
              deliveryDate: r.deliveryDate,
              status: r.status,
              notes: r.notes,
            }))}
            filename="purchase-requests.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إنشاء طلب شراء
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الطلبات</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">بانتظار الموافقة</div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtSAR(stats.pending)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">معتمد</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.approved)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">محول لأمر شراء</div>
          <div className="text-base lg:text-xl font-extrabold text-info tabular-nums">
            {fmtSAR(stats.converted)}
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
              {options("purchaseRequestStatus").map((o) => (
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
        <Select
          label="الإدارة"
          options={[
            "الكل",
            "إدارة المساعدات",
            "تقنية المعلومات",
            "إدارة المشاريع",
            "الإدارة المالية",
            "المشتريات",
          ]}
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
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

      <MobilePageHeader title="طلبات الشراء" count={`${total} طلب`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب طلبات الشراء"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات شراء"
          description="ابدأ بإنشاء أول طلب شراء للموافقة عليه"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إنشاء طلب شراء
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرقم", "الموضوع", "الإدارة", "المبلغ", "الحالة", ""]}
          rows={items}
          renderRow={(r) => (
            <>
              <Td className="font-mono text-xs">{r.id}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(r.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  <ClipboardList size={13} className="inline ms-1 text-primary" />
                  {r.subject}
                </button>
                {r.requester && <div className="text-xs text-muted-foreground">{r.requester}</div>}
              </Td>
              <Td className="text-muted-foreground">{r.department}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
              <Td>
                <Badge tone={statusTone(r.status)}>
                  {label("purchaseRequestStatus", r.status)}
                </Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getRequestActions(
                    r,
                    setDetailId,
                    openEdit,
                    submitMutation,
                    approveMutation,
                    setActionTarget,
                    deleteMutation,
                    setDeleteTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setDetailId(r.id)}
                    className="text-sm font-bold truncate text-right hover:text-primary"
                  >
                    {r.subject}
                  </button>
                  <div className="text-xs text-muted-foreground">
                    {r.department} · {r.deliveryDate || "—"}
                  </div>
                </div>
                <Badge tone={statusTone(r.status)}>
                  {label("purchaseRequestStatus", r.status)}
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-base font-bold tabular-nums">{fmtSAR(r.amount)}</div>
                <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
              </div>
              <div className="mt-2 pt-2 border-t flex gap-2">
                {r.status === PurchaseRequestStatus.DRAFT && (
                  <button
                    className="flex-1 rounded-lg bg-primary/15 text-primary py-2 text-xs font-semibold min-h-[36px]"
                    onClick={() =>
                      submitMutation.mutate({ id: r.id, userId: user?.id, userName: user?.name })
                    }
                  >
                    إرسال للموافقة
                  </button>
                )}
                {r.status === PurchaseRequestStatus.SUBMITTED && (
                  <button
                    className="flex-1 rounded-lg bg-success/15 text-success py-2 text-xs font-semibold min-h-[36px]"
                    onClick={() =>
                      approveMutation.mutate({ id: r.id, userId: user?.id, userName: user?.name })
                    }
                  >
                    اعتماد
                  </button>
                )}
                <button
                  className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                  onClick={() => setDetailId(r.id)}
                >
                  تفاصيل
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`تفاصيل الطلب: ${detailQuery.data?.item?.subject || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow
                label="الحالة"
                value={label("purchaseRequestStatus", detailQuery.data.item.status)}
              />
              <DetailRow label="القسم" value={detailQuery.data.item.department} />
              <DetailRow
                label="الأولوية"
                value={label("priority", detailQuery.data.item.priority)}
              />
              <DetailRow label="مقدم الطلب" value={detailQuery.data.item.requester || "—"} />
              <DetailRow label="المبلغ" value={fmtSAR(detailQuery.data.item.amount)} />
              <DetailRow label="تاريخ التوريد" value={detailQuery.data.item.deliveryDate || "—"} />
            </div>
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                أوامر الشراء المرتبطة
              </div>
              <div className="text-base font-bold">{fmtSAR(detailQuery.data.orderCount)}</div>
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
        open={!!actionTarget && actionTarget.action === "reject"}
        onClose={() => {
          setActionTarget(null);
          setRejectReason("");
        }}
        title={`رفض الطلب: ${actionTarget?.req.subject || ""}`}
        onSave={() => {
          if (actionTarget) {
            rejectMutation.mutate({
              id: actionTarget.req.id,
              reason: rejectReason,
              userId: user?.id,
              userName: user?.name,
            });
          }
        }}
        loading={rejectMutation.isPending}
        saveText="تأكيد الرفض"
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-warning/10 p-3 text-sm">
            <div className="font-bold text-warning mb-1">⚠ رفض طلب الشراء</div>
            <p className="text-xs">سيتم رفض الطلب وإضافة السبب إلى الملاحظات.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">سبب الرفض</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اذكر سبب الرفض..."
            />
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "return"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            returnMutation.mutate({
              id: actionTarget.req.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
          setActionTarget(null);
        }}
        title="إعادة للمسودة"
        message={`هل تريد إعادة الطلب "${actionTarget?.req.subject}" إلى المسودة؟`}
        confirmText="إعادة للمسودة"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "cancel"}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (actionTarget) {
            cancelMutation.mutate({
              id: actionTarget.req.id,
              userId: user?.id,
              userName: user?.name,
            });
          }
          setActionTarget(null);
        }}
        title="إلغاء الطلب"
        message={`هل تريد إلغاء الطلب "${actionTarget?.req.subject}"؟`}
        confirmText="إلغاء"
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
        message={deleteTarget ? `هل تريد حذف طلب الشراء "${deleteTarget.subject}"؟` : ""}
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
              {options("purchaseRequestStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الإدارة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>إدارة المساعدات</option>
              <option>تقنية المعلومات</option>
              <option>إدارة المشاريع</option>
              <option>الإدارة المالية</option>
              <option>المشتريات</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
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

function getRequestActions(
  r: PurchaseRequest,
  setDetailId: (id: string) => void,
  openEdit: (r: PurchaseRequest) => void,
  submitMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  approveMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  setActionTarget: (t: { req: PurchaseRequest; action: "reject" | "return" | "cancel" }) => void,
  deleteMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  setDeleteTarget: (r: PurchaseRequest) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(r.id) }];

  if (r.status === PurchaseRequestStatus.DRAFT) {
    actions.push({ label: "تعديل", icon: Edit, onClick: () => openEdit(r) });
    actions.push({
      label: "إرسال للموافقة",
      icon: Send,
      onClick: () => submitMutation.mutate({ id: r.id }),
    });
  }

  if (r.status === PurchaseRequestStatus.SUBMITTED) {
    actions.push({
      label: "اعتماد",
      icon: CheckCircle,
      onClick: () => approveMutation.mutate({ id: r.id }),
    });
    actions.push({
      label: "رفض",
      icon: XCircle,
      onClick: () => setActionTarget({ req: r, action: "reject" }),
    });
  }

  if (r.status === PurchaseRequestStatus.APPROVED) {
    actions.push({
      label: "إعادة للمسودة",
      icon: ArrowRight,
      onClick: () => setActionTarget({ req: r, action: "return" }),
    });
  }

  if (r.status === PurchaseRequestStatus.REJECTED) {
    actions.push({ label: "تعديل", icon: Edit, onClick: () => openEdit(r) });
    actions.push({
      label: "إعادة للمسودة",
      icon: ArrowRight,
      onClick: () => setActionTarget({ req: r, action: "return" }),
    });
  }

  if (
    r.status !== PurchaseRequestStatus.ORDERED &&
    r.status !== PurchaseRequestStatus.CANCELLED
  ) {
    actions.push({
      label: "إلغاء",
      icon: XCircle,
      onClick: () => setActionTarget({ req: r, action: "cancel" }),
    });
  }

  if (
    r.status === PurchaseRequestStatus.DRAFT ||
    r.status === PurchaseRequestStatus.REJECTED ||
    r.status === PurchaseRequestStatus.CANCELLED
  ) {
    actions.push({
      label: "حذف",
      icon: Trash2,
      variant: "destructive",
      onClick: () => {
        deleteMutation.mutate({ id: r.id });
        setDeleteTarget(r);
      },
    });
  }

  return actions;
}
