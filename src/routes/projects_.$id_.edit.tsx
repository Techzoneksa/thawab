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
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getProject, updateProject } from "@/lib/api/projects";
import { ProjectStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/projects_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مشروع — ثواب" }] }),
  component: EditProjectPage,
});

const STATUS_OPTIONS = options("projectStatus");

function EditProjectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("تنموي");
  const [category, setCategory] = useState("أخرى");
  const [branch, setBranch] = useState("");
  const [manager, setManager] = useState("");
  const [budget, setBudget] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<string>(ProjectStatus.ACTIVE);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setCode(project.code || "");
      setType(project.type || "تنموي");
      setCategory(project.category || "أخرى");
      setBranch(project.branch || "");
      setManager(project.manager || "");
      setBudget(String(project.budget || 0));
      setStartDate(project.startDate || "");
      setEndDate(project.endDate || "");
      setStatus(project.status || ProjectStatus.ACTIVE);
      setDescription(project.description || "");
      setNotes(project.notes || "");
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateProject({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      showToast("تم تحديث المشروع بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name,
        code,
        type,
        category,
        branch,
        manager,
        budget: parseFloat(budget) || 0,
        startDate,
        endDate,
        status,
        description,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/projects" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="المشاريع" breadcrumb={["المشاريع", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell title="المشاريع" breadcrumb={["المشاريع"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المشروع غير موجود</div>
          <button onClick={() => navigate({ to: "/projects" })} className="text-primary hover:underline text-sm">
            العودة إلى المشاريع
          </button>
        </div>
      </AppShell>
    );
  }

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات المشروع">
          <FormRow>
            <FormField label="اسم المشروع"><FormInput value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="الرمز" hint="للمستخدمين التقنيين"><FormInput value={code} disabled dir="ltr" className="font-mono" /></FormField>
          </FormRow>
          <FormRow>
            <FormField label="التصنيف">
              <FormSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="إغاثي">إغاثي</option>
                <option value="تنموي">تنموي</option>
                <option value="تعليمي">تعليمي</option>
                <option value="صحي">صحي</option>
                <option value="كفالة">كفالة</option>
                <option value="رعاية أيتام">رعاية أيتام</option>
                <option value="إسكان">إسكان</option>
                <option value="أخرى">أخرى</option>
              </FormSelect>
            </FormField>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                <option value="إغاثي">إغاثي</option>
                <option value="تنموي">تنموي</option>
                <option value="مستدام">مستدام</option>
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="الفرع"><FormInput value={branch} onChange={(e) => setBranch(e.target.value)} /></FormField>
            <FormField label="مدير المشروع"><FormInput value={manager} onChange={(e) => setManager(e.target.value)} /></FormField>
          </FormRow>
          <FormField label="الوصف"><FormTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></FormField>
        </FormSection>
      ),
    },
    {
      id: "budget",
      label: "الميزانية والجدول",
      content: (
        <FormSection title="الميزانية والجدول الزمني">
          <FormRow>
            <FormField label="الميزانية المعتمدة (ر.س)">
              <FormInput type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} dir="ltr" className="font-mono tabular-nums" />
            </FormField>
            <FormField label="الحالة">
              <FormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="تاريخ البدء"><FormInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" /></FormField>
            <FormField label="تاريخ النهاية"><FormInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" /></FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "الملخص والإحصاءات",
      content: (
        <FormSection title="إحصاءات المشروع">
          <div className="space-y-0">
            <FormSummaryLine label="إجمالي التبرعات" value={fmtSAR(project.totalDonations ?? project.donations ?? 0)} tone="success" />
            <FormSummaryLine label="إجمالي المساعدات" value={fmtSAR(project.totalAid ?? 0)} />
            <FormSummaryLine label="عدد المساعدات" value={fmtNum(project.aidCount ?? 0)} />
            <FormSummaryLine label="المستفيدون" value={fmtNum(project.beneficiaryCount ?? 0)} />
            <FormSummaryLine label="المصروف" value={fmtSAR(project.spent ?? 0)} />
            <FormSummaryLine label="المتبقي من الميزانية" value={fmtSAR(project.remainingBudget ?? project.budget ?? 0)} tone={(project.remainingBudget ?? project.budget ?? 0) >= 0 ? "default" : "warning"} />
            <FormSummaryLine label="نسبة الإنجاز" value={`${fmtNum(project.progress ?? 0)}%`} />
            <FormSummaryLine label="تاريخ الإنشاء" value={project.createdAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={project.createdBy || "—"} />
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات داخلية">
          <FormField label="ملاحظات"><FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} /></FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المشاريع" breadcrumb={["المشاريع", project.name]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المشاريع", to: "/projects" }, { label: project.name }]}
        title={project.name}
        subtitle={`${project.code} · ${label("projectStatus", project.status)} · ${project.category}`}
        draftNumber={project.code}
        status={{ label: label("projectStatus", project.status), tone: statusTone(project.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/projects" })}
      />
    </AppShell>
  );
}
