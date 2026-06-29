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
  MobileActionChips,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { DONATIONS, DONORS, fmtSAR } from "@/data/sample";
import { Plus, Search, Printer, Filter, Eye, Pencil, Trash2, UserPlus } from "lucide-react";
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

export const Route = createFileRoute("/donations")({
  head: () => ({ meta: [{ title: "إدارة التبرعات — ثواب" }] }),
  component: Page,
});

function Page() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [donations, setDonations] = useState(DONATIONS);
  const [donorsList, setDonorsList] = useState(DONORS);
  const [addDonationOpen, setAddDonationOpen] = useState(false);
  const [addDonorOpen, setAddDonorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingDonationId, setEditingDonationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [projectFilter, setProjectFilter] = useState("الكل");
  const [methodFilter, setMethodFilter] = useState("الكل");
  const [channelFilter, setChannelFilter] = useState("الكل");
  const [formDonor, setFormDonor] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formProject, setFormProject] = useState("صدقة جارية");
  const [formMethod, setFormMethod] = useState("تحويل بنكي");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [newDonorName, setNewDonorName] = useState("");
  const [newDonorType, setNewDonorType] = useState<"فرد" | "شركة" | "مؤسسة">("فرد");
  const [newDonorPhone, setNewDonorPhone] = useState("");
  const [newDonorEmail, setNewDonorEmail] = useState("");
  const [newDonorCity, setNewDonorCity] = useState("");

  const filteredDonations = donations.filter((d) => {
    if (statusFilter !== "الكل" && d.status !== statusFilter) return false;
    if (projectFilter !== "الكل" && d.project !== projectFilter) return false;
    if (methodFilter !== "الكل" && d.method !== methodFilter) return false;
    if (channelFilter !== "الكل" && d.channel !== channelFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !d.id.toLowerCase().includes(q) &&
        !d.donor.toLowerCase().includes(q) &&
        !d.project.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const stats = [
    { label: "تبرعات هذا الشهر", value: fmtSAR(4_582_400), sub: "+12.4%" },
    { label: "تبرعات نقدية", value: fmtSAR(1_240_000), sub: "27%" },
    { label: "تحويلات بنكية", value: fmtSAR(2_842_000), sub: "62%" },
    { label: "تبرعات عينية", value: fmtSAR(500_400), sub: "11%" },
  ];

  const openAddDonation = (method?: string) => {
    setEditingDonationId(null);
    setFormDonor("");
    setFormAmount("");
    setFormProject("صدقة جارية");
    setFormMethod(method || "تحويل بنكي");
    setFormDate("");
    setFormNotes("");
    setAddDonationOpen(true);
  };

  const openEditDonation = (d: (typeof DONATIONS)[0]) => {
    setEditingDonationId(d.id);
    setFormDonor(d.donor);
    setFormAmount(String(d.amount));
    setFormProject(d.project);
    setFormMethod(d.method);
    setFormDate(d.date);
    setFormNotes("");
    setAddDonationOpen(true);
  };

  const handleSaveDonation = () => {
    if (editingDonationId) {
      setDonations((prev) =>
        prev.map((d) =>
          d.id === editingDonationId
            ? {
                ...d,
                donor: formDonor || d.donor,
                amount: Number(formAmount) || d.amount,
                project: formProject || d.project,
                method: formMethod || d.method,
                date: formDate || d.date,
              }
            : d,
        ),
      );
      showToast("تم تحديث التبرع بنجاح", "success");
    } else {
      const id = `DON-${String(donations.length + 22015).padStart(5, "0")}`;
      const donation = {
        id,
        donor: formDonor || "متبرع غير معروف",
        project: formProject || "صدقة جارية",
        amount: Number(formAmount) || 0,
        method: formMethod,
        channel: formMethod === "تحويل بنكي" ? "البنك الأهلي" : "البوابة الإلكترونية",
        date: formDate || new Date().toLocaleDateString("ar-SA"),
        status: "مكتمل",
      };
      setDonations((prev) => [donation, ...prev]);
      showToast("تم إضافة التبرع بنجاح", "success");
    }
    setAddDonationOpen(false);
  };

  const handleAddDonor = () => {
    const id = `DNR-${String(donorsList.length + 1).padStart(5, "0")}`;
    const donor = {
      id,
      name: newDonorName,
      type: newDonorType,
      phone: newDonorPhone,
      city: newDonorCity,
      total: 0,
      donations: 0,
      recurring: false,
      tag: "برونزي" as const,
    };
    setDonorsList((prev) => [...prev, donor]);
    showToast("تم إضافة المتبرع بنجاح", "success");
    setAddDonorOpen(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setDonations((prev) => prev.filter((d) => d.id !== deleteTarget));
      showToast("تم حذف التبرع بنجاح", "success");
      setDeleteTarget(null);
    }
  };

  const handleStatusToggle = (id: string) => {
    setDonations((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const statuses = ["مكتمل", "بانتظار التحقق", "مسترد"];
        const idx = statuses.indexOf(d.status);
        return { ...d, status: statuses[(idx + 1) % statuses.length] };
      }),
    );
    showToast("تم تغيير حالة التبرع", "info");
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التبرعات والمتبرعون", "التبرعات"]}
      title="إدارة التبرعات"
      actions={
        <>
          <ExportButton data={donations} filename="التبرعات.csv" />
          <PrintButton />
          <Btn variant="outline" onClick={() => setAddDonorOpen(true)}>
            <UserPlus size={15} /> إضافة متبرع
          </Btn>
          <Btn variant="primary" onClick={() => openAddDonation()}>
            <Plus size={15} /> تسجيل تبرع جديد
          </Btn>
        </>
      }
    >
      <MobileActionChips
        items={[
          { label: "تبرع نقدي", icon: Plus, onClick: () => openAddDonation("نقدي") },
          { label: "تحويل بنكي", icon: Plus, onClick: () => openAddDonation("تحويل بنكي") },
          { label: "متبرع جديد", icon: UserPlus, onClick: () => setAddDonorOpen(true) },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
            <div className="text-xs text-success font-semibold mt-0.5">{s.sub}</div>
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
            placeholder="بحث برقم التبرع، اسم المتبرع، المشروع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="القناة"
          options={[
            "الكل",
            "البوابة الإلكترونية",
            "تطبيق الجوال",
            "مقر الجمعية",
            "تحويل بنكي",
            "تبرع متكرر",
          ]}
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
        />
        <Select
          label="طريقة الدفع"
          options={["الكل", "نقدي", "مدى", "تحويل بنكي", "Apple Pay", "STC Pay", "صك عيني"]}
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
        />
        <Select
          label="المشروع"
          options={["الكل", "كفالة الأيتام", "إفطار صائم", "السلال الغذائية", "كسوة الشتاء"]}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        />
        <Select
          label="الحالة"
          options={["الكل", "مكتمل", "بانتظار التحقق", "مسترد"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Btn variant="ghost" className="hidden lg:inline-flex">
          <Filter size={15} /> تصفية متقدمة
        </Btn>
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} /> تصفية
        </Btn>
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث عن تبرع..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader title="التبرعات" count={`${filteredDonations.length} تبرع`} />

      <MobileTable
        columns={[
          "رقم التبرع",
          "المتبرع",
          "المشروع / الحملة",
          "المبلغ",
          "طريقة الدفع",
          "القناة",
          "التاريخ",
          "الحالة",
          "",
        ]}
        rows={filteredDonations}
        renderRow={(d) => (
          <>
            <Td className="font-mono text-xs">{d.id}</Td>
            <Td className="font-semibold">{d.donor}</Td>
            <Td>{d.project}</Td>
            <Td className="tabular-nums font-bold text-success">{fmtSAR(d.amount)}</Td>
            <Td>{d.method}</Td>
            <Td className="text-muted-foreground">{d.channel}</Td>
            <Td className="text-muted-foreground">{d.date}</Td>
            <Td>
              <button onClick={() => handleStatusToggle(d.id)}>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </button>
            </Td>
            <Td>
              <ActionMenu
                actions={[
                  {
                    label: "عرض",
                    icon: Eye,
                    onClick: () => showToast(`${d.id}: ${d.donor} - ${fmtSAR(d.amount)}`, "info"),
                  },
                  { label: "تعديل", icon: Pencil, onClick: () => openEditDonation(d) },
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
          <Card key={d.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{d.donor}</div>
                <div className="text-xs text-muted-foreground">{d.project}</div>
              </div>
              <button onClick={() => handleStatusToggle(d.id)}>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </button>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-base font-bold text-success tabular-nums">
                  {fmtSAR(d.amount)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {d.method} · {d.channel}
                </div>
              </div>
              <div className="text-left">
                <div className="text-[11px] font-mono text-muted-foreground">{d.id}</div>
                <div className="text-[11px] text-muted-foreground">{d.date}</div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t flex justify-between items-center">
              <Link to="/donors" className="text-primary text-xs font-semibold">
                عرض ملف المتبرع
              </Link>
              <ActionMenu
                actions={[
                  {
                    label: "عرض",
                    icon: Eye,
                    onClick: () => showToast(`${d.id}: ${d.donor} - ${fmtSAR(d.amount)}`, "info"),
                  },
                  { label: "تعديل", icon: Pencil, onClick: () => openEditDonation(d) },
                  {
                    label: "حذف",
                    icon: Trash2,
                    onClick: () => setDeleteTarget(d.id),
                    variant: "destructive",
                  },
                ]}
              />
            </div>
          </Card>
        )}
      />

      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
        <span>عرض {filteredDonations.length} من 22,418 تبرع</span>
        <div className="flex gap-1">
          <button className="rounded border px-2 py-1 min-h-[32px]">السابق</button>
          <button className="rounded bg-primary text-primary-foreground px-3 py-1 min-h-[32px]">
            1
          </button>
          <button className="rounded border px-3 py-1 min-h-[32px]">2</button>
          <button className="rounded border px-3 py-1 min-h-[32px]">3</button>
          <button className="rounded border px-2 py-1 min-h-[32px]">التالي</button>
        </div>
      </div>

      <EntityFormDrawer
        open={addDonationOpen}
        onClose={() => setAddDonationOpen(false)}
        title={editingDonationId ? "تعديل التبرع" : "تسجيل تبرع جديد"}
        onSave={handleSaveDonation}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المتبرع</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formDonor}
            onChange={(e) => setFormDonor(e.target.value)}
            placeholder="اسم المتبرع"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المبلغ (ر.س)</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="number"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formProject}
            onChange={(e) => setFormProject(e.target.value)}
          >
            <option>صدقة جارية</option>
            <option>كفالة الأيتام</option>
            <option>إفطار صائم</option>
            <option>السلال الغذائية</option>
            <option>كسوة الشتاء</option>
            <option>علاج المرضى</option>
            <option>ترميم المساجد</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">طريقة الدفع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formMethod}
            onChange={(e) => setFormMethod(e.target.value)}
          >
            <option>نقدي</option>
            <option>تحويل بنكي</option>
            <option>مدى</option>
            <option>Apple Pay</option>
            <option>STC Pay</option>
            <option>صك عيني</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">التاريخ</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
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

      <EntityFormDrawer
        open={addDonorOpen}
        onClose={() => {
          setAddDonorOpen(false);
          setNewDonorName("");
          setNewDonorType("فرد");
          setNewDonorPhone("");
          setNewDonorEmail("");
          setNewDonorCity("");
        }}
        title="إضافة متبرع جديد"
        onSave={handleAddDonor}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={newDonorName}
            onChange={(e) => setNewDonorName(e.target.value)}
            placeholder="الاسم الكامل"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">النوع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={newDonorType}
            onChange={(e) => setNewDonorType(e.target.value as "فرد" | "شركة" | "مؤسسة")}
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
            value={newDonorPhone}
            onChange={(e) => setNewDonorPhone(e.target.value)}
            placeholder="05xxxxxxxx"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">البريد الإلكتروني</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={newDonorEmail}
            onChange={(e) => setNewDonorEmail(e.target.value)}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={newDonorCity}
            onChange={(e) => setNewDonorCity(e.target.value)}
            placeholder="المدينة"
          />
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف التبرع"
        message="هل أنت متأكد من حذف هذا التبرع؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">القناة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>البوابة الإلكترونية</option>
              <option>تطبيق الجوال</option>
              <option>مقر الجمعية</option>
              <option>تحويل بنكي</option>
              <option>تبرع متكرر</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">طريقة الدفع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>نقدي</option>
              <option>تحويل بنكي</option>
              <option>مدى</option>
              <option>Apple Pay</option>
              <option>STC Pay</option>
              <option>صك عيني</option>
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
              <option>إفطار صائم</option>
              <option>السلال الغذائية</option>
              <option>كسوة الشتاء</option>
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
              <option>مكتمل</option>
              <option>بانتظار التحقق</option>
              <option>مسترد</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
