import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, statusTone } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormRow,
  FormSection,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { MembershipRole, MembershipType, MembershipStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";
import { getMembership, updateMembership, type Membership } from "@/lib/api/memberships";

export const Route = createFileRoute("/memberships_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل عضو — ثواب" }] }),
  component: EditMembershipPage,
});

function EditMembershipPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["membershipDetail", id],
    queryFn: () => getMembership(id),
  });
  const item: Membership | undefined = detailQuery.data?.item;

  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(MembershipRole.MEMBER);
  const [type, setType] = useState<string>(MembershipType.BOARD);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>(MembershipStatus.ACTIVE);
  const [joinedAt, setJoinedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setName(item.name);
    setRole(item.role || MembershipRole.MEMBER);
    setType(item.type || MembershipType.BOARD);
    setPhone(item.phone || "");
    setEmail(item.email || "");
    setStatus(item.status || MembershipStatus.ACTIVE);
    setJoinedAt(item.joinedAt || "");
    setHydrated(true);
  }

  const updateMut = useMutation({
    mutationFn: updateMembership,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
      queryClient.invalidateQueries({ queryKey: ["membershipDetail", id] });
      showToast("تم حفظ التعديلات", "success");
      navigate({ to: "/memberships" });
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setSaving(false);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      setErrors(["اسم العضو مطلوب"]);
      return;
    }
    setErrors([]);
    setSaving(true);
    updateMut.mutate({
      id,
      name: name.trim(),
      role,
      type,
      phone: phone || undefined,
      email: email || undefined,
      status,
      joinedAt: joinedAt || undefined,
    });
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات العضو">
          <FormRow>
            <FormField label="الاسم" required error={errors[0]}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="المنصب">
              <FormSelect value={role} onChange={(e) => setRole(e.target.value)}>
                {options("membershipRole").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الجهة">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                {options("membershipType").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {options("membershipStatus").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <FormInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="تاريخ الانضمام">
            <FormInput
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              dir="ltr"
            />
          </FormField>
        </FormSection>
      ),
    },
  ];

  if (detailQuery.isLoading) {
    return (
      <AppShell title="العضويات" breadcrumb={["الموارد", "العضويات"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="العضويات" breadcrumb={["الموارد", "العضويات"]}>
        <div className="text-center py-12 text-muted-foreground">العضو غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="العضويات" breadcrumb={["الموارد", "العضويات", "تعديل"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "الموارد", to: "/memberships" },
          { label: "العضويات", to: "/memberships" },
          { label: item.name },
        ]}
        title={item.name}
        subtitle={`${label("membershipRole", item.role)} · ${label("membershipType", item.type)}`}
        draftNumber={item.id}
        status={{ label: label("membershipStatus", item.status), tone: statusTone(item.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ التعديلات"
        showSecondary={false}
        onPrimary={handleSave}
        onCancel={() => navigate({ to: "/memberships" })}
      />
    </AppShell>
  );
}
