import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRightLeft,
  Wrench,
  CheckCircle,
  TrendingDown,
  ShoppingCart,
  Archive,
} from "lucide-react";
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
import {
  getFixedAsset,
  updateFixedAsset,
  transferFixedAsset,
  maintainFixedAsset,
  returnFromMaintenance,
  depreciateFixedAsset,
  disposeFixedAsset,
  sellFixedAsset,
  deleteFixedAsset,
  type FixedAsset,
} from "@/lib/api/assets";
import {
  AssetStatus as AssetStatusEnum,
  AssetCondition as AssetConditionEnum,
  DepreciationMethod,
} from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

const CATEGORIES = [
  "أجهزة كمبيوتر",
  "أثاث مكتبي",
  "معدات",
  "سيارات",
  "مبانٍ",
  "أجهزة اتصال",
  "أخرى",
];

export const Route = createFileRoute("/assets_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل أصل — ثواب" }] }),
  component: EditAssetPage,
});

type ActionKind = "transfer" | "maintain" | "return" | "depreciate" | "dispose" | "sell" | "delete";

function EditAssetPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["fixedAssetDetail", id],
    queryFn: () => getFixedAsset(id),
  });

  const item: FixedAsset | undefined = detailQuery.data?.item;
  const depreciationCount = detailQuery.data?.depreciationCount ?? 0;
  const movementCount = detailQuery.data?.movementCount ?? 0;
  const hasHistory = detailQuery.data?.hasHistory ?? false;
  const bookValue = detailQuery.data?.bookValue ?? 0;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("0");
  const [salvageValue, setSalvageValue] = useState("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [depreciationMethod, setDepreciationMethod] = useState<string>(
    DepreciationMethod.STRAIGHT_LINE,
  );
  const [condition, setCondition] = useState<string>(AssetConditionEnum.GOOD);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [status, setStatus] = useState<string>(AssetStatusEnum.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ActionKind | null>(null);

  const [toLocation, setToLocation] = useState("");
  const [toResponsible, setToResponsible] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [maintainCost, setMaintainCost] = useState("0");
  const [maintainReason, setMaintainReason] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnCondition, setReturnCondition] = useState<string>(AssetConditionEnum.GOOD);
  const [disposeReason, setDisposeReason] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saleBuyer, setSaleBuyer] = useState("");
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setCode(item.code);
    setCategory(item.category);
    setLocation(item.location);
    setCost(String(item.cost || 0));
    setSalvageValue(String(item.salvageValue || 0));
    setUsefulLifeMonths(String(item.usefulLifeMonths || 60));
    setDepreciationMethod(item.depreciationMethod || DepreciationMethod.STRAIGHT_LINE);
    setCondition(item.condition || AssetConditionEnum.GOOD);
    setPurchaseDate(item.purchaseDate || "");
    setSerialNumber(item.serialNumber || "");
    setResponsiblePerson(item.responsiblePerson || "");
    setStatus(item.status || AssetStatusEnum.ACTIVE);
    setNotes(item.notes || "");
    setToLocation(item.location);
    setToResponsible(item.responsiblePerson);
    setHydrated(true);
  }

  const isReadOnly = !!item && item.status === AssetStatusEnum.DISPOSED;

  const handleSave = async () => {
    if (isReadOnly) {
      showToast("لا يمكن تعديل أصل مستبعد أو مباع", "error");
      return;
    }
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم الأصل مطلوب");
    const c = parseFloat(cost) || 0;
    const s = parseFloat(salvageValue) || 0;
    if (c < 0) errs.push("قيمة الشراء لا يمكن أن تكون سالبة");
    if (s < 0) errs.push("قيمة الإنقاذ لا يمكن أن تكون سالبة");
    if (s > c) errs.push("قيمة الإنقاذ لا يمكن أن تتجاوز قيمة الشراء");
    const life = parseInt(usefulLifeMonths) || 0;
    if (life <= 0) errs.push("العمر الافتراضي يجب أن يكون أكبر من صفر");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateFixedAsset({
        id,
        name: name.trim(),
        code: code || undefined,
        category: category || undefined,
        location: location || undefined,
        cost: c,
        salvageValue: s,
        usefulLifeMonths: life,
        depreciationMethod,
        condition,
        purchaseDate: purchaseDate || undefined,
        serialNumber: serialNumber || undefined,
        responsiblePerson: responsiblePerson || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    try {
      await transferFixedAsset({
        id,
        toLocation: toLocation || undefined,
        toResponsible: toResponsible || undefined,
        date: new Date().toISOString().slice(0, 10),
        reason: transferReason || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast("تم نقل الأصل", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل النقل", "error");
    }
  };

  const handleMaintain = async () => {
    try {
      await maintainFixedAsset({
        id,
        cost: parseFloat(maintainCost) || 0,
        date: new Date().toISOString().slice(0, 10),
        reason: maintainReason || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast("تم تسجيل الصيانة", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل تسجيل الصيانة", "error");
    }
  };

  const handleReturn = async () => {
    try {
      await returnFromMaintenance({
        id,
        condition: returnCondition,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast("تم إنهاء الصيانة", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل إنهاء الصيانة", "error");
    }
  };

  const handleDepreciate = async () => {
    const amt = parseFloat(depAmount);
    if (!amt || amt <= 0) {
      showToast("قيمة الإهلاك يجب أن تكون أكبر من صفر", "error");
      return;
    }
    try {
      await depreciateFixedAsset({
        id,
        amount: amt,
        date: depDate,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast(`تم تسجيل إهلاك ${fmtSAR(amt)}`, "success");
      setDepAmount("");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل تسجيل الإهلاك", "error");
    }
  };

  const handleDispose = async () => {
    try {
      await disposeFixedAsset({
        id,
        date: new Date().toISOString().slice(0, 10),
        reason: disposeReason || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast("تم استبعاد الأصل", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الاستبعاد", "error");
    }
  };

  const handleSell = async () => {
    try {
      await sellFixedAsset({
        id,
        salePrice: parseFloat(salePrice) || 0,
        date: new Date().toISOString().slice(0, 10),
        buyer: saleBuyer || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
      showToast("تم تسجيل بيع الأصل", "success");
      setConfirmAction(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل تسجيل البيع", "error");
    }
  };

  const deleteMut = useMutation({
    mutationFn: () => deleteFixedAsset({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      showToast("تم حذف الأصل", "success");
      navigate({ to: "/assets" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const auditQuery = useQuery({
    queryKey: ["fixedAssetAudit", id],
    queryFn: () => getAuditEntries({ entityType: "أصل ثابت", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الأصل",
      content: (
        <FormSection title="بيانات الأصل">
          <FormRow>
            <FormField label="اسم الأصل" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="رقم الأصل">
              <FormInput value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
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
            <FormField label="الموقع">
              <FormInput value={location} onChange={(e) => setLocation(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الشخص المسؤول">
              <FormInput
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
              />
            </FormField>
            <FormField label="الرقم التسلسلي">
              <FormInput
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "financial",
      label: "البيانات المالية",
      content: (
        <FormSection title="البيانات المالية">
          <FormRow>
            <FormField label="قيمة الشراء" hint="ر.س" error={errors[1]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                dir="ltr"
                disabled={depreciationCount > 0}
              />
            </FormField>
            <FormField label="قيمة الإنقاذ" hint="ر.س" error={errors[2] || errors[3]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={salvageValue}
                onChange={(e) => setSalvageValue(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="العمر الافتراضي" hint="بالأشهر" error={errors[4]}>
              <FormInput
                type="number"
                min="1"
                value={usefulLifeMonths}
                onChange={(e) => setUsefulLifeMonths(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="طريقة الإهلاك">
              <FormSelect
                value={depreciationMethod}
                onChange={(e) => setDepreciationMethod(e.target.value)}
              >
                {options("depreciationMethod").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <div className="rounded-lg bg-info/10 border border-info/30 px-3 py-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-muted-foreground">قيمة الشراء</div>
                <div className="font-bold tabular-nums">{fmtSAR(parseFloat(cost) || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">الإهلاك المتراكم</div>
                <div className="font-bold tabular-nums text-warning">
                  {fmtSAR(item?.accumulatedDepreciation || 0)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">القيمة الدفترية الحالية</div>
                <div className="font-bold tabular-nums text-info">{fmtSAR(bookValue)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">عدد حركات الإهلاك</div>
                <div className="font-bold tabular-nums">{depreciationCount}</div>
              </div>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "actions",
      label: "العمليات",
      badge: movementCount || undefined,
      content: isReadOnly ? (
        <FormSection title="العمليات">
          <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground text-center">
            الأصل في حالة "{label("assetStatus", item?.status)}" — لا يمكن تنفيذ عمليات إضافية.
          </div>
        </FormSection>
      ) : (
        <FormSection title="عمليات الأصل">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmAction("transfer")}
              className="text-right rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[64px]"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <ArrowRightLeft size={15} className="text-info" /> نقل الأصل
              </div>
              <div className="text-xs text-muted-foreground mt-1">نقل إلى موقع أو مسؤول جديد</div>
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("maintain")}
              className="text-right rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[64px]"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Wrench size={15} className="text-warning" /> تسجيل صيانة
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                تحوّل الأصل إلى حالة "تحت الصيانة"
              </div>
            </button>
            {item?.status === AssetStatusEnum.UNDER_MAINTENANCE && (
              <button
                type="button"
                onClick={() => setConfirmAction("return")}
                className="text-right rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[64px]"
              >
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle size={15} className="text-success" /> إنهاء الصيانة
                </div>
                <div className="text-xs text-muted-foreground mt-1">إرجاع الأصل إلى حالة نشط</div>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmAction("depreciate")}
              className="text-right rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[64px]"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <TrendingDown size={15} className="text-warning" /> تسجيل إهلاك
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                إنقاص القيمة الدفترية بمبلغ الإهلاك
              </div>
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("sell")}
              className="text-right rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors min-h-[64px]"
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <ShoppingCart size={15} className="text-info" /> بيع الأصل
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                تسجيل عملية بيع مع سعر البيع والمشتري
              </div>
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("dispose")}
              className="text-right rounded-lg border border-destructive/40 bg-destructive/5 p-3 hover:bg-destructive/10 transition-colors min-h-[64px]"
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-destructive">
                <Archive size={15} /> استبعاد الأصل
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                إزالة الأصل بدون بيع (هالك / تالف نهائي)
              </div>
            </button>
          </div>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: item ? (
        <FormSection title="ملخص الأصل">
          <FormSummaryLine label="الاسم" value={item.name} />
          <FormSummaryLine label="رقم الأصل" value={item.code || "—"} />
          <FormSummaryLine label="التصنيف" value={item.category || "—"} />
          <FormSummaryLine
            label="الحالة"
            value={label("assetStatus", item.status)}
            tone={statusTone(item.status)}
          />
          <FormSummaryLine label="الموقع" value={item.location || "—"} />
          <FormSummaryLine label="المسؤول" value={item.responsiblePerson || "—"} />
          <FormSummaryLine label="تاريخ الشراء" value={item.purchaseDate || "—"} />
          <FormSummaryLine label="قيمة الشراء" value={fmtSAR(item.cost || 0)} />
          <FormSummaryLine label="قيمة الإنقاذ" value={fmtSAR(item.salvageValue || 0)} />
          <FormSummaryLine
            label="الإهلاك المتراكم"
            value={fmtSAR(item.accumulatedDepreciation || 0)}
            tone="warning"
          />
          <FormSummaryLine label="القيمة الدفترية" value={fmtSAR(bookValue)} tone="success" />
          <FormSummaryLine label="العمر الافتراضي" value={`${item.usefulLifeMonths} شهرًا`} />
          <FormSummaryLine
            label="طريقة الإهلاك"
            value={label("depreciationMethod", item.depreciationMethod)}
          />
          <FormSummaryLine
            label="عدد حركات الإهلاك"
            value={String(depreciationCount)}
            tone={depreciationCount > 0 ? "warning" : "default"}
          />
          <FormSummaryLine
            label="عدد حركات النقل/الصيانة"
            value={String(movementCount)}
            tone={movementCount > 0 ? "warning" : "default"}
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
            <div className="text-xs text-muted-foreground">لا توجد عمليات مسجلة على هذا الأصل.</div>
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

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الأصول الثابتة" breadcrumb={["المالية", "الأصول الثابتة"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الأصول الثابتة" breadcrumb={["المالية", "الأصول الثابتة"]}>
        <div className="text-center py-12 text-muted-foreground">الأصل غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الأصول الثابتة" breadcrumb={["المالية", "الأصول الثابتة", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "الأصول", to: "/assets" }, { label: item.name }]}
        title={item.name}
        subtitle={`${item.code ? `(${item.code}) · ` : ""}${fmtSAR(bookValue)}`}
        draftNumber={item.id}
        status={{ label: label("assetStatus", item.status), tone: statusTone(item.status) }}
        isReadOnly={isReadOnly}
        readonlyReason={
          isReadOnly ? `الأصل في حالة "${label("assetStatus", item.status)}" — للقراءة فقط.` : undefined
        }
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/assets" })}
      />

      <ConfirmDialog
        open={confirmAction === "transfer"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleTransfer}
        title="نقل الأصل"
        message={`هل تريد نقل الأصل "${item.name}" إلى موقع/مسؤول جديد؟`}
        confirmText="تأكيد النقل"
        cancelText="تراجع"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="إلى موقع">
            <FormInput value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
          </FormField>
          <FormField label="إلى مسؤول">
            <FormInput value={toResponsible} onChange={(e) => setToResponsible(e.target.value)} />
          </FormField>
          <FormField label="سبب النقل">
            <FormTextarea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              rows={2}
            />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "maintain"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleMaintain}
        title="تسجيل صيانة"
        message={`هل تريد تسجيل صيانة للأصل "${item.name}"؟ سيتحول إلى حالة "تحت الصيانة".`}
        confirmText="تسجيل"
        cancelText="تراجع"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="تكلفة الصيانة" hint="ر.س">
            <FormInput
              type="number"
              min="0"
              step="0.01"
              value={maintainCost}
              onChange={(e) => setMaintainCost(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="سبب الصيانة">
            <FormTextarea
              value={maintainReason}
              onChange={(e) => setMaintainReason(e.target.value)}
              rows={2}
            />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "return"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleReturn}
        title="إنهاء الصيانة"
        message={`هل تريد إنهاء صيانة "${item.name}" وإرجاعه إلى الحالة نشطة؟`}
        confirmText="إنهاء"
        cancelText="تراجع"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="الحالة المادية بعد الصيانة">
            <FormSelect
              value={returnCondition}
              onChange={(e) => setReturnCondition(e.target.value)}
            >
              {options("assetCondition").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "depreciate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleDepreciate}
        title="تسجيل إهلاك"
        message={`هل تريد تسجيل إهلاك للأصل "${item.name}"؟ القيمة الدفترية ستنخفض بمقدار الإهلاك لكنها لن تقل عن قيمة الإنقاذ.`}
        confirmText="تسجيل"
        cancelText="تراجع"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="قيمة الإهلاك" hint="ر.س" required>
            <FormInput
              type="number"
              min="0"
              step="0.01"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="تاريخ الإهلاك">
            <FormInput
              type="date"
              value={depDate}
              onChange={(e) => setDepDate(e.target.value)}
              dir="ltr"
            />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "dispose"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleDispose}
        title="استبعاد الأصل"
        message={`هل تريد استبعاد الأصل "${item.name}" (إزالته بدون بيع)؟ هذا الإجراء لا يمكن التراجع عنه.`}
        confirmText="استبعاد"
        cancelText="تراجع"
        variant="destructive"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="سبب الاستبعاد">
            <FormTextarea
              value={disposeReason}
              onChange={(e) => setDisposeReason(e.target.value)}
              rows={2}
            />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "sell"}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleSell}
        title="بيع الأصل"
        message={`هل تريد تسجيل بيع الأصل "${item.name}"؟`}
        confirmText="تسجيل البيع"
        cancelText="تراجع"
      >
        <div className="mt-3 space-y-2 text-right">
          <FormField label="سعر البيع" hint="ر.س">
            <FormInput
              type="number"
              min="0"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="المشتري">
            <FormInput value={saleBuyer} onChange={(e) => setSaleBuyer(e.target.value)} />
          </FormField>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف الأصل"
        message={`هل تريد حذف الأصل "${item.name}"؟ ${hasHistory ? "الأصل له سجل حركات، قد لا يُسمح بالحذف." : ""}`}
        confirmText="حذف"
        cancelText="تراجع"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
