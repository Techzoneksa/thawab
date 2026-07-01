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
} from "lucide-react";
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
import { getAccounts, type Account } from "@/lib/api/accounts";
import { getCostCenters, type CostCenter } from "@/lib/api/cost-centers";
import {
  getJournalEntries,
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
  cancelJournalEntry,
  JOURNAL_STATUSES,
  JOURNAL_FUNDS,
  type JournalFund,
  type JournalEntry,
  type JournalLine,
} from "@/lib/api/journal";

export const Route = createFileRoute("/finance/journal")({
  head: () => ({ meta: [{ title: "قيود اليومية — ثواب" }] }),
  component: Page,
});

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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [fundFilter, setFundFilter] = useState("الكل");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [editLines, setEditLines] = useState<JournalLine[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    number: string;
    action: "post" | "reverse" | "cancel";
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Form fields
  const [formDate, setFormDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFund, setFormFund] = useState<JournalFund>("مقيد");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<DraftLine[]>([
    { accountId: "", description: "", debit: "0", credit: "0", costCenterId: "", notes: "" },
    { accountId: "", description: "", debit: "0", credit: "0", costCenterId: "", notes: "" },
  ]);

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

  // Account lookup for form
  const { data: accountsData } = useQuery({
    queryKey: ["accounts", { search: "" }],
    queryFn: () => getAccounts({}),
  });
  const accountsList: Account[] = accountsData?.items || [];

  const { data: ccData } = useQuery({
    queryKey: ["cost-centers", { search: "" }],
    queryFn: () => getCostCenters({}),
  });
  const ccList: CostCenter[] = ccData?.items || [];

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, fundFilter]);

  const postableAccounts = accountsList.filter((a: Account) => a.postable && a.status === "نشط");

  const openAdd = () => {
    setEditing(null);
    setEditLines([]);
    setFormDate("");
    setFormDescription("");
    setFormFund("مقيد");
    setFormNotes("");
    setFormLines([
      { accountId: "", description: "", debit: "0", credit: "0", costCenterId: "", notes: "" },
      { accountId: "", description: "", debit: "0", credit: "0", costCenterId: "", notes: "" },
    ]);
    setAddOpen(true);
  };

  const openEdit = async (e: JournalEntry) => {
    if (e.status !== "مسودة" && e.status !== "بانتظار الاعتماد") {
      showToast("لا يمكن تعديل قيد مرحّل أو معكوس", "error");
      return;
    }
    const d = await getJournalEntry(e.id);
    setEditing(e);
    setEditLines(d.lines);
    setFormDate(e.date);
    setFormDescription(e.description);
    setFormFund(e.fund as JournalFund);
    setFormNotes(e.notes || "");
    setFormLines(
      d.lines.map((l: JournalLine) => ({
        accountId: l.accountId,
        description: l.description,
        debit: String(l.debit),
        credit: String(l.credit),
        costCenterId: l.costCenterId || "",
        notes: l.notes || "",
      })),
    );
    setAddOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry"] });
      showToast("تم إضافة القيد بنجاح", "success");
      setAddOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry"] });
      showToast("تم تحديث القيد بنجاح", "success");
      setAddOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

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
    mutationFn: async (vars: {
      id: string;
      action: "post" | "reverse" | "cancel";
      userId?: string;
      userName?: string;
    }) => {
      const fns = {
        post: postJournalEntry,
        reverse: reverseJournalEntry,
        cancel: cancelJournalEntry,
      };
      return fns[vars.action]({ id: vars.id, userId: vars.userId, userName: vars.userName });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry"] });
      const labels = {
        post: "تم ترحيل القيد",
        reverse: "تم عكس القيد",
        cancel: "تم إلغاء القيد",
      };
      showToast(labels[vars.action], "success");
      setActionTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const addLine = () => {
    setFormLines([
      ...formLines,
      { accountId: "", description: "", debit: "0", credit: "0", costCenterId: "", notes: "" },
    ]);
  };
  const removeLine = (idx: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== idx));
  };
  const updateLine = (idx: number, field: keyof DraftLine, value: string) => {
    setFormLines(formLines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const totalDebit = formLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = formLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleSave = () => {
    if (!formDescription.trim()) return showToast("يرجى إدخال وصف القيد", "error");
    if (formLines.length < 2) return showToast("القيد يحتاج سطرين على الأقل", "error");
    if (totalDebit === 0 && totalCredit === 0) return showToast("لا يوجد مبالغ في القيد", "error");
    if (!balanced)
      return showToast(
        `القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`,
        "error",
      );

    const linesPayload = formLines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      costCenterId: l.costCenterId || null,
      notes: l.notes,
    }));

    const basePayload = {
      date: formDate,
      description: formDescription,
      fund: formFund,
      notes: formNotes,
      lines: linesPayload,
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
    if (actionTarget) {
      actionMutation.mutate({
        id: actionTarget.id,
        action: actionTarget.action,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const stats = [
    { label: "إجمالي القيود", value: fmtNum(total) },
    {
      label: "مرحّلة",
      value: entries.filter((e: JournalEntry) => e.status === "مرحّل").length,
    },
    {
      label: "مسودات",
      value: entries.filter((e: JournalEntry) => e.status === "مسودة").length,
    },
    {
      label: "قيد الانتظار",
      value: entries.filter((e: JournalEntry) => e.status === "بانتظار الاعتماد").length,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "قيود اليومية"]}
      title="قيود اليومية"
      actions={
        <>
          <ExportButton
            data={entries as unknown as Record<string, unknown>[]}
            filename="قيود_اليومية.csv"
          />
          <PrintButton />
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
          options={["الكل", ...JOURNAL_STATUSES]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="نوع الصندوق"
          options={["الكل", ...JOURNAL_FUNDS]}
          value={fundFilter}
          onChange={(e) => setFundFilter(e.target.value)}
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
              <Td className="text-xs">{e.fund}</Td>
              <Td>
                <Badge tone={statusTone(e.status)}>{e.status}</Badge>
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
                <Badge tone={statusTone(e.status)}>{e.status}</Badge>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-base font-bold tabular-nums">{fmtSAR(e.amount)}</span>
                <div className="flex gap-2">
                  {(e.status === "مسودة" || e.status === "بانتظار الاعتماد") && (
                    <button
                      onClick={() => openEdit(e)}
                      className="text-primary text-xs font-semibold"
                    >
                      تعديل
                    </button>
                  )}
                  {e.status === "مسودة" && (
                    <button
                      onClick={() => setDeleteTarget(e.id)}
                      className="text-destructive text-xs font-semibold"
                    >
                      حذف
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{e.fund}</div>
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
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل القيد" : "إضافة قيد يومية جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الوصف *</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="وصف القيد..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              placeholder="1446/01/01"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الصندوق</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formFund}
              onChange={(e) => setFormFund(e.target.value as JournalFund)}
            >
              {JOURNAL_FUNDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-muted-foreground">سطور القيد *</label>
            <button type="button" onClick={addLine} className="text-xs text-primary font-semibold">
              + إضافة سطر
            </button>
          </div>
          <div className="space-y-2">
            {formLines.map((line, idx) => (
              <Card key={idx} className="p-2 bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground">سطر {idx + 1}</span>
                  {formLines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-destructive text-xs"
                    >
                      حذف
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12">
                    <select
                      className="w-full rounded-lg border bg-background p-2 text-xs"
                      value={line.accountId}
                      onChange={(e) => updateLine(idx, "accountId", e.target.value)}
                    >
                      <option value="">اختر حساباً قابلاً للترحيل</option>
                      {postableAccounts.map((a: Account) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6">
                    <input
                      className="w-full rounded-lg border bg-background p-2 text-xs"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => updateLine(idx, "debit", e.target.value)}
                      placeholder="مدين"
                    />
                  </div>
                  <div className="col-span-6">
                    <input
                      className="w-full rounded-lg border bg-background p-2 text-xs"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => updateLine(idx, "credit", e.target.value)}
                      placeholder="دائن"
                    />
                  </div>
                  <div className="col-span-12">
                    <select
                      className="w-full rounded-lg border bg-background p-2 text-xs"
                      value={line.costCenterId}
                      onChange={(e) => updateLine(idx, "costCenterId", e.target.value)}
                    >
                      <option value="">— (بدون مركز تكلفة)</option>
                      {ccList
                        .filter((c: CostCenter) => c.status === "نشط")
                        .map((c: CostCenter) => (
                          <option key={c.id} value={c.id}>
                            {c.code} - {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div
            className={`mt-2 rounded-lg p-2 text-xs flex justify-between items-center ${balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
          >
            <span>
              مدين: {fmtSAR(totalDebit)} | دائن: {fmtSAR(totalCredit)}
            </span>
            <Badge tone={balanced ? "success" : "destructive"}>
              {balanced ? "✓ متوازن" : "✗ غير متوازن"}
            </Badge>
          </div>
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

      <EntityFormDrawer
        open={!!detailId && !addOpen}
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
              <DetailRow label="الحالة" value={detailData.item.status} />
              <DetailRow label="الصندوق" value={detailData.item.fund} />
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

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={handleActionConfirm}
        title={
          actionTarget
            ? actionTarget.action === "post"
              ? "ترحيل القيد"
              : actionTarget.action === "reverse"
                ? "عكس القيد"
                : "إلغاء القيد"
            : ""
        }
        message={
          actionTarget
            ? `هل تريد ${actionTarget.action === "post" ? "ترحيل" : actionTarget.action === "reverse" ? "عكس" : "إلغاء"} القيد "${actionTarget.number}"؟`
            : ""
        }
        confirmText={
          actionTarget
            ? actionTarget.action === "post"
              ? "ترحيل"
              : actionTarget.action === "reverse"
                ? "عكس"
                : "إلغاء"
            : ""
        }
        cancelText="رجوع"
        variant={actionTarget?.action === "cancel" ? "destructive" : "default"}
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
              {JOURNAL_STATUSES.map((s) => (
                <option key={s}>{s}</option>
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
              <option>الكل</option>
              {JOURNAL_FUNDS.map((f) => (
                <option key={f}>{f}</option>
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

function getJournalActions(
  e: JournalEntry,
  setDetailId: (id: string) => void,
  openEdit: (e: JournalEntry) => void,
  setDeleteTarget: (id: string) => void,
  setActionTarget: (t: {
    id: string;
    number: string;
    action: "post" | "reverse" | "cancel";
  }) => void,
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
      onClick: () => setDetailId(e.id),
    },
  ];

  if (e.status === "مسودة" || e.status === "بانتظار الاعتماد") {
    actions.push({ label: "تعديل", icon: Pencil, onClick: () => openEdit(e) });
    actions.push({
      label: "ترحيل",
      icon: CheckCircle,
      onClick: () => setActionTarget({ id: e.id, number: e.number, action: "post" }),
    });
    if (e.status === "مسودة") {
      actions.push({
        label: "إلغاء",
        icon: XCircle,
        onClick: () => setActionTarget({ id: e.id, number: e.number, action: "cancel" }),
        variant: "destructive",
      });
      actions.push({
        label: "حذف",
        icon: Trash2,
        onClick: () => setDeleteTarget(e.id),
        variant: "destructive",
      });
    }
  }

  if (e.status === "مرحّل") {
    actions.push({
      label: "عكس",
      icon: RotateCcw,
      onClick: () => setActionTarget({ id: e.id, number: e.number, action: "reverse" }),
    });
  }

  return actions;
}
