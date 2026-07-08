import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  createPurchaseRequest,
  REQUEST_PRIORITIES,
  type RequestPriority,
} from "@/lib/api/purchase-requests";

export const Route = createFileRoute("/procurement/requests/new")({
  head: () => ({ meta: [{ title: "طلب شراء جديد — ثواب" }] }),
  component: NewRequestPage,
});

const DEPARTMENTS = [
  "إدارة المساعدات",
  "تقنية المعلومات",
  "إدارة المشاريع",
  "الإدارة المالية",
  "المشتريات",
];

function NewRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [subject, setSubject] = useState("");
  const [department, setDepartment] = useState("إدارة المساعدات");
  const [priority, setPriority] = useState<RequestPriority>("متوسطة");
  const [requester, setRequester] = useState(user?.name || "");
  const [amount, setAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!subject.trim()) errs.push("موضوع الطلب مطلوب");
    if (!department.trim()) errs.push("الإدارة مطلوبة");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createPurchaseRequest({
        subject: subject.trim(),
        department,
        priority,
        requester: requester || undefined,
        amount: parseFloat(amount) || 0,
        deliveryDate: deliveryDate || undefined,
        notes: notes || undefined,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast(`تم إنشاء طلب الشراء`, "success");
      if (andClose) navigate({ to: "/procurement/requests" });
      else navigate({ to: "/procurement/requests/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الطلب",
      content: (
        <FormSection title="بيانات طلب الشراء">
          <FormField label="موضوع الطلب" required error={errors[0]}>
            <FormInput
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: مستلزمات سلال غذائية لشهر ربيع الأول"
            />
          </FormField>
          <FormRow>
            <FormField label="الإدارة" required error={errors[1]}>
              <FormSelect value={department} onChange={(e) => setDepartment(e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الأولوية">
              <FormSelect
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
              >
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="مقدم الطلب">
              <FormInput
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                placeholder="اسم مقدم الطلب"
              />
            </FormField>
            <FormField label="المبلغ التقديري" hint="ر.س">
              <FormInput
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
                placeholder="0.00"
              />
            </FormField>
          </FormRow>
          <FormField label="تاريخ التوريد المطلوب">
            <FormInput
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="طلبات الشراء" breadcrumb={["المشتريات", "طلبات الشراء", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "طلبات الشراء", to: "/procurement/requests" },
          { label: "طلب جديد" },
        ]}
        title="طلب شراء جديد"
        subtitle={subject || "أدخل بيانات الطلب"}
        draftNumber="مسودة جديدة"
        status={{ label: "مسودة", tone: "muted" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/procurement/requests" })}
      />
    </AppShell>
  );
}
