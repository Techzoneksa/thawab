import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, Badge, statusTone } from "@/components/erp/AppShell";
import { fmtSAR, fmtNum } from "@/data/sample";
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
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import {
  getAccount,
  getAccounts,
  updateAccount,
  deactivateAccount,
  activateAccount,
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  type AccountType,
  type AccountStatus,
} from "@/lib/api/accounts";

export const Route = createFileRoute("/finance/accounts/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل حساب — ثواب" }] }),
  component: EditAccountPage,
});

function EditAccountPage() {
  const { id } = useParams({ from: "/finance/accounts/$id/edit" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: accountData, isLoading } = useQuery({
    queryKey: ["account", id],
    queryFn: () => getAccount(id),
    enabled: !!id,
  });

  const { data: allData } = useQuery({
    queryKey: ["accounts-all"],
    queryFn: () => getAccounts({ limit: 1000 }),
  });
  const allAccounts = allData?.items || [];

  const account = accountData?.item;
  const lineCount = accountData?.lineCount || 0;
  const childCount = accountData?.childCount || 0;
  const hasTransactions = accountData?.hasTransactions || false;

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("تفصيلي");
  const [parentId, setParentId] = useState<string>("");
  const [currency, setCurrency] = useState("SAR");
  const [postable, setPostable] = useState(true);
  const [status, setStatus] = useState<AccountStatus>("نشط");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setType(account.type as AccountType);
      setParentId(account.parentId || "");
      setCurrency(account.currency);
      setPostable(account.postable);
      setStatus(account.status as AccountStatus);
      setDescription(account.description || "");
      setNotes(account.notes || "");
    }
  }, [account]);

  const isReadOnly = hasTransactions;
  const readOnlyReason = hasTransactions
    ? "لا يمكن تعديل هذا الحساب لوجود قيود مرحلة عليه. يمكن إيقافه أو تفعيله فقط."
    : "";

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم الحساب مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: updateAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["account", id] });
      showToast("تم تحديث الحساب بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (action: "deactivate" | "activate") =>
      action === "deactivate"
        ? deactivateAccount({ id, userId: user?.id, userName: user?.name })
        : activateAccount({ id, userId: user?.id, userName: user?.name }),
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ["account", id] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      showToast(action === "deactivate" ? "تم إيقاف الحساب" : "تم تفعيل الحساب", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (isReadOnly) return;
    if (!validate()) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        id,
        name: name.trim(),
        type,
        parentId: parentId || null,
        currency,
        postable,
        status,
        description,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/finance/accounts" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const { data: auditData } = useQuery({
    queryKey: ["audit", "account", id],
    queryFn: () => getAuditEntries({ entityType: "account", entityId: id, limit: 100 }),
    enabled: !!id,
  });
  const auditEntries = auditData?.items || [];

  if (isLoading) {
    return (
      <AppShell title="دليل الحسابات" breadcrumb={["المالية", "دليل الحسابات", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!account) {
    return (
      <AppShell title="دليل الحسابات" breadcrumb={["المالية", "دليل الحسابات"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">الحساب غير موجود</div>
          <button
            onClick={() => navigate({ to: "/finance/accounts" })}
            className="text-primary hover:underline text-sm"
          >
            العودة إلى دليل الحسابات
          </button>
        </div>
      </AppShell>
    );
  }

  const parent = parentId ? allAccounts.find((a) => a.id === parentId) : null;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="تعريف الحساب">
          <FormRow>
            <FormField label="رقم الحساب" hint="لا يمكن تعديل رقم حساب له حركات">
              <FormInput value={code} disabled dir="ltr" className="font-mono" />
            </FormField>
            <FormField label="اسم الحساب" required error={errors.name}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                invalid={!!errors.name}
                disabled={isReadOnly}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="نوع الحساب">
              <FormSelect
                value={type}
                onChange={(e) => {
                  const v = e.target.value as AccountType;
                  setType(v);
                  if (v === "رئيسي") setPostable(false);
                  else setPostable(true);
                }}
                disabled={isReadOnly}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحساب الأب">
              <FormSelect
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={isReadOnly || type === "رئيسي"}
              >
                <option value="">— (بدون أب)</option>
                {allAccounts
                  .filter((a) => a.type === "رئيسي" && a.id !== id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الوصف">
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={isReadOnly}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "structure",
      label: "الهيكل المحاسبي",
      content: (
        <FormSection title="الهيكل">
          <FormRow>
            <FormField label="المستوى">
              <FormInput value={String(account.level)} disabled dir="ltr" className="font-mono" />
            </FormField>
            <FormField label="عدد الحسابات الفرعية">
              <FormInput value={fmtNum(childCount)} disabled dir="ltr" className="font-mono" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحساب الأب">
              <FormInput
                value={parent ? `${parent.code} — ${parent.name}` : "— (بدون أب)"}
                disabled
              />
            </FormField>
            <FormField label="إجمالي القيود المرحلة">
              <FormInput value={fmtNum(lineCount)} disabled dir="ltr" className="font-mono" />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "posting",
      label: "إعدادات الترحيل",
      content: (
        <FormSection title="ضبط الترحيل">
          <FormField label="قابل للترحيل">
            <FormSegmented<"yes" | "no">
              value={postable ? "yes" : "no"}
              onChange={(v) => setPostable(v === "yes")}
              disabled={isReadOnly || type === "رئيسي"}
              options={[
                { value: "yes", label: "نعم — يقبل قيود يومية" },
                { value: "no", label: "لا — حساب رئيسي فقط" },
              ]}
            />
          </FormField>
          <FormRow>
            <FormField label="العملة">
              <FormSelect value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={isReadOnly}>
                <option value="SAR">ر.س — ريال سعودي</option>
                <option value="USD">$ — دولار أمريكي</option>
                <option value="EUR">€ — يورو</option>
                <option value="EGP">ج.م — جنيه مصري</option>
              </FormSelect>
            </FormField>
            <FormField label="الحالة">
              <FormSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountStatus)}
                disabled={isReadOnly}
              >
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          {!isReadOnly && status === "نشط" && (
            <button
              type="button"
              onClick={() => statusMutation.mutate("deactivate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 text-warning-foreground px-3 py-2 text-sm font-medium hover:bg-warning/20 transition-colors min-h-[40px]"
            >
              إيقاف الحساب
            </button>
          )}
          {!isReadOnly && status === "موقوف" && (
            <button
              type="button"
              onClick={() => statusMutation.mutate("activate")}
              disabled={statusMutation.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px]"
            >
              تفعيل الحساب
            </button>
          )}
        </FormSection>
      ),
    },
    {
      id: "balance",
      label: "الأرصدة والاستخدامات",
      content: (
        <FormSection title="الرصيد الحالي والإحصاءات">
          <div className="space-y-0">
            <FormSummaryLine label="الرصيد الحالي" value={fmtSAR(account.balance)} tone={account.balance >= 0 ? "success" : "warning"} />
            <FormSummaryLine label="العملة" value={account.currency} />
            <FormSummaryLine label="عدد القيود المرحلة" value={fmtNum(lineCount)} />
            <FormSummaryLine label="عدد الحسابات الفرعية" value={fmtNum(childCount)} />
            <FormSummaryLine label="تاريخ الإنشاء" value={account.createdAt} />
            <FormSummaryLine label="آخر تحديث" value={account.updatedAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={account.createdBy || "—"} />
          </div>
        </FormSection>
      ),
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      badge: auditEntries.length || undefined,
      content: (
        <FormSection title="سجل التعديلات">
          {auditEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد تعديلات مسجلة بعد.</p>
          ) : (
            <div className="space-y-2">
              {auditEntries.map((e) => (
                <div key={e.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold">{e.action}</span>
                    <span className="text-xs text-muted-foreground">{e.timestamp}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{e.userName}</div>
                  {e.description && <div className="text-xs mt-1">{e.description}</div>}
                </div>
              ))}
            </div>
          )}
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="دليل الحسابات" breadcrumb={["المالية", "دليل الحسابات", account.code]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المالية", to: "/finance/accounts" },
          { label: "دليل الحسابات", to: "/finance/accounts" },
          { label: account.code },
        ]}
        title={`${account.code} — ${account.name}`}
        subtitle={`${type} · المستوى ${account.level}${parent ? ` · تحت ${parent.code}` : ""}`}
        draftNumber={account.code}
        status={{ label: account.status, tone: statusTone(account.status) }}
        isReadOnly={isReadOnly}
        readonlyReason={readOnlyReason}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel={isReadOnly ? "غير قابل للتعديل" : "حفظ ومتابعة"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={!isReadOnly}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/finance/accounts" })}
      />
    </AppShell>
  );
}
