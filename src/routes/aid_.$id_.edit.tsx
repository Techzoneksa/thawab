import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, Badge, statusTone } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
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
import { getBeneficiaries } from "@/lib/api/beneficiaries";
import { getProjects } from "@/lib/api/projects";
import { getAidRecord, updateAidRecord, approveAidRecord, rejectAidRecord, deliverAidRecord } from "@/lib/api/aid";
import { AidStatus, AidType } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/aid_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل مساعدة — ثواب" }] }),
  component: EditAidPage,
});

const AID_TYPE_OPTIONS = options("aidType");

function EditAidPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: aid, isLoading } = useQuery({
    queryKey: ["aid-record", id],
    queryFn: () => getAidRecord(id),
    enabled: !!id,
  });

  const { data: benData } = useQuery({
    queryKey: ["beneficiaries-simple"],
    queryFn: () => getBeneficiaries({ limit: 500 }),
  });
  const beneficiaries = benData?.items || [];

  const { data: projData } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: () => getProjects({ limit: 200 }),
  });
  const projects = projData?.items || [];

  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<string>(AidType.URGENT);
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (aid) {
      setBeneficiaryId(aid.beneficiaryId || "");
      setProjectId(aid.projectId || "");
      setType(aid.type || AidType.URGENT);
      setAmount(String(aid.amount || 0));
      setDate(aid.date || "");
      setNotes(aid.notes || "");
    }
  }, [aid]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateAidRecord({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid-record", id] });
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم تحديث المساعدة بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveAidRecord({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid-record", id] });
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم اعتماد المساعدة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectAidRecord({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid-record", id] });
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم رفض المساعدة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deliverMutation = useMutation({
    mutationFn: () => deliverAidRecord({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aid-record", id] });
      queryClient.invalidateQueries({ queryKey: ["aid"] });
      showToast("تم تأكيد تسليم المساعدة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        beneficiaryId,
        projectId: projectId || null,
        type,
        amount: parseFloat(amount) || 0,
        date,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/aid" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="المساعدات" breadcrumb={["المساعدات", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!aid) {
    return (
      <AppShell title="المساعدات" breadcrumb={["المساعدات"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المساعدة غير موجودة</div>
          <button onClick={() => navigate({ to: "/aid" })} className="text-primary hover:underline text-sm">
            العودة إلى المساعدات
          </button>
        </div>
      </AppShell>
    );
  }

  const isApproved = aid.status === AidStatus.APPROVED || aid.status === AidStatus.DELIVERED;
  const isDelivered = aid.status === AidStatus.DELIVERED;

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات المساعدة">
          <FormRow>
            <FormField label="المستفيد" required>
              <FormSelect value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} disabled={isApproved}>
                <option value="">— اختر —</option>
                {beneficiaries.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </FormSelect>
            </FormField>
            <FormField label="تاريخ المساعدة">
              <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" disabled={isApproved} />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="نوع المساعدة">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)} disabled={isApproved}>
                {AID_TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </FormSelect>
            </FormField>
            <FormField label="قيمة المساعدة (ر.س)">
              <FormInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" className="font-mono tabular-nums" disabled={isApproved} />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "allocation",
      label: "المشروع",
      content: (
        <FormSection title="تخصيص المساعدة">
          <FormField label="المشروع">
            <FormSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={isApproved}>
              <option value="">— خارج مشروع —</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </FormSelect>
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات"><FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} disabled={isApproved} /></FormField>
        </FormSection>
      ),
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      content: (
        <FormSection title="الحالة والإجراءات">
          <div className="space-y-0">
            <FormSummaryLine label="الحالة" value={label("aidStatus", aid.status)} />
            <FormSummaryLine label="اعتمد بواسطة" value={aid.approvedBy || "—"} />
            <FormSummaryLine label="تاريخ الاعتماد" value={aid.approvedAt || "—"} />
            <FormSummaryLine label="سلم بواسطة" value={aid.deliveredBy || "—"} />
            <FormSummaryLine label="تاريخ التسليم" value={aid.deliveredAt || "—"} />
            <FormSummaryLine label="طريقة التسليم" value={aid.deliveryMethod || "—"} />
            <FormSummaryLine label="تاريخ التسجيل" value={aid.createdAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={aid.createdBy || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المساعدات" breadcrumb={["المساعدات", aid.id]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المساعدات", to: "/aid" }, { label: aid.beneficiaryName || aid.id }]}
        title={`مساعدة: ${label("aidType", aid.type)}`}
        subtitle={`${aid.beneficiaryName} · ${fmtSAR(aid.amount)} · ${aid.date}`}
        draftNumber={aid.id}
        status={{ label: label("aidStatus", aid.status), tone: statusTone(aid.status) }}
        isReadOnly={isApproved}
        readonlyReason={isApproved ? "المساعدة معتمدة. يمكن فقط تأكيد التسليم." : ""}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel={isApproved ? "غير قابل للتعديل" : "حفظ ومتابعة"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={!isApproved}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/aid" })}
        extraActions={
          aid.status === AidStatus.PENDING ? (
            <>
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px]"
              >
                اعتماد
              </button>
              <button
                type="button"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/20 transition-colors min-h-[40px]"
              >
                رفض
              </button>
            </>
          ) : aid.status === AidStatus.APPROVED && !isDelivered ? (
            <button
              type="button"
              onClick={() => deliverMutation.mutate()}
              disabled={deliverMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity min-h-[40px]"
            >
              تأكيد التسليم
            </button>
          ) : null
        }
      />
    </AppShell>
  );
}
