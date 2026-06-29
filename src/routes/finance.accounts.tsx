import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  MobilePageHeader,
  MobileSearchInput,
} from "@/components/erp/AppShell";
import { CHART_OF_ACCOUNTS, fmtSAR } from "@/data/sample";
import { showToast, EntityFormDrawer, ActionMenu, ExportButton } from "@/components/erp/actions";
import {
  Plus,
  Download,
  ChevronLeft,
  ChevronDown,
  Search,
  Eye,
  Edit,
  FolderPlus,
} from "lucide-react";

export const Route = createFileRoute("/finance/accounts")({
  head: () => ({ meta: [{ title: "دليل الحسابات — ثواب" }] }),
  component: Page,
});

const ACCOUNT_TYPES = ["أصل", "التزام", "حقوق", "إيراد", "مصروف"];

function Page() {
  const [accounts, setAccounts] = useState(CHART_OF_ACCOUNTS);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedCode, setSelectedCode] = useState("1102");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "أصل",
    parent: "",
    currency: "ر.س - SAR",
    openingBalance: "",
  });

  const selected = accounts.find((a) => a.code === selectedCode);

  const filtered = accounts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
  });

  const visibleAccounts = filtered.filter((a) => {
    if (a.level === 1) return true;
    if (a.level === 2) return expanded.has(a.code[0]);
    if (a.level === 3) return expanded.has(a.code.slice(0, 2));
    return false;
  });

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const getChildren = (code: string) => {
    const parent = accounts.find((a) => a.code === code);
    if (!parent) return [];
    return accounts.filter((a) => a.code.startsWith(code) && a.level === parent.level + 1);
  };

  const hasChildren = (code: string) => getChildren(code).length > 0;

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      type: "أصل",
      parent: "",
      currency: "ر.س - SAR",
      openingBalance: "",
    });
    setEditingCode(null);
  };

  const handleSave = () => {
    if (!formData.code || !formData.name) {
      showToast("يرجى ملء رمز الحساب واسمه", "error");
      return;
    }
    if (editingCode) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.code === editingCode
            ? { ...a, code: formData.code, name: formData.name, type: formData.type }
            : a,
        ),
      );
      showToast("تم تعديل الحساب بنجاح", "success");
    } else {
      const parent = accounts.find((a) => a.code === formData.parent);
      const level = parent ? parent.level + 1 : 1;
      setAccounts((prev) => [
        ...prev,
        {
          code: formData.code,
          name: formData.name,
          level,
          type: formData.type,
          balance: Number(formData.openingBalance) || 0,
        },
      ]);
      showToast("تم إضافة الحساب بنجاح", "success");
    }
    setFormOpen(false);
    resetForm();
  };

  const handleEdit = (code: string) => {
    const a = accounts.find((ac) => ac.code === code);
    if (!a) return;
    setFormData({
      code: a.code,
      name: a.name,
      type: a.type,
      parent: "",
      currency: "ر.س - SAR",
      openingBalance: String(a.balance),
    });
    setEditingCode(code);
    setFormOpen(true);
  };

  const exportData = accounts.map((a) => ({
    الرمز: a.code,
    "اسم الحساب": a.name,
    المستوى: a.level,
    النوع: a.type,
    الرصيد: a.balance,
  }));

  const subAccounts = selected
    ? accounts.filter((a) => a.code.startsWith(selected.code) && a.level === selected.level + 1)
    : [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "دليل الحسابات"]}
      title="دليل الحسابات"
      actions={
        <>
          <ExportButton data={exportData} filename="chart-of-accounts.csv" />
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            <Plus size={15} />
            حساب جديد
          </Btn>
        </>
      }
    >
      <MobilePageHeader title="دليل الحسابات" count={`${accounts.length} حساب`} />
      <MobileSearchInput
        placeholder="بحث عن حساب..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-1 p-4 hidden lg:block">
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
              placeholder="بحث عن حساب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1 text-sm">
            {visibleAccounts.map((a) => {
              const isExpanded = expanded.has(a.code);
              const childCount = getChildren(a.code).length;
              return (
                <div key={a.code} className="flex items-center gap-1">
                  <button
                    className={`flex-1 text-right rounded-md py-1.5 px-2 hover:bg-muted transition-colors flex items-center gap-2 ${a.level === 1 ? "font-bold" : ""} ${selectedCode === a.code ? "bg-muted" : ""}`}
                    style={{ paddingRight: `${a.level * 12 + 8}px` }}
                    onClick={() => setSelectedCode(a.code)}
                  >
                    {hasChildren(a.code) ? (
                      isExpanded ? (
                        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronLeft size={12} className="text-muted-foreground shrink-0" />
                      )
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <button
                      className="p-0 text-right"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(a.code);
                      }}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronLeft size={12} />}
                    </button>
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </button>
                  <ActionMenu
                    actions={[
                      { label: "عرض التفاصيل", icon: Eye, onClick: () => setSelectedCode(a.code) },
                      { label: "تعديل", icon: Edit, onClick: () => handleEdit(a.code) },
                      {
                        label: "إضافة حساب فرعي",
                        icon: FolderPlus,
                        onClick: () => {
                          resetForm();
                          setFormData((prev) => ({ ...prev, parent: a.code }));
                          setFormOpen(true);
                        },
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <div className="lg:hidden">
          <select
            className="w-full rounded-xl border bg-background py-2.5 px-3 text-sm min-h-[44px]"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <Card className="lg:col-span-3 p-5">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {selected.code} · {selected.type}
                  </div>
                  <h2 className="text-xl font-extrabold">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selected.level === 1
                      ? "حساب رئيسي"
                      : selected.level === 2
                        ? "حساب فرعي"
                        : "حساب تفصيلي"}
                    {selected.level > 1 &&
                      ` تابع للحساب ${accounts.find((a) => a.code === (selected.level === 2 ? selected.code[0] : selected.code.slice(0, 2)))?.name || "—"}`}
                  </p>
                </div>
                <div className="text-left">
                  <div className="text-xs text-muted-foreground">الرصيد الحالي</div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {fmtSAR(selected.balance)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {[
                  { l: "نوع الحساب", v: selected.type },
                  { l: "العملة", v: "ر.س - SAR" },
                  { l: "مستوى الحساب", v: `المستوى ${selected.level}` },
                  { l: "حالة الحساب", v: "نشط" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg bg-muted/50 p-3">
                    <div className="text-[11px] text-muted-foreground">{s.l}</div>
                    <div className="font-semibold text-sm mt-0.5">{s.v}</div>
                  </div>
                ))}
              </div>

              {subAccounts.length > 0 && (
                <div>
                  <h4 className="font-bold mb-2">الحسابات الفرعية</h4>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/60">
                        <tr className="text-right">
                          <th className="px-3 py-2 font-semibold">الرمز</th>
                          <th className="px-3 py-2 font-semibold">اسم الحساب</th>
                          <th className="px-3 py-2 font-semibold">النوع</th>
                          <th className="px-3 py-2 font-semibold">الرصيد</th>
                          <th className="px-3 py-2 font-semibold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subAccounts.map((sa) => (
                          <tr key={sa.code} className="border-t hover:bg-muted/40">
                            <td className="px-3 py-2 font-mono text-xs">{sa.code}</td>
                            <td className="px-3 py-2 font-semibold">{sa.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{sa.type}</td>
                            <td className="px-3 py-2 tabular-nums font-bold">
                              {fmtSAR(sa.balance)}
                            </td>
                            <td className="px-3 py-2">
                              <Badge tone="success">نشط</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">اختر حساباً من القائمة</div>
          )}
        </Card>
      </div>

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        title={editingCode ? "تعديل حساب" : "إضافة حساب"}
        onSave={handleSave}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">رمز الحساب</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="مثال: 1104"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">اسم الحساب</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="اسم الحساب"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">النوع</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">الحساب الأب</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.parent}
                onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
              >
                <option value="">بدون (حساب رئيسي)</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">العملة</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">الرصيد الافتتاحي</label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="0"
                value={formData.openingBalance}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
              />
            </div>
          </div>
        </div>
      </EntityFormDrawer>
    </AppShell>
  );
}
