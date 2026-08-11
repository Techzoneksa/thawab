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
import { getDonors } from "@/lib/api/donors";
import { getProjects } from "@/lib/api/projects";
import { getDonation, updateDonation, confirmDonation, cancelDonation, issueReceipt } from "@/lib/api/donations";
import { DonationStatus, DonationMethod, DonationChannel } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/donations_/$id_/edit")({
  head: () => ({ meta: [{ title: "تعديل تبرع — ثواب" }] }),
  component: EditDonationPage,
});

function EditDonationPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: donationData, isLoading } = useQuery({
    queryKey: ["donation", id],
    queryFn: async () => {
      const res = await fetch(`/api/donations?id=${id}`);
      if (!res.ok) throw new Error("فشل في جلب التبرع");
      return res.json() as Promise<{ item: any }>;
    },
    enabled: !!id,
  });

  const { data: donorsData } = useQuery({
    queryKey: ["donors-simple"],
    queryFn: () => getDonors({ limit: 200 }),
  });
  const donors = donorsData?.items || [];

  const { data: projectsData } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: () => getProjects({ limit: 200 }),
  });
  const projects = projectsData?.items || [];

  const donation = donationData?.item;
  const [donorId, setDonorId] = useState("");
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [method, setMethod] = useState<string>(DonationMethod.TRANSFER);
  const [channel, setChannel] = useState<string>(DonationChannel.ONLINE);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (donation) {
      setDonorId(donation.donorId || "");
      setAmount(String(donation.amount || ""));
      setProjectId(donation.projectId || "");
      setMethod(donation.method || DonationMethod.TRANSFER);
      setChannel(donation.channel || DonationChannel.ONLINE);
      setDate(donation.date || "");
      setNotes(donation.notes || "");
    }
  }, [donation]);

  const isPosted = donation?.status === DonationStatus.CONFIRMED;
  const isCancelled = donation?.status === DonationStatus.CANCELLED;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!donorId) e.donorId = "يرجى اختيار المتبرع";
    if (!amount || parseFloat(amount) <= 0) e.amount = "يرجى إدخال مبلغ أكبر من صفر";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateDonation({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donation", id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast("تم تحديث التبرع بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmDonation({
        id,
        amount: parseFloat(amount) || 0,
        userId: user?.id,
        userName: user?.name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donation", id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast("تم تأكيد التبرع بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDonation({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donation", id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast("تم إلغاء التبرع", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const receiptMutation = useMutation({
    mutationFn: () => issueReceipt({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donation", id] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      showToast("تم إصدار الإيصال بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    if (isPosted || isCancelled) return;
    if (!validate()) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        donorId,
        amount: parseFloat(amount),
        projectId: projectId || null,
        method,
        channel,
        date,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/donations" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="التبرعات" breadcrumb={["التبرعات", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!donation) {
    return (
      <AppShell title="التبرعات" breadcrumb={["التبرعات"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">التبرع غير موجود</div>
          <button onClick={() => navigate({ to: "/donations" })} className="text-primary hover:underline text-sm">
            العودة إلى التبرعات
          </button>
        </div>
      </AppShell>
    );
  }

  const donor = donors.find((d) => d.id === donorId);
  const project = projects.find((p) => p.id === projectId);

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "البيانات الأساسية",
      content: (
        <FormSection title="بيانات التبرع">
          <FormRow>
            <FormField label="المتبرع" required error={errors.donorId}>
              <FormSelect
                value={donorId}
                onChange={(e) => setDonorId(e.target.value)}
                invalid={!!errors.donorId}
                disabled={isPosted}
              >
                <option value="">— اختر متبرعاً —</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="تاريخ التبرع">
              <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" disabled={isPosted} />
            </FormField>
          </FormRow>
          <FormField label="قيمة التبرع" required error={errors.amount} hint="بالريال السعودي">
            <FormInput
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
              className="font-mono tabular-nums text-base"
              invalid={!!errors.amount}
              disabled={isPosted}
            />
          </FormField>
          <FormRow>
            <FormField label="طريقة الدفع">
              <FormSelect value={method} onChange={(e) => setMethod(e.target.value)} disabled={isPosted}>
                {options("donationMethod").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="قناة الاستلام">
              <FormSelect value={channel} onChange={(e) => setChannel(e.target.value)} disabled={isPosted}>
                {options("donationChannel").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "allocation",
      label: "المشروع والتخصيص",
      content: (
        <FormSection title="تخصيص التبرع">
          <FormField label="المشروع">
            <FormSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isPosted}
            >
              <option value="">— تبرع عام (بدون مشروع) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </FormSelect>
          </FormField>
          {project && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold mb-1">{project.name}</div>
              <div className="text-xs text-muted-foreground">
                {label("projectStatus", project.status)} · {fmtNum(project.progress)}% مكتمل
              </div>
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "donor",
      label: "المتبرع",
      content: (
        <FormSection title="بيانات المتبرع">
          {donor ? (
            <div className="space-y-0">
              <FormSummaryLine label="الاسم" value={donor.name} />
              <FormSummaryLine label="النوع" value={label("donorType", donor.type)} />
              <FormSummaryLine label="الجوال" value={donor.phone || "—"} />
              <FormSummaryLine label="البريد" value={donor.email || "—"} />
              <FormSummaryLine label="المدينة" value={donor.city || "—"} />
              <FormSummaryLine
                label="إجمالي التبرعات"
                value={fmtSAR(donor.totalDonations)}
              />
              <FormSummaryLine label="عدد التبرعات" value={fmtNum(donor.donationCount)} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">اختر متبرعاً في تبويب «البيانات الأساسية» لعرض تفاصيله هنا.</p>
          )}
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              disabled={isPosted}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "audit",
      label: "سجل التدقيق",
      content: (
        <FormSection title="الحالة والإجراءات">
          <div className="space-y-0">
            <FormSummaryLine label="الحالة الحالية" value={label("donationStatus", donation.status)} tone="default" />
            <FormSummaryLine label="رقم الإيصال" value={donation.receiptId || "—"} />
            <FormSummaryLine label="تاريخ التسجيل" value={donation.createdAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={donation.createdBy || "—"} />
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التبرعات" breadcrumb={["التبرعات", donation.id]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/donations" },
          { label: donor?.name || "تبرع" },
        ]}
        title={`تبرع من ${donor?.name || "متبرع"}`}
        subtitle={`${fmtSAR(donation.amount)} · ${label("donationMethod", donation.method)} · ${donation.date}`}
        draftNumber={donation.id}
        status={{ label: label("donationStatus", donation.status), tone: statusTone(donation.status) }}
        isReadOnly={isPosted || isCancelled}
        readonlyReason={
          isPosted
            ? "التبرع مؤكد. لا يمكن التعديل، ولكن يمكن إصدار إيصال أو إلغاؤه."
            : isCancelled
              ? "التبرع ملغى."
              : ""
        }
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel={isPosted || isCancelled ? "غير قابل للتعديل" : "حفظ ومتابعة"}
        secondaryLabel="حفظ وإغلاق"
        showSecondary={!isPosted && !isCancelled}
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donations" })}
        extraActions={
          !isPosted && !isCancelled ? (
            <button
              type="button"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-semibold text-success-foreground hover:opacity-90 transition-opacity min-h-[40px] shadow-sm"
            >
              اعتماد التبرع
            </button>
          ) : isPosted && !donation.receiptId ? (
            <button
              type="button"
              onClick={() => receiptMutation.mutate()}
              disabled={receiptMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-primary px-3 py-2 text-sm font-semibold hover:bg-primary/20 transition-colors min-h-[40px]"
            >
              إصدار إيصال
            </button>
          ) : !isCancelled ? (
            <button
              type="button"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/20 transition-colors min-h-[40px]"
            >
              إلغاء التبرع
            </button>
          ) : null
        }
      />
    </AppShell>
  );
}
