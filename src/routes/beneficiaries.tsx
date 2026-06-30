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
import { fmtNum } from "@/data/sample";
import { Plus, Download, Search, UserPlus, Filter, Eye, Pencil, Trash2 } from "lucide-react";
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
import {
  getBeneficiaries,
  createBeneficiary,
  updateBeneficiary,
  deleteBeneficiary,
  changeBeneficiaryStatus,
  type Beneficiary,
  type BeneficiaryFilters,
} from "@/lib/api/beneficiaries";

export const Route = createFileRoute("/beneficiaries")({
  head: () => ({ meta: [{ title: "المستفيدون — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingBeneficiary, setEditingBeneficiary] = useState<Beneficiary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [formName, setFormName] = useState("");
  const [formIdNumber, setFormIdNumber] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCategory, setFormCategory] = useState("أسر محتاجة");
  const [formStatus, setFormStatus] = useState("جديد");
  const [formNotes, setFormNotes] = useState("");

  const [apiFilters, setApiFilters] = useState<BeneficiaryFilters>({
    search: "",
    status: "",
    category: "",
    city: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["beneficiaries", apiFilters],
    queryFn: () => getBeneficiaries(apiFilters),
  });

  const beneficiaries = data?.items || [];

  useEffect(() => {
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusFilter,
      category: categoryFilter,
      city: cityFilter,
    }));
  }, [searchQuery, statusFilter, categoryFilter, cityFilter]);

  const createMutation = useMutation({
    mutationFn: createBeneficiary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم إضافة المستفيد بنجاح", "success");
      setAddOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateBeneficiary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم تحديث بيانات المستفيد بنجاح", "success");
      setAddOpen(false);
      setEditingBeneficiary(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBeneficiary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beneficiaries"] });
      showToast("تم حذف المستفيد بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setEditingBeneficiary(null);
    setFormName("");
    setFormIdNumber("");
    setFormPhone("");
    setFormCity("");
    setFormAddress("");
    setFormCategory("أسر محتاجة");
    setFormStatus("جديد");
    setFormNotes("");
    setAddOpen(true);
  };

  const openEdit = (b: Beneficiary) => {
    setEditingBeneficiary(b);
    setFormName(b.name);
    setFormIdNumber(b.idNumber || "");
    setFormPhone(b.phone || "");
    setFormCity(b.city);
    setFormAddress(b.address || "");
    setFormCategory(b.category);
    setFormStatus(b.status);
    setFormNotes(b.notes || "");
    setAddOpen(true);
  };

  const handleSave = () => {
    if (editingBeneficiary) {
      updateMutation.mutate({
        id: editingBeneficiary.id,
        name: formName,
        idNumber: formIdNumber,
        phone: formPhone || undefined,
        city: formCity,
        address: formAddress,
        category: formCategory,
        status: formStatus,
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      createMutation.mutate({
        name: formName,
        idNumber: formIdNumber,
        phone: formPhone || undefined,
        city: formCity,
        address: formAddress,
        category: formCategory,
        status: formStatus,
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const stats = [
    { label: "إجمالي المستفيدين", value: fmtNum(beneficiaries.length) },
    {
      label: "مؤهلين",
      value: beneficiaries.filter((b: Beneficiary) => b.status === "مؤهل").length,
    },
    { label: "جدد", value: beneficiaries.filter((b: Beneficiary) => b.status === "جديد").length },
    {
      label: "غير مؤهلين",
      value: beneficiaries.filter((b: Beneficiary) => b.status === "غير مؤهل").length,
    },
  ];

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums">{s.value}</div>
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
          options={["الكل", "أيتام", "أرامل", "أسر محتاجة", "مرضى", "أسر منتجة"]}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        />
        <Select
          label="الحالة"
          options={["الكل", "جديد", "قيد المراجعة", "مؤهل", "غير مؤهل", "موقوف"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <Select
          label="المدينة"
          options={["الكل", "الرياض", "جدة", "الدمام", "أبها", "الطائف", "المدينة المنورة"]}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
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
        count={`${beneficiaries.length} مستفيد`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <UserPlus size={15} />
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
          description="حدث خطأ أثناء تحميل المستفيدين"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["beneficiaries"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : beneficiaries.length === 0 ? (
        <EmptyState
          title="لا توجد مستفيدين"
          description="ابدأ بإضافة أول مستفيد"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مستفيد
            </Btn>
          }
        />
      ) : (
        <>
          <div className="hidden lg:block">
            <Table
              columns={["الرقم", "الاسم", "الفئة", "الجوال", "المدينة", "الحالة", ""]}
              rows={beneficiaries}
              renderRow={(b: Beneficiary) => (
                <>
                  <Td className="font-mono text-xs">{b.id}</Td>
                  <Td className="font-semibold">{b.name}</Td>
                  <Td>
                    <Badge tone="info">{b.category}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{b.phone || "—"}</Td>
                  <Td className="text-muted-foreground">{b.city}</Td>
                  <Td>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${b.name} - ${b.category}`, "info"),
                        },
                        { label: "تعديل", icon: Pencil, onClick: () => openEdit(b) },
                        {
                          label: "حذف",
                          icon: Trash2,
                          onClick: () => setDeleteTarget(b.id),
                          variant: "destructive" as const,
                        },
                      ]}
                    />
                  </Td>
                </>
              )}
            />
          </div>

          <div className="lg:hidden space-y-2">
            {beneficiaries.map((b: Beneficiary) => (
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
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{b.phone || "—"}</span>
                      <ActionMenu
                        actions={[
                          { label: "تعديل", icon: Pencil, onClick: () => openEdit(b) },
                          {
                            label: "حذف",
                            icon: Trash2,
                            onClick: () => setDeleteTarget(b.id),
                            variant: "destructive" as const,
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <EntityFormDrawer
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditingBeneficiary(null);
        }}
        title={editingBeneficiary ? "تعديل المستفيد" : "إضافة مستفيد جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="اسم المستفيد"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">رقم الهوية</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formIdNumber}
            onChange={(e) => setFormIdNumber(e.target.value)}
            placeholder="رقم الهوية أو الإقامة"
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
          <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formCity}
            onChange={(e) => setFormCity(e.target.value)}
          >
            <option value="">اختر المدينة</option>
            <option>الرياض</option>
            <option>جدة</option>
            <option>الدمام</option>
            <option>أبها</option>
            <option>الطائف</option>
            <option>المدينة المنورة</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          >
            <option>أيتام</option>
            <option>أرامل</option>
            <option>أسر محتاجة</option>
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
            <option value="جديد">جديد</option>
            <option value="قيد المراجعة">قيد المراجعة</option>
            <option value="مؤهل">مؤهل</option>
            <option value="غير مؤهل">غير مؤهل</option>
            <option value="موقوف">موقوف</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={3}
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="ملاحظات..."
          />
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
              <option>أسر محتاجة</option>
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
              <option>جديد</option>
              <option>قيد المراجعة</option>
              <option>مؤهل</option>
              <option>غير مؤهل</option>
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
              <option>الدمام</option>
              <option>أبها</option>
              <option>الطائف</option>
              <option>المدينة المنورة</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
