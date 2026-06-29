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
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { DONORS, fmtSAR, fmtNum } from "@/data/sample";
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

export const Route = createFileRoute("/donors")({
  head: () => ({ meta: [{ title: "المتبرعون — ثواب" }] }),
  component: Page,
});

function tagTone(t: string) {
  return t === "ذهبي" ? "warning" : t === "فضي" ? "info" : "muted";
}

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [donors, setDonors] = useState(DONORS);
  const [addDonorOpen, setAddDonorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingDonorId, setEditingDonorId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [tagFilter, setTagFilter] = useState("الكل");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [recurringFilter, setRecurringFilter] = useState("الكل");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"فرد" | "شركة" | "مؤسسة">("فرد");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const filteredDonors = donors.filter((d) => {
    if (typeFilter !== "الكل" && d.type !== typeFilter) return false;
    if (tagFilter !== "الكل" && d.tag !== tagFilter) return false;
    if (cityFilter !== "الكل" && d.city !== cityFilter) return false;
    if (recurringFilter === "نعم" && !d.recurring) return false;
    if (recurringFilter === "لا" && d.recurring) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !d.name.toLowerCase().includes(q) &&
        !d.phone.toLowerCase().includes(q) &&
        !d.id.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const openAddDonor = () => {
    setEditingDonorId(null);
    setFormName("");
    setFormType("فرد");
    setFormPhone("");
    setFormEmail("");
    setFormCity("");
    setFormNotes("");
    setAddDonorOpen(true);
  };

  const openEditDonor = (d: (typeof DONORS)[0]) => {
    setEditingDonorId(d.id);
    setFormName(d.name);
    setFormType(d.type);
    setFormPhone(d.phone);
    setFormEmail("");
    setFormCity(d.city);
    setFormNotes("");
    setAddDonorOpen(true);
  };

  const handleSaveDonor = () => {
    if (editingDonorId) {
      setDonors((prev) =>
        prev.map((d) =>
          d.id === editingDonorId
            ? {
                ...d,
                name: formName || d.name,
                type: formType,
                phone: formPhone || d.phone,
                city: formCity || d.city,
              }
            : d,
        ),
      );
      showToast("تم تحديث بيانات المتبرع بنجاح", "success");
    } else {
      const id = `DNR-${String(donors.length + 1).padStart(5, "0")}`;
      const donor = {
        id,
        name: formName,
        type: formType,
        phone: formPhone,
        city: formCity,
        total: 0,
        donations: 0,
        recurring: false,
        tag: "برونزي" as const,
      };
      setDonors((prev) => [...prev, donor]);
      showToast("تم إضافة المتبرع بنجاح", "success");
    }
    setAddDonorOpen(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setDonors((prev) => prev.filter((d) => d.id !== deleteTarget));
      showToast("تم حذف المتبرع بنجاح", "success");
      setDeleteTarget(null);
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التبرعات والمتبرعون", "المتبرعون"]}
      title="إدارة المتبرعين (CRM)"
      actions={
        <>
          <ExportButton data={donors} filename="المتبرعون.csv" />
          <PrintButton />
          <Btn variant="primary" onClick={openAddDonor}>
            <UserPlus size={15} /> متبرع جديد
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {[
          { l: "إجمالي المتبرعين", v: fmtNum(18_420) },
          { l: "متبرعون نشطون", v: fmtNum(4_120) },
          { l: "متبرعون متكررون", v: fmtNum(2_840) },
          { l: "متوسط التبرع", v: fmtSAR(420) },
        ].map((s) => (
          <Card key={s.l} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.l}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums">{s.v}</div>
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
            placeholder="بحث باسم المتبرع، الجوال، الهوية..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="النوع"
          options={["الكل", "فرد", "شركة", "مؤسسة"]}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
        <Select
          label="التصنيف"
          options={["الكل", "ذهبي", "فضي", "برونزي"]}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <Select
          label="المدينة"
          options={["الكل", "الرياض", "جدة", "الدمام", "مكة المكرمة"]}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
        />
        <Select
          label="متكرر"
          options={["الكل", "نعم", "لا"]}
          value={recurringFilter}
          onChange={(e) => setRecurringFilter(e.target.value)}
        />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث عن متبرع..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="المتبرعون"
        count={`${filteredDonors.length} متبرع`}
        action={
          <Btn variant="primary" onClick={openAddDonor}>
            <UserPlus size={15} />
          </Btn>
        }
      />

      <MobileTable
        columns={[
          "الرقم",
          "اسم المتبرع",
          "النوع",
          "المدينة",
          "إجمالي التبرعات",
          "عدد العمليات",
          "متكرر",
          "التصنيف",
          "",
        ]}
        rows={filteredDonors}
        renderRow={(d) => (
          <>
            <Td className="font-mono text-xs">{d.id}</Td>
            <Td>
              <Link
                to="/donors/$id"
                params={{ id: d.id }}
                className="font-semibold hover:text-primary"
              >
                {d.name}
              </Link>
            </Td>
            <Td>
              <Badge tone="info">{d.type}</Badge>
            </Td>
            <Td className="text-muted-foreground">{d.city}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(d.total)}</Td>
            <Td className="tabular-nums">{d.donations}</Td>
            <Td>{d.recurring ? <Badge tone="success">نعم</Badge> : <Badge>لا</Badge>}</Td>
            <Td>
              <Badge tone={tagTone(d.tag)}>{d.tag}</Badge>
            </Td>
            <Td>
              <ActionMenu
                actions={[
                  {
                    label: "عرض",
                    icon: Eye,
                    onClick: () => showToast(`${d.name} - إجمالي ${fmtSAR(d.total)}`, "info"),
                  },
                  { label: "تعديل", icon: Pencil, onClick: () => openEditDonor(d) },
                  {
                    label: "حذف",
                    icon: Trash2,
                    onClick: () => setDeleteTarget(d.id),
                    variant: "destructive",
                  },
                ]}
              />
            </Td>
          </>
        )}
        mobileCard={(d) => (
          <Link key={d.id} to="/donors/$id" params={{ id: d.id }}>
            <Card className="p-3 hover:border-primary transition-colors">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white text-sm font-bold">
                  {d.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.city}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge tone={tagTone(d.tag)}>{d.tag}</Badge>
                      <ActionMenu
                        actions={
                          [
                            {
                              label: "عرض",
                              icon: Eye,
                              onClick: (e) => {
                                e?.preventDefault?.();
                                showToast(`${d.name} - إجمالي ${fmtSAR(d.total)}`, "info");
                              },
                            },
                            {
                              label: "تعديل",
                              icon: Pencil,
                              onClick: (e) => {
                                e?.preventDefault?.();
                                openEditDonor(d);
                              },
                            },
                            {
                              label: "حذف",
                              icon: Trash2,
                              onClick: (e) => {
                                e?.preventDefault?.();
                                setDeleteTarget(d.id);
                              },
                              variant: "destructive",
                            },
                          ] as any
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">إجمالي التبرعات</div>
                      <div className="text-base font-bold tabular-nums">{fmtSAR(d.total)}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-xs text-muted-foreground">عدد العمليات</div>
                      <div className="text-sm font-semibold">{d.donations}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone="info">{d.type}</Badge>
                    {d.recurring && <Badge tone="success">متكرر</Badge>}
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        )}
      />

      <EntityFormDrawer
        open={addDonorOpen}
        onClose={() => setAddDonorOpen(false)}
        title={editingDonorId ? "تعديل المتبرع" : "إضافة متبرع جديد"}
        onSave={handleSaveDonor}
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
          <label className="text-xs font-semibold text-muted-foreground">النوع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formType}
            onChange={(e) => setFormType(e.target.value as "فرد" | "شركة" | "مؤسسة")}
          >
            <option>فرد</option>
            <option>شركة</option>
            <option>مؤسسة</option>
          </select>
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
          <label className="text-xs font-semibold text-muted-foreground">البريد الإلكتروني</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formCity}
            onChange={(e) => setFormCity(e.target.value)}
            placeholder="المدينة"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={3}
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
          />
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف المتبرع"
        message="هل أنت متأكد من حذف هذا المتبرع؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>فرد</option>
              <option>شركة</option>
              <option>مؤسسة</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>ذهبي</option>
              <option>فضي</option>
              <option>برونزي</option>
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
              <option>الدمام</option>
              <option>مكة المكرمة</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
