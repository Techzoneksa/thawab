import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Power, PowerOff, Archive, Wallet } from "lucide-react";
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
import { showToast, ConfirmDialog, EntityFormDrawer } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getAuditEntries } from "@/lib/api/audit";
import { SupplierStatus as SupplierStatusEnum } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import {
  getSupplier,
  updateSupplier,
  activateSupplier,
  deactivateSupplier,
  deleteSupplier,
  paySupplier,
  type Supplier,
} from "@/lib/api/suppliers";
import { fmtSAR } from "@/data/sample";

export const Route = createFileRoute("/procurement/suppliers_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مورد — ثواب" }] }),
  component: EditSupplierPage,
});

function EditSupplierPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["supplierDetail", id],
    queryFn: () => getSupplier(id),
  });

  const item: Supplier | undefined = detailQuery.data?.item;
  const orderCount = detailQuery.data?.orderCount ?? 0;
  const assetCount = detailQuery.data?.assetCount ?? 0;
  const movementCount = detailQuery.data?.movementCount ?? 0;
  const hasTransactions = detailQuery.data?.hasTransactions ?? false;

  const [name, setName] = useState("");
  const [activity, setActivity] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [buildingNo, setBuildingNo] = useState("");
  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [additionalNo, setAdditionalNo] = useState("");
  const [rating, setRating] = useState("0");
  const [status, setStatus] = useState<string>(SupplierStatusEnum.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<"activate" | "deactivate" | "delete" | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("bank");
  // Stable payment-intent id — generated ONCE per pay dialog, reused for every
  // submit/retry so a double-click/network-retry cannot create two payments.
  const [payIntentId, setPayIntentId] = useState("");

  if (item && !hydrated) {
    setName(item.name);
    setActivity(item.activity);
    setContactPerson(item.contactPerson || "");
    setPhone(item.phone || "");
    setEmail(item.email || "");
    setTaxNumber(item.taxNumber || "");
    setAddress(item.address || "");
    setBuildingNo(item.buildingNo || "");
    setStreet(item.street || "");
    setDistrict(item.district || "");
    setCity(item.city || "");
    setPostalCode(item.postalCode || "");
    setAdditionalNo(item.additionalNo || "");
    setRating(String(item.rating || 0));
    setStatus(item.status || SupplierStatusEnum.ACTIVE);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const isReadOnly = !!item && hasTransactions;

  const handleSave = async () => {
    if (isReadOnly) {
      showToast("لا يمكن تعديل مورد مرتبط بحركات", "error");
      return;
    }
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم المورد مطلوب");
    if (!activity.trim()) errs.push("نشاط المورد مطلوب");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await updateSupplier({
        id,
        name: name.trim(),
        activity: activity.trim(),
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        taxNumber: taxNumber || undefined,
        address: address || undefined,
        buildingNo: buildingNo || undefined,
        street: street || undefined,
        district: district || undefined,
        city: city || undefined,
        postalCode: postalCode || undefined,
        additionalNo: additionalNo || undefined,
        rating: parseFloat(rating) || 0,
        status,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierDetail", id] });
      showToast("تم حفظ التعديلات", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const auditQuery = useQuery({
    queryKey: ["supplierAudit", id],
    queryFn: () => getAuditEntries({ entityType: "مورد", entityId: id, limit: 50 }),
    enabled: !!item,
  });

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات المورد">
          <FormRow>
            <FormField label="اسم المورد" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="نشاط المورد" required error={errors[1]}>
              <FormInput value={activity} onChange={(e) => setActivity(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الشخص المسؤول">
              <FormInput value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </FormField>
            <FormField label="رقم الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="البريد الإلكتروني">
              <FormInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الرقم الضريبي">
              <FormInput
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="العنوان">
            <FormInput value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="التقييم" hint="من 1 إلى 5">
              <FormInput
                type="number"
                min="0"
                max="5"
                step="0.5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("supplierStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "national-address",
      label: "العنوان الوطني",
      content: (
        <FormSection title="العنوان الوطني السعودي">
          <FormRow>
            <FormField label="رقم المبنى" hint="4 أرقام">
              <FormInput
                value={buildingNo}
                onChange={(e) => setBuildingNo(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="اسم الشارع">
              <FormInput value={street} onChange={(e) => setStreet(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الحي">
              <FormInput value={district} onChange={(e) => setDistrict(e.target.value)} />
            </FormField>
            <FormField label="المدينة">
              <FormInput value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الرمز البريدي" hint="5 أرقام">
              <FormInput
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الرقم الإضافي" hint="4 أرقام">
              <FormInput
                value={additionalNo}
                onChange={(e) => setAdditionalNo(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      badge: hasTransactions ? "مرتبط" : undefined,
      content: item ? (
        <FormSection title="ملخص المورد">
          <FormSummaryLine label="اسم المورد" value={item.name} />
          <FormSummaryLine label="النشاط" value={item.activity || "—"} />
          <FormSummaryLine
            label="الحالة"
            value={label("supplierStatus", item.status)}
            tone={status === SupplierStatusEnum.ACTIVE ? "success" : "warning"}
          />
          <FormSummaryLine label="التقييم" value={`${item.rating || 0} / 5`} />
          <FormSummaryLine label="الرصيد" value={fmtSAR(item.balance || 0)} />
          <FormSummaryLine
            label="أوامر شراء مرتبطة"
            value={String(orderCount)}
            tone={orderCount > 0 ? "warning" : "default"}
          />
          <FormSummaryLine
            label="أصول مرتبطة"
            value={String(assetCount)}
            tone={assetCount > 0 ? "warning" : "default"}
          />
          <FormSummaryLine
            label="حركات مرتبطة"
            value={String(movementCount)}
            tone={movementCount > 0 ? "warning" : "default"}
          />
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            {hasTransactions
              ? "هذا المورد مرتبط بحركات قائمة. لا يمكن حذفه للحفاظ على سلامة البيانات، كما أن بعض الحقول لا يمكن تعديلها."
              : "هذا المورد غير مرتبط بأي حركة. يمكن حذفه بأمان إذا لزم الأمر."}
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
              لا توجد عمليات مسجلة على هذا المورد.
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
    mutationFn: () => activateSupplier({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplierDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierAudit", id] });
      showToast("تم تفعيل المورد", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateSupplier({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplierDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierAudit", id] });
      showToast("تم إيقاف المورد", "success");
      setConfirmAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSupplier({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      showToast("تم حذف المورد", "success");
      navigate({ to: "/procurement/suppliers" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const payMut = useMutation({
    mutationFn: () =>
      paySupplier({
        id,
        amount: Number(payAmount) || 0,
        method: payMethod,
        paymentId: payIntentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["supplierAudit", id] });
      showToast("تم تسجيل السداد وترحيله للدفتر", "success");
      setPayOpen(false);
      setPayAmount("");
      setPayIntentId(""); // completed intent — the next payment gets a fresh id
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين"]}>
        <div className="text-center py-12 text-muted-foreground">المورد غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "الموردين", to: "/procurement/suppliers" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${item.activity || ""} · ${item.phone || ""}`}
        draftNumber={item.id}
        status={{
          label: item.status ? label("supplierStatus", item.status) : "—",
          tone: statusTone(item.status),
        }}
        isReadOnly={isReadOnly}
        readonlyReason={
          isReadOnly
            ? "هذا المورد مرتبط بحركات قائمة (أوامر شراء / أصول / حركات). تعديل بعض الحقول محظور للحفاظ على سلامة البيانات."
            : undefined
        }
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        secondaryLabel="حفظ وإغلاق"
        showSecondary={false}
        extraActions={
          <>
            <button
              type="button"
              onClick={() => {
                setPayAmount(item.balance > 0 ? String(item.balance) : "");
                setPayIntentId(crypto.randomUUID()); // one stable intent per dialog
                setPayOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px]"
            >
              <Wallet size={15} /> سداد
            </button>
            {item.status === SupplierStatusEnum.ACTIVE ? (
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
            {!hasTransactions && (
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
        onCancel={() => navigate({ to: "/procurement/suppliers" })}
      />

      <EntityFormDrawer
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`سداد للمورد: ${item.name}`}
        onSave={() => {
          if (!(Number(payAmount) > 0)) {
            showToast("أدخل مبلغاً صحيحاً", "error");
            return;
          }
          payMut.mutate();
        }}
        saveText="تسجيل السداد"
        loading={payMut.isPending}
      >
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          الرصيد المستحق للمورد حالياً:{" "}
          <span className="font-bold">{fmtSAR(item.balance || 0)}</span>
          <br />
          سيُنشأ قيد تلقائي: مدين «ذمم دائنة — موردون» / دائن «النقد أو البنك».
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المبلغ</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="number"
            dir="ltr"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">طريقة السداد</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as "cash" | "bank")}
          >
            <option value="bank">تحويل بنكي</option>
            <option value="cash">نقداً</option>
          </select>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmAction === "activate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activateMut.mutate()}
        title="تفعيل المورد"
        message={`هل تريد تفعيل المورد "${item.name}"؟ سيظهر في القوائم المتاحة لإنشاء أوامر الشراء.`}
        confirmText="تفعيل"
        cancelText="إلغاء"
        loading={activateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "deactivate"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deactivateMut.mutate()}
        title="إيقاف المورد"
        message={`هل تريد إيقاف المورد "${item.name}"؟ سيختفي من القوائم المتاحة لإنشاء أوامر شراء جديدة، لكن أوامره القائمة ستبقى مرتبطة به.`}
        confirmText="إيقاف"
        cancelText="إلغاء"
        variant="destructive"
        loading={deactivateMut.isPending}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="أرشفة المورد"
        message={`هل تريد أرشفة المورد "${item.name}"؟ لن يستطيع أحد استخدامه بعد الآن، لكن بياناته ستبقى في التقارير.`}
        confirmText="أرشفة"
        cancelText="إلغاء"
        variant="destructive"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
