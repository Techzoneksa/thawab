import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
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
import { EndowmentType, EndowmentStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { getEndowment, updateEndowment, type Endowment } from "@/lib/api/endowments";

export const Route = createFileRoute("/endowments_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل وقف — ثواب" }] }),
  component: EditEndowmentPage,
});

function EditEndowmentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["endowmentDetail", id],
    queryFn: () => getEndowment(id),
  });
  const item: Endowment | undefined = detailQuery.data?.item;

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(EndowmentType.GENERAL);
  const [value, setValue] = useState("");
  const [returns, setReturns] = useState("");
  const [status, setStatus] = useState<string>(EndowmentStatus.ACTIVE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setType(item.type || EndowmentType.GENERAL);
    setValue(String(item.value || 0));
    setReturns(String(item.returns || 0));
    setStatus(item.status || EndowmentStatus.ACTIVE);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateEndowment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endowments"] });
      queryClient.invalidateQueries({ queryKey: ["endowmentDetail", id] });
      showToast("تم حفظ التعديلات", "success");
      navigate({ to: "/endowments" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم الوقف مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    updateMut.mutate({
      id,
      name: name.trim(),
      type,
      value: Number(value) || 0,
      returns: Number(returns) || 0,
      status,
      notes: notes || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الوقف">
          <FormRow>
            <FormField label="اسم الوقف" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {options("endowmentType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="القيمة (ر.س)">
              <FormInput
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="العائد السنوي (ر.س)">
              <FormInput
                type="number"
                value={returns}
                onChange={(e) => setReturns(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="الحالة">
            <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {options("endowmentStatus").map((o) => (
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
  ];

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الأوقاف" breadcrumb={["المنح والأوقاف", "الأوقاف"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الأوقاف" breadcrumb={["المنح والأوقاف", "الأوقاف"]}>
        <div className="text-center py-12 text-muted-foreground">الوقف غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الأوقاف" breadcrumb={["المنح والأوقاف", "الأوقاف", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المنح والأوقاف", to: "/endowments" },
          { label: "الأوقاف", to: "/endowments" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={label("endowmentType", item.type)}
        draftNumber={item.id}
        status={{ label: label("endowmentStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/endowments" })}
      />
    </AppShell>
  );
}
