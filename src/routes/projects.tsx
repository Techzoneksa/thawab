import { createFileRoute, Link } from "@tanstack/react-router";
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
import { PROJECTS, fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Download, LayoutGrid, List, Filter, Eye, Pencil, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "المشاريع والبرامج — ثواب" }] }),
  component: Page,
});

function Page() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [projects, setProjects] = useState(PROJECTS);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [managerFilter, setManagerFilter] = useState("الكل");
  const [formName, setFormName] = useState("");
  const [formManager, setFormManager] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formStatus, setFormStatus] = useState("نشط");

  const filtered = projects.filter((p) => {
    if (statusFilter !== "الكل" && p.status !== statusFilter) return false;
    if (managerFilter !== "الكل" && p.manager !== managerFilter) return false;
    return true;
  });

  const openAdd = () => {
    setEditingId(null);
    setFormName("");
    setFormManager("");
    setFormBudget("");
    setFormStart("");
    setFormEnd("");
    setFormStatus("نشط");
    setAddOpen(true);
  };

  const openEdit = (p: (typeof PROJECTS)[0]) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormManager(p.manager);
    setFormBudget(String(p.budget));
    setFormStart(p.start);
    setFormEnd(p.end);
    setFormStatus(p.status);
    setAddOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: formName || p.name,
                manager: formManager || p.manager,
                budget: Number(formBudget) || p.budget,
                start: formStart || p.start,
                end: formEnd || p.end,
                status: formStatus,
              }
            : p,
        ),
      );
      showToast("تم تحديث المشروع بنجاح", "success");
    } else {
      const id = `PRJ-${String(projects.length + 22).padStart(3, "0")}`;
      const p = {
        id,
        name: formName,
        manager: formManager,
        budget: Number(formBudget) || 0,
        spent: 0,
        donations: 0,
        beneficiaries: 0,
        progress: 0,
        status: formStatus,
        start: formStart,
        end: formEnd,
      };
      setProjects((prev) => [...prev, p]);
      showToast("تم إضافة المشروع بنجاح", "success");
    }
    setAddOpen(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget));
      showToast("تم حذف المشروع بنجاح", "success");
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    showToast(`تم تغيير حالة المشروع إلى ${newStatus}`, "success");
  };

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
      <FilterBar>
        <Select
          label="الحالة"
          options={["الكل", "نشط", "مكتمل", "متأخر", "مقترح"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="المدير"
          options={["الكل", "فهد العتيبي", "سارة الزهراني", "خالد الدوسري"]}
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
        />
        <Select label="نوع التمويل" options={["الكل", "مقيد بمشروع", "غير مقيد", "منحة", "وقف"]} />
        <Select label="الفرع" options={["جميع الفروع", "الرياض", "جدة", "الدمام"]} />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center justify-between mb-3">
        <h3 className="text-base font-bold">المشاريع ({filtered.length})</h3>
        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
          </Btn>
          <div className="flex rounded-lg border overflow-hidden">
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
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {filtered.map((p) => (
            <div key={p.id}>
              <Card className="p-4 lg:p-5 hover:border-primary hover:shadow-elevated transition-all active:scale-[0.98]">
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

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => handleStatusChange(p.id, "نشط")}
                    className={`px-2 py-0.5 text-[10px] rounded ${p.status === "نشط" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-primary/10"}`}
                  >
                    نشط
                  </button>
                  <button
                    onClick={() => handleStatusChange(p.id, "متوقف")}
                    className={`px-2 py-0.5 text-[10px] rounded ${p.status === "متوقف" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground hover:bg-destructive/10"}`}
                  >
                    متوقف
                  </button>
                  <button
                    onClick={() => handleStatusChange(p.id, "مكتمل")}
                    className={`px-2 py-0.5 text-[10px] rounded ${p.status === "مكتمل" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground hover:bg-success/10"}`}
                  >
                    مكتمل
                  </button>
                </div>

                <div className="mt-3 lg:mt-4 flex items-center justify-between text-xs text-muted-foreground border-t pt-2 lg:pt-3">
                  <span>{fmtNum(p.beneficiaries)} مستفيد</span>
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
            </div>
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
          rows={filtered}
          renderRow={(p) => (
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
              <Td className="tabular-nums">{fmtNum(p.beneficiaries)}</Td>
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
                      onClick: () =>
                        showToast(
                          `${p.name} - ${p.status} - الميزانية: ${fmtSAR(p.budget)}`,
                          "info",
                        ),
                    },
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(p) },
                    {
                      label: "حذف",
                      icon: Trash2,
                      onClick: () => setDeleteTarget(p.id),
                      variant: "destructive",
                    },
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(p) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
              <Card className="p-3 hover:border-primary transition-colors active:scale-[0.98]">
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
                  <span>{fmtNum(p.beneficiaries)} مستفيد</span>
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
        onClose={() => setAddOpen(false)}
        title={editingId ? "تعديل المشروع" : "إضافة مشروع جديد"}
        onSave={handleSave}
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
            <option>نشط</option>
            <option>متوقف</option>
            <option>مكتمل</option>
            <option>مقترح</option>
          </select>
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
              <option>نشط</option>
              <option>مكتمل</option>
              <option>متوقف</option>
              <option>مقترح</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المدير</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>فهد العتيبي</option>
              <option>سارة الزهراني</option>
              <option>خالد الدوسري</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
