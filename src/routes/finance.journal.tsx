import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  Td,
  statusTone,
  MobileTable,
  MobileSearchInput,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { JOURNAL_ENTRIES, CHART_OF_ACCOUNTS, fmtSAR } from "@/data/sample";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
  PrintStyle,
} from "@/components/erp/actions";
import { Plus, Filter, Search, Eye, Edit, Trash2, ArrowUpDown, Copy, FileText } from "lucide-react";

export const Route = createFileRoute("/finance/journal")({
  head: () => ({ meta: [{ title: "قيود اليومية — ثواب" }] }),
  component: Page,
});

let idCounter = 189;
function nextId() {
  return `JV-2406-${(idCounter++).toString().padStart(4, "0")}`;
}

const STATUSES = ["الكل", "مرحّل", "بانتظار الموافقة", "ملغى", "مسودة"];
const FUNDS = ["الكل", "مقيد", "غير مقيد", "أوقاف"];
const PROJECTS = ["الكل", "PRJ-014", "PRJ-015", "PRJ-017", "PRJ-018", "PRJ-021", "—"];

function Page() {
  const [entries, setEntries] = useState(JOURNAL_ENTRIES);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState("الكل");
  const [projectFilter, setProjectFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<(typeof JOURNAL_ENTRIES)[0] | null>(null);
  const [formData, setFormData] = useState({
    date: "1446/10/14",
    desc: "",
    debit: "",
    credit: "",
    amount: "",
    fund: "غير مقيد",
    project: "—",
  });

  const filtered = entries.filter((e) => {
    if (fundFilter !== "الكل" && e.fund !== fundFilter) return false;
    if (statusFilter !== "الكل" && e.status !== statusFilter) return false;
    if (projectFilter !== "الكل" && e.project !== projectFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.id.toLowerCase().includes(q) && !e.desc.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totals = filtered.reduce((a, j) => a + j.amount, 0);
  const totalPending = entries.filter(
    (e) => e.status === "بانتظار الموافقة" || e.status === "مسودة",
  ).length;
  const accountOptions = CHART_OF_ACCOUNTS.map((a) => `${a.code} ${a.name}`);

  const resetForm = () => {
    setFormData({
      date: "1446/10/14",
      desc: "",
      debit: "",
      credit: "",
      amount: "",
      fund: "غير مقيد",
      project: "—",
    });
    setEditingId(null);
  };

  const handleSave = () => {
    if (!formData.desc || !formData.debit || !formData.credit || !formData.amount) {
      showToast("يرجى ملء جميع الحقول المطلوبة", "error");
      return;
    }
    const amount = Number(formData.amount);
    if (editingId) {
      setEntries((prev) =>
        prev.map((e) => (e.id === editingId ? { ...e, ...formData, amount } : e)),
      );
      showToast("تم تعديل القيد بنجاح", "success");
    } else {
      setEntries((prev) => [
        {
          id: nextId(),
          date: formData.date,
          desc: formData.desc,
          debit: formData.debit,
          credit: formData.credit,
          amount,
          fund: formData.fund,
          project: formData.project,
          status: "مسودة",
        },
        ...prev,
      ]);
      showToast("تم إنشاء القيد بنجاح", "success");
    }
    setFormOpen(false);
    resetForm();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setEntries((prev) => prev.filter((e) => e.id !== deleteId));
    setConfirmOpen(false);
    setDeleteId(null);
    showToast("تم حذف القيد", "success");
  };

  const handleStatusChange = (id: string, status: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    showToast(`تم تغيير حالة القيد إلى ${status}`, "success");
  };

  const handleReverse = (entry: (typeof JOURNAL_ENTRIES)[0]) => {
    setEntries((prev) => [
      {
        id: nextId(),
        date: "1446/10/14",
        desc: `قيد عكسي - ${entry.desc}`,
        debit: entry.credit,
        credit: entry.debit,
        amount: entry.amount,
        fund: entry.fund,
        project: entry.project,
        status: "مسودة",
      },
      ...prev,
    ]);
    showToast("تم إنشاء القيد العكسي", "success");
  };

  const handleEdit = (entry: (typeof JOURNAL_ENTRIES)[0]) => {
    setFormData({
      date: entry.date,
      desc: entry.desc,
      debit: entry.debit,
      credit: entry.credit,
      amount: String(entry.amount),
      fund: entry.fund,
      project: entry.project,
    });
    setEditingId(entry.id);
    setFormOpen(true);
  };

  const exportData = filtered.map((e) => ({
    "رقم القيد": e.id,
    التاريخ: e.date,
    الوصف: e.desc,
    "حساب مدين": e.debit,
    "حساب دائن": e.credit,
    المبلغ: e.amount,
    "نوع الصندوق": e.fund,
    المشروع: e.project,
    الحالة: e.status,
  }));

  return (
    <>
      <PrintStyle />
      <AppShell
        breadcrumb={["الرئيسية", "المالية", "قيود اليومية"]}
        title="قيود اليومية"
        actions={
          <>
            <ExportButton data={exportData} filename="journal-entries.csv" />
            <PrintButton />
            <Btn
              variant="primary"
              onClick={() => {
                resetForm();
                setFormOpen(true);
              }}
            >
              <Plus size={15} />
              قيد جديد
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3 lg:mb-4">
          {[
            { l: "قيود الشهر", v: filtered.length.toString() },
            { l: "قيد الاعتماد", v: totalPending.toString(), tone: "warning" },
            { l: "إجمالي مدين", v: fmtSAR(totals) },
            { l: "إجمالي دائن", v: fmtSAR(totals) },
          ].map((s) => (
            <Card key={s.l} className="p-3 lg:p-4">
              <div className="text-xs text-muted-foreground truncate">{s.l}</div>
              <div className="text-base lg:text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
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
              placeholder="بحث برقم القيد أو الوصف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            label="نوع الصندوق"
            options={FUNDS}
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
          />
          <Select
            label="المركز/المشروع"
            options={PROJECTS}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          />
          <Select
            label="الحالة"
            options={STATUSES}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            label="الفترة"
            options={["هذا الشهر", "الشهر السابق", "هذا الربع", "هذا العام"]}
          />
          <Btn variant="ghost">
            <Filter size={15} /> متقدم
          </Btn>
        </FilterBar>

        <div className="lg:hidden flex items-center gap-2 mb-3">
          <MobileSearchInput
            placeholder="بحث عن قيد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <MobilePageHeader
          title="قيود اليومية"
          count={`${filtered.length} قيد`}
          action={
            <button
              className="min-h-[44px] min-w-[44px] grid place-items-center rounded-lg bg-primary text-primary-foreground"
              onClick={() => {
                resetForm();
                setFormOpen(true);
              }}
            >
              <Plus size={20} />
            </button>
          }
        />

        <MobileTable
          columns={[
            "رقم القيد",
            "التاريخ",
            "الوصف",
            "ح/ مدين",
            "ح/ دائن",
            "المبلغ",
            "نوع الصندوق",
            "المشروع",
            "الحالة",
            "",
          ]}
          rows={filtered}
          renderRow={(j) => (
            <>
              <Td className="font-mono text-xs">{j.id}</Td>
              <Td className="text-muted-foreground">{j.date}</Td>
              <Td className="max-w-[280px] truncate">{j.desc}</Td>
              <Td className="text-xs">{j.debit}</Td>
              <Td className="text-xs">{j.credit}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(j.amount)}</Td>
              <Td>
                <Badge tone={j.fund === "مقيد" ? "info" : j.fund === "أوقاف" ? "primary" : "muted"}>
                  {j.fund}
                </Badge>
              </Td>
              <Td className="font-mono text-xs">{j.project}</Td>
              <Td>
                <Badge tone={statusTone(j.status)}>{j.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailEntry(j) },
                    ...(j.status === "مسودة"
                      ? [{ label: "تعديل", icon: Edit, onClick: () => handleEdit(j) }]
                      : []),
                    { label: "طباعة", icon: FileText, onClick: () => window.print() },
                    {
                      label: "ترحيل",
                      icon: ArrowUpDown,
                      onClick: () => handleStatusChange(j.id, "مرحّل"),
                    },
                    { label: "إنشاء قيد عكسي", icon: Copy, onClick: () => handleReverse(j) },
                    ...(j.status === "مسودة"
                      ? [
                          {
                            label: "حذف",
                            icon: Trash2,
                            onClick: () => {
                              setDeleteId(j.id);
                              setConfirmOpen(true);
                            },
                            variant: "destructive" as const,
                          },
                        ]
                      : []),
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(j) => (
            <Card key={j.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-tight line-clamp-2">{j.desc}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {j.id} · {j.date}
                  </div>
                </div>
                <Badge tone={statusTone(j.status)}>{j.status}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="tabular-nums font-bold text-base">{fmtSAR(j.amount)}</div>
                <div className="text-xs text-muted-foreground">صندوق: {j.fund}</div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted/50 px-2 py-0.5 truncate max-w-[120px]">
                  {j.debit}
                </span>
                <span>←</span>
                <span className="rounded bg-muted/50 px-2 py-0.5 truncate max-w-[120px]">
                  {j.credit}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">{j.project}</span>
                <div className="flex items-center gap-2">
                  {j.status === "مسودة" && (
                    <>
                      <button
                        className="text-xs font-semibold text-primary"
                        onClick={() => handleStatusChange(j.id, "بانتظار الموافقة")}
                      >
                        إرسال للاعتماد
                      </button>
                      <ActionMenu
                        actions={[
                          { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailEntry(j) },
                          {
                            label: "ترحيل",
                            icon: ArrowUpDown,
                            onClick: () => handleStatusChange(j.id, "مرحّل"),
                          },
                          { label: "إنشاء قيد عكسي", icon: Copy, onClick: () => handleReverse(j) },
                          {
                            label: "حذف",
                            icon: Trash2,
                            onClick: () => {
                              setDeleteId(j.id);
                              setConfirmOpen(true);
                            },
                            variant: "destructive",
                          },
                        ]}
                      />
                    </>
                  )}
                  {j.status === "بانتظار الموافقة" && (
                    <>
                      <button
                        className="text-xs font-semibold text-success"
                        onClick={() => handleStatusChange(j.id, "مرحّل")}
                      >
                        اعتماد
                      </button>
                      <ActionMenu
                        actions={[
                          { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailEntry(j) },
                          { label: "إنشاء قيد عكسي", icon: Copy, onClick: () => handleReverse(j) },
                        ]}
                      />
                    </>
                  )}
                  {j.status === "مرحّل" && (
                    <ActionMenu
                      actions={[
                        { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailEntry(j) },
                        { label: "طباعة", icon: FileText, onClick: () => window.print() },
                        { label: "إنشاء قيد عكسي", icon: Copy, onClick: () => handleReverse(j) },
                      ]}
                    />
                  )}
                  {j.status === "ملغى" && (
                    <ActionMenu
                      actions={[
                        { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailEntry(j) },
                      ]}
                    />
                  )}
                </div>
              </div>
            </Card>
          )}
        />
      </AppShell>

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        title={editingId ? "تعديل قيد يومية" : "إضافة قيد يومية"}
        onSave={handleSave}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">التاريخ</label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">البيان</label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="وصف القيد"
              value={formData.desc}
              onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">حساب مدين</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.debit}
                onChange={(e) => setFormData({ ...formData, debit: e.target.value })}
              >
                <option value="">اختر حساب</option>
                {accountOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">حساب دائن</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.credit}
                onChange={(e) => setFormData({ ...formData, credit: e.target.value })}
              >
                <option value="">اختر حساب</option>
                {accountOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">المبلغ</label>
            <input
              type="number"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">نوع الصندوق</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.fund}
                onChange={(e) => setFormData({ ...formData, fund: e.target.value })}
              >
                {FUNDS.filter((f) => f !== "الكل").map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">المشروع</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.project}
                onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              >
                {PROJECTS.filter((p) => p !== "الكل").map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        message="هل أنت متأكد من حذف هذا القيد؟"
        confirmText="حذف"
        variant="destructive"
      />

      <EntityFormDrawer
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        title="تفاصيل القيد"
        onSave={() => setDetailEntry(null)}
        saveText="إغلاق"
      >
        {detailEntry && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">رقم القيد</span>
                <div className="font-semibold font-mono">{detailEntry.id}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">التاريخ</span>
                <div className="font-semibold">{detailEntry.date}</div>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">البيان</span>
              <div className="font-semibold">{detailEntry.desc}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">حساب مدين</span>
                <div className="font-semibold">{detailEntry.debit}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">حساب دائن</span>
                <div className="font-semibold">{detailEntry.credit}</div>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">المبلغ</span>
              <div className="font-bold text-lg">{fmtSAR(detailEntry.amount)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">نوع الصندوق</span>
                <div className="font-semibold">{detailEntry.fund}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">المشروع</span>
                <div className="font-semibold">{detailEntry.project}</div>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الحالة</span>
              <div>
                <Badge tone={statusTone(detailEntry.status)}>{detailEntry.status}</Badge>
              </div>
            </div>
          </div>
        )}
      </EntityFormDrawer>
    </>
  );
}
