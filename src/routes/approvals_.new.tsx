import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { Priority } from "@/lib/enums";
import { options } from "@/lib/i18n/labels";
import { createApproval } from "@/lib/api/approvals";

const TYPE_OPTIONS = ["قيد يومية", "طلب شراء", "مساعدة", "ميزانية مشروع", "فاتورة مورد", "أخرى"];

export const Route = createFileRoute("/approvals_/new")({
  head: () => ({ meta: [{ title: "طلب موافقة جديد — ثواب" }] }),
  component: NewApprovalPage,
});

function NewApprovalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [subject, setSubject] = useState("");
  const [requester, setRequester] = useState("");
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState<string>(Priority.MEDIUM);
  const [level, setLevel] = useState("1");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createApproval,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      showToast("تم إنشاء طلب الموافقة", "success");
      navigate({ to: "/approvals" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!subject.trim()) {
      setErrors(["موضوع الطلب مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      type,
      subject: subject.trim(),
      requester: requester.trim() || undefined,
      amount: Number(amount) || 0,
      priority,
      level: Number(level) || 1,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="طلب موافقة">
          <FormRow>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الأولوية">
              <FormSelect value={priority} onChange={(e) => setPriority(e.target.value)}>
                {options("priority").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="الموضوع" required error={errors[0]}>
            <FormInput
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="موضوع الطلب"
            />
          </FormField>
          <FormRow>
            <FormField label="مقدم الطلب" hint="يُترك فارغاً = أنت">
              <FormInput value={requester} onChange={(e) => setRequester(e.target.value)} />
            </FormField>
            <FormField label="المبلغ (ر.س)">
              <FormInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="مستوى الاعتماد">
            <FormInput
              type="number"
              min="1"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              dir="ltr"
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الموافقات" breadcrumb={["الموافقات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "الموافقات", to: "/approvals" }, { label: "طلب موافقة جديد" }]}
        title="طلب موافقة جديد"
        subtitle={subject || "أدخل بيانات الطلب"}
        draftNumber="مسودة جديدة"
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/approvals" })}
      />
    </AppShell>
  );
}
