import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormTextarea,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { PermissionMatrix } from "@/components/erp/PermissionMatrix";
import { showToast } from "@/components/erp/actions";
import { getRole, updateRole } from "@/lib/api/roles";

export const Route = createFileRoute("/permissions_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل دور — ثواب" }] }),
  component: EditRolePage,
});

function EditRolePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: payload, isLoading } = useQuery({
    queryKey: ["role", id],
    queryFn: () => getRole(id),
    enabled: !!id,
  });

  const item = payload?.item;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || "");
      setPerms(item.permissions || []);
    }
  }, [item]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissions: string[] }) =>
      updateRole({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role", id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      showToast("تم تحديث الدور", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الدور", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ name: name.trim(), description, permissions: perms });
      if (andClose) navigate({ to: "/permissions" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="الصلاحيات">
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الصلاحيات">
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">الدور غير موجود</div>
          <button
            onClick={() => navigate({ to: "/permissions" })}
            className="text-primary hover:underline text-sm"
          >
            العودة
          </button>
        </div>
      </AppShell>
    );
  }

  const permCount = perms.includes("*") ? "كامل" : `${perms.length} صلاحية`;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الدور",
      content: (
        <FormSection title="بيانات الدور">
          <FormField label="اسم الدور" required>
            <FormInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="الوصف">
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "perms",
      label: "الصلاحيات",
      content: (
        <FormSection
          title="صلاحيات الدور"
          description="حدّد ما يمكن لهذا الدور الوصول إليه في كل وحدة"
        >
          <PermissionMatrix value={perms} onChange={setPerms} />
        </FormSection>
      ),
    },
    {
      id: "info",
      label: "معلومات",
      content: (
        <FormSection title="معلومات الدور">
          <div className="space-y-0">
            <FormSummaryLine label="معرّف الدور" value={item.id} />
            <FormSummaryLine label="عدد المستخدمين" value={payload?.userCount ?? 0} />
            <FormSummaryLine label="عدد الصلاحيات" value={permCount} />
            <FormSummaryLine label="تاريخ الإنشاء" value={item.createdAt || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الصلاحيات" breadcrumb={["التقارير والحوكمة", "الصلاحيات", item.name]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التقارير والحوكمة", to: "/permissions" },
          { label: "الصلاحيات", to: "/permissions" },
          { label: item.name },
        ]}
        title={`الدور: ${item.name}`}
        subtitle={`${permCount} · ${payload?.userCount ?? 0} مستخدم`}
        draftNumber={item.id}
        status={{ label: "نشط", tone: "success" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/permissions" })}
      />
    </AppShell>
  );
}
