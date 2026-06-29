import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { Plus, Building2, Coins } from "lucide-react";

export const Route = createFileRoute("/settings/org")({
  head: () => ({ meta: [{ title: "إعدادات الجمعية — ثواب" }] }),
  component: () => {
    const fields = [
      { l: "اسم الجمعية", k: "name" },
      { l: "رقم التسجيل بالمركز الوطني", k: "regNo" },
      { l: "الرقم الضريبي", k: "taxNo" },
      { l: "البريد الإلكتروني", k: "email" },
      { l: "الجوال", k: "phone" },
      { l: "المدير التنفيذي", k: "ceo" },
      { l: "السنة المالية", k: "fiscalYear" },
      { l: "العملة الأساسية", k: "currency" },
    ];
    const [form, setForm] = useState({
      name: "جمعية البر الخيرية",
      regNo: "1234",
      taxNo: "300123456700003",
      email: "info@albir.org.sa",
      phone: "920001234",
      ceo: "د. عبدالله بن محمد السبيعي",
      fiscalYear: "1446هـ (هجري)",
      currency: "ر.س - الريال السعودي",
    });

    function handleSave() {
      showToast("تم حفظ التغييرات بنجاح", "success");
    }

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "إعدادات الجمعية"]}
        title="إعدادات الجمعية"
        actions={
          <Btn variant="primary" className="hidden lg:inline-flex" onClick={handleSave}>
            حفظ التغييرات
          </Btn>
        }
      >
        <MobilePageHeader title="إعدادات الجمعية" />
        <Card className="p-6">
          <h3 className="font-bold mb-4">المعلومات الأساسية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.k}>
                <label className="text-xs text-muted-foreground">{f.l}</label>
                <input
                  className="mt-1 w-full rounded-lg border bg-background p-2 text-sm min-h-[44px]"
                  value={(form as any)[f.k]}
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
              "متعدد المستأجرين",
              "REST API",
              "تطبيق جوال",
              "Webhooks",
              "فاتورة إلكترونية",
              "استضافة داخل المملكة",
            ].map((c) => (
              <Badge key={c} tone="success">
                ✓ {c}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Btn
              variant="outline"
              onClick={() => showToast("تم إضافة فرع جديد (تجريبي)", "success")}
            >
              <Building2 size={14} /> إضافة فرع
            </Btn>
            <Btn
              variant="outline"
              onClick={() => showToast("تم إضافة عملة جديدة (تجريبي)", "success")}
            >
              <Coins size={14} /> إضافة عملة
            </Btn>
          </div>
        </Card>
        <div className="lg:hidden fixed bottom-16 right-0 left-0 z-20 border-t bg-surface/95 backdrop-blur px-4 py-3 safe-area-bottom shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-bold text-sm min-h-[48px]"
            onClick={handleSave}
          >
            حفظ التغييرات
          </button>
        </div>
      </AppShell>
    );
  },
});
