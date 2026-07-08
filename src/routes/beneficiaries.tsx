import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import {
  Plus,
  LayoutGrid,
  List,
  Filter,
  Search,
  UserPlus,
  Eye,
  Pencil,
  Trash2,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Pause,
  Play,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  PrintButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getBeneficiaries,
  deleteBeneficiary,
  reviewBeneficiary,
  qualifyBeneficiary,
  disqualifyBeneficiary,
  suspendBeneficiary,
  reactivateBeneficiary,
  ELIGIBILITY_STATUSES,
  type Beneficiary,
  type EligibilityStatus,
  type BeneficiaryFilters,
} from "@/lib/api/beneficiaries";

export const Route = createFileRoute("/beneficiaries")({
  head: () => ({ meta: [{ title: "المستفيدون — ثواب" }] }),
  component: Page,
});

const BENEFICIARY_CATEGORIES = ["الكل", "أيتام", "أرامل", "أسر محتاجة", "مرضى", "أسر منتجة"];
const CITIES = ["الكل", "الرياض", "جدة", "الدمام", "أبها", "الطائف", "المدينة المنورة"];

type WorkflowAction = "review" | "qualify" | "disqualify" | "suspend" | "reactivate";

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<{
    id: string;
    name: string;
    action: WorkflowAction;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [page, setPage] = useState(1);

  const [apiFilters, setApiFilters] = useState<BeneficiaryFilters>({
    search: "",
    status: "",
    category: "",
    city: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["beneficiaries", apiFilters],
    queryFn: () => getBeneficiaries(apiFilters),
  });

  const beneficiaries = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  useEffect(() => {
    setPage(1);
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusFilter,
      category: categoryFilter,
      city: cityFilter,
      page: 1,
    }));
  }, [searchQuery, statusFilter, categoryFilter, cityFilter]);

  useEffect(() => {
    setApiFilters((f) => ({ ...f, page }));
  }, [page]);

  const deleteMutation = useMutation({
    mutationFn: deleteBeneficiary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم حذف المستفيد بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const workflowMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: WorkflowAction;
      userId?: string;
      userName?: string;
    }) => {
      const fns = {
        review: reviewBeneficiary,
        qualify: qualifyBeneficiary,
        disqualify: disqualifyBeneficiary,
        suspend: suspendBeneficiary,
        reactivate: reactivateBeneficiary,
      };
      return fns[vars.action]({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiary"] });
      queryClient.invalidateQueries({ queryKey: ["beneficiaries-simple"] });
      const labels: Record<WorkflowAction, string> = {
        review: "تم إرسال المستفيد للمراجعة",
        qualify: "تم تأهيل المستفيد",
        disqualify: "تم عدم تأهيل المستفيد",
        suspend: "تم إيقاف المستفيد",
        reactivate: "تم إعادة تفعيل المستفيد",
      };
      showToast(labels[vars.action], "success");
      setWorkflowTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/beneficiaries/new" });

  const openEdit = (b: Beneficiary) =>
    navigate({ to: "/beneficiaries/$id/edit", params: { id: b.id } });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleWorkflowConfirm = () => {
    if (workflowTarget) {
      workflowMutation.mutate({
        id: workflowTarget.id,
        action: workflowTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const stats = [
    { label: "إجمالي المستفيدين", value: fmtNum(total) },
    {
      label: "مؤهلين",
      value: beneficiaries.filter((b: Beneficiary) => b.status === "مؤهل").length,
    },
    {
      label: "قيد المراجعة",
      value: beneficiaries.filter((b: Beneficiary) => b.status === "قيد المراجعة").length,
    },
    {
      label: "موقوفين",
      value: beneficiaries.filter((b: Beneficiary) => b.status === "موقوف").length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المستفيدون"]}
      title="قاعدة بيانات المستفيدين"
      actions={
        <>
          <div className="hidden lg:flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-2 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-3 py-2 ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <List size={15} />
            </button>
          </div>
          <ExportButton
            data={beneficiaries as unknown as Record<string, unknown>[]}
            filename="المستفيدون.csv"
          />
          <PrintButton />
          <Btn variant="primary" onClick={openAdd}>
            <UserPlus size={15} /> إضافة مستفيد
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالاسم، رقم الملف، الهوية، الجوال..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الفئة"
          options={BENEFICIARY_CATEGORIES}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        />
        <Select
          label="الحالة"
          options={["الكل", ...ELIGIBILITY_STATUSES]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="المدينة"
          options={CITIES}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
        />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث عن مستفيد..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="المستفيدون"
        count={`${fmtNum(total)} مستفيد`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <UserPlus size={15} />
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
          description="حدث خطأ أثناء تحميل المستفيدين"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["beneficiaries"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : beneficiaries.length === 0 ? (
        <EmptyState
          title="لا توجد مستفيدين"
          description="ابدأ بإضافة أول مستفيد"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مستفيد
            </Btn>
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {beneficiaries.map((b: Beneficiary) => (
            <Card key={b.id} className="p-4 lg:p-5 hover:border-primary transition-all">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-info/15 text-info text-base font-bold">
                  {b.name?.[0] || "؟"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm lg:text-base truncate">{b.name}</h3>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {b.fileNumber || b.id}
                      </div>
                    </div>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {b.category}
                    {b.city ? ` · ${b.city}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/60 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-muted-foreground">الأفراد</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5">
                    {fmtNum(b.familyMembers || 1)}
                  </div>
                </div>
                <div className="rounded-lg bg-success/10 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-success">الدخل</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5 text-success">
                    {fmtSAR(b.monthlyIncome || 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-warning/15 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-warning-foreground">المساعدات</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5">
                    {fmtNum(b.aidCount || 0)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2 lg:pt-3">
                <span className="truncate">{b.phone || "—"}</span>
                <div className="flex gap-2">
                  <Link
                    to="/beneficiaries/$id"
                    params={{ id: b.id }}
                    className="text-info text-xs font-semibold"
                  >
                    تفاصيل
                  </Link>
                  <button
                    onClick={() => openEdit(b)}
                    className="text-primary text-xs font-semibold"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => setDeleteTarget(b.id)}
                    className="text-destructive text-xs font-semibold"
                  >
                    حذف
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <MobileTable
          columns={["رقم الملف", "الاسم", "الفئة", "الجوال", "المدينة", "الأفراد", "الحالة", ""]}
          rows={beneficiaries}
          renderRow={(b: Beneficiary) => (
            <>
              <Td className="font-mono text-xs">{b.fileNumber || b.id}</Td>
              <Td>
                <Link
                  to="/beneficiaries/$id"
                  params={{ id: b.id }}
                  className="font-semibold hover:text-primary"
                >
                  {b.name}
                </Link>
              </Td>
              <Td>
                <Badge tone="info">{b.category}</Badge>
              </Td>
              <Td className="text-muted-foreground">{b.phone || "—"}</Td>
              <Td className="text-muted-foreground">{b.city || "—"}</Td>
              <Td className="tabular-nums">{fmtNum(b.familyMembers || 1)}</Td>
              <Td>
                <Badge tone={statusTone(b.status)}>{b.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getBeneficiaryActions(b, setWorkflowTarget, openEdit, setDeleteTarget)}
                />
              </Td>
            </>
          )}
          mobileCard={(b: Beneficiary) => (
            <Link key={b.id} to="/beneficiaries/$id" params={{ id: b.id }}>
              <Card className="p-3 hover:border-primary transition-colors">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-info/15 text-info text-sm font-bold">
                    {b.name?.[0] || "؟"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.fileNumber || b.id} · {b.category}
                        </div>
                      </div>
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {b.city || "—"} · {b.phone || "—"}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            openEdit(b);
                          }}
                          className="text-primary text-xs"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setDeleteTarget(b.id);
                          }}
                          className="text-destructive text-xs"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages} | {fmtNum(total)} مستفيد
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المستفيد"
        message="هل أنت متأكد من حذف هذا المستفيد؟ سيتم الحذف فقط إذا لم يكن لديه مساعدات مستلمة أو قيد المعالجة."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!workflowTarget}
        onClose={() => setWorkflowTarget(null)}
        onConfirm={handleWorkflowConfirm}
        title={workflowTarget ? getWorkflowTitle(workflowTarget.action) : ""}
        message={
          workflowTarget
            ? `هل تريد ${getWorkflowVerb(workflowTarget.action)} المستفيد "${workflowTarget.name}"؟`
            : ""
        }
        confirmText={workflowTarget ? getWorkflowConfirm(workflowTarget.action) : "تأكيد"}
        cancelText="إلغاء"
        variant={getWorkflowVariant(workflowTarget?.action)}
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {BENEFICIARY_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>الكل</option>
              {ELIGIBILITY_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function getBeneficiaryActions(
  b: Beneficiary,
  setWorkflowTarget: (t: { id: string; name: string; action: WorkflowAction }) => void,
  openEdit: (b: Beneficiary) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [];

  // Workflow actions based on current status
  if (b.status === "جديد") {
    actions.push({
      label: "إرسال للمراجعة",
      icon: ClipboardCheck,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "review" }),
    });
  }

  if (b.status === "قيد المراجعة") {
    actions.push({
      label: "تأهيل",
      icon: CheckCircle,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "qualify" }),
    });
    actions.push({
      label: "عدم تأهيل",
      icon: XCircle,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "disqualify" }),
      variant: "destructive",
    });
  }

  if (b.status === "مؤهل") {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "suspend" }),
    });
  }

  if (b.status === "موقوف") {
    actions.push({
      label: "إعادة تفعيل",
      icon: Play,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "reactivate" }),
    });
  }

  if (b.status === "غير مؤهل") {
    actions.push({
      label: "إرسال للمراجعة",
      icon: ClipboardCheck,
      onClick: () => setWorkflowTarget({ id: b.id, name: b.name, action: "review" }),
    });
  }

  actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(b) });

  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => setDeleteTarget(b.id),
    variant: "destructive",
  });

  return actions;
}

function getWorkflowTitle(action: WorkflowAction): string {
  const titles: Record<WorkflowAction, string> = {
    review: "إرسال للمراجعة",
    qualify: "تأهيل المستفيد",
    disqualify: "عدم تأهيل المستفيد",
    suspend: "إيقاف المستفيد",
    reactivate: "إعادة تفعيل المستفيد",
  };
  return titles[action];
}

function getWorkflowVerb(action: WorkflowAction): string {
  const verbs: Record<WorkflowAction, string> = {
    review: "إرسال للمراجعة",
    qualify: "تأهيل",
    disqualify: "عدم تأهيل",
    suspend: "إيقاف",
    reactivate: "إعادة تفعيل",
  };
  return verbs[action];
}

function getWorkflowConfirm(action: WorkflowAction): string {
  const texts: Record<WorkflowAction, string> = {
    review: "إرسال",
    qualify: "تأهيل",
    disqualify: "عدم تأهيل",
    suspend: "إيقاف",
    reactivate: "إعادة التفعيل",
  };
  return texts[action];
}

function getWorkflowVariant(action?: WorkflowAction): "default" | "destructive" {
  if (action === "disqualify" || action === "suspend") return "destructive";
  return "default";
}
