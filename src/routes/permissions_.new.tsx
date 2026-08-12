import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import { FormField, FormInput, FormTextarea, FormSection } from "@/components/erp/FormFields";
import { PermissionMatrix } from "@/components/erp/PermissionMatrix";
import { showToast } from "@/components/erp/actions";
import { createRole } from "@/lib/api/roles";

export const Route = createFileRoute("/permissions_/new")({
  head: () => ({ meta: [{ title: "دور جديد — ثواب" }] }),
  component: NewRolePage,
});

function NewRolePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const createMutation = useMutation({
    mutationFn: createRole,
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (!name.trim()) {
      showToast("يرجى إدخال اسم الدور", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        description,
        permissions: perms,
      });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      showToast(`تم إنشاء الدور ${created.name}`, "success");
      if (andClose) navigate({ to: "/permissions" });
      else navigate({ to: "/permissions/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const permCount = perms.includes("*") ? "كامل" : `${perms.length} صلاحية`;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الدور",
      content: (
        <FormSection title="بيانات الدور">
          <FormField label="اسم الدور" required>
            <FormInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: محاسب، مدير مشاريع"
            />
          </FormField>
          <FormField label="الوصف">
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="وصف مختصر لمسؤوليات هذا الدور"
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
  ];

  return (
    <AppShell title="الصلاحيات" breadcrumb={["التقارير والحوكمة", "الصلاحيات", "دور جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التقارير والحوكمة", to: "/permissions" },
          { label: "الصلاحيات", to: "/permissions" },
          { label: "دور جديد" },
        ]}
        title="دور جديد"
        subtitle={permCount}
        draftNumber="مسودة جديدة"
        status={{ label: "جديد", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
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
