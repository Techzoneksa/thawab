import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  FilterBar,
  Select,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import {
  HandHelping,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getBeneficiaries, type Beneficiary } from "@/lib/api/beneficiaries";
import {
  getAidRecords,
  deleteAidRecord,
  approveAidRecord,
  rejectAidRecord,
  deliverAidRecord,
  returnAidRecord,
  type AidRecord,
  type AidFilters,
} from "@/lib/api/aid";
import { AidStatus, BeneficiaryStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { DocumentActions } from "@/components/documents/DocumentActions";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/aid")({
  head: () => ({ meta: [{ title: "المساعدات — ثواب" }] }),
  component: Page,
});

const AID_STATUS_OPTIONS = options("aidStatus");
const AID_TYPE_OPTIONS = options("aidType");

// The shared <Select> displays Arabic labels; convert the picked label back to
// its English enum key (or "" for the "الكل" sentinel) before hitting the API.
const toAidStatusKey = (arLabel: string) =>
  arLabel === "الكل" ? "" : (AID_STATUS_OPTIONS.find((o) => o.label === arLabel)?.value ?? "");
const toAidTypeKey = (arLabel: string) =>
  arLabel === "الكل" ? "" : (AID_TYPE_OPTIONS.find((o) => o.label === arLabel)?.value ?? "");

function statusToneLocal(s: string) {
  if (s === AidStatus.DELIVERED) return "success";
  if (s === AidStatus.APPROVED) return "warning";
  if (s === AidStatus.REJECTED) return "destructive";
  if (s === AidStatus.PENDING) return "muted";
  return "info";
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<AidRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AidRecord | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<AidRecord | null>(null);
  const [returnTarget, setReturnTarget] = useState<AidRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");

  const [page, setPage] = useState(1);

  const [apiFilters, setApiFilters] = useState<AidFilters>({
    search: "",
    status: "",
    type: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["aid", apiFilters],
    queryFn: () => getAidRecords(apiFilters),
  });

  const { data: beneficiariesData } = useQuery({
    queryKey: ["beneficiaries-simple"],
    queryFn: () => getBeneficiaries({ status: BeneficiaryStatus.ACTIVE, limit: 200 }),
  });

  const aidRecords = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);
  const beneficiaries = beneficiariesData?.items || [];

  useEffect(() => {
    setPage(1);
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: toAidStatusKey(statusFilter),
      type: toAidTypeKey(typeFilter),
      page: 1,
    }));
  }, [searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    setApiFilters((f) => ({ ...f, page }));
  }, [page]);

  const deleteMutation = useMutation({
    mutationFn: deleteAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم حذف المساعدة بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: approveAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم اعتماد المساعدة بنجاح", "success");
      setApproveTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم رفض المساعدة", "success");
      setRejectTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deliverMutation = useMutation({
    mutationFn: deliverAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم تسليم المساعدة بنجاح", "success");
      setDeliverTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const returnMutation = useMutation({
    mutationFn: returnAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم إرجاع المساعدة للتعديل", "success");
      setReturnTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const buildDoc = async (): Promise<DocumentDefinition> => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await getAidRecords({
      search: searchQuery,
      status: toAidStatusKey(statusFilter),
      type: toAidTypeKey(typeFilter),
      page: 1,
      limit: 100000,
    });
    const rows = res.items;
    const totalAmount = rows.reduce((s: number, r: AidRecord) => s + (r.amount || 0), 0);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter !== "الكل") filters.push({ label: "الحالة", value: statusFilter });
    if (typeFilter !== "الكل") filters.push({ label: "النوع", value: typeFilter });
    return {
      title: "سجل المساعدات المصروفة",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "id", label: "الرقم" },
        { key: "beneficiaryName", label: "المستفيد" },
        { key: "type", label: "النوع" },
        { key: "amount", label: "المبلغ", type: "money" },
        { key: "status", label: "الحالة" },
        { key: "date", label: "التاريخ", type: "date" },
      ],
      rows: rows.map((r: AidRecord) => ({
        id: r.id,
        beneficiaryName: r.beneficiaryName,
        type: label("aidType", r.type),
        amount: r.amount,
        status: label("aidStatus", r.status),
        date: r.date,
      })),
      totals: [
        { label: "إجمالي المبلغ", value: totalAmount, type: "money" },
        { label: "عدد السجلات", value: rows.length, type: "number" },
      ],
      fileBase: `aid-${today}`,
    };
  };

  const openAdd = () => navigate({ to: "/aid/new" });

  const openEdit = (r: AidRecord) =>
    navigate({ to: "/aid/$id/edit", params: { id: r.id } });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleApprove = () => {
    if (approveTarget) {
      approveMutation.mutate({ id: approveTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const handleReject = () => {
    if (rejectTarget) {
      rejectMutation.mutate({ id: rejectTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const handleDeliver = () => {
    if (deliverTarget) {
      deliverMutation.mutate({ id: deliverTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const handleReturn = () => {
    if (returnTarget) {
      returnMutation.mutate({ id: returnTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const stats = [
    { label: "إجمالي السجلات", value: aidRecords.length },
    {
      label: "بانتظار الموافقة",
      value: aidRecords.filter((r: AidRecord) => r.status === AidStatus.PENDING).length,
    },
    {
      label: "معتمد",
      value: aidRecords.filter((r: AidRecord) => r.status === AidStatus.APPROVED).length,
    },
    {
      label: "تم التسليم",
      value: aidRecords.filter((r: AidRecord) => r.status === AidStatus.DELIVERED).length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المساعدات"]}
      title="سجل المساعدات المصروفة"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          <Btn variant="primary" onClick={openAdd}>
            <HandHelping size={15} /> إضافة مساعدة
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums">{s.value}</div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Eye
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
        <Select
          label="الحالة"
          options={["الكل", ...AID_STATUS_OPTIONS.map((o) => o.label)]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="النوع"
          options={["الكل", ...AID_TYPE_OPTIONS.map((o) => o.label)]}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <HandHelping size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="المساعدات"
        count={`${aidRecords.length} سجل`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <HandHelping size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل السجلات"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["aid"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : aidRecords.length === 0 ? (
        <EmptyState
          title="لا توجد مساعدات"
          description="ابدأ بإضافة أول مساعدة"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مساعدة
            </Btn>
          }
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <Table
              columns={["الرقم", "المستفيد", "النوع", "المبلغ", "المشروع", "التاريخ", "الحالة", ""]}
              rows={aidRecords}
              renderRow={(r: AidRecord) => (
                <>
                  <Td className="font-mono text-xs">{r.id}</Td>
                  <Td className="font-semibold">{r.beneficiaryName}</Td>
                  <Td className="text-muted-foreground text-xs">{label("aidType", r.type)}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                  <Td className="text-muted-foreground text-xs">{r.projectName || "—"}</Td>
                  <Td className="text-muted-foreground text-xs">{r.date}</Td>
                  <Td>
                    <Badge tone={statusToneLocal(r.status)}>{label("aidStatus", r.status)}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu actions={getAidActions(r)} />
                  </Td>
                </>
              )}
            />
          </div>

          <div className="lg:hidden space-y-2">
            {aidRecords.map((r: AidRecord) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={statusToneLocal(r.status)}>{label("aidStatus", r.status)}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                </div>
                <div className="font-semibold">{r.beneficiaryName}</div>
                <div className="text-xs text-muted-foreground mt-1">{label("aidType", r.type)}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                  <span className="text-xs text-muted-foreground">{r.projectName || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.date}</div>
                <div className="flex gap-2 mt-2">{getAidMobileActions(r)}</div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-muted-foreground">
                صفحة {page} من {totalPages} | {total} سجل
              </span>
              <div className="flex gap-1">
                <button
                  className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px]"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  السابق
                </button>
                <button
                  className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px]"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المساعدة"
        message="هل أنت متأكد من حذف هذه المساعدة؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="اعتماد المساعدة"
        message={`هل أنت متأكد من اعتماد مساعدة ${approveTarget?.beneficiaryName} بمبلغ ${approveTarget ? fmtSAR(approveTarget.amount) : ""}؟`}
        confirmText="اعتماد"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        title="رفض المساعدة"
        message="هل أنت متأكد من رفض هذه المساعدة؟"
        confirmText="رفض"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!deliverTarget}
        onClose={() => setDeliverTarget(null)}
        onConfirm={handleDeliver}
        title="تسليم المساعدة"
        message={`هل أنت متأكد من تسليم مساعدة ${deliverTarget?.beneficiaryName} بمبلغ ${deliverTarget ? fmtSAR(deliverTarget.amount) : ""}؟`}
        confirmText="تسليم"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        onConfirm={handleReturn}
        title="إرجاع للتعديل"
        message="هل تريد إرجاع هذه المساعدة للتعديل؟"
        confirmText="إرجاع"
        cancelText="إلغاء"
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
              <option>الكل</option>
              {AID_STATUS_OPTIONS.map((o) => (
                <option key={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option>الكل</option>
              {AID_TYPE_OPTIONS.map((o) => (
                <option key={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );

  function getAidActions(r: AidRecord) {
    const actions: any[] = [
      {
        label: "عرض",
        icon: Eye,
        onClick: () => showToast(`${r.beneficiaryName} - ${fmtSAR(r.amount)}`, "info"),
      },
    ];

    if (r.status === AidStatus.PENDING) {
      actions.push(
        { label: "اعتماد", icon: CheckCircle, onClick: () => setApproveTarget(r) },
        {
          label: "رفض",
          icon: XCircle,
          onClick: () => setRejectTarget(r),
          variant: "destructive" as const,
        },
        { label: "تعديل", icon: Edit, onClick: () => openEdit(r) },
        {
          label: "حذف",
          icon: Trash2,
          onClick: () => setDeleteTarget(r.id),
          variant: "destructive" as const,
        },
      );
    }

    if (r.status === AidStatus.APPROVED) {
      actions.push(
        { label: "تسليم", icon: CheckCircle, onClick: () => setDeliverTarget(r) },
        { label: "إرجاع", icon: RotateCcw, onClick: () => setReturnTarget(r) },
      );
    }

    return actions;
  }

  function getAidMobileActions(r: AidRecord) {
    const btns = [];
    if (r.status === AidStatus.PENDING) {
      btns.push(
        <button
          key="approve"
          className="flex-1 rounded-lg bg-success/15 text-success text-xs font-semibold py-2 min-h-[36px]"
          onClick={() => setApproveTarget(r)}
        >
          اعتماد
        </button>,
      );
    }
    if (r.status === AidStatus.APPROVED) {
      btns.push(
        <button
          key="deliver"
          className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold py-2 min-h-[36px]"
          onClick={() => setDeliverTarget(r)}
        >
          تسليم
        </button>,
      );
    }
    return btns;
  }
}
