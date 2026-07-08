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
  FormSegmented,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getDonor, updateDonor, deleteDonor } from "@/lib/api/donors";
import { getDonations } from "@/lib/api/donations";

export const Route = createFileRoute("/donors/$id/edit")({
  head: () => ({ meta: [{ title: "تعديل متبرع — ثواب" }] }),
  component: EditDonorPage,
});

function EditDonorPage() {
  const { id } = useParams({ from: "/donors/$id/edit" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: donorData, isLoading } = useQuery({
    queryKey: ["donor", id],
    queryFn: () => getDonor(id),
    enabled: !!id,
  });

  const { data: donationsData } = useQuery({
    queryKey: ["donations-for-donor", id],
    queryFn: () => getDonations({ donorId: id, limit: 50 }),
    enabled: !!id,
  });
  const recentDonations = donationsData?.items || [];

  const donor = donorData;
  const [name, setName] = useState("");
  const [type, setType] = useState("فرد");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [tag, setTag] = useState("عام");
  const [recurring, setRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (donor) {
      setName(donor.name || "");
      setType(donor.type || "فرد");
      setPhone(donor.phone || "");
      setEmail(donor.email || "");
      setCity(donor.city || "");
      setAddress(donor.address || "");
      setTag(donor.tag || "عام");
      setRecurring(donor.recurring || false);
      setNotes(donor.notes || "");
    }
  }, [donor]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateDonor({ id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donor", id] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم تحديث المتبرع بنجاح", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDonor({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      showToast("تم حذف المتبرع", "success");
      navigate({ to: "/donors" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleSave = async (andClose: boolean) => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم المتبرع مطلوب";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      showToast("يرجى تصحيح الأخطاء قبل الحفظ", "error");
      return;
    }
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        name: name.trim(),
        type,
        phone: phone || null,
        email: email || null,
        city,
        address,
        tag,
        recurring,
        notes,
        userId: user?.id,
        userName: user?.name,
      });
      if (andClose) navigate({ to: "/donors" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="المتبرعون" breadcrumb={["المتبرعون", "تحميل..."]}>
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!donor) {
    return (
      <AppShell title="المتبرعون" breadcrumb={["المتبرعون"]}>
        <div className="text-center py-12">
          <div className="text-base font-bold mb-2">المتبرع غير موجود</div>
          <button onClick={() => navigate({ to: "/donors" })} className="text-primary hover:underline text-sm">
            العودة إلى المتبرعين
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
        <FormSection title="بيانات المتبرع">
          <FormRow>
            <FormField label="الاسم" required error={errors.name}>
              <FormInput value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
            </FormField>
            <FormField label="النوع">
              <FormSelect value={type} onChange={(e) => setType(e.target.value)}>
                <option value="فرد">فرد</option>
                <option value="شركة">شركة</option>
                <option value="مؤسسة">مؤسسة</option>
                <option value="جهة حكومية">جهة حكومية</option>
              </FormSelect>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="رقم الجوال">
              <FormInput value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </FormField>
            <FormField label="البريد الإلكتروني">
              <FormInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="المدينة">
              <FormInput value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
            <FormField label="العنوان">
              <FormInput value={address} onChange={(e) => setAddress(e.target.value)} />
            </FormField>
          </FormRow>
        </FormSection>
      ),
    },
    {
      id: "categorization",
      label: "التصنيف",
      content: (
        <FormSection title="تصنيف المتبرع">
          <FormField label="الوسم">
            <FormSelect value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="عام">عام</option>
              <option value="VIP">VIP</option>
              <option value="متكرر">متكرر</option>
              <option value="جديد">جديد</option>
              <option value="غير نشط">غير نشط</option>
            </FormSelect>
          </FormField>
          <FormField label="متبرع متكرر">
            <FormSegmented<"yes" | "no">
              value={recurring ? "yes" : "no"}
              onChange={(v) => setRecurring(v === "yes")}
              options={[
                { value: "yes", label: "نعم — متبرع متكرر" },
                { value: "no", label: "لا — تبرع لمرة واحدة" },
              ]}
            />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "history",
      label: "تاريخ التبرعات",
      badge: recentDonations.length || undefined,
      content: (
        <FormSection title="آخر التبرعات">
          {recentDonations.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد تبرعات مسجلة بعد.</p>
          ) : (
            <div className="space-y-2">
              {recentDonations.slice(0, 10).map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate({ to: "/donations/$id/edit", params: { id: d.id } })}
                  className="w-full text-right rounded-lg border bg-background p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{d.date}</span>
                    <span className="font-bold tabular-nums">{fmtSAR(d.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "الملخص والإحصاءات",
      content: (
        <FormSection title="إحصاءات المتبرع">
          <div className="space-y-0">
            <FormSummaryLine label="إجمالي التبرعات" value={fmtSAR(donor.totalDonations)} tone="success" />
            <FormSummaryLine label="عدد التبرعات" value={fmtNum(donor.donationCount)} />
            <FormSummaryLine label="آخر تبرع" value={donor.lastDonation || "—"} />
            <FormSummaryLine label="الحالة" value={donor.status} />
            <FormSummaryLine label="تاريخ التسجيل" value={donor.createdAt} />
            <FormSummaryLine label="أنشأ بواسطة" value={donor.createdBy || "—"} />
          </div>
        </FormSection>
      ),
    },
    {
      id: "notes",
      label: "ملاحظات",
      content: (
        <FormSection title="ملاحظات داخلية">
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
          </FormField>
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="المتبرعون" breadcrumb={["المتبرعون", donor.name]}>
      <EnterpriseFormLayout
        breadcrumb={[{ label: "المتبرعون", to: "/donors" }, { label: donor.name }]}
        title={donor.name}
        subtitle={`${donor.type} · ${donor.city || "—"}`}
        draftNumber={donor.id}
        status={{ label: donor.status, tone: statusTone(donor.status) }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving || updateMutation.isPending}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/donors" })}
        extraActions={
          <button
            type="button"
            onClick={() => {
              if (window.confirm("هل تريد حذف هذا المتبرع؟")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/20 transition-colors min-h-[40px]"
          >
            حذف
          </button>
        }
      />
    </AppShell>
  );
}
