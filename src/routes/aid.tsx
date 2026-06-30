import { createFileRoute } from "@tanstack/react-router";
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
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getBeneficiaries, type Beneficiary } from "@/lib/api/beneficiaries";
import {
  getAidRecords,
  createAidRecord,
  updateAidRecord,
  deleteAidRecord,
  approveAidRecord,
  rejectAidRecord,
  deliverAidRecord,
  returnAidRecord,
  type AidRecord,
  type AidFilters,
} from "@/lib/api/aid";

export const Route = createFileRoute("/aid")({
  head: () => ({ meta: [{ title: "المساعدات — ثواب" }] }),
  component: Page,
});

function statusToneLocal(s: string) {
  if (s === "تم التسليم") return "success";
  if (s === "معتمد") return "warning";
  if (s === "مرفوض") return "destructive";
  if (s === "بانتظار الموافقة") return "muted";
  return "info";
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<AidRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AidRecord | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<AidRecord | null>(null);
  const [returnTarget, setReturnTarget] = useState<AidRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<AidRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [formBeneficiaryId, setFormBeneficiaryId] = useState("");
  const [formType, setFormType] = useState("مساعدة عاجلة");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");

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
    queryFn: () => getBeneficiaries({ status: "مؤهل", limit: 200 }),
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
      status: statusFilter,
      type: typeFilter,
      page: 1,
    }));
  }, [searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    setApiFilters((f) => ({ ...f, page }));
  }, [page]);

  const createMutation = useMutation({
    mutationFn: createAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم إضافة المساعدة بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateAidRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم تحديث المساعدة بنجاح", "success");
      setFormOpen(false);
      setEditingRecord(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

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

  const openAdd = () => {
    setEditingRecord(null);
    setFormBeneficiaryId("");
    setFormType("مساعدة عاجلة");
    setFormAmount("");
    setFormNotes("");
    setFormOpen(true);
  };

  const openEdit = (r: AidRecord) => {
    setEditingRecord(r);
    setFormBeneficiaryId(r.beneficiaryId);
    setFormType(r.type);
    setFormAmount(String(r.amount));
    setFormNotes(r.notes || "");
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formBeneficiaryId) {
      showToast("يرجى اختيار المستفيد", "error");
      return;
    }
    if (!formAmount) {
      showToast("يرجى إدخال المبلغ", "error");
      return;
    }

    if (editingRecord) {
      updateMutation.mutate({
        id: editingRecord.id,
        beneficiaryId: formBeneficiaryId,
        type: formType,
        amount: parseFloat(formAmount),
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      createMutation.mutate({
        beneficiaryId: formBeneficiaryId,
        type: formType,
        amount: parseFloat(formAmount),
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

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
      value: aidRecords.filter((r: AidRecord) => r.status === "بانتظار الموافقة").length,
    },
    { label: "معتمد", value: aidRecords.filter((r: AidRecord) => r.status === "معتمد").length },
    {
      label: "تم التسليم",
      value: aidRecords.filter((r: AidRecord) => r.status === "تم التسليم").length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المساعدات"]}
      title="سجل المساعدات المصروفة"
      actions={
        <>
          <ExportButton
            data={aidRecords as unknown as Record<string, unknown>[]}
            filename="المساعدات.csv"
          />
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
          options={["الكل", "بانتظار الموافقة", "معتمد", "مرفوض", "تم التسليم"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="النوع"
          options={["الكل", "مساعدة عاجلة", "مساعدة شهرية", "سلة غذائية", "علاج", "كسوة شتوية"]}
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
                  <Td className="text-muted-foreground text-xs">{r.type}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                  <Td className="text-muted-foreground text-xs">{r.projectName || "—"}</Td>
                  <Td className="text-muted-foreground text-xs">{r.date}</Td>
                  <Td>
                    <Badge tone={statusToneLocal(r.status)}>{r.status}</Badge>
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
                  <Badge tone={statusToneLocal(r.status)}>{r.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                </div>
                <div className="font-semibold">{r.beneficiaryName}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.type}</div>
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

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingRecord(null);
        }}
        title={editingRecord ? "تعديل المساعدة" : "إضافة مساعدة"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المستفيد (مؤهل فقط)</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formBeneficiaryId}
            onChange={(e) => setFormBeneficiaryId(e.target.value)}
          >
            <option value="">اختر المستفيد...</option>
            {beneficiaries.map((b: Beneficiary) => (
              <option key={b.id} value={b.id}>
                {b.name} - {b.city}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">النوع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
          >
            <option>مساعدة عاجلة</option>
            <option>مساعدة شهرية</option>
            <option>سلة غذائية</option>
            <option>علاج</option>
            <option>كسوة شتوية</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المبلغ (ر.س)</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="number"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={3}
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="ملاحظات..."
          />
        </div>
      </EntityFormDrawer>

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
              <option>بانتظار الموافقة</option>
              <option>معتمد</option>
              <option>مرفوض</option>
              <option>تم التسليم</option>
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
              <option>مساعدة عاجلة</option>
              <option>مساعدة شهرية</option>
              <option>سلة غذائية</option>
              <option>علاج</option>
              <option>كسوة شتوية</option>
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

    if (r.status === "بانتظار الموافقة") {
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

    if (r.status === "معتمد") {
      actions.push(
        { label: "تسليم", icon: CheckCircle, onClick: () => setDeliverTarget(r) },
        { label: "إرجاع", icon: RotateCcw, onClick: () => setReturnTarget(r) },
      );
    }

    return actions;
  }

  function getAidMobileActions(r: AidRecord) {
    const btns = [];
    if (r.status === "بانتظار الموافقة") {
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
    if (r.status === "معتمد") {
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
