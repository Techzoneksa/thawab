import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Card, Btn, MobilePageHeader } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, EmptyState } from "@/components/erp/actions";
import { ShieldCheck, Globe, Wrench } from "lucide-react";

const TENANTS: string[] = [];

export const Route = createFileRoute("/settings/system")({
  head: () => ({ meta: [{ title: "إعدادات النظام — ثواب" }] }),
  component: () => {
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

    function handleSave() {
      showToast("تم حفظ الإعدادات بنجاح", "success");
    }

    function handleToggleMaintenance() {
      setConfirmAction(() => () => {
        setMaintenanceMode(!maintenanceMode);
        showToast(`تم ${!maintenanceMode ? "تفعيل" : "إلغاء"} وضع الصيانة`, "success");
      });
      setConfirmOpen(true);
    }

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "إعدادات النظام"]}
        title="إعدادات النظام العامة"
        actions={
          <Btn variant="primary" onClick={handleSave}>
            حفظ الإعدادات
          </Btn>
        }
      >
        <MobilePageHeader title="إعدادات النظام العامة" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-bold mb-3 inline-flex items-center gap-2">
              <Globe size={16} className="text-primary" />
              البنية متعددة المستأجرين
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              نظام خاص بإدارة الجمعية مع عزل كامل للبيانات لكل فرع.
            </p>
            {TENANTS.length === 0 ? (
              <EmptyState
                icon={<Globe size={40} />}
                title="لا توجد فروع مُعرّفة"
                description="لم تتم إضافة أي فرع أو مستأجر بعد"
              />
            ) : (
              <ul className="space-y-2">
                {TENANTS.map((t) => (
                  <li
                    key={t}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="font-bold mb-3 inline-flex items-center gap-2">
              <ShieldCheck size={16} className="text-success" />
              الأمان والامتثال
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                "استضافة سحابية داخل المملكة العربية السعودية (Riyadh Region)",
                "تشفير البيانات أثناء النقل (TLS 1.3) وأثناء التخزين (AES-256)",
                "متوافق مع متطلبات الهيئة الوطنية للأمن السيبراني",
                "متوافق مع نظام حماية البيانات الشخصية (PDPL)",
                "متوافق مع متطلبات المركز الوطني لتنمية القطاع غير الربحي",
                "تكامل مع فاتورة (الهيئة العامة للزكاة والضريبة والجمارك)",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="text-success mt-0.5">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench size={16} className="text-warning" />
                  <span className="text-sm font-semibold">وضع الصيانة</span>
                </div>
                <button
                  onClick={handleToggleMaintenance}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${maintenanceMode ? "bg-destructive" : "bg-muted"}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${maintenanceMode ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                  />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {maintenanceMode ? "النظام في وضع الصيانة حالياً" : "النظام يعمل بشكل طبيعي"}
              </p>
            </div>
          </Card>
        </div>

        <div className="lg:hidden fixed bottom-16 right-0 left-0 z-20 border-t bg-surface/95 backdrop-blur px-4 py-3 safe-area-bottom shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-bold text-sm min-h-[48px]"
            onClick={handleSave}
          >
            حفظ الإعدادات
          </button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            confirmAction();
            setConfirmOpen(false);
          }}
          title={maintenanceMode ? "إلغاء وضع الصيانة" : "تفعيل وضع الصيانة"}
          message={
            maintenanceMode
              ? "هل تريد إلغاء وضع الصيانة والعودة للتشغيل العادي؟"
              : "سيتم تعطيل وصول المستخدمين للنظام. هل أنت متأكد؟"
          }
          confirmText={maintenanceMode ? "إلغاء الصيانة" : "تفعيل الصيانة"}
          cancelText="إلغاء"
          variant={maintenanceMode ? "default" : "destructive"}
        />
      </AppShell>
    );
  },
});
