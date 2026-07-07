import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  MobileTable,
  MobilePageHeader,
  statusTone,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Plus, Star, Edit, Trash2, ToggleLeft, ToggleRight, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  activateSupplier,
  deactivateSupplier,
  deleteSupplier,
  SUPPLIER_STATUSES,
  type Supplier,
} from "@/lib/api/suppliers";

export const Route = createFileRoute("/procurement/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formActivity, setFormActivity] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTaxNo, setFormTaxNo] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState<string>("نشط");

  const { data, isLoading, error } = useQuery({
    queryKey: ["suppliers", { search: searchQuery }],
    queryFn: () => getSuppliers({ search: searchQuery }),
  });

  const { data: detailData } = useQuery({
    queryKey: ["supplier", detailId],
    queryFn: () => (detailId ? getSuppliers() : Promise.resolve(null)),
    enabled: false,
  });

  const detailQuery = useQuery({
    queryKey: ["supplierDetail", detailId],
    queryFn: async () =>
      detailId
        ? await fetch(`/api/procurement/suppliers?id=${detailId}`).then((r) => r.json())
        : null,
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast("تم إضافة المورد بنجاح", "success");
      setFormOpen(false);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: updateSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierDetail"] });
      showToast("تم تحديث المورد بنجاح", "success");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast("تم حذف المورد", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const activateMutation = useMutation({
    mutationFn: activateSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast("تم تفعيل المورد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast("تم تعطيل المورد", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => {
    setEditing(null);
    setFormName("");
    setFormActivity("");
    setFormPhone("");
    setFormEmail("");
    setFormTaxNo("");
    setFormContact("");
    setFormAddress("");
    setFormNotes("");
    setFormStatus("نشط");
    setFormOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setFormName(s.name);
    setFormActivity(s.activity || "");
    setFormPhone(s.phone || "");
    setFormEmail(s.email || "");
    setFormTaxNo(s.taxNumber || "");
    setFormContact(s.contactPerson || "");
    setFormAddress(s.address || "");
    setFormNotes(s.notes || "");
    setFormStatus(s.status || "نشط");
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return showToast("يرجى إدخال اسم المورد", "error");
    const payload = {
      name: formName,
      activity: formActivity,
      phone: formPhone,
      email: formEmail,
      taxNumber: formTaxNo,
      contactPerson: formContact,
      address: formAddress,
      notes: formNotes,
      status: formStatus,
      userId: user?.id,
      userName: user?.name,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({
        id: deleteTarget.id,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const handleToggle = (s: Supplier) => {
    if (s.status === "نشط") {
      deactivateMutation.mutate({ id: s.id, userId: user?.id, userName: user?.name });
    } else {
      activateMutation.mutate({ id: s.id, userId: user?.id, userName: user?.name });
    }
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const stats = {
    active: items.filter((s) => s.status === "نشط").length,
    inactive: items.filter((s) => s.status === "موقوف").length,
    total,
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "الموردون"]}
      title="سجل الموردين"
      actions={
        <>
          <ExportButton
            data={items.map((s) => ({
              id: s.id,
              name: s.name,
              activity: s.activity,
              phone: s.phone || "",
              email: s.email || "",
              taxNumber: s.taxNumber,
              contactPerson: s.contactPerson,
              address: s.address,
              status: s.status,
              rating: s.rating,
              notes: s.notes,
            }))}
            filename="suppliers.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
            إضافة مورد
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 mb-3 lg:mb-4">
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">إجمالي الموردين</div>
          <div className="text-base lg:text-xl font-extrabold tabular-nums">
            {fmtSAR(stats.total)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">نشط</div>
          <div className="text-base lg:text-xl font-extrabold text-success tabular-nums">
            {fmtSAR(stats.active)}
          </div>
        </Card>
        <Card className="p-3 lg:p-4">
          <div className="text-xs text-muted-foreground mb-1">موقوف</div>
          <div className="text-base lg:text-xl font-extrabold text-muted-foreground tabular-nums">
            {fmtSAR(stats.inactive)}
          </div>
        </Card>
      </div>

      <MobilePageHeader title="سجل الموردين" count={`${total} مورد`} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء جلب الموردين"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["suppliers"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا يوجد موردون"
          description="ابدأ بإضافة أول مورد للتعامل مع المشتريات"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة مورد
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={["الرقم", "اسم المورد", "النشاط", "الجوال", "الحالة", ""]}
          rows={items}
          renderRow={(s) => (
            <>
              <Td className="font-mono text-xs">{s.id}</Td>
              <Td>
                <button
                  onClick={() => setDetailId(s.id)}
                  className="font-semibold hover:text-primary text-right"
                >
                  {s.name}
                </button>
                {s.contactPerson && (
                  <div className="text-xs text-muted-foreground">{s.contactPerson}</div>
                )}
              </Td>
              <Td>{s.activity ? <Badge tone="info">{s.activity}</Badge> : "—"}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{s.phone || "—"}</Td>
              <Td>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={getSupplierActions(
                    s,
                    setDetailId,
                    openEdit,
                    handleToggle,
                    setDeleteTarget,
                  )}
                />
              </Td>
            </>
          )}
          mobileCard={(s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
              </div>
              <button
                onClick={() => setDetailId(s.id)}
                className="font-semibold text-right hover:text-primary"
              >
                {s.name}
              </button>
              <div className="text-xs text-muted-foreground mt-1">{s.phone || "—"}</div>
              {s.activity && <Badge tone="info">{s.activity}</Badge>}
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openEdit(s)}
                >
                  تعديل
                </button>
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => handleToggle(s)}
                >
                  {s.status === "نشط" ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل مورد" : "إضافة مورد جديد"}
        onSave={handleSave}
        loading={createMutation.isPending || updateMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم *</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم المورد"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النشاط</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formActivity}
              onChange={(e) => setFormActivity(e.target.value)}
              placeholder="مثال: مواد غذائية"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-xs font-semibold text-muted-foreground">
                البريد الإلكتروني
              </label>
              <input
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="supplier@example.com"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الرقم الضريبي</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTaxNo}
              onChange={(e) => setFormTaxNo(e.target.value)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الشخص المسؤول</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formContact}
              onChange={(e) => setFormContact(e.target.value)}
              placeholder="اسم الشخص المسؤول"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">العنوان</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="المدينة، الحي"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              {SUPPLIER_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={!!detailId && !formOpen}
        onClose={() => setDetailId(null)}
        title={`تفاصيل المورد: ${detailQuery.data?.item?.name || ""}`}
        onSave={() => setDetailId(null)}
        saveText="إغلاق"
      >
        {detailQuery.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <DetailRow label="الحالة" value={detailQuery.data.item.status} />
              <DetailRow label="النشاط" value={detailQuery.data.item.activity || "—"} />
              <DetailRow label="الجوال" value={detailQuery.data.item.phone || "—"} />
              <DetailRow label="البريد" value={detailQuery.data.item.email || "—"} />
              <DetailRow label="الرقم الضريبي" value={detailQuery.data.item.taxNumber || "—"} />
              <DetailRow label="المسؤول" value={detailQuery.data.item.contactPerson || "—"} />
            </div>
            {detailQuery.data.item.address && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">العنوان</div>
                <div className="text-sm">{detailQuery.data.item.address}</div>
              </div>
            )}
            <Card className="p-3 bg-primary/10">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                ارتباطات المورد
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatBox label="أوامر شراء" value={fmtSAR(detailQuery.data.orderCount)} />
                <StatBox label="أصول مرتبطة" value={fmtSAR(detailQuery.data.assetCount)} />
              </div>
            </Card>
            {detailQuery.data.item.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm">{detailQuery.data.item.notes}</div>
              </div>
            )}
          </div>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="تأكيد الحذف"
        message={
          deleteTarget
            ? `هل تريد حذف المورد "${deleteTarget.name}"؟ لا يمكن الحذف إذا كان مرتبطاً بأوامر شراء أو أصول.`
            : ""
        }
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

function getSupplierActions(
  s: Supplier,
  setDetailId: (id: string) => void,
  openEdit: (s: Supplier) => void,
  handleToggle: (s: Supplier) => void,
  setDeleteTarget: (s: Supplier) => void,
) {
  return [
    { label: "عرض التفاصيل", icon: Eye, onClick: () => setDetailId(s.id) },
    { label: "تعديل", icon: Edit, onClick: () => openEdit(s) },
    {
      label: s.status === "نشط" ? "تعطيل" : "تفعيل",
      icon: s.status === "نشط" ? ToggleLeft : ToggleRight,
      onClick: () => handleToggle(s),
    },
    {
      label: "حذف",
      icon: Trash2,
      variant: "destructive" as const,
      onClick: () => setDeleteTarget(s),
    },
  ];
}
