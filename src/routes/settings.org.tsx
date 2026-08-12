import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { getOrgSettings, saveOrgSettings, type OrgSettingsInput } from "@/lib/api/org-settings";

const FIELDS: { l: string; k: keyof OrgSettingsInput }[] = [
  { l: "اسم الجمعية", k: "name" },
  { l: "رقم التسجيل بالمركز الوطني", k: "regNo" },
  { l: "الرقم الضريبي", k: "taxNo" },
  { l: "البريد الإلكتروني", k: "email" },
  { l: "الجوال", k: "phone" },
  { l: "المدير التنفيذي", k: "ceo" },
  { l: "السنة المالية", k: "fiscalYear" },
  { l: "العملة الأساسية", k: "currency" },
];

// National Address (العنوان الوطني السعودي)
const NATIONAL_FIELDS: { l: string; k: keyof OrgSettingsInput }[] = [
  { l: "رقم المبنى", k: "buildingNo" },
  { l: "اسم الشارع", k: "street" },
  { l: "الحي", k: "district" },
  { l: "المدينة", k: "city" },
  { l: "الرمز البريدي", k: "postalCode" },
  { l: "الرقم الإضافي", k: "additionalNo" },
];

const EMPTY: Required<OrgSettingsInput> = {
  name: "",
  regNo: "",
  taxNo: "",
  email: "",
  phone: "",
  ceo: "",
  fiscalYear: "",
  currency: "SAR",
  buildingNo: "",
  street: "",
  district: "",
  city: "",
  postalCode: "",
  additionalNo: "",
};

export const Route = createFileRoute("/settings/org")({
  head: () => ({ meta: [{ title: "إعدادات الجمعية — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [form, setForm] = useState<Required<OrgSettingsInput>>(EMPTY);

    const { data, isLoading, error } = useQuery({
      queryKey: ["orgSettings"],
      queryFn: getOrgSettings,
    });

    useEffect(() => {
      if (data?.item) {
        const { id: _id, updatedAt: _u, ...rest } = data.item;
        setForm({ ...EMPTY, ...rest });
      }
    }, [data]);

    const saveMutation = useMutation({
      mutationFn: saveOrgSettings,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["orgSettings"] });
        showToast("تم حفظ التغييرات بنجاح", "success");
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const handleSave = () => saveMutation.mutate(form);

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "إعدادات الجمعية"]}
        title="إعدادات الجمعية"
        actions={
          <Btn
            variant="primary"
            className="hidden lg:inline-flex"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            حفظ التغييرات
          </Btn>
        }
      >
        <MobilePageHeader title="إعدادات الجمعية" />
        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الإعدادات</div>
        )}
        <Card className="p-6">
          <h3 className="font-bold mb-4">المعلومات الأساسية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.k}>
                <label className="text-xs text-muted-foreground">{f.l}</label>
                <input
                  className="mt-1 w-full rounded-lg border bg-background p-2 text-sm min-h-[44px]"
                  value={form[f.k] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 mt-4">
          <h3 className="font-bold mb-4">العنوان الوطني</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {NATIONAL_FIELDS.map((f) => (
              <div key={f.k}>
                <label className="text-xs text-muted-foreground">{f.l}</label>
                <input
                  className="mt-1 w-full rounded-lg border bg-background p-2 text-sm min-h-[44px]"
                  value={form[f.k] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 mt-4">
          <h3 className="font-bold mb-3">القدرات المُفعّلة</h3>
          <div className="flex flex-wrap gap-2">
            {[
              "متعدد الفروع",
              "متعدد العملات",
              "REST API",
              "تطبيق جوال",
              "فاتورة إلكترونية",
              "استضافة داخل المملكة",
            ].map((c) => (
              <Badge key={c} tone="success">
                ✓ {c}
              </Badge>
            ))}
          </div>
        </Card>
        <div className="lg:hidden fixed bottom-16 right-0 left-0 z-20 border-t bg-surface/95 backdrop-blur px-4 py-3 safe-area-bottom shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-bold text-sm min-h-[48px] disabled:opacity-50"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            حفظ التغييرات
          </button>
        </div>
      </AppShell>
    );
  },
});
