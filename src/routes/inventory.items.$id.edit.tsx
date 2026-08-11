import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Minus, ArrowRightLeft, Settings2, Power, PowerOff, Archive } from "lucide-react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
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
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";
import {
  getInventoryItem,
  updateInventoryItem,
  receiveInventoryItem,
  issueInventoryItem,
  transferInventoryItem,
  adjustInventoryItem,
  activateInventoryItem,
  deactivateInventoryItem,
  deleteInventoryItem,
  MOVEMENT_TYPES,
  type InventoryItem,
} from "@/lib/api/inventory-items";
import { InventoryItemStatus, WarehouseStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

const CATEGORIES = [
  "مواد غذائية",
  "ملابس",
  "أجهزة إلكترونية",
  "أثاث",
  "مواد تنظيف",
  "أدوات مكتبية",
  "مستلزمات طبية",
  "أخرى",
];

export const Route = createFileRoute("/inventory/items/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل صنف — ثواب" }] }),
  component: EditItemPage,
});

function EditItemPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["inventoryItemDetail", id],
    queryFn: () => getInventoryItem(id),
  });

  const whQuery = useQuery({
    queryKey: ["warehouses-simple"],
    queryFn: () => getWarehouses({ limit: 1000 }),
  });
  const warehouses: Warehouse[] = (whQuery.data?.items || []).filter(
    (w) => w.status === WarehouseStatus.ACTIVE,
  );

  const item: InventoryItem | undefined = detailQuery.data?.item;
  const movementCount = detailQuery.data?.movementCount ?? 0;
  const poLineCount = detailQuery.data?.poLineCount ?? 0;
  const hasMovements = detailQuery.data?.hasMovements ?? false;

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [minQuantity, setMinQuantity] = useState("0");
  const [price, setPrice] = useState("0");
  const [status, setStatus] = useState<string>(InventoryItemStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<
    "activate" | "deactivate" | "delete" | "movement" | null
  >(null);
  const [movementType, setMovementType] = useState<"receive" | "issue" | "transfer" | "adjust">(
    "receive",
  );
  const [mvQty, setMvQty] = useState("");
  const [mvWarehouseId, setMvWarehouseId] = useState("");
  const [mvToWarehouseId, setMvToWarehouseId] = useState("");
  const [mvNotes, setMvNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setSku(item.sku);
    setCategory(item.category);
    setUnit(item.unit);
    setWarehouseId(item.warehouseId || "");
    setMinQuantity(String(item.minQuantity || 0));
    setPrice(String(item.price || 0));
    setStatus(item.status || InventoryItemStatus.ACTIVE);
    setNotes(item.notes || "");
    setMvWarehouseId(item.warehouseId || "");
    setHydrated(true);
  }

  const handleSave = async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم الصنف مطلوب");
    const min = parseFloat(minQuantity) || 0;
    if (min < 0) errs.push("الحد الأدنى لا يمكن أن يكون سالبًا");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateInventoryItem({
        id,
        name: name.trim(),
        sku: sku || undefined,
        category: category || undefined,
        unit,
        warehouseId: warehouseId || undefined,
        minQuantity: min,
        price: parseFloat(price) || 0,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleMovement = async () => {
    const qty = parseFloat(mvQty);
    if (!qty || qty <= 0) {
      showToast("الكمية يجب أن تكون أكبر من صفر", "error");
      return;
    }
    if (movementType === "transfer") {
      if (!mvWarehouseId || !mvToWarehouseId) {
        showToast("يرجى اختيار مستودع المصدر والوجهة", "error");
        return;
      }
      if (mvWarehouseId === mvToWarehouseId) {
        showToast("لا يمكن التحويل لنفس المستودع", "error");
        return;
      }
    }
    try {
      if (movementType === "receive") {
        await receiveInventoryItem({
          id,
          quantity: qty,
          warehouseId: mvWarehouseId || undefined,
          notes: mvNotes || undefined,
          userId: user?.id,
          userName: user?.name,
        });
        showToast(`تم استلام ${qty} ${item?.unit}`, "success");
      } else if (movementType === "issue") {
        await issueInventoryItem({
          id,
          quantity: qty,
          warehouseId: mvWarehouseId || undefined,
          notes: mvNotes || undefined,
          userId: user?.id,
          userName: user?.name,
        });
        showToast(`تم صرف ${qty} ${item?.unit}`, "success");
      } else if (movementType === "transfer") {
        await transferInventoryItem({
          id,
          fromWarehouseId: mvWarehouseId,
          toWarehouseId: mvToWarehouseId,
          quantity: qty,
          notes: mvNotes || undefined,
          userId: user?.id,
          userName: user?.name,
        });
        showToast(`تم تحويل ${qty} ${item?.unit}`, "success");
      } else {
        await adjustInventoryItem({
          id,
          quantity: qty,
          warehouseId: mvWarehouseId || undefined,
          notes: mvNotes || undefined,
          userId: user?.id,
          userName: user?.name,
        });
        showToast(`تمت تسوية ${qty} ${item?.unit}`, "success");
      }
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemAudit", id] });
      setMvQty("");
      setMvNotes("");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل تنفيذ الحركة", "error");
    }
  };

  const auditQuery = useQuery({
    queryKey: ["inventoryItemAudit", id],
    queryFn: () => getAuditEntries({ entityType: "صنف", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الصنف",
      content: (
        <FormSection title="بيانات الصنف">
          <FormRow>
            <FormField label="اسم الصنف" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="رمز SKU">
              <FormInput value={sku} onChange={(e) => setSku(e.target.value)} dir="ltr" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="التصنيف">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— اختر —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="وحدة القياس">
              <FormInput value={unit} onChange={(e) => setUnit(e.target.value)} />
            </FormField>
          </FormRow>
          <FormField label="المستودع الافتراضي">
            <FormSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— لا يوجد —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormRow>
            <FormField label="الحد الأدنى" error={errors[1]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="سعر الوحدة" hint="ر.س">
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("inventoryItemStatus").map((o) => (
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
      id: "movements",
      label: "حركة المخزون",
      badge: hasMovements ? String(movementCount) : undefined,
      content: (
        <FormSection title="حركة المخزون">
          <div className="rounded-lg bg-muted/40 p-3 mb-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-muted-foreground">الكمية الحالية</div>
                <div className="text-base font-bold tabular-nums">
                  {item?.quantity ?? 0} {item?.unit}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">الحد الأدنى</div>
                <div className="text-base font-bold tabular-nums">
                  {item?.minQuantity ?? 0} {item?.unit}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">إجمالي الحركات</div>
                <div className="text-base font-bold tabular-nums">{movementCount}</div>
              </div>
              <div>
                <div className="text-muted-foreground">أوامر شراء مرتبطة</div>
                <div className="text-base font-bold tabular-nums">{poLineCount}</div>
              </div>
            </div>
            {item && item.quantity <= item.minQuantity && (
              <div className="mt-2 text-warning font-semibold">
                ⚠ الكمية وصلت للحد الأدنى — يرجى إعادة الطلب.
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-card shadow-card p-4 sm:p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">نوع الحركة</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MOVEMENT_TYPES.map((t) => {
                  const map = {
                    in: { value: "receive", icon: Plus, color: "success" },
                    out: { value: "issue", icon: Minus, color: "warning" },
                    transfer: { value: "transfer", icon: ArrowRightLeft, color: "info" },
                    adjustment: { value: "adjust", icon: Settings2, color: "primary" },
                  } as const;
                  const cfg = map[t as keyof typeof map];
                  const Icon = cfg.icon;
                  const active = movementType === cfg.value;
                  return (
                    <button
                      key={cfg.value}
                      type="button"
                      onClick={() => setMovementType(cfg.value)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors min-h-[40px] ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <Icon size={14} /> {label("stockMovementType", t)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {movementType === "transfer" ? (
                <>
                  <FormField label="من مستودع" required>
                    <FormSelect
                      value={mvWarehouseId}
                      onChange={(e) => setMvWarehouseId(e.target.value)}
                    >
                      <option value="">— اختر —</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                  <FormField label="إلى مستودع" required>
                    <FormSelect
                      value={mvToWarehouseId}
                      onChange={(e) => setMvToWarehouseId(e.target.value)}
                    >
                      <option value="">— اختر —</option>
                      {warehouses
                        .filter((w) => w.id !== mvWarehouseId)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </FormSelect>
                  </FormField>
                </>
              ) : (
                <FormField label="المستودع" hint="اختياري">
                  <FormSelect
                    value={mvWarehouseId}
                    onChange={(e) => setMvWarehouseId(e.target.value)}
                  >
                    <option value="">— افتراضي —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
              )}
              <FormField label="الكمية" required hint={item?.unit || ""}>
                <FormInput
                  type="number"
                  step="0.01"
                  value={mvQty}
                  onChange={(e) => setMvQty(e.target.value)}
                  dir="ltr"
                />
              </FormField>
            </div>
            <FormField label="ملاحظات">
              <FormTextarea
                value={mvNotes}
                onChange={(e) => setMvNotes(e.target.value)}
                rows={2}
                placeholder="سبب الحركة..."
              />
            </FormField>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction("movement")}
                disabled={!mvQty || parseFloat(mvQty) <= 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 min-h-[40px]"
              >
                تنفيذ الحركة
              </button>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص الصنف">
          <FormSummaryLine label="اسم الصنف" value={item.name} />
          <FormSummaryLine label="SKU" value={item.sku || "—"} />
          <FormSummaryLine label="التصنيف" value={item.category || "—"} />
          <FormSummaryLine label="الوحدة" value={item.unit} />
          <FormSummaryLine
            label="الكمية الحالية"
            value={`${item.quantity} ${item.unit}`}
            tone={item.quantity <= item.minQuantity ? "warning" : "default"}
          />
          <FormSummaryLine label="الحد الأدنى" value={`${item.minQuantity} ${item.unit}`} />
          <FormSummaryLine label="سعر الوحدة" value={fmtSAR(item.price)} />
          <FormSummaryLine
            label="الحالة"
            value={label("inventoryItemStatus", item.status)}
            tone={item.status === InventoryItemStatus.ACTIVE ? "success" : "warning"}
          />
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
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا الصنف.</div>
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
    mutationFn: () => activateInventoryItem({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemAudit", id] });
      showToast("تم تفعيل الصنف", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateInventoryItem({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItemAudit", id] });
      showToast("تم إيقاف الصنف", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteInventoryItem({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم حذف الصنف", "success");
      navigate({ to: "/inventory/items" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الأصناف" breadcrumb={["المخزون", "الأصناف"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الأصناف" breadcrumb={["المخزون", "الأصناف"]}>
        <div className="text-center py-12 text-muted-foreground">الصنف غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الأصناف" breadcrumb={["المخزون", "الأصناف", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "الأصناف", to: "/inventory/items" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${item.category || ""} · ${item.unit} · ${item.quantity} متوفر`}
        draftNumber={item.id}
        status={{ label: label("inventoryItemStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={false}
        extraActions={
          <>
            {item.status === InventoryItemStatus.ACTIVE ? (
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
            {!hasMovements && !poLineCount && (
              <button
                type="button"
                onClick={() => setConfirmAction("delete")}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors min-h-[40px]"
              >
                <Archive size={15} /> حذف
              </button>
            )}
          </>
        }
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/inventory/items" })}
      />

      <ConfirmDialog
        open={confirmAction === "movement"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleMovement}
        title="تأكيد الحركة"
        message={`هل تريد تنفيذ حركة "${label(
          "stockMovementType",
          { receive: "in", issue: "out", transfer: "transfer", adjust: "adjustment" }[movementType],
        )}" بكمية ${mvQty} ${item.unit}؟`}
        confirmText="تنفيذ"
        cancelText="تراجع"
      />
      <ConfirmDialog
        open={confirmAction === "activate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activateMut.mutate()}
        title="تفعيل الصنف"
        message={`هل تريد تفعيل الصنف "${item.name}"؟`}
        confirmText="تفعيل"
        cancelText="إلغاء"
        loading={activateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "deactivate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deactivateMut.mutate()}
        title="إيقاف الصنف"
        message={`هل تريد إيقاف الصنف "${item.name}"؟ سيختفي من القوائم المتاحة للحركات الجديدة.`}
        confirmText="إيقاف"
        cancelText="إلغاء"
        variant="destructive"
        loading={deactivateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف الصنف"
        message={`هل تريد حذف الصنف "${item.name}"؟`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
