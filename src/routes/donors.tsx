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
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Download, Search, UserPlus, Filter, Eye, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/api/auth";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
  EmptyState,
} from "@/components/erp/actions";
import {
  getDonors,
  createDonor,
  updateDonor,
  deleteDonor,
  type Donor,
  type DonorFilters,
} from "@/lib/api/donors";

export const Route = createFileRoute("/donors")({
  head: () => ({ meta: [{ title: "المتبرعون — ثواب" }] }),
  component: Page,
});

function tagTone(t: string) {
  return t === "ذهبي" ? "warning" : t === "فضي" ? "info" : "muted";
}

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [tagFilter, setTagFilter] = useState("الكل");
  const [cityFilter, setCityFilter] = useState("الكل");
  const [recurringFilter, setRecurringFilter] = useState("الكل");

  const [apiFilters, setApiFilters] = useState<DonorFilters>({
    search: "",
    type: "",
    tag: "",
    city: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["donors", apiFilters],
    queryFn: () => getDonors(apiFilters),
  });

  const donors = data?.items || [];
  const total = data?.total || 0;

  useEffect(() => {
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      type: typeFilter,
      tag: tagFilter,
      city: cityFilter,
    }));
  }, [searchQuery, typeFilter, tagFilter, cityFilter]);

  const { user } = useAuth();

  const createMutation = useMutation({
    mutationFn: createDonor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم إضافة المتبرع بنجاح", "success");
      setAddDonorOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateDonor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم تحديث بيانات المتبرع بنجاح", "success");
      setAddDonorOpen(false);
      setEditingDonor(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDonor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم حذف المتبرع بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAddDonor = () => {
    navigate({ to: "/donors/new" });
  };

  const openEditDonor = (d: Donor) => {
    navigate({ to: "/donors/$id/edit", params: { id: d.id } });
  };

  const handleSaveDonor = () => {
    if (editingDonor) {
      updateMutation.mutate({
        id: editingDonor.id,
        name: formName,
        type: formType,
        email: formEmail || undefined,
        phone: formPhone || undefined,
        city: formCity,
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      createMutation.mutate({
        name: formName,
        type: formType,
        email: formEmail || undefined,
        phone: formPhone || undefined,
        city: formCity,
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
          { l: "إجمالي المتبرعين", v: fmtNum(total || donors.length) },
          { l: "متبرعون نشطون", v: fmtNum(donors.filter((d: Donor) => d.status === "نشط").length) },
          { l: "متبرعون متكررون", v: fmtNum(donors.filter((d: Donor) => d.recurring).length) },
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
            placeholder="بحث باسم المتبرع، الجوال، البريد..."
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
        count={`${donors.length} متبرع`}
        action={
          <Btn variant="primary" onClick={openAddDonor}>
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
          description="حدث خطأ أثناء تحميل قائمة المتبرعين"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["donors"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : donors.length === 0 ? (
        <EmptyState
          title="لا يوجد متبرعون"
          description="ابدأ بإضافة أول متبرع للنظام"
          action={
            <Btn variant="primary" onClick={openAddDonor}>
              إضافة متبرع
            </Btn>
          }
        />
      ) : (
        <>
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
            rows={donors}
            renderRow={(d: Donor) => (
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
                <Td className="tabular-nums font-bold">{fmtSAR(d.totalDonations)}</Td>
                <Td className="tabular-nums">{d.donationCount}</Td>
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
                        onClick: () =>
                          showToast(`${d.name} - إجمالي ${fmtSAR(d.totalDonations)}`, "info"),
                      },
                      { label: "تعديل", icon: Pencil, onClick: () => openEditDonor(d) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        onClick: () => setDeleteTarget(d.id),
                        variant: "destructive" as const,
                      },
                    ]}
                  />
                </Td>
              </>
            )}
            mobileCard={(d: Donor) => (
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
                                    showToast(
                                      `${d.name} - إجمالي ${fmtSAR(d.totalDonations)}`,
                                      "info",
                                    );
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
                                  variant: "destructive" as const,
                                },
                              ] as any
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">إجمالي التبرعات</div>
                          <div className="text-base font-bold tabular-nums">
                            {fmtSAR(d.totalDonations)}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="text-xs text-muted-foreground">عدد العمليات</div>
                          <div className="text-sm font-semibold">{d.donationCount}</div>
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
        </>
      )}
    </AppShell>
  );
}
