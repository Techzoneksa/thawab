import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { CheckCircle2, ThumbsUp, ThumbsDown, Trash2, Plus, Star, Eye, Pencil } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  EntityFormDrawer,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { QuoteStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import {
  getQuotes,
  acceptQuote,
  rejectQuote,
  deleteQuote,
  type Quote,
} from "@/lib/api/quotes";
import { getPurchaseRequests, type PurchaseRequest } from "@/lib/api/purchase-requests";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [requestFilter, setRequestFilter] = useState("الكل");
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [detailTarget, setDetailTarget] = useState<Quote | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["quotes", { search: searchQuery, status: statusFilter, requestId: requestFilter }],
    queryFn: () =>
      getQuotes({
        search: searchQuery,
        status: statusFilter,
        requestId: requestFilter === "الكل" ? "" : requestFilter,
      }),
  });

  const { data: requestsData } = useQuery({
    queryKey: ["purchaseRequests-all"],
    queryFn: () => getPurchaseRequests({}),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => getSuppliers({}),
  });

  const acceptMutation = useMutation({
    mutationFn: acceptQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      showToast("تم قبول العرض وتحديده كفائز", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      showToast("تم رفض عرض السعر", "info");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      showToast("تم حذف عرض السعر", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    navigate({ to: "/procurement/quotes/new" });
  };

  const openEdit = (q: Quote) => {
    if (q.status !== QuoteStatus.PENDING) {
      showToast("لا يمكن تعديل عرض تم البت فيه", "error");
      return;
    }
    navigate({ to: "/procurement/quotes/$id/edit", params: { id: q.id } });
  };

  const items = data?.items || [];
  const requests = requestsData?.items || [];
  const suppliers = suppliersData?.items || [];

  // Group by requestId
  const groupedByRequest = items.reduce<Record<string, Quote[]>>((acc, q) => {
    const key = q.requestId || "_none";
    if (!acc[key]) acc[key] = [];
    acc[key].push(q);
    return acc;
  }, {});

  const buildDoc = (): DocumentDefinition => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter) filters.push({ label: "الحالة", value: label("quoteStatus", statusFilter) });
    if (requestFilter && requestFilter !== "الكل")
      filters.push({ label: "طلب الشراء", value: requestFilter });
    return {
      title: "عروض الأسعار",
      date: today,
      filters,
      columns: [
        { key: "supplier", label: "المورد" },
        { key: "price", label: "السعر", type: "money" },
        { key: "status", label: "الحالة" },
      ],
      rows: items.map((q) => ({
        supplier: q.supplier,
        price: q.price,
        status: label("quoteStatus", q.status),
      })),
      fileBase: `quotes-${today}`,
    };
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "عروض الأسعار"]}
      title="مقارنة عروض الأسعار"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة عرض سعر
          </Btn>
        </>
      }
    >
      <MobilePageHeader title="مقارنة عروض الأسعار" count={`${items.length} عرض`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب عروض الأسعار"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["quotes"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عروض أسعار"
          description="ابدأ بإضافة عروض الأسعار لمقارنتها واختيار الأفضل"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة عرض سعر
            </Btn>
          }
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByRequest).map(([reqId, group]) => {
            const request = requests.find((r) => r.id === reqId);
            return (
              <div key={reqId}>
                {request && (
                  <Card className="p-4 mb-3 bg-primary/5">
                    <div className="text-sm">
                      <span className="text-muted-foreground">طلب الشراء:</span>{" "}
                      <b className="text-foreground">{request.id}</b> ·{" "}
                      <span>{request.subject}</span>
                      <span className="text-muted-foreground"> · {request.department}</span>
                    </div>
                  </Card>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {group.map((q) => (
                    <Card key={q.id} className={`p-5 ${q.winner ? "ring-2 ring-success" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold truncate">{q.supplier}</h3>
                          <div className="flex items-center gap-1 mt-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                size={12}
                                className={
                                  s <= q.rating
                                    ? "fill-warning text-warning"
                                    : "text-muted-foreground"
                                }
                              />
                            ))}
                            <span className="text-xs text-muted-foreground">({q.rating}/5)</span>
                          </div>
                        </div>
                        <ActionMenu
                          actions={getQuoteActions(
                            q,
                            setDetailTarget,
                            openEdit,
                            acceptMutation,
                            rejectMutation,
                            setDeleteTarget,
                          )}
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {q.winner && (
                          <Badge tone="success">
                            <CheckCircle2 size={11} className="inline ms-1" />
                            الموصى به
                          </Badge>
                        )}
                        <Badge tone={quoteStatusTone(q.status)}>
                          {label("quoteStatus", q.status)}
                        </Badge>
                      </div>
                      <div className="text-3xl font-extrabold tabular-nums mt-3">
                        {fmtSAR(q.price)}
                      </div>
                      <ul className="mt-4 space-y-2 text-sm">
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">مدة التسليم</span>
                          <b>{q.delivery || "—"}</b>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">الضمان</span>
                          <b>{q.warranty || "—"}</b>
                        </li>
                        {q.validUntil && (
                          <li className="flex justify-between">
                            <span className="text-muted-foreground">صالح حتى</span>
                            <b>{q.validUntil}</b>
                          </li>
                        )}
                      </ul>
                      <div className="flex gap-2 mt-4">
                        {q.status === QuoteStatus.PENDING && (
                          <>
                            <Btn
                              variant={q.winner ? "primary" : "outline"}
                              className="flex-1 justify-center"
                              onClick={() =>
                                acceptMutation.mutate({
                                  id: q.id,
                                  userId: user?.id,
                                  userName: user?.name,
                                })
                              }
                            >
                              <ThumbsUp size={14} />
                              قبول
                            </Btn>
                            <Btn
                              variant="outline"
                              className="flex-1 justify-center"
                              onClick={() =>
                                rejectMutation.mutate({
                                  id: q.id,
                                  userId: user?.id,
                                  userName: user?.name,
                                })
                              }
                            >
                              <ThumbsDown size={14} />
                              رفض
                            </Btn>
                          </>
                        )}
                        {q.status !== QuoteStatus.PENDING && (
                          <Btn
                            variant="outline"
                            className="w-full justify-center"
                            onClick={() => setDetailTarget(q)}
                          >
                            عرض التفاصيل
                          </Btn>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EntityFormDrawer
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={`تفاصيل عرض السعر: ${detailTarget?.supplier || ""}`}
        onSave={() => setDetailTarget(null)}
        saveText="إغلاق"
      >
        {detailTarget && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={label("quoteStatus", detailTarget.status)} />
              <DetailRow label="الموصى به" value={detailTarget.winner ? "نعم" : "لا"} />
              <DetailRow label="السعر" value={fmtSAR(detailTarget.price)} />
              <DetailRow label="التقييم" value={`${detailTarget.rating} / 5`} />
              <DetailRow label="مدة التسليم" value={detailTarget.delivery || "—"} />
              <DetailRow label="الضمان" value={detailTarget.warranty || "—"} />
              {detailTarget.validUntil && (
                <DetailRow label="صالح حتى" value={detailTarget.validUntil} />
              )}
            </div>
            {detailTarget.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm">{detailTarget.notes}</div>
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
        message={deleteTarget ? `هل تريد حذف عرض السعر من "${deleteTarget.supplier}"؟` : ""}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}

function quoteStatusTone(s: string): "success" | "destructive" | "warning" | "muted" {
  if (s === QuoteStatus.ACCEPTED) return "success";
  if (s === QuoteStatus.REJECTED) return "destructive";
  return "warning";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function getQuoteActions(
  q: Quote,
  setDetailTarget: (q: Quote) => void,
  openEdit: (q: Quote) => void,
  acceptMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  rejectMutation: { mutate: (o: { id: string; userId?: string; userName?: string }) => void },
  setDeleteTarget: (q: Quote) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailTarget(q) }];

  if (q.status === QuoteStatus.PENDING) {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(q) });
    actions.push({
      label: "قبول",
      icon: ThumbsUp,
      onClick: () => acceptMutation.mutate({ id: q.id }),
    });
    actions.push({
      label: "رفض",
      icon: ThumbsDown,
      onClick: () => rejectMutation.mutate({ id: q.id }),
    });
  }

  actions.push({
    label: "حذف",
    icon: Trash2,
    variant: "destructive",
    onClick: () => setDeleteTarget(q),
  });

  return actions;
}
