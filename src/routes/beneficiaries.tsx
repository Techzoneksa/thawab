import { createFileRoute } from "@tanstack/react-router";
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
import { BENEFICIARIES, fmtNum } from "@/data/sample";
import { Plus, Download, Search, UserPlus, Filter, Eye, Pencil, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/beneficiaries")({
  head: () => ({ meta: [{ title: "المستفيدون — ثواب" }] }),
  component: Page,
});

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState(BENEFICIARIES);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [projectFilter, setProjectFilter] = useState("الكل");
  const [formName, setFormName] = useState("");
  const [formIdNum, setFormIdNum] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formHelpType, setFormHelpType] = useState("مساعدات نقدية");
  const [formStatus, setFormStatus] = useState("مستحق");

  const filtered = beneficiaries.filter((b) => {
    if (categoryFilter !== "الكل" && b.category !== categoryFilter) return false;
    if (statusFilter !== "الكل" && b.status !== statusFilter) return false;
    if (cityFilter !== "الكل" && b.city !== cityFilter) return false;
    if (projectFilter !== "الكل" && b.project !== projectFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.name.toLowerCase().includes(q) && !b.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openAdd = () => {
    setEditingId(null);
    setFormName("");
    setFormIdNum("");
    setFormPhone("");
    setFormAddress("");
    setFormHelpType("مساعدات نقدية");
    setFormStatus("مستحق");
    setAddOpen(true);
  };

  const openEdit = (b: (typeof BENEFICIARIES)[0]) => {
    setEditingId(b.id);
    setFormName(b.name);
    setFormIdNum("");
    setFormPhone("");
    setFormAddress(b.city);
    setFormHelpType(b.category);
    setFormStatus(b.status);
    setAddOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      setBeneficiaries((prev) =>
        prev.map((b) =>
          b.id === editingId
            ? {
                ...b,
                name: formName || b.name,
                status: formStatus,
                category: formHelpType,
                city: formAddress || b.city,
              }
            : b,
        ),
      );
      showToast("تم تحديث بيانات المستفيد بنجاح", "success");
    } else {
      const id = `BEN-${String(beneficiaries.length + 30030).padStart(5, "0")}`;
      const b = {
        id,
        name: formName,
        category: formHelpType,
        family: 1,
        city: formAddress,
        status: formStatus,
        lastAid: "—",
        project: "—",
      };
      setBeneficiaries((prev) => [...prev, b]);
      showToast("تم إضافة المستفيد بنجاح", "success");
    }
    setAddOpen(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setBeneficiaries((prev) => prev.filter((b) => b.id !== deleteTarget));
      showToast("تم حذف المستفيد بنجاح", "success");
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المستفيدون"]}
      title="قاعدة بيانات المستفيدين"
      actions={
        <>
          <ExportButton data={beneficiaries} filename="المستفيدون.csv" />
          <PrintButton />
          <Btn variant="primary" onClick={openAdd}>
            <UserPlus size={15} /> إضافة مستفيد
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3 lg:mb-4">
        {[
          { l: "إجمالي المستفيدين", v: fmtNum(12_846) },
          { l: "مستحقون", v: fmtNum(9_420) },
          { l: "قيد الدراسة", v: fmtNum(820) },
          { l: "موقوفون", v: fmtNum(240) },
          { l: "هذا الشهر", v: fmtNum(412) },
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
            placeholder="بحث باسم المستفيد، رقم الهوية، الجوال..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الفئة"
          options={["الكل", "أيتام", "أرامل", "أسر متعففة", "مرضى", "أسر منتجة"]}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        />
        <Select
          label="الحالة"
          options={["الكل", "مستحق", "قيد الدراسة", "موقوف"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="المدينة"
          options={["الكل", "الرياض", "جدة", "أبها", "الطائف", "المدينة المنورة"]}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
        />
        <Select
          label="المشروع"
          options={["الكل", "كفالة الأيتام", "السلال الغذائية", "علاج المرضى"]}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
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
        count={`${filtered.length} مستفيد`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <UserPlus size={15} />
          </Btn>
        }
      />

      <MobileTable
        columns={[
          "الرقم",
          "اسم المستفيد",
          "الفئة",
          "أفراد الأسرة",
          "المدينة",
          "الحالة",
          "آخر مساعدة",
          "المشروع",
          "",
        ]}
        rows={filtered}
        renderRow={(b) => (
          <>
            <Td className="font-mono text-xs">{b.id}</Td>
            <Td className="font-semibold">{b.name}</Td>
            <Td>
              <Badge tone="info">{b.category}</Badge>
            </Td>
            <Td className="tabular-nums">{b.family}</Td>
            <Td className="text-muted-foreground">{b.city}</Td>
            <Td>
              <Badge tone={statusTone(b.status)}>{b.status}</Badge>
            </Td>
            <Td className="text-muted-foreground">{b.lastAid}</Td>
            <Td className="text-xs">{b.project}</Td>
            <Td>
              <ActionMenu
                actions={[
                  {
                    label: "عرض",
                    icon: Eye,
                    onClick: () => showToast(`${b.name} - ${b.category} - ${b.city}`, "info"),
                  },
                  { label: "تعديل", icon: Pencil, onClick: () => openEdit(b) },
                  {
                    label: "حذف",
                    icon: Trash2,
                    onClick: () => setDeleteTarget(b.id),
                    variant: "destructive",
                  },
                ]}
              />
            </Td>
          </>
        )}
        mobileCard={(b) => (
          <Card key={b.id} className="p-3">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-info/15 text-info text-sm font-bold">
                {b.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.city} · {b.category}
                    </div>
                  </div>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">أفراد الأسرة: </span>
                    <span className="font-bold">{b.family}</span>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 truncate">
                    <span className="text-muted-foreground">آخر مساعدة: </span>
                    <span className="font-semibold">{b.lastAid}</span>
                  </div>
                </div>
                {b.project !== "—" && (
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">المشروع: </span>
                    <span className="font-semibold">{b.project}</span>
                  </div>
                )}
                <div className="mt-2 pt-2 border-t flex justify-between items-center">
                  <button
                    className="text-primary text-xs font-semibold"
                    onClick={() => showToast(`${b.name} - ${b.category} - ${b.city}`, "info")}
                  >
                    عرض الملف الشخصي
                  </button>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () => showToast(`${b.name} - ${b.category} - ${b.city}`, "info"),
                      },
                      { label: "تعديل", icon: Pencil, onClick: () => openEdit(b) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        onClick: () => setDeleteTarget(b.id),
                        variant: "destructive",
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}
      />

      <EntityFormDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editingId ? "تعديل المستفيد" : "إضافة مستفيد جديد"}
        onSave={handleSave}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="الاسم الكامل"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">رقم الهوية</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formIdNum}
            onChange={(e) => setFormIdNum(e.target.value)}
            placeholder="xxxxxxxxxx"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الجوال</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">العنوان</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formAddress}
            onChange={(e) => setFormAddress(e.target.value)}
            placeholder="المدينة"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">نوع المساعدة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formHelpType}
            onChange={(e) => setFormHelpType(e.target.value)}
          >
            <option>أيتام</option>
            <option>أرامل</option>
            <option>أسر متعففة</option>
            <option>مرضى</option>
            <option>أسر منتجة</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
          >
            <option>مستحق</option>
            <option>قيد الدراسة</option>
            <option>موقوف</option>
          </select>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المستفيد"
        message="هل أنت متأكد من حذف هذا المستفيد؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
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
              <option>الكل</option>
              <option>أيتام</option>
              <option>أرامل</option>
              <option>أسر متعففة</option>
              <option>مرضى</option>
              <option>أسر منتجة</option>
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
              <option>مستحق</option>
              <option>قيد الدراسة</option>
              <option>موقوف</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>الرياض</option>
              <option>جدة</option>
              <option>أبها</option>
              <option>الطائف</option>
              <option>المدينة المنورة</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>كفالة الأيتام</option>
              <option>السلال الغذائية</option>
              <option>علاج المرضى</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
