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
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  Plus,
  LayoutGrid,
  List,
  Filter,
  Eye,
  Pencil,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  XCircle,
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
  getProjects,
  deleteProject,
  activateProject,
  pauseProject,
  completeProject,
  cancelProject,
  type Project,
  type ProjectFilters,
} from "@/lib/api/projects";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع والبرامج — ثواب" }] }),
  component: Page,
});

const PROJECT_CATEGORIES = ["الكل", "إغاثي", "تنموي", "تعليمي", "صحي", "اجتماعي"];
const PROJECT_BRANCHES = ["الكل", "الفرع الرئيسي", "فرع مكة", "فرع الرياض", "فرع جدة"];
const PROJECT_TYPES = ["الكل", "برنامج موسمي", "مشروع مستدام", "حملة طارئة", "مبادرة مجتمعية"];

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    name: string;
    action: "activate" | "pause" | "complete" | "cancel";
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [branchFilter, setBranchFilter] = useState("الكل");
  const [page, setPage] = useState(1);

  const [apiFilters, setApiFilters] = useState<ProjectFilters>({
    search: "",
    status: "",
    category: "",
    branch: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", apiFilters],
    queryFn: () => getProjects(apiFilters),
  });

  const projects = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  useEffect(() => {
    setPage(1);
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusFilter,
      category: categoryFilter,
      branch: branchFilter,
      page: 1,
    }));
  }, [searchQuery, statusFilter, categoryFilter, branchFilter]);

  useEffect(() => {
    setApiFilters((f) => ({ ...f, page }));
  }, [page]);

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("تم حذف المشروع بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "activate" | "pause" | "complete" | "cancel";
      userId?: string;
      userName?: string;
    }) => {
      const fns = {
        activate: activateProject,
        pause: pauseProject,
        complete: completeProject,
        cancel: cancelProject,
      };
      return fns[vars.action]({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      const labels = {
        activate: "تم تفعيل المشروع",
        pause: "تم إيقاف المشروع",
        complete: "تم إكمال المشروع",
        cancel: "تم إلغاء المشروع",
      };
      showToast(labels[vars.action], "success");
      setStatusTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/projects/new" });

  const openEdit = (p: Project) =>
    navigate({ to: "/projects/$id/edit", params: { id: p.id } });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleStatusConfirm = () => {
    if (statusTarget) {
      statusMutation.mutate({
        id: statusTarget.id,
        action: statusTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const isReadOnly = (p: Project) => p.status === "مكتمل" || p.status === "ملغي";

  const stats = [
    { label: "إجمالي المشاريع", value: fmtNum(total) },
    { label: "مشاريع نشطة", value: projects.filter((p: Project) => p.status === "نشط").length },
    {
      label: "مشاريع مكتملة",
      value: projects.filter((p: Project) => p.status === "مكتمل").length,
    },
    {
      label: "الميزانية الكلية",
      value: fmtSAR(projects.reduce((s: number, p: Project) => s + p.budget, 0)),
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المشاريع والبرامج"]}
      title="المشاريع والبرامج"
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
            data={projects as unknown as Record<string, unknown>[]}
            filename="المشاريع.csv"
          />
          <PrintButton />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> مشروع جديد
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
          <Eye
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالاسم أو الكود أو المدير..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", "مخطط", "نشط", "متوقف", "مكتمل", "ملغي"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="التصنيف"
          options={PROJECT_CATEGORIES}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        />
        <Select
          label="الفرع"
          options={PROJECT_BRANCHES}
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
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

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل المشاريع"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["projects"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : projects.length === 0 ? (
        <EmptyState
          title="لا توجد مشاريع"
          description="ابدأ بإضافة أول مشروع"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مشروع
            </Btn>
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {projects.map((p: Project) => (
            <Card key={p.id} className="p-4 lg:p-5 hover:border-primary transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {p.code || p.id}
                  </div>
                  <h3 className="font-bold text-sm lg:text-base mt-0.5 truncate">{p.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    المدير: {p.manager}
                  </div>
                  {p.category && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {p.category}
                      {p.branch && ` · ${p.branch}`}
                    </div>
                  )}
                </div>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </div>

              <div className="mt-3 lg:mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>نسبة الإنجاز</span>
                  <span className="font-bold tabular-nums">{p.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-primary to-info"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 lg:mt-4">
                <div className="rounded-lg bg-muted/60 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-muted-foreground">الميزانية</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5">
                    {fmtSAR(p.budget)}
                  </div>
                </div>
                <div className="rounded-lg bg-success/10 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-success">التبرعات</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5 text-success">
                    {fmtSAR(p.donations)}
                  </div>
                </div>
                <div className="rounded-lg bg-warning/15 p-2 text-center">
                  <div className="text-[9px] lg:text-[10px] text-warning-foreground">المنصرف</div>
                  <div className="text-[11px] lg:text-xs font-bold tabular-nums mt-0.5">
                    {fmtSAR(p.spent)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2 lg:pt-3">
                <span>{fmtNum(p.beneficiaryCount)} مستفيد</span>
                <div className="flex gap-2">
                  <Link
                    to="/projects/$id"
                    params={{ id: p.id }}
                    className="text-info text-xs font-semibold"
                  >
                    تفاصيل
                  </Link>
                  {!isReadOnly(p) && (
                    <button
                      onClick={() => openEdit(p)}
                      className="text-primary text-xs font-semibold"
                    >
                      تعديل
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(p.id)}
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
          columns={[
            "المشروع",
            "المدير",
            "الميزانية",
            "المنصرف",
            "التبرعات",
            "المستفيدون",
            "الإنجاز",
            "الحالة",
            "",
          ]}
          rows={projects}
          renderRow={(p: Project) => (
            <>
              <Td>
                <Link
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="font-semibold hover:text-primary"
                >
                  {p.name}
                </Link>
                <div className="text-[10px] text-muted-foreground font-mono">{p.code || p.id}</div>
              </Td>
              <Td className="text-muted-foreground">{p.manager}</Td>
              <Td className="tabular-nums">{fmtSAR(p.budget)}</Td>
              <Td className="tabular-nums">{fmtSAR(p.spent)}</Td>
              <Td className="tabular-nums text-success font-semibold">{fmtSAR(p.donations)}</Td>
              <Td className="tabular-nums">{fmtNum(p.beneficiaryCount)}</Td>
              <Td>
                <div className="flex items-center gap-2 min-w-[140px]">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="text-xs">{p.progress}%</span>
                </div>
              </Td>
              <Td>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getProjectActions(p, setStatusTarget, openEdit, setDeleteTarget)}
                />
              </Td>
            </>
          )}
          mobileCard={(p: Project) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
              <Card className="p-3 hover:border-primary transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.manager}</div>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-primary to-info"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold tabular-nums">{p.progress}%</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-muted/50 p-1.5">
                    <span className="text-muted-foreground">ميزانية</span>
                    <br />
                    <span className="font-bold tabular-nums">{fmtSAR(p.budget)}</span>
                  </div>
                  <div className="rounded bg-success/10 p-1.5">
                    <span className="text-success">تبرعات</span>
                    <br />
                    <span className="font-bold tabular-nums">{fmtSAR(p.donations)}</span>
                  </div>
                  <div className="rounded bg-warning/15 p-1.5">
                    <span className="text-warning-foreground">منصرف</span>
                    <br />
                    <span className="font-bold tabular-nums">{fmtSAR(p.spent)}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex justify-between items-center">
                  <span>{fmtNum(p.beneficiaryCount)} مستفيد</span>
                  <div className="flex gap-2">
                    {!isReadOnly(p) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          openEdit(p);
                        }}
                        className="text-primary"
                      >
                        تعديل
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteTarget(p.id);
                      }}
                      className="text-destructive"
                    >
                      حذف
                    </button>
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
            صفحة {page} من {totalPages} | {total} مشروع
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
        title="حذف المشروع"
        message="هل أنت متأكد من حذف هذا المشروع؟ لا يمكن حذف مشروع مرتبط بتبرعات أو مساعدات."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleStatusConfirm}
        title={statusTarget ? getStatusTitle(statusTarget.action) : ""}
        message={
          statusTarget
            ? `هل تريد ${getStatusVerb(statusTarget.action)} مشروع "${statusTarget.name}"؟`
            : ""
        }
        confirmText={statusTarget ? getStatusConfirm(statusTarget.action) : ""}
        cancelText="إلغاء"
        variant={statusTarget?.action === "cancel" ? "destructive" : "default"}
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
              <option>مخطط</option>
              <option>نشط</option>
              <option>متوقف</option>
              <option>مكتمل</option>
              <option>ملغي</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفرع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              {PROJECT_BRANCHES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function getProjectActions(
  p: Project,
  setStatusTarget: (t: any) => void,
  openEdit: (p: Project) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: any[] = [
    {
      label: "عرض التفاصيل",
      icon: Eye,
      onClick: () => showToast(`مشروع: ${p.name} · ${p.status}`, "info"),
    },
  ];

  if (p.status !== "مكتمل" && p.status !== "ملغي") {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(p) });
  }

  // Workflow actions based on current status
  if (p.status === "مخطط" || p.status === "متوقف") {
    actions.push({
      label: "تفعيل",
      icon: Play,
      onClick: () => setStatusTarget({ id: p.id, name: p.name, action: "activate" }),
    });
  }

  if (p.status === "نشط") {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () => setStatusTarget({ id: p.id, name: p.name, action: "pause" }),
    });
    actions.push({
      label: "إكمال",
      icon: CheckCircle,
      onClick: () => setStatusTarget({ id: p.id, name: p.name, action: "complete" }),
    });
  }

  if (p.status !== "ملغي" && p.status !== "مكتمل") {
    actions.push({
      label: "إلغاء",
      icon: XCircle,
      onClick: () => setStatusTarget({ id: p.id, name: p.name, action: "cancel" }),
      variant: "destructive" as const,
    });
  }

  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => setDeleteTarget(p.id),
    variant: "destructive" as const,
  });

  return actions;
}

function getStatusTitle(action: string): string {
  const titles: Record<string, string> = {
    activate: "تفعيل المشروع",
    pause: "إيقاف المشروع",
    complete: "إكمال المشروع",
    cancel: "إلغاء المشروع",
  };
  return titles[action] || "تغيير الحالة";
}

function getStatusVerb(action: string): string {
  const verbs: Record<string, string> = {
    activate: "تفعيل",
    pause: "إيقاف",
    complete: "إكمال",
    cancel: "إلغاء",
  };
  return verbs[action] || "تغيير";
}

function getStatusConfirm(action: string): string {
  const texts: Record<string, string> = {
    activate: "تفعيل",
    pause: "إيقاف",
    complete: "إكمال",
    cancel: "إلغاء",
  };
  return texts[action] || "تأكيد";
}
