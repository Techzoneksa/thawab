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
import { MeetingStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { createMeeting } from "@/lib/api/meetings";

export const Route = createFileRoute("/meetings_/new")({
  head: () => ({ meta: [{ title: "اجتماع جديد — ثواب" }] }),
  component: NewMeetingPage,
});

function NewMeetingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<string>(MeetingStatus.SCHEDULED);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createMeeting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      showToast("تم إضافة الاجتماع بنجاح", "success");
      navigate({ to: "/meetings" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      setErrors(["عنوان الاجتماع مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    createMut.mutate({
      title: title.trim(),
      date: date || undefined,
      location: location || undefined,
      status,
      notes: notes || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات الاجتماع">
          <FormField label="عنوان الاجتماع" required error={errors[0]}>
            <FormInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormRow>
            <FormField label="التاريخ">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("meetingStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="المكان">
            <FormInput
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="مكان الانعقاد"
            />
          </FormField>
          <FormField label="ملاحظات / محضر">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الاجتماعات" breadcrumb={["الموارد", "الاجتماعات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/meetings" },
          { label: "الاجتماعات", to: "/meetings" },
          { label: "اجتماع جديد" },
        ]}
        title="اجتماع جديد"
        subtitle={title || "أدخل بيانات الاجتماع"}
        draftNumber="مسودة جديدة"
        status={{
          label: label("meetingStatus", status),
          tone: status === MeetingStatus.HELD ? "success" : "muted",
        }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/meetings" })}
      />
    </AppShell>
  );
}
