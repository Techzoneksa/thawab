import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
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
import { fmtNum } from "@/data/sample";
import {
  Plus,
  Search,
  Filter,
  Lock,
  Unlock,
  Trash2,
  Eye,
  Calendar,
  GitBranch,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getPeriods,
  getPeriod,
  createPeriod,
  updatePeriod,
  closePeriod,
  reopenPeriod,
  deletePeriod,
  PERIOD_STATUSES,
  type FiscalPeriod,
} from "@/lib/api/periods";

export const Route = createFileRoute("/finance/closing")({
  head: () => ({ meta: [{ title: "الإقفال المالي — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalPeriod | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    name: string;
    action: "close" | "reopen";
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["periods", { search: searchQuery, status: statusFilter }],
    queryFn: () => getPeriods({ search: searchQuery, status: statusFilter }),
  });

  const periods = data?.items || [];
  const total = data?.total || 0;

  const { data: detailData } = useQuery({
    queryKey: ["period", detailId],
    queryFn: () => (detailId ? getPeriod(detailId) : Promise.resolve(null)),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: createPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم إضافة الفترة المالية بنجاح", "success");
      setAddOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updatePeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      queryClient.invalidateQueries({ queryKey: ["period"] });
      showToast("تم تحديث الفترة المالية بنجاح", "success");
      setAddOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      showToast("تم حذف الفترة المالية بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMutation = useMutation({
    mutationFn: closePeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      queryClient.invalidateQueries({ queryKey: ["period"] });
      showToast("تم إقفال الفترة المالية بنجاح", "success");
      setActionTarget(null);
      setCloseNotes("");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const reopenMutation = useMutation({
    mutationFn: reopenPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["periods"] });
      queryClient.invalidateQueries({ queryKey: ["period"] });
      showToast("تم إعادة فتح الفترة المالية بنجاح", "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setEditing(null);
    setFormName("");
    setFormStartDate("");
    setFormEndDate("");
    setFormNotes("");
    setAddOpen(true);
  };

  const openEdit = (p: FiscalPeriod) => {
    if (p.status === "مقفلة") {
      showToast("لا يمكن تعديل فترة مقفلة. أعد فتحها أولاً.", "error");
      return;
    }
    setEditing(p);
    setFormName(p.name);
    setFormStartDate(p.startDate);
    setFormEndDate(p.endDate);
    setFormNotes(p.notes || "");
    setAddOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return showToast("يرجى إدخال اسم الفترة", "error");
    if (!formStartDate) return showToast("يرجى تحديد تاريخ البداية", "error");
    if (!formEndDate) return showToast("يرجى تحديد تاريخ النهاية", "error");
    if (formStartDate > formEndDate)
      return showToast("تاريخ البداية يجب أن يكون قبل تاريخ النهاية", "error");

    const basePayload = {
      name: formName,
      startDate: formStartDate,
      endDate: formEndDate,
      notes: formNotes,
      userId: user?.id,
      userName: user?.name,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...basePayload });
    } else {
      createMutation.mutate(basePayload);
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const handleActionConfirm = () => {
    if (!actionTarget) return;
    if (actionTarget.action === "close") {
      closeMutation.mutate({
        id: actionTarget.id,
        notes: closeNotes,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      reopenMutation.mutate({
        id: actionTarget.id,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const stats = {
    open: periods.filter((p: FiscalPeriod) => p.status === "مفتوحة").length,
    closed: periods.filter((p: FiscalPeriod) => p.status === "مقفلة").length,
    reopened: periods.filter((p: FiscalPeriod) => p.status === "معاد فتحتها").length,
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الإقفال المالي"]}
      title="الإقفال المالي للفترات"
      actions={
        <Btn variant="primary" onClick={openAdd}>
          <Plus size={15} /> فترة جديدة
        </Btn>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <GitBranch size={13} /> إجمالي الفترات
          </div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtNum(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Calendar size={13} /> مفتوحة
          </div>
          <div className="text-base lg:text-xl font-extrabold text-warning tabular-nums">
            {fmtNum(stats.open)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Lock size={13} /> مقفلة
          </div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtNum(stats.closed)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Unlock size={13} /> معاد فتحتها
          </div>
          <div className="text-base lg:text-xl font-extrabold text-info tabular-nums">
            {fmtNum(stats.reopened)}
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
            placeholder="بحث بالاسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...PERIOD_STATUSES]}
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
        title="الفترات المالية"
        count={`${fmtNum(total)} فترة`}
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
          description="حدث خطأ أثناء جلب الفترات المالية"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["periods"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : periods.length === 0 ? (
        <EmptyState
          title="لا توجد فترات مالية"
          description="ابدأ بإضافة أول فترة مالية (شهرية أو ربع سنوية أو سنوية)"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة فترة
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الفترة", "البداية", "النهاية", "الحالة", "أُقفلت بواسطة", ""]}
          rows={periods}
          renderRow={(p: FiscalPeriod) => (
            <>
              <Td>
                <button
                  onClick={() => setDetailId(p.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {p.name}
                </button>
                {p.notes && (
                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {p.notes}
                  </div>
                )}
              </Td>
              <Td className="font-mono text-xs">{p.startDate}</Td>
              <Td className="font-mono text-xs">{p.endDate}</Td>
              <Td>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </Td>
              <Td className="text-xs">
                {p.closedByName ? (
                  <div>
                    <div className="font-semibold">{p.closedByName}</div>
                    <div className="text-muted-foreground">{p.closedAt}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
              <Td>
                <ActionMenu
                  actions={getPeriodActions(
                    p,
                    setDetailId,
                    openEdit,
                    setDeleteTarget,
                    setActionTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(p: FiscalPeriod) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  onClick={() => setDetailId(p.id)}
                  className="text-sm font-bold hover:text-primary text-right"
                >
                  {p.name}
                </button>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <span>
                  <Calendar size={11} className="inline ml-1" />
                  {p.startDate}
                </span>
                <span>→</span>
                <span>{p.endDate}</span>
              </div>
              {p.closedByName && (
                <div className="text-xs text-muted-foreground">
                  أُقفلت بواسطة: {p.closedByName} · {p.closedAt}
                </div>
              )}
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل فترة مالية" : "إضافة فترة مالية جديدة"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم الفترة *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="مثال: شهر شوال 1446، الربع الأول 1446، السنة 1446"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ البداية *</label>
              <input
                type="date"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">تاريخ النهاية *</label>
              <input
                type="date"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="ملاحظات حول الفترة..."
            />
          </div>
          {editing && (
            <div className="rounded-lg bg-info/10 p-3 text-xs">
              <div className="font-bold mb-1">معلومات الإقفال</div>
              {editing.closedAt && (
                <div>
                  أُقفلت في {editing.closedAt} بواسطة {editing.closedByName}
                </div>
              )}
              {editing.reopenedAt && (
                <div className="mt-1">
                  أُعيد فتحها في {editing.reopenedAt} بواسطة {editing.reopenedByName}
                </div>
              )}
            </div>
          )}
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!detailId && !addOpen}
        onClose={() => setDetailId(null)}
        title={`تفاصيل الفترة: ${detailData?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={detailData.item.status} />
              <DetailRow label="من تاريخ" value={detailData.item.startDate} />
              <DetailRow label="إلى تاريخ" value={detailData.item.endDate} />
              <DetailRow label="أنشأ بواسطة" value={detailData.item.createdBy || "—"} />
            </div>

            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                إحصائيات الفترة
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <StatBox label="إجمالي القيود" value={fmtNum(detailData.stats.totalEntries)} />
                <StatBox
                  label="مرحّلة"
                  value={fmtNum(detailData.stats.postedEntries)}
                  tone="success"
                />
                <StatBox
                  label="مسودة"
                  value={fmtNum(detailData.stats.draftEntries)}
                  tone="warning"
                />
              </div>
            </Card>

            {detailData.item.closedAt && (
              <Card className="p-3 bg-success/10">
                <div className="text-xs font-bold text-success mb-1">معلومات الإقفال</div>
                <div className="text-xs">
                  التاريخ: <span className="font-semibold">{detailData.item.closedAt}</span>
                </div>
                <div className="text-xs">
                  بواسطة: <span className="font-semibold">{detailData.item.closedByName}</span>
                </div>
              </Card>
            )}

            {detailData.item.reopenedAt && (
              <Card className="p-3 bg-warning/10">
                <div className="text-xs font-bold text-warning mb-1">معلومات إعادة الفتح</div>
                <div className="text-xs">
                  التاريخ: <span className="font-semibold">{detailData.item.reopenedAt}</span>
                </div>
                <div className="text-xs">
                  بواسطة: <span className="font-semibold">{detailData.item.reopenedByName}</span>
                </div>
              </Card>
            )}

            {detailData.item.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm">{detailData.item.notes}</div>
              </div>
            )}
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الفترة المالية"
        message="سيتم حذف الفترة المالية نهائياً. لا يمكن حذف الفترات المقفلة."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      {actionTarget?.action === "close" && (
        <EntityFormDrawer
          open={!!actionTarget}
          onClose={() => setActionTarget(null)}
          title={`إقفال الفترة: ${actionTarget?.name || ""}`}
          onSave={handleActionConfirm}
          saveText="تأكيد الإقفال"
          loading={closeMutation.isPending}
        >
          <div className="space-y-3">
            <div className="rounded-lg bg-warning/10 p-3 text-sm">
              <div className="font-bold text-warning mb-2">⚠ تنبيهات قبل الإقفال</div>
              <ul className="text-xs space-y-1 pr-4 list-disc">
                <li>سيتم منع أي تعديل على القيود ضمن هذه الفترة</li>
                <li>لا يمكن حذف الفترة بعد الإقفال</li>
                <li>يجب أن تكون جميع القيود مرحّلة ومتوازنة أولاً</li>
                <li>يتم تسجيل هذا الإجراء في سجل التدقيق</li>
              </ul>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات الإقفال</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={3}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="ملاحظات اختيارية حول الإقفال..."
              />
            </div>
          </div>
        </EntityFormDrawer>
      )}

      <ConfirmDialog
        open={!!actionTarget && actionTarget.action === "reopen"}
        onClose={() => setActionTarget(null)}
        onConfirm={handleActionConfirm}
        title="إعادة فتح الفترة"
        message={
          actionTarget
            ? `هل تريد إعادة فتح الفترة "${actionTarget.name}"؟ سيتم السماح بإضافة وتعديل القيود مرة أخرى، ويبقى السجل في سجل التدقيق.`
            : ""
        }
        confirmText="إعادة الفتح"
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
              {PERIOD_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
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

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={`font-bold tabular-nums ${
          tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function getPeriodActions(
  p: FiscalPeriod,
  setDetailId: (id: string) => void,
  openEdit: (p: FiscalPeriod) => void,
  setDeleteTarget: (id: string) => void,
  setActionTarget: (t: { id: string; name: string; action: "close" | "reopen" }) => void,
) {
  const actions: Array<{
    label: string;
    icon: typeof Eye;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(p.id) }];

  if (p.status === "مفتوحة") {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(p) });
    actions.push({
      label: "إقفال الفترة",
      icon: Lock,
      onClick: () => setActionTarget({ id: p.id, name: p.name, action: "close" }),
    });
    actions.push({
      label: "حذف",
      icon: Trash2,
      onClick: () => setDeleteTarget(p.id),
      variant: "destructive",
    });
  }

  if (p.status === "مقفلة") {
    actions.push({
      label: "إعادة الفتح",
      icon: Unlock,
      onClick: () => setActionTarget({ id: p.id, name: p.name, action: "reopen" }),
    });
  }

  if (p.status === "معاد فتحتها") {
    actions.push({
      label: "إقفال مرة أخرى",
      icon: Lock,
      onClick: () => setActionTarget({ id: p.id, name: p.name, action: "close" }),
    });
  }

  return actions;
}
