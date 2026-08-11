import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/erp/AppShell";
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
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getDonors } from "@/lib/api/donors";
import { getProjects } from "@/lib/api/projects";
import { createDonation } from "@/lib/api/donations";
import { DonationStatus, DonationMethod, DonationChannel, ProjectStatus } from "@/lib/enums";
import { options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/donations/new")({
  head: () => ({ meta: [{ title: "تبرع جديد — ثواب" }] }),
  component: NewDonationPage,
});

function NewDonationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const [donorId, setDonorId] = useState("");
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [method, setMethod] = useState<string>(DonationMethod.TRANSFER);
  const [channel, setChannel] = useState<string>(DonationChannel.ONLINE);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!donorId) e.donorId = "يرجى اختيار المتبرع";
    if (!amount || parseFloat(amount) <= 0) e.amount = "يرجى إدخال مبلغ أكبر من صفر";
    if (!method) e.method = "يرجى اختيار طريقة الدفع";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (andClose: boolean) => {
    if (!validate()) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await createDonation({
        donorId,
        amount: parseFloat(amount),
        projectId: projectId || undefined,
        method,
        channel,
        date,
        notes,
        status: DonationStatus.DRAFT,
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast(`تم تسجيل التبرع بمبلغ ${fmtSAR(created.amount)}`, "success");
      if (andClose) navigate({ to: "/donations" });
      else navigate({ to: "/donations/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

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
              >
                <option value="">— اختر متبرعاً —</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ""}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="تاريخ التبرع" required>
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField
            label="قيمة التبرع"
            required
            error={errors.amount}
            hint="بالريال السعودي"
          >
            <FormInput
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              dir="ltr"
              className="font-mono tabular-nums text-base"
              invalid={!!errors.amount}
            />
          </FormField>
          <FormRow>
            <FormField label="طريقة الدفع" required error={errors.method}>
              <FormSelect
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                invalid={!!errors.method}
              >
                {options("donationMethod").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="قناة الاستلام">
              <FormSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
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
        <FormSection title="تخصيص التبرع" description="اختر مشروعاً لتخصيص التبرع له، أو اتركه فارغاً ليُضاف للصندوق العام">
          <FormField label="المشروع" hint="اتركه فارغاً للتبرع العام">
            <FormSelect value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— تبرع عام (بدون مشروع) —</option>
              {projects
                .filter((p) => p.status === ProjectStatus.ACTIVE)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </FormSelect>
          </FormField>
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">ملاحظة:</strong> بعد التأكيد، يتم إنشاء قيد يومية تلقائياً
            لتحويل المبلغ من حساب البنك إلى حساب التبرعات.
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "الملاحظات والمرفقات",
      content: (
        <FormSection title="ملاحظات">
          <FormField label="ملاحظات" hint="تظهر في سجل التبرعات">
            <FormTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="أي ملاحظات إضافية حول هذا التبرع..."
            />
          </FormField>
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            إرفاق الإيصال أو مستند الدفع (قريباً)
          </div>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="التبرعات" breadcrumb={["التبرعات", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "التبرعات", to: "/donations" },
          { label: "تسجيل تبرع جديد" },
        ]}
        title="تسجيل تبرع جديد"
        subtitle="املأ بيانات التبرع. سيتم تسجيل التبرع بحالة «بانتظار التأكيد» حتى يتم اعتماده."
        draftNumber="مسودة جديدة"
        status={{ label: "مسودة", tone: "info" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        primaryLabel="حفظ كمسودة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donations" })}
      />
    </AppShell>
  );
}
