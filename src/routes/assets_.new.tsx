import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
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
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import {
  createFixedAsset,
  type AssetStatus,
  type AssetCondition,
} from "@/lib/api/assets";
import {
  AssetStatus as AssetStatusEnum,
  AssetCondition as AssetConditionEnum,
  DepreciationMethod,
  SupplierStatus,
} from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/assets_/new")({
  head: () => ({ meta: [{ title: "أصل جديد — ثواب" }] }),
  component: NewAssetPage,
});

const CATEGORIES = [
  "أجهزة كمبيوتر",
  "أثاث مكتبي",
  "معدات",
  "سيارات",
  "مبانٍ",
  "أجهزة اتصال",
  "أخرى",
];

function NewAssetPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const supQuery = useQuery({
    queryKey: ["suppliers-simple"],
    queryFn: () => getSuppliers({ limit: 1000 }),
  });
  const suppliers: Supplier[] = (supQuery.data?.items || []).filter(
    (s) => s.status === SupplierStatus.ACTIVE,
  );

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
  const [condition, setCondition] = useState<AssetCondition>(AssetConditionEnum.GOOD);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [status, setStatus] = useState<AssetStatus>(AssetStatusEnum.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const bookValue = useMemo(
    () => Math.max(0, (parseFloat(cost) || 0) - (parseFloat(salvageValue) || 0)),
    [cost, salvageValue],
  );

  const handleSave = async (andClose: boolean) => {
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
      const created = await createFixedAsset({
        name: name.trim(),
        code: code || undefined,
        category: category || undefined,
        location: location || undefined,
        cost: c,
        salvageValue: s,
        usefulLifeMonths: life,
        depreciationMethod,
        condition,
        purchaseDate,
        supplierId: supplierId || undefined,
        serialNumber: serialNumber || undefined,
        responsiblePerson: responsiblePerson || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
      showToast(`تم إضافة الأصل ${created.name}`, "success");
      if (andClose) navigate({ to: "/assets" });
      else navigate({ to: "/assets/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الأصل",
      content: (
        <FormSection title="بيانات الأصل">
          <FormRow>
            <FormField label="اسم الأصل" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: سيارة نيسان باترول 2024"
              />
            </FormField>
            <FormField label="رقم الأصل" hint="اختياري">
              <FormInput
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                placeholder="AST-001"
              />
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
              <FormInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="المدينة، المبنى، المكتب..."
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الشخص المسؤول">
              <FormInput
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="اسم الشخص المسؤول عن الأصل"
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
          <FormField label="المورّد">
            <FormSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— لا يوجد —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "financial",
      label: "البيانات المالية",
      content: (
        <FormSection title="البيانات المالية">
          <FormRow>
            <FormField label="قيمة الشراء" required hint="ر.س" error={errors[1]}>
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                dir="ltr"
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
            <FormField label="العمر الافتراضي" hint="بالأشهر" required error={errors[4]}>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground">قيمة الشراء</div>
                <div className="font-bold tabular-nums">{fmtSAR(parseFloat(cost) || 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">القيمة الدفترية الأولية</div>
                <div className="font-bold tabular-nums text-info">{fmtSAR(bookValue)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">قيمة الإنقاذ</div>
                <div className="font-bold tabular-nums">
                  {fmtSAR(parseFloat(salvageValue) || 0)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">الإهلاك الشهري (قسط ثابت)</div>
                <div className="font-bold tabular-nums">
                  {fmtSAR(
                    (parseInt(usefulLifeMonths) || 0) > 0
                      ? bookValue / (parseInt(usefulLifeMonths) || 1)
                      : 0,
                  )}
                </div>
              </div>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "condition",
      label: "الحالة والملاحظات",
      content: (
        <FormSection title="الحالة والملاحظات">
          <FormRow>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
                {options("assetStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحالة المادية">
              <FormSelect
                value={condition}
                onChange={(e) => setCondition(e.target.value as AssetCondition)}
              >
                {options("assetCondition").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="تاريخ الشراء">
            <FormInput
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: (
        <FormSection title="ملخص الأصل">
          <FormSummaryLine label="الاسم" value={name || "—"} />
          <FormSummaryLine label="رقم الأصل" value={code || "—"} />
          <FormSummaryLine label="التصنيف" value={category || "—"} />
          <FormSummaryLine label="الموقع" value={location || "—"} />
          <FormSummaryLine label="المسؤول" value={responsiblePerson || "—"} />
          <FormSummaryLine label="تاريخ الشراء" value={purchaseDate} />
          <FormSummaryLine label="قيمة الشراء" value={fmtSAR(parseFloat(cost) || 0)} />
          <FormSummaryLine label="قيمة الإنقاذ" value={fmtSAR(parseFloat(salvageValue) || 0)} />
          <FormSummaryLine label="القيمة الدفترية" value={fmtSAR(bookValue)} tone="success" />
          <FormSummaryLine label="العمر الافتراضي" value={`${usefulLifeMonths} شهرًا`} />
          <FormSummaryLine
            label="طريقة الإهلاك"
            value={label("depreciationMethod", depreciationMethod)}
          />
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الأصول الثابتة" breadcrumb={["المالية", "الأصول الثابتة", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "الأصول", to: "/assets" }, { label: "أصل جديد" }]}
        title="أصل جديد"
        subtitle={name || "أدخل بيانات الأصل"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("assetStatus", status),
          tone: status === AssetStatusEnum.ACTIVE ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/assets" })}
      />
    </AppShell>
  );
}
