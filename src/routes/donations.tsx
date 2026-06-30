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
  MobileActionChips,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import {
  Plus,
  Search,
  Printer,
  Filter,
  Eye,
  Pencil,
  Trash2,
  UserPlus,
  Check,
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
import { getDonors, type Donor } from "@/lib/api/donors";
import {
  getDonations,
  createDonation,
  updateDonation,
  deleteDonation,
  confirmDonation,
  cancelDonation,
  issueReceipt,
  type Donation,
  type DonationFilters,
} from "@/lib/api/donations";

export const Route = createFileRoute("/donations")({
  head: () => ({ meta: [{ title: "إدارة التبرعات — ثواب" }] }),
  component: Page,
});

function statusToneLocal(s: string) {
  if (s === "مؤكد" || s === "تم إصدار إيصال") return "success";
  if (s === "ملغي") return "error";
  if (s === "مسودة") return "muted";
  return "info";
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filterOpen, setFilterOpen] = useState(false);
  const [addDonationOpen, setAddDonationOpen] = useState(false);
  const [addDonorOpen, setAddDonorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingDonation, setEditingDonation] = useState<Donation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [methodFilter, setMethodFilter] = useState("الكل");
  const [channelFilter, setChannelFilter] = useState("الكل");
  const [formDonorId, setFormDonorId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formProject, setFormProject] = useState("");
  const [formMethod, setFormMethod] = useState("تحويل بنكي");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [newDonorName, setNewDonorName] = useState("");
  const [newDonorType, setNewDonorType] = useState<"فرد" | "شركة" | "مؤسسة">("فرد");
  const [newDonorPhone, setNewDonorPhone] = useState("");
  const [newDonorEmail, setNewDonorEmail] = useState("");
  const [newDonorCity, setNewDonorCity] = useState("");

  const [apiFilters, setApiFilters] = useState<DonationFilters>({
    search: "",
    status: "",
    method: "",
    channel: "",
    page: 1,
    limit: 50,
  });

  const [confirmTarget, setConfirmTarget] = useState<Donation | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Donation | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Donation | null>(null);
  const [addDonorLoading, setAddDonorLoading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["donations", apiFilters],
    queryFn: () => getDonations(apiFilters),
  });

  const { data: donorsData } = useQuery({
    queryKey: ["donors-simple"],
    queryFn: () => getDonors({ limit: 200 }),
  });

  const donations = data?.items || [];
  const donors = donorsData?.items || [];
  const totalCount = data?.total || 0;

  useEffect(() => {
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusFilter,
      method: methodFilter,
      channel: channelFilter,
    }));
  }, [searchQuery, statusFilter, methodFilter, channelFilter]);

  const createMutation = useMutation({
    mutationFn: createDonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم إضافة التبرع بنجاح", "success");
      setAddDonationOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateDonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم تحديث التبرع بنجاح", "success");
      setAddDonationOpen(false);
      setEditingDonation(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم حذف التبرع بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const confirmMutation = useMutation({
    mutationFn: confirmDonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم تأكيد التبرع بنجاح", "success");
      setConfirmTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelDonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم إلغاء التبرع بنجاح", "success");
      setCancelTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const receiptMutation = useMutation({
    mutationFn: issueReceipt,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast(`تم إصدار الإيصال بنجاح: ${data.receiptId}`, "success");
      setReceiptTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAddDonation = (method?: string) => {
    setEditingDonation(null);
    setFormDonorId("");
    setFormAmount("");
    setFormProject("");
    setFormMethod(method || "تحويل بنكي");
    setFormDate("");
    setFormNotes("");
    setAddDonationOpen(true);
  };

  const openEditDonation = (d: Donation) => {
    setEditingDonation(d);
    setFormDonorId(d.donorId);
    setFormAmount(String(d.amount));
    setFormProject(d.projectName || "");
    setFormMethod(d.method);
    setFormDate(d.date);
    setFormNotes(d.notes || "");
    setAddDonationOpen(true);
  };

  const handleSaveDonation = () => {
    if (editingDonation) {
      updateMutation.mutate({
        id: editingDonation.id,
        donorId: formDonorId || undefined,
        amount: parseFloat(formAmount),
        method: formMethod,
        date: formDate,
        notes: formNotes,
        userId: user?.id,
        userName: user?.name,
      });
    } else {
      createMutation.mutate({
        donorId: formDonorId,
        amount: parseFloat(formAmount),
        method: formMethod,
        channel: formMethod === "تحويل بنكي" ? "البنك الأهلي" : "مباشر",
        date: formDate || new Date().toLocaleDateString("ar-SA"),
        notes: formNotes,
        status: "مسودة",
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

  const handleConfirm = () => {
    if (confirmTarget) {
      confirmMutation.mutate({
        id: confirmTarget.id,
        amount: confirmTarget.amount,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const handleCancel = () => {
    if (cancelTarget) {
      cancelMutation.mutate({ id: cancelTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const handleIssueReceipt = () => {
    if (receiptTarget) {
      receiptMutation.mutate({ id: receiptTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const stats = [
    { label: "إجمالي التبرعات", value: fmtSAR(donations.reduce((s, d) => s + d.amount, 0)) },
    { label: "مسودة", value: donations.filter((d: Donation) => d.status === "مسودة").length },
    { label: "مؤكد", value: donations.filter((d: Donation) => d.status === "مؤكد").length },
    {
      label: "تم إصدار إيصال",
      value: donations.filter((d: Donation) => d.status === "تم إصدار إيصال").length,
    },
  ];

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
            placeholder="بحث برقم التبرع، اسم المتبرع..."
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
          label="الحالة"
          options={["الكل", "مسودة", "مؤكد", "تم إصدار إيصال", "ملغي"]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
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

      <MobilePageHeader title="التبرعات" count={`${donations.length} تبرع`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل قائمة التبرعات"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["donations"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : donations.length === 0 ? (
        <EmptyState
          title="لا توجد تبرعات"
          description="ابدأ بتسجيل أول تبرع في النظام"
          action={
            <Btn variant="primary" onClick={() => openAddDonation()}>
              تسجيل تبرع جديد
            </Btn>
          }
        />
      ) : (
        <>
          <MobileTable
            columns={[
              "رقم التبرع",
              "المتبرع",
              "المشروع",
              "المبلغ",
              "طريقة الدفع",
              "التاريخ",
              "الحالة",
              "",
            ]}
            rows={donations}
            renderRow={(d: Donation) => (
              <>
                <Td className="font-mono text-xs">{d.id}</Td>
                <Td className="font-semibold">{d.donorName}</Td>
                <Td className="text-muted-foreground text-xs">{d.projectName || "—"}</Td>
                <Td className="tabular-nums font-bold text-success">{fmtSAR(d.amount)}</Td>
                <Td className="text-muted-foreground text-xs">{d.method}</Td>
                <Td className="text-muted-foreground text-xs">{d.date}</Td>
                <Td>
                  <Badge tone={statusToneLocal(d.status)}>{d.status}</Badge>
                </Td>
                <Td>
                  <ActionMenu actions={getDonationActions(d)} />
                </Td>
              </>
            )}
            mobileCard={(d: Donation) => (
              <Card key={d.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{d.donorName}</div>
                    <div className="text-xs text-muted-foreground">{d.projectName || "—"}</div>
                  </div>
                  <Badge tone={statusToneLocal(d.status)}>{d.status}</Badge>
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
                  <ActionMenu actions={getDonationActions(d)} />
                </div>
              </Card>
            )}
          />

          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>
              عرض {donations.length} من {totalCount} تبرع
            </span>
          </div>
        </>
      )}

      <EntityFormDrawer
        open={addDonationOpen}
        onClose={() => {
          setAddDonationOpen(false);
          setEditingDonation(null);
        }}
        title={editingDonation ? "تعديل التبرع" : "تسجيل تبرع جديد"}
        onSave={handleSaveDonation}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المتبرع</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formDonorId}
            onChange={(e) => setFormDonorId(e.target.value)}
          >
            <option value="">اختر المتبرع...</option>
            {donors.map((d: Donor) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
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
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formProject}
            onChange={(e) => setFormProject(e.target.value)}
            placeholder="اسم المشروع أو الحملة"
          />
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
        onSave={async () => {
          setAddDonorLoading(true);
          try {
            const { createDonor } = await import("@/lib/api/donors");
            await createDonor({
              name: newDonorName,
              type: newDonorType,
              phone: newDonorPhone || undefined,
              email: newDonorEmail || undefined,
              city: newDonorCity,
            });
            queryClient.invalidateQueries({ queryKey: ["donors"] });
            showToast("تم إضافة المتبرع بنجاح", "success");
            setAddDonorOpen(false);
          } catch (err: any) {
            showToast(err.message || "فشل في إضافة المتبرع", "error");
          } finally {
            setAddDonorLoading(false);
          }
        }}
        loading={addDonorLoading}
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
        message="هل أنت متأكد من حذف هذا التبرع؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title="تأكيد التبرع"
        message={`هل أنت متأكد من تأكيد تبرع ${confirmTarget?.donorName} بمبلغ ${confirmTarget ? fmtSAR(confirmTarget.amount) : ""}؟`}
        confirmText="تأكيد"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="إلغاء التبرع"
        message="هل أنت متأكد من إلغاء هذا التبرع؟"
        confirmText="إلغاء"
        cancelText="التراجع"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!receiptTarget}
        onClose={() => setReceiptTarget(null)}
        onConfirm={handleIssueReceipt}
        title="إصدار إيصال"
        message={`هل تريد إصدار إيصال لتبرع ${receiptTarget?.donorName} بمبلغ ${receiptTarget ? fmtSAR(receiptTarget.amount) : ""}؟`}
        confirmText="إصدار"
        cancelText="إلغاء"
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
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>مسودة</option>
              <option>مؤكد</option>
              <option>تم إصدار إيصال</option>
              <option>ملغي</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );

  function getDonationActions(d: Donation) {
    const actions: any[] = [
      {
        label: "عرض",
        icon: Eye,
        onClick: () => showToast(`${d.id}: ${d.donorName} - ${fmtSAR(d.amount)}`, "info"),
      },
    ];

    if (d.status === "مسودة") {
      actions.push(
        { label: "تعديل", icon: Pencil, onClick: () => openEditDonation(d) },
        { label: "تأكيد", icon: Check, onClick: () => setConfirmTarget(d) },
        {
          label: "حذف",
          icon: Trash2,
          onClick: () => setDeleteTarget(d.id),
          variant: "destructive" as const,
        },
      );
    }

    if (d.status === "مؤكد") {
      actions.push(
        { label: "إصدار إيصال", icon: Printer, onClick: () => setReceiptTarget(d) },
        {
          label: "إلغاء",
          icon: XCircle,
          onClick: () => setCancelTarget(d),
          variant: "destructive" as const,
        },
      );
    }

    return actions;
  }
}
