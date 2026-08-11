import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Save, X, Plus } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
import {
  EnterpriseFormLayout,
  type EnterpriseTab,
} from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormSegmented,
  FormGrid,
  FormSection,
  FormRow,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { options } from "@/lib/i18n/labels";
import { AccountClassification, AccountStatus as AccountStatusEnum } from "@/lib/enums";
import {
  getAccounts,
  createAccount,
  type AccountType,
  type AccountStatus,
  type CreateAccountInput,
} from "@/lib/api/accounts";

export const Route = createFileRoute("/finance/accounts/new")({
  head: () => ({ meta: [{ title: "حساب جديد — ثواب" }] }),
  component: NewAccountPage,
});

function NewAccountPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/finance/accounts/new" }) as { parent?: string };
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const parentId = search.parent;

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-all"],
    queryFn: () => getAccounts({ limit: 1000 }),
  });
  const allAccounts = accountsData?.items || [];

  const parent = useMemo(
    () => allAccounts.find((a) => a.id === parentId) || null,
    [allAccounts, parentId],
  );

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [classification, setClassification] = useState<AccountType>(AccountClassification.ASSET);
  const [parentId_, setParentId] = useState<string>(parent?.id || "");
  const [currency, setCurrency] = useState("SAR");
  const [balance, setBalance] = useState("0");
  const [postable, setPostable] = useState(!parent);
  const [status, setStatus] = useState<AccountStatus>(AccountStatusEnum.ACTIVE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!code.trim()) e.code = "رقم الحساب مطلوب";
    else if (allAccounts.some((a) => a.code === code.trim())) e.code = "رقم الحساب مستخدم";
    if (!name.trim()) e.name = "اسم الحساب مطلوب";
    if (!parentId_ && postable)
      e.parent = "الحساب الأب مطلوب للحسابات الفرعية";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (andClose: boolean) => {
    if (!validate()) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createAccount({
        code: code.trim(),
        name: name.trim(),
        // `classification` is the migrated column name; client type not yet updated.
        classification,
        parentId: parentId_ || null,
        currency,
        balance: parseFloat(balance) || 0,
        postable,
        status,
        description,
        notes,
        userId: user?.id,
        userName: user?.name,
      } as unknown as CreateAccountInput);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showToast(`تم إنشاء الحساب ${created.code} بنجاح`, "success");
      if (andClose) {
        navigate({ to: "/finance/accounts" });
      } else {
        navigate({ to: "/finance/accounts/$id/edit", params: { id: created.id } });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="تعريف الحساب" description="الرقم والاسم والنوع والحساب الأب">
          <FormRow>
            <FormField label="رقم الحساب" required error={errors.code} htmlFor="acct-code">
              <FormInput
                id="acct-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="مثال: 1101"
                invalid={!!errors.code}
                dir="ltr"
                className="font-mono"
              />
            </FormField>
            <FormField label="اسم الحساب" required error={errors.name} htmlFor="acct-name">
              <FormInput
                id="acct-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: النقدية بالصندوق الرئيسي"
                invalid={!!errors.name}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="تصنيف الحساب" required htmlFor="acct-classification">
              <FormSelect
                id="acct-classification"
                value={classification}
                onChange={(e) => setClassification(e.target.value as AccountType)}
              >
                {options("accountClassification").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField
              label="الحساب الأب"
              error={errors.parent}
              hint={!postable ? "الحسابات الرئيسية لا تحتاج أب" : "اختر الحساب الرئيسي الذي يندرج تحته هذا الحساب"}
              htmlFor="acct-parent"
            >
              <FormSelect
                id="acct-parent"
                value={parentId_}
                onChange={(e) => setParentId(e.target.value)}
                disabled={!postable}
              >
                <option value="">— (حساب رئيسي بدون أب)</option>
                {allAccounts
                  .filter((a) => !a.postable)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الوصف" htmlFor="acct-desc" hint="يظهر في التقارير والقوائم">
            <FormTextarea
              id="acct-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="وصف مختصر لطبيعة هذا الحساب..."
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "structure",
      label: "الهيكل المحاسبي",
      content: (
        <FormSection title="الهيكل والمستوى">
          <FormRow>
            <FormField label="المستوى في الشجرة" hint="يحسب تلقائياً من الحساب الأب">
              <FormInput
                value={parentId_ ? String((allAccounts.find((a) => a.id === parentId_)?.level || 1) + 1) : "1"}
                disabled
                dir="ltr"
                className="font-mono"
              />
            </FormField>
            <FormField label="الحساب الأب الحالي">
              <FormInput
                value={
                  parentId_
                    ? `${allAccounts.find((a) => a.id === parentId_)?.code || ""} — ${
                        allAccounts.find((a) => a.id === parentId_)?.name || ""
                      }`
                    : "— (بدون أب / حساب رئيسي)"
                }
                disabled
              />
            </FormField>
          </FormRow>
          <FormSection title="الحسابات الفرعية" className="bg-muted/30">
            {allAccounts.filter((a) => a.parentId === "").length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لم يتم بعد إنشاء حسابات رئيسية. الحسابات الرئيسية عادةً تكون أصول، التزامات، حقوق ملكية، إيرادات، مصروفات.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                بعد الحفظ، ستظهر الحسابات الفرعية تحت هذا الحساب في دليل الحسابات.
              </p>
            )}
          </FormSection>
        </FormSection>
      ),
    },
    {
      id: "posting",
      label: "إعدادات الترحيل",
      content: (
        <FormSection title="ضبط سلوك الترحيل">
          <FormField label="قابل للترحيل" hint="الحسابات غير القابلة للترحيل تستقبل فقط حسابات فرعية">
            <FormSegmented<"yes" | "no">
              value={postable ? "yes" : "no"}
              onChange={(v) => {
                const p = v === "yes";
                setPostable(p);
                if (!p) setParentId("");
              }}
              options={[
                { value: "yes", label: "نعم — يقبل قيود يومية" },
                { value: "no", label: "لا — حساب رئيسي فقط" },
              ]}
            />
          </FormField>
          <FormRow>
            <FormField label="العملة" htmlFor="acct-currency">
              <FormSelect
                id="acct-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="SAR">ر.س — ريال سعودي</option>
                <option value="USD">$ — دولار أمريكي</option>
                <option value="EUR">€ — يورو</option>
                <option value="EGP">ج.م — جنيه مصري</option>
              </FormSelect>
            </FormField>
            <FormField label="الحالة" htmlFor="acct-status">
              <FormSelect
                id="acct-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountStatus)}
              >
                {options("accountStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "balance",
      label: "الأرصدة والاستخدامات",
      content: (
        <FormSection title="الرصيد الافتتاحي">
          <FormRow>
            <FormField
              label="رصيد افتتاحي"
              hint="يُسجَّل فقط عند إنشاء حساب جديد"
              htmlFor="acct-balance"
            >
              <FormInput
                id="acct-balance"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                dir="ltr"
                className="font-mono tabular-nums"
              />
            </FormField>
            <FormField label="اتجاه الرصيد">
              <FormInput
                value={
                  parseFloat(balance) > 0
                    ? "مدين"
                    : parseFloat(balance) < 0
                      ? "دائن"
                      : "صفر"
                }
                disabled
              />
            </FormField>
          </FormRow>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">ملاحظة:</strong> الأرصدة اللاحقة تُحسب تلقائياً من القيود المرحلة.
            هذا الرصيد هو نقطة البداية فقط.
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "ملاحظات",
      content: (
        <FormSection title="ملاحظات داخلية" description="مرئية فقط لفريق المحاسبة">
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="ملاحظات خاصة بهذا الحساب..."
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="دليل الحسابات" breadcrumb={["المالية", "دليل الحسابات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/accounts" },
          { label: "دليل الحسابات", to: "/finance/accounts" },
          { label: "حساب جديد" },
        ]}
        title={parent ? `حساب فرعي تحت ${parent.code}` : "إنشاء حساب جديد"}
        subtitle={parent ? `يندرج تحت: ${parent.name}` : "املأ البيانات لإنشاء حساب جديد في دليل الحسابات"}
        draftNumber={code ? `مسودة · ${code}` : "مسودة جديدة"}
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={true}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/accounts" })}
      />
    </AppShell>
  );
}
