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
import { MeetingStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { getMeeting, updateMeeting, type Meeting } from "@/lib/api/meetings";

export const Route = createFileRoute("/meetings_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل اجتماع — ثواب" }] }),
  component: EditMeetingPage,
});

function EditMeetingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({ queryKey: ["meetingDetail", id], queryFn: () => getMeeting(id) });
  const item: Meeting | undefined = detailQuery.data?.item;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<string>(MeetingStatus.SCHEDULED);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setTitle(item.title);
    setDate(item.date || "");
    setLocation(item.location || "");
    setStatus(item.status || MeetingStatus.SCHEDULED);
    setNotes(item.notes || "");
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateMeeting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["meetingDetail", id] });
      showToast("تم حفظ التعديلات", "success");
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
    updateMut.mutate({
      id,
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
            <FormInput value={location} onChange={(e) => setLocation(e.target.value)} />
          </FormField>
          <FormField label="ملاحظات / محضر">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الاجتماعات" breadcrumb={["الموارد", "الاجتماعات"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الاجتماعات" breadcrumb={["الموارد", "الاجتماعات"]}>
        <div className="text-center py-12 text-muted-foreground">الاجتماع غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الاجتماعات" breadcrumb={["الموارد", "الاجتماعات", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/meetings" },
          { label: "الاجتماعات", to: "/meetings" },
          { label: item.title },
        ]}
        title={item.title}
        subtitle={item.date || "تعديل بيانات الاجتماع"}
        draftNumber={item.id}
        status={{ label: label("meetingStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/meetings" })}
      />
    </AppShell>
  );
}
