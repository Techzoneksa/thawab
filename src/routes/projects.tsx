import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, Download, LayoutGrid, List, Filter, Eye, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
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
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  changeProjectStatus,
  type Project,
  type ProjectFilters,
} from "@/lib/api/projects";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع والبرامج — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [searchQuery, setSearchQuery] = useState("");
  const [formName, setFormName] = useState("");
  const [formManager, setFormManager] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formStatus, setFormStatus] = useState("مخطط");
  const [formDescription, setFormDescription] = useState("");

  const [apiFilters, setApiFilters] = useState<ProjectFilters>({
    search: "",
    status: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", apiFilters],
    queryFn: () => getProjects(apiFilters),
  });

  const projects = data?.items || [];

  useEffect(() => {
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusFilter,
    }));
  }, [searchQuery, statusFilter]);

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("تم إضافة المشروع بنجاح", "success");
      setAddOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("تم تحديث المشروع بنجاح", "success");
      setAddOpen(false);
      setEditingProject(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

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
    mutationFn: changeProjectStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("تم تغيير حالة المشروع بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setEditingProject(null);
    setFormName("");
    setFormManager("");
    setFormBudget("");
    setFormStart("");
    setFormEnd("");
    setFormStatus("مخطط");
    setFormDescription("");
    setAddOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setFormName(p.name);
    setFormManager(p.manager);
    setFormBudget(String(p.budget));
    setFormStart(p.startDate);
    setFormEnd(p.endDate);
    setFormStatus(p.status);
    setFormDescription(p.description || "");
    setAddOpen(true);
  };

  const handleSave = () => {
    if (editingProject) {
      updateMutation.mutate({
        id: editingProject.id,
        name: formName,
        manager: formManager,
        budget: parseFloat(formBudget) || 0,
        startDate: formStart,
        endDate: formEnd,
        status: formStatus,
        description: formDescription,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      createMutation.mutate({
        name: formName,
        manager: formManager,
        budget: parseFloat(formBudget) || 0,
        startDate: formStart,
        endDate: formEnd,
        status: formStatus,
        description: formDescription,
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

  const handleStatusChange = (id: string, newStatus: string) => {
    statusMutation.mutate({ id, status: newStatus, userId: user?.id, userName: user?.name });
  };

  const stats = [
    { label: "إجمالي المشاريع", value: fmtNum(projects.length) },
    { label: "مشاريع نشطة", value: projects.filter((p: Project) => p.status === "نشط").length },
    { label: "مشاريع مكتملة", value: projects.filter((p: Project) => p.status === "مكتمل").length },
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
          <ExportButton data={projects} filename="المشاريع.csv" />
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
            placeholder="بحث بالمشروع أو المدير..."
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
                  <div className="text-[11px] text-muted-foreground font-mono">{p.id}</div>
                  <h3 className="font-bold text-sm lg:text-base mt-0.5 truncate">{p.name}</h3>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    المدير: {p.manager}
                  </div>
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
                  <button
                    onClick={() => openEdit(p)}
                    className="text-primary text-xs font-semibold"
                  >
                    تعديل
                  </button>
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
                <div className="text-[10px] text-muted-foreground font-mono">{p.id}</div>
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
                  actions={[
                    {
                      label: "عرض",
                      icon: Eye,
                      onClick: () => showToast(`${p.name} - ${p.status}`, "info"),
                    },
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(p) },
                    {
                      label: "حذف",
                      icon: Trash2,
                      onClick: () => setDeleteTarget(p.id),
                      variant: "destructive" as const,
                    },
                  ]}
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
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        openEdit(p);
                      }}
                      className="text-primary"
                    >
                      تعديل
                    </button>
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

      <EntityFormDrawer
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditingProject(null);
        }}
        title={editingProject ? "تعديل المشروع" : "إضافة مشروع جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="اسم المشروع"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المدير</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formManager}
            onChange={(e) => setFormManager(e.target.value)}
            placeholder="مدير المشروع"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الميزانية (ر.س)</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="number"
            value={formBudget}
            onChange={(e) => setFormBudget(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">تاريخ البدء</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formStart}
            onChange={(e) => setFormStart(e.target.value)}
            placeholder="1446/01/01"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">تاريخ النهاية</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formEnd}
            onChange={(e) => setFormEnd(e.target.value)}
            placeholder="1446/12/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
          >
            <option value="مخطط">مخطط</option>
            <option value="نشط">نشط</option>
            <option value="متوقف">متوقف</option>
            <option value="مكتمل">مكتمل</option>
            <option value="ملغي">ملغي</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الوصف</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={3}
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="وصف المشروع..."
          />
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المشروع"
        message="هل أنت متأكد من حذف هذا المشروع؟"
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
              <option>الكل</option>
              <option>مخطط</option>
              <option>نشط</option>
              <option>متوقف</option>
              <option>مكتمل</option>
              <option>ملغي</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
