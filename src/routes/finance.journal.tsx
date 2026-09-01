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
  Search,
  Filter,
  Eye,
  Pencil,
  Trash2,
  CheckCircle,
  RotateCcw,
  XCircle,
  Send,
  ThumbsUp,
  Undo2,
  Upload,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { JournalImportDialog } from "@/components/finance/JournalImportDialog";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";
import { useAuth, useCan } from "@/lib/api/auth";
import { FINANCE_PERMISSIONS } from "@/lib/finance-permissions";
import { label, options } from "@/lib/i18n/labels";
import { JournalStatus } from "@/lib/enums";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { getCostCenters, type CostCenter } from "@/lib/api/cost-centers";
import {
  getJournalEntries,
  getJournalEntry,
  deleteJournalEntry,
  journalAction,
  type JournalWorkflowAction,
  type JournalEntry,
  type JournalLine,
  type WorkflowEvent,
} from "@/lib/api/journal";

export const Route = createFileRoute("/finance/journal")({
  head: () => ({ meta: [{ title: "قيود اليومية — ثواب" }] }),
  component: Page,
});

const ACTION_LABELS: Record<
  JournalWorkflowAction,
  { title: string; verb: string; done: string; reasonRequired: boolean; destructive?: boolean }
> = {
  submit: {
    title: "إرسال للاعتماد",
    verb: "إرسال",
    done: "تم إرسال القيد للاعتماد",
    reasonRequired: false,
  },
  approve: {
    title: "اعتماد القيد",
    verb: "اعتماد",
    done: "تم اعتماد القيد",
    reasonRequired: false,
  },
  return: {
    title: "إعادة للتعديل",
    verb: "إعادة",
    done: "تمت إعادة القيد للمُعِدّ",
    reasonRequired: true,
  },
  reject: {
    title: "رفض القيد",
    verb: "رفض",
    done: "تم رفض القيد",
    reasonRequired: true,
    destructive: true,
  },
  post: { title: "ترحيل القيد", verb: "ترحيل", done: "تم ترحيل القيد", reasonRequired: false },
  reverse: { title: "عكس القيد", verb: "عكس", done: "تم عكس القيد", reasonRequired: true },
  cancel: {
    title: "إلغاء القيد",
    verb: "إلغاء",
    done: "تم إلغاء القيد",
    reasonRequired: false,
    destructive: true,
  },
};

const WF_ACTION_LABEL: Record<string, string> = {
  submit: "إرسال للاعتماد",
  approve: "اعتماد",
  return: "إعادة للتعديل",
  reject: "رفض",
  post: "ترحيل",
  reverse: "عكس",
  cancel: "إلغاء",
  close: "إغلاق فترة",
  reopen: "إعادة فتح فترة",
};

// Operational work-queue presets (item 30).
const QUEUES: { key: string; label: string; status: string }[] = [
  { key: "all", label: "الكل", status: "" },
  { key: "draft", label: "مسودات", status: JournalStatus.DRAFT },
  { key: "awaiting_approval", label: "بانتظار الاعتماد", status: JournalStatus.SUBMITTED },
  { key: "awaiting_posting", label: "معتمدة بانتظار الترحيل", status: JournalStatus.APPROVED },
  { key: "posted", label: "مرحّلة", status: JournalStatus.POSTED },
  { key: "rejected", label: "مرفوضة", status: JournalStatus.REJECTED },
  { key: "reversed", label: "معكوسة", status: JournalStatus.REVERSED },
];

interface DraftLine {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  costCenterId: string;
  notes: string;
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fundFilter, setFundFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    number: string;
    action: JournalWorkflowAction;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["journal", { search: searchQuery, status: statusFilter, fund: fundFilter, page }],
    queryFn: () =>
      getJournalEntries({
        search: searchQuery,
        status: statusFilter,
        fund: fundFilter,
        page,
        limit: 50,
      }),
  });

  const entries = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  // Detail query
  const { data: detailData } = useQuery({
    queryKey: ["journal-entry", detailId],
    queryFn: () => (detailId ? getJournalEntry(detailId) : Promise.resolve(null)),
    enabled: !!detailId,
  });

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, fundFilter]);

  const openAdd = () => navigate({ to: "/finance/journal/new" });

  const openEdit = (e: JournalEntry) => {
    if (e.status !== JournalStatus.DRAFT && e.status !== JournalStatus.PENDING) {
      showToast("لا يمكن تعديل قيد مرحّل أو معكوس. افتح التفاصيل لعرض السجل أو عكسه.", "error");
      return;
    }
    navigate({ to: "/finance/journal/$id/edit", params: { id: e.id } });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      showToast("تم حذف القيد بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const actionMutation = useMutation({
    mutationFn: (vars: { id: string; action: JournalWorkflowAction; reason?: string }) =>
      journalAction(vars),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry"] });
      showToast(ACTION_LABELS[vars.action].done, "success");
      setActionTarget(null);
      setActionReason("");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const reasonNeeded = actionTarget ? ACTION_LABELS[actionTarget.action].reasonRequired : false;
  const handleActionConfirm = () => {
    if (!actionTarget) return;
    if (reasonNeeded && !actionReason.trim()) {
      showToast("السبب مطلوب لهذا الإجراء", "error");
      return;
    }
    actionMutation.mutate({
      id: actionTarget.id,
      action: actionTarget.action,
      reason: actionReason.trim() || undefined,
    });
  };

  const buildDoc = async (): Promise<DocumentDefinition> => {
    const today = new Date().toISOString().slice(0, 10);
    const filters: DocMeta[] = [];
    if (searchQuery) filters.push({ label: "بحث", value: searchQuery });
    if (statusFilter)
      filters.push({ label: "الحالة", value: label("journalStatus", statusFilter) });
    if (fundFilter) filters.push({ label: "الصندوق", value: label("fund", fundFilter) });
    // Re-fetch the COMPLETE filtered dataset (list is server-paginated).
    const all = await getJournalEntries({
      search: searchQuery,
      status: statusFilter,
      fund: fundFilter,
      page: 1,
      limit: 100000,
    });
    return {
      title: "قيود اليومية",
      date: today,
      orientation: "landscape",
      filters,
      columns: [
        { key: "number", label: "الرقم", width: "12%" },
        { key: "date", label: "التاريخ", width: "12%" },
        { key: "description", label: "الوصف", width: "34%" },
        { key: "fund", label: "الصندوق", width: "12%" },
        { key: "status", label: "الحالة", width: "12%" },
        { key: "totalDebit", label: "مدين", type: "money" },
        { key: "totalCredit", label: "دائن", type: "money" },
      ],
      rows: all.items.map((e: JournalEntry) => ({
        number: e.number,
        date: e.date,
        description: e.description,
        fund: label("fund", e.fund),
        status: label("journalStatus", e.status),
        totalDebit: e.totalDebit ?? e.amount,
        totalCredit: e.totalCredit ?? e.amount,
      })),
      fileBase: `journal-${today}`,
    };
  };

  const stats = [
    { label: "إجمالي القيود", value: fmtNum(total) },
    {
      label: "مرحّلة",
      value: entries.filter((e: JournalEntry) => e.status === JournalStatus.POSTED).length,
    },
    {
      label: "مسودات",
      value: entries.filter((e: JournalEntry) => e.status === JournalStatus.DRAFT).length,
    },
    {
      label: "قيد الانتظار",
      value: entries.filter((e: JournalEntry) => e.status === JournalStatus.PENDING).length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "قيود اليومية"]}
      title="قيود اليومية"
      actions={
        <>
          <DocumentActions document={buildDoc} />
          {can(FINANCE_PERMISSIONS.importJournal) && (
            <Btn variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> استيراد Excel
            </Btn>
          )}
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> قيد جديد
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

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUEUES.map((q) => (
          <button
            key={q.key}
            onClick={() => setStatusFilter(q.status)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === q.status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted"
            }`}
          >
            {q.label}
          </button>
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
            placeholder="بحث بالرقم أو الوصف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...options("journalStatus").map((o) => o.label)]}
          value={statusFilter ? label("journalStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("journalStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Select
          label="نوع الصندوق"
          options={["الكل", ...options("fund").map((o) => o.label)]}
          value={fundFilter ? label("fund", fundFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setFundFilter(
              v === "الكل" ? "" : (options("fund").find((o) => o.label === v)?.value ?? ""),
            );
          }}
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
        title="قيود اليومية"
        count={`${fmtNum(total)} قيد`}
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
          description="حدث خطأ أثناء تحميل القيود"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["journal"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title="لا توجد قيود"
          description="ابدأ بإضافة أول قيد يومية"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة قيد
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرقم", "التاريخ", "الوصف", "المبلغ", "الصندوق", "الحالة", ""]}
          rows={entries}
          renderRow={(e: JournalEntry) => (
            <>
              <Td className="font-mono text-xs">{e.number}</Td>
              <Td className="text-xs">{e.date}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(e.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {e.description}
                </button>
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(e.amount)}</Td>
              <Td className="text-xs">{label("fund", e.fund)}</Td>
              <Td>
                <Badge tone={statusTone(e.status)}>{label("journalStatus", e.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getJournalActions(
                    e,
                    setDetailId,
                    openEdit,
                    setDeleteTarget,
                    setActionTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(e: JournalEntry) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground font-mono">
                    {e.number} · {e.date}
                  </div>
                  <button
                    onClick={() => setDetailId(e.id)}
                    className="text-sm font-bold hover:text-primary text-right mt-0.5 line-clamp-2"
                  >
                    {e.description}
                  </button>
                </div>
                <Badge tone={statusTone(e.status)}>{label("journalStatus", e.status)}</Badge>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-base font-bold tabular-nums">{fmtSAR(e.amount)}</span>
                <div className="flex gap-2">
                  {(e.status === JournalStatus.DRAFT || e.status === JournalStatus.PENDING) && (
                    <button
                      onClick={() => openEdit(e)}
                      className="text-primary text-xs font-semibold"
                    >
                      تعديل
                    </button>
                  )}
                  {e.status === JournalStatus.DRAFT && (
                    <button
                      onClick={() => setDeleteTarget(e.id)}
                      className="text-destructive text-xs font-semibold"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{label("fund", e.fund)}</div>
            </Card>
          )}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-muted-foreground">
            صفحة {page} من {totalPages} | {fmtNum(total)} قيد
          </span>
          <div className="flex gap-1">
            <button
              className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 min-h-[36px]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </button>
            <button
              className="px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-muted disabled:opacity-40 min-h-[36px]"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              التالي
            </button>
          </div>
        </div>
      )}

      <EntityFormDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`القيد: ${detailData?.item?.number || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailData && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الرقم" value={detailData.item.number} />
              <DetailRow label="التاريخ" value={detailData.item.date} />
              <DetailRow label="الحالة" value={label("journalStatus", detailData.item.status)} />
              <DetailRow label="الصندوق" value={label("fund", detailData.item.fund)} />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground">الوصف</div>
              <div className="text-sm mt-1">{detailData.item.description}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">السطور</div>
              <div className="space-y-1">
                {detailData.lines.map((l: JournalLine) => (
                  <div key={l.id} className="rounded-lg border p-2 bg-muted/30 text-xs">
                    <div className="flex justify-between">
                      <span className="font-mono font-bold">
                        {l.accountCode} - {l.accountName}
                      </span>
                      <span>
                        {l.debit > 0 ? (
                          <span className="text-success font-bold">مدين {fmtSAR(l.debit)}</span>
                        ) : (
                          <span className="text-info font-bold">دائن {fmtSAR(l.credit)}</span>
                        )}
                      </span>
                    </div>
                    {l.description && (
                      <div className="text-muted-foreground mt-1">{l.description}</div>
                    )}
                    {l.costCenterName && (
                      <div className="text-muted-foreground mt-1">
                        مركز التكلفة: {l.costCenterName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between rounded-lg bg-primary/10 p-2 text-sm font-bold">
                <span>الإجمالي</span>
                <span>
                  مدين {fmtSAR(detailData.totals.debit)} | دائن {fmtSAR(detailData.totals.credit)}
                </span>
              </div>
              <div className="mt-1">
                <Badge tone={detailData.totals.balanced ? "success" : "destructive"}>
                  {detailData.totals.balanced ? "متوازن ✓" : "غير متوازن ✗"}
                </Badge>
              </div>
            </div>
            {detailData.item.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">ملاحظات</div>
                <div className="text-sm mt-1">{detailData.item.notes}</div>
              </div>
            )}
            {detailData.reversedOf && (
              <Card className="p-2 bg-warning/10">
                <div className="text-xs">
                  هذا القيد عكس القيد:{" "}
                  <span className="font-mono">{detailData.reversedOf.number}</span>
                </div>
              </Card>
            )}
            {detailData.reversalEntries.length > 0 && (
              <Card className="p-2 bg-warning/10">
                <div className="text-xs">القيد تم عكسه بواسطة:</div>
                {detailData.reversalEntries.map((r: JournalEntry) => (
                  <div key={r.id} className="text-xs font-mono mt-0.5">
                    {r.number}
                  </div>
                ))}
              </Card>
            )}

            {/* Workflow timeline — how the journal reached its current state. */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                مسار الاعتماد والترحيل
              </div>
              {detailData.workflowHistory && detailData.workflowHistory.length > 0 ? (
                <ol className="relative space-y-2 border-r-2 border-muted pr-3">
                  {detailData.workflowHistory.map((w: WorkflowEvent) => (
                    <li key={w.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {WF_ACTION_LABEL[w.action] || w.action}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {w.createdAt?.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        بواسطة {w.userName || "—"}
                        {w.fromStatus && w.toStatus ? (
                          <>
                            {" "}
                            · {label("journalStatus", w.fromStatus)} →{" "}
                            {label("journalStatus", w.toStatus)}
                          </>
                        ) : null}
                      </div>
                      {w.reason ? (
                        <div className="mt-0.5 rounded bg-muted/40 px-2 py-1">
                          السبب: {w.reason}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-xs text-muted-foreground">لا يوجد سجل مسار بعد.</div>
              )}
            </div>
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف القيد"
        message="هل أنت متأكد من حذف هذا القيد؟ لا يمكن حذف قيد مرحّل أو معكوس."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      {actionTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setActionTarget(null);
            setActionReason("");
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="text-base font-bold">{ACTION_LABELS[actionTarget.action].title}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {`هل تريد ${ACTION_LABELS[actionTarget.action].verb} القيد "${actionTarget.number}"؟`}
            </div>
            {reasonNeeded && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-muted-foreground">السبب (مطلوب)</label>
                <textarea
                  autoFocus
                  className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
                  rows={3}
                  value={actionReason}
                  onChange={(ev) => setActionReason(ev.target.value)}
                  placeholder="اكتب سبباً واضحاً…"
                />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Btn
                variant="ghost"
                onClick={() => {
                  setActionTarget(null);
                  setActionReason("");
                }}
              >
                رجوع
              </Btn>
              <Btn
                variant="primary"
                className={
                  ACTION_LABELS[actionTarget.action].destructive
                    ? "!bg-destructive !text-destructive-foreground"
                    : undefined
                }
                disabled={actionMutation.isPending || (reasonNeeded && !actionReason.trim())}
                onClick={handleActionConfirm}
              >
                {ACTION_LABELS[actionTarget.action].verb}
              </Btn>
            </div>
          </div>
        </div>
      )}

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
              {options("journalStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الصندوق</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value)}
            >
              <option value="">الكل</option>
              {options("fund").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>

      <JournalImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setStatusFilter(JournalStatus.DRAFT);
          setPage(1);
          queryClient.invalidateQueries({ queryKey: ["journal"] });
        }}
      />
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

function getJournalActions(
  e: JournalEntry,
  setDetailId: (id: string) => void,
  openEdit: (e: JournalEntry) => void,
  setDeleteTarget: (id: string) => void,
  setActionTarget: (t: { id: string; number: string; action: JournalWorkflowAction }) => void,
) {
  const t = (action: JournalWorkflowAction) => ({ id: e.id, number: e.number, action });
  const actions: Array<{
    label: string;
    icon: any;
    onClick: () => void;
    variant?: "destructive";
  }> = [{ label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(e.id) }];

  // Contextual by workflow state. The server is authoritative — buttons the
  // user is not permitted to use return 403 on click.
  if (e.status === JournalStatus.DRAFT || e.status === JournalStatus.PENDING) {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(e) });
    actions.push({
      label: "إرسال للاعتماد",
      icon: Send,
      onClick: () => setActionTarget(t("submit")),
    });
    actions.push({
      label: "إلغاء",
      icon: XCircle,
      onClick: () => setActionTarget(t("cancel")),
      variant: "destructive",
    });
    if (e.status === JournalStatus.DRAFT)
      actions.push({
        label: "حذف",
        icon: Trash2,
        onClick: () => setDeleteTarget(e.id),
        variant: "destructive",
      });
  } else if (e.status === JournalStatus.SUBMITTED) {
    actions.push({ label: "اعتماد", icon: ThumbsUp, onClick: () => setActionTarget(t("approve")) });
    actions.push({
      label: "إعادة للتعديل",
      icon: Undo2,
      onClick: () => setActionTarget(t("return")),
    });
    actions.push({
      label: "رفض",
      icon: XCircle,
      onClick: () => setActionTarget(t("reject")),
      variant: "destructive",
    });
  } else if (e.status === JournalStatus.APPROVED) {
    actions.push({ label: "ترحيل", icon: CheckCircle, onClick: () => setActionTarget(t("post")) });
  } else if (e.status === JournalStatus.POSTED) {
    actions.push({ label: "عكس", icon: RotateCcw, onClick: () => setActionTarget(t("reverse")) });
  }

  return actions;
}
