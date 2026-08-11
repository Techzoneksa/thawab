import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Power, PowerOff, Archive } from "lucide-react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import {
  getWarehouse,
  updateWarehouse,
  activateWarehouse,
  deactivateWarehouse,
  deleteWarehouse,
  type Warehouse,
} from "@/lib/api/warehouses";
import { WarehouseStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/inventory/warehouses_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مستودع — ثواب" }] }),
  component: EditWarehousePage,
});

function EditWarehousePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["warehouseDetail", id],
    queryFn: () => getWarehouse(id),
  });

  const item: Warehouse | undefined = detailQuery.data?.item;
  const itemCount = detailQuery.data?.itemCount ?? 0;
  const movementCount = detailQuery.data?.movementCount ?? 0;
  const totalQty = detailQuery.data?.totalQty ?? 0;
  const hasMovements = detailQuery.data?.hasMovements ?? false;

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [manager, setManager] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [occupancy, setOccupancy] = useState("0");
  const [status, setStatus] = useState<string>(WarehouseStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<"activate" | "deactivate" | "delete" | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setLocation(item.location);
    setManager(item.manager);
    setCapacity(String(item.capacity || 0));
    setOccupancy(String(item.occupancy || 0));
    setStatus(item.status || WarehouseStatus.ACTIVE);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const handleSave = async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم المستودع مطلوب");
    if (!location.trim()) errs.push("موقع المستودع مطلوب");
    const cap = parseFloat(capacity) || 0;
    const occ = parseFloat(occupancy) || 0;
    if (cap < 0) errs.push("السعة يجب ألا تكون سالبة");
    if (occ < 0) errs.push("الإشغال يجب ألا يكون سالبًا");
    if (cap > 0 && occ > cap) errs.push("الإشغال لا يمكن أن يتجاوز السعة");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateWarehouse({
        id,
        name: name.trim(),
        location: location.trim(),
        manager: manager || undefined,
        capacity: cap,
        occupancy: occ,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditQuery = useQuery({
    queryKey: ["warehouseAudit", id],
    queryFn: () => getAuditEntries({ entityType: "مستودع", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات المستودع",
      content: (
        <FormSection title="بيانات المستودع">
          <FormRow>
            <FormField label="اسم المستودع" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="الموقع" required error={errors[1]}>
              <FormInput value={location} onChange={(e) => setLocation(e.target.value)} />
            </FormField>
          </FormRow>
          <FormField label="مدير المستودع">
            <FormInput value={manager} onChange={(e) => setManager(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="السعة" error={errors[2] || errors[4]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الإشغال الحالي" error={errors[3] || errors[4]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("warehouseStatus").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      badge: hasMovements ? "مرتبط" : undefined,
      content: item ? (
        <FormSection title="ملخص المستودع">
          <FormSummaryLine label="اسم المستودع" value={item.name} />
          <FormSummaryLine label="الموقع" value={item.location || "—"} />
          <FormSummaryLine
            label="الحالة"
            value={label("warehouseStatus", item.status)}
            tone={item.status === WarehouseStatus.ACTIVE ? "success" : "warning"}
          />
          <FormSummaryLine label="السعة" value={String(item.capacity || 0)} />
          <FormSummaryLine label="الإشغال" value={String(item.occupancy || 0)} />
          <FormSummaryLine label="الأصناف المسجلة" value={String(itemCount)} />
          <FormSummaryLine
            label="إجمالي الكمية"
            value={String(totalQty)}
            tone={totalQty > 0 ? "warning" : "default"}
          />
          <FormSummaryLine
            label="عدد الحركات"
            value={String(movementCount)}
            tone={movementCount > 0 ? "warning" : "default"}
          />
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            {hasMovements
              ? "هذا المستودع مرتبط بحركات قائمة. لا يمكن حذفه للحفاظ على سلامة البيانات."
              : "هذا المستودع غير مرتبط بأي حركة. يمكن أرشفته بأمان إذا لزم الأمر."}
          </div>
        </FormSection>
      ) : null,
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      badge: auditQuery.data?.items.length,
      content: (
        <FormSection title="سجل العمليات">
          {auditQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">جاري التحميل...</div>
          ) : (auditQuery.data?.items ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">
              لا توجد عمليات مسجلة على هذا المستودع.
            </div>
          ) : (
            <ul className="space-y-2">
              {(auditQuery.data?.items ?? []).map((e) => (
                <li key={e.id} className="rounded-lg border bg-card px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{e.action}</span>
                    <span className="text-muted-foreground font-mono">
                      {e.timestamp?.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">{e.description}</div>
                  <div className="text-muted-foreground mt-0.5">المستخدم: {e.userName || "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      ),
    },
  ];

  const activateMut = useMutation({
    mutationFn: () => activateWarehouse({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouseDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseAudit", id] });
      showToast("تم تفعيل المستودع", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateWarehouse({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouseDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseAudit", id] });
      showToast("تم إيقاف المستودع", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteWarehouse({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      showToast("تم أرشفة المستودع", "success");
      navigate({ to: "/inventory/warehouses" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="المستودعات" breadcrumb={["المخزون", "المستودعات"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="المستودعات" breadcrumb={["المخزون", "المستودعات"]}>
        <div className="text-center py-12 text-muted-foreground">المستودع غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="المستودعات" breadcrumb={["المخزون", "المستودعات", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "المستودعات", to: "/inventory/warehouses" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${item.location || ""} · ${item.manager || ""}`}
        draftNumber={item.id}
        status={{ label: label("warehouseStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={false}
        extraActions={
          <>
            {item.status === WarehouseStatus.ACTIVE ? (
              <button
                type="button"
                onClick={() => setConfirmAction("deactivate")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px]"
              >
                <PowerOff size={15} /> إيقاف
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmAction("activate")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px]"
              >
                <Power size={15} /> تفعيل
              </button>
            )}
            {!hasMovements && (
              <button
                type="button"
                onClick={() => setConfirmAction("delete")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Archive size={15} /> أرشفة
              </button>
            )}
          </>
        }
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/inventory/warehouses" })}
      />

      <ConfirmDialog
        open={confirmAction === "activate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activateMut.mutate()}
        title="تفعيل المستودع"
        message={`هل تريد تفعيل المستودع "${item.name}"؟ سيظهر في القوائم المتاحة لإنشاء الحركات.`}
        confirmText="تفعيل"
        cancelText="إلغاء"
        loading={activateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "deactivate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deactivateMut.mutate()}
        title="إيقاف المستودع"
        message={`هل تريد إيقاف المستودع "${item.name}"؟ سيختفي من القوائم المتاحة، لكن حركاته القائمة ستبقى مرتبطة به.`}
        confirmText="إيقاف"
        cancelText="إلغاء"
        variant="destructive"
        loading={deactivateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="أرشفة المستودع"
        message={`هل تريد أرشفة المستودع "${item.name}"؟ لن يستطيع أحد استخدامه بعد الآن.`}
        confirmText="أرشفة"
        cancelText="إلغاء"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
