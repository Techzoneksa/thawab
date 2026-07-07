import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Search, Filter, Eye, Pencil, Trash2, Pause, Play } from "lucide-react";
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
  getCostCenters,
  createCostCenter,
  updateCostCenter,
  deleteCostCenter,
  deactivateCostCenter,
  activateCostCenter,
  COST_CENTER_STATUSES,
  type CostCenter,
  type CostCenterStatus,
} from "@/lib/api/cost-centers";

export const Route = createFileRoute("/finance/cost-centers")({
  head: () => ({ meta: [{ title: "مراكز التكلفة — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    id: string;
    name: string;
    action: "deactivate" | "activate";
  } | null>(null);

  // Form
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formManager, setFormManager] = useState("");
  const [formBudget, setFormBudget] = useState("0");
  const [formSpent, setFormSpent] = useState("0");
  const [formStatus, setFormStatus] = useState<CostCenterStatus>("نشط");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["cost-centers", { search: searchQuery, status: statusFilter }],
    queryFn: () => getCostCenters({ search: searchQuery, status: statusFilter }),
  });

  const costCenters = data?.items || [];
  const total = data?.total || 0;

  const openAdd = () => {
    setEditing(null);
    setFormCode("");
    setFormName("");
    setFormManager("");
    setFormBudget("0");
    setFormSpent("0");
    setFormStatus("نشط");
    setFormDescription("");
    setFormNotes("");
    setAddOpen(true);
  };

  const openEdit = (c: CostCenter) => {
    setEditing(c);
    setFormCode(c.code);
    setFormName(c.name);
    setFormManager(c.manager);
    setFormBudget(String(c.budget));
    setFormSpent(String(c.spent));
    setFormStatus(c.status as CostCenterStatus);
    setFormDescription(c.description || "");
    setFormNotes(c.notes || "");
    setAddOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: createCostCenter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast("تم إضافة مركز التكلفة بنجاح", "success");
      setAddOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateCostCenter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast("تم تحديث مركز التكلفة بنجاح", "success");
      setAddOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCostCenter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast("تم حذف مركز التكلفة بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      action: "deactivate" | "activate";
      userId?: string;
      userName?: string;
    }) => {
      const fn = vars.action === "deactivate" ? deactivateCostCenter : activateCostCenter;
      return fn({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
      showToast(
        vars.action === "deactivate" ? "تم إيقاف مركز التكلفة" : "تم تفعيل مركز التكلفة",
        "success",
      );
      setStatusTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = () => {
    if (!formCode.trim()) return showToast("يرجى إدخال رمز المركز", "error");
    if (!formName.trim()) return showToast("يرجى إدخال اسم المركز", "error");
    const payload = {
      code: formCode,
      name: formName,
      manager: formManager,
      budget: parseFloat(formBudget) || 0,
      spent: parseFloat(formSpent) || 0,
      status: formStatus,
      description: formDescription,
      notes: formNotes,
      userId: user?.id,
      userName: user?.name,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

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

  const stats = [
    { label: "إجمالي المراكز", value: fmtNum(total) },
    {
      label: "مراكز نشطة",
      value: costCenters.filter((c: CostCenter) => c.status === "نشط").length,
    },
    {
      label: "إجمالي الموازنات",
      value: fmtSAR(costCenters.reduce((s: number, c: CostCenter) => s + c.budget, 0)),
    },
    {
      label: "إجمالي المصروف",
      value: fmtSAR(costCenters.reduce((s: number, c: CostCenter) => s + c.spent, 0)),
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "مراكز التكلفة"]}
      title="مراكز التكلفة"
      actions={
        <>
          <ExportButton
            data={costCenters as unknown as Record<string, unknown>[]}
            filename="مراكز_التكلفة.csv"
          />
          <PrintButton />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> مركز جديد
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
            placeholder="بحث بالرمز أو الاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...COST_CENTER_STATUSES]}
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

      <MobilePageHeader
        title="مراكز التكلفة"
        count={`${fmtNum(total)} مركز`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
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
          description="حدث خطأ أثناء تحميل مراكز التكلفة"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["cost-centers"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : costCenters.length === 0 ? (
        <EmptyState
          title="لا توجد مراكز تكلفة"
          description="ابدأ بإضافة أول مركز"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مركز
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرمز", "الاسم", "المسؤول", "الموازنة", "المصروف", "الحالة", ""]}
          rows={costCenters}
          renderRow={(c: CostCenter) => {
            const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
            return (
              <>
                <Td className="font-mono text-xs">{c.code}</Td>
                <Td className="font-semibold">{c.name}</Td>
                <Td className="text-muted-foreground">{c.manager || "—"}</Td>
                <Td className="tabular-nums">{fmtSAR(c.budget)}</Td>
                <Td>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{pct}%</span>
                  </div>
                </Td>
                <Td>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={getCostCenterActions(c, setStatusTarget, openEdit, setDeleteTarget)}
                  />
                </Td>
              </>
            );
          }}
          mobileCard={(c: CostCenter) => {
            const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {c.code} · {c.manager || "—"}
                    </div>
                  </div>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-bold">{pct}%</span>
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">الموازنة: {fmtSAR(c.budget)}</span>
                  <span className="font-bold">المصروف: {fmtSAR(c.spent)}</span>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-primary text-xs font-semibold"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    className="text-destructive text-xs font-semibold"
                  >
                    حذف
                  </button>
                </div>
              </Card>
            );
          }}
        />
      )}

      <EntityFormDrawer
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل مركز التكلفة" : "إضافة مركز تكلفة جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الرمز *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder="CC-100"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المسؤول</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formManager}
            onChange={(e) => setFormManager(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الموازنة (ر.س)</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formBudget}
              onChange={(e) => setFormBudget(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المصروف (ر.س)</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formSpent}
              onChange={(e) => setFormSpent(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value as CostCenterStatus)}
          >
            {COST_CENTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الوصف</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={2}
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
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
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف مركز التكلفة"
        message="لا يمكن حذف مركز تكلفة مستخدم في قيود أو موازنات. أوقف المركز بدلاً من ذلك."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={handleStatusConfirm}
        title={
          statusTarget
            ? statusTarget.action === "deactivate"
              ? "إيقاف مركز التكلفة"
              : "تفعيل مركز التكلفة"
            : ""
        }
        message={
          statusTarget
            ? `هل تريد ${statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل"} مركز التكلفة "${statusTarget.name}"؟`
            : ""
        }
        confirmText={statusTarget ? (statusTarget.action === "deactivate" ? "إيقاف" : "تفعيل") : ""}
        cancelText="إلغاء"
        variant="default"
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
              {COST_CENTER_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}

function getCostCenterActions(
  c: CostCenter,
  setStatusTarget: (t: { id: string; name: string; action: "deactivate" | "activate" }) => void,
  openEdit: (c: CostCenter) => void,
  setDeleteTarget: (id: string) => void,
) {
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [
    {
      label: "عرض التفاصيل",
      icon: Eye,
      onClick: () => showToast(`${c.code} - ${c.name}`, "info"),
    },
  ];
  actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(c) });
  if (c.status === "نشط") {
    actions.push({
      label: "إيقاف",
      icon: Pause,
      onClick: () =>
        setStatusTarget({ id: c.id, name: `${c.code} - ${c.name}`, action: "deactivate" }),
    });
  } else if (c.status === "موقوف") {
    actions.push({
      label: "تفعيل",
      icon: Play,
      onClick: () =>
        setStatusTarget({ id: c.id, name: `${c.code} - ${c.name}`, action: "activate" }),
    });
  }
  actions.push({
    label: "حذف",
    icon: Trash2,
    onClick: () => setDeleteTarget(c.id),
    variant: "destructive",
  });
  return actions;
}
