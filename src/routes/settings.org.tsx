import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";

export const Route = createFileRoute("/settings/org")({
  head: () => ({ meta: [{ title: "إعدادات الجمعية — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الإعدادات", "إعدادات الجمعية"]} title="إعدادات الجمعية"
      actions={<Btn variant="primary">حفظ التغييرات</Btn>}
    >
      <Card className="p-6">
        <h3 className="font-bold mb-4">المعلومات الأساسية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { l: "اسم الجمعية", v: "جمعية البر الخيرية" },
            { l: "رقم التسجيل بالمركز الوطني", v: "1234" },
            { l: "الرقم الضريبي", v: "300123456700003" },
            { l: "البريد الإلكتروني", v: "info@albir.org.sa" },
            { l: "الجوال", v: "920001234" },
            { l: "المدير التنفيذي", v: "د. عبدالله بن محمد السبيعي" },
            { l: "السنة المالية", v: "1446هـ (هجري)" },
            { l: "العملة الأساسية", v: "ر.س - الريال السعودي" },
          ].map((f) => (
            <div key={f.l}>
              <label className="text-xs text-muted-foreground">{f.l}</label>
              <input className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" defaultValue={f.v} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6 mt-4">
        <h3 className="font-bold mb-3">القدرات المُفعّلة</h3>
        <div className="flex flex-wrap gap-2">
          {["متعدد الفروع", "متعدد العملات", "متعدد المستأجرين", "REST API", "تطبيق جوال", "Webhooks", "فاتورة إلكترونية", "استضافة داخل المملكة"].map((c) => (
            <Badge key={c} tone="success">✓ {c}</Badge>
          ))}
        </div>
      </Card>
    </AppShell>
  ),
});
