import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { TENANTS } from "@/data/sample";
import { ShieldCheck, Globe } from "lucide-react";

export const Route = createFileRoute("/settings/system")({
  head: () => ({ meta: [{ title: "إعدادات النظام — ثواب" }] }),
  component: () => (
    <AppShell breadcrumb={["الرئيسية", "الإعدادات", "إعدادات النظام"]} title="إعدادات النظام العامة"
      actions={<Btn variant="primary">حفظ</Btn>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold mb-3 inline-flex items-center gap-2"><Globe size={16} className="text-primary" />البنية متعددة المستأجرين</h3>
          <p className="text-sm text-muted-foreground mb-3">نظام خاص بإدارة الجمعية مع عزل كامل للبيانات لكل فرع.</p>
          <ul className="space-y-2">
            {TENANTS.map((t, i) => (
              <li key={t} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{t}</span>
                <Badge tone={i === 0 ? "primary" : "muted"}>{i === 0 ? "المستأجر الحالي" : "نشط"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3 inline-flex items-center gap-2"><ShieldCheck size={16} className="text-success" />الأمان والامتثال</h3>
          <ul className="space-y-2 text-sm">
            {[
              "استضافة سحابية داخل المملكة العربية السعودية (Riyadh Region)",
              "تشفير البيانات أثناء النقل (TLS 1.3) وأثناء التخزين (AES-256)",
              "متوافق مع متطلبات الهيئة الوطنية للأمن السيبراني",
              "متوافق مع نظام حماية البيانات الشخصية (PDPL)",
              "متوافق مع متطلبات المركز الوطني لتنمية القطاع غير الربحي",
              "تكامل مع فاتورة (الهيئة العامة للزكاة والضريبة والجمارك)",
            ].map((t) => <li key={t} className="flex items-start gap-2"><span className="text-success mt-0.5">✓</span>{t}</li>)}
          </ul>
        </Card>
      </div>
    </AppShell>
  ),
});
