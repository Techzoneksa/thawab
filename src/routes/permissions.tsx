import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { PERMISSIONS_MATRIX } from "@/data/sample";
import { KeyRound, Plus } from "lucide-react";

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — ثواب" }] }),
  component: Page,
});

function tone(v: string) {
  if (v === "كامل") return "success";
  if (v === "اعتماد") return "primary";
  if (v === "إدخال" || v === "طلب") return "info";
  if (v === "قراءة" || v === "محدود") return "muted";
  return "muted";
}

function Page() {
  const modules = ["finance", "donations", "projects", "procurement", "reports", "settings"] as const;
  const labels = { finance: "المالية", donations: "التبرعات", projects: "المشاريع", procurement: "المشتريات", reports: "التقارير", settings: "الإعدادات" };
  return (
    <AppShell breadcrumb={["الرئيسية", "التقارير والحوكمة", "الصلاحيات"]} title="مصفوفة الصلاحيات (RBAC)"
      actions={<Btn variant="primary"><Plus size={15} />دور جديد</Btn>}
    >
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-right">
              <th className="px-4 py-3 font-semibold">الدور</th>
              {modules.map((m) => <th key={m} className="px-4 py-3 font-semibold text-center">{labels[m]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS_MATRIX.map((r) => (
              <tr key={r.role} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-semibold"><KeyRound size={14} className="inline ms-1 text-primary" />{r.role}</td>
                {modules.map((m) => (
                  <td key={m} className="px-4 py-3 text-center"><Badge tone={tone(r[m]) as any}>{r[m]}</Badge></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card className="p-5">
          <h3 className="font-bold mb-3">فصل المهام (SoD)</h3>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>✓ المنشئ ≠ المعتمِد للقيود المالية</li>
            <li>✓ المشتريات ≠ السداد</li>
            <li>✓ صرف المساعدة يتطلب 3 مستويات اعتماد</li>
            <li>✓ تعديل الميزانية يتطلب موافقة المجلس</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">المصادقة الثنائية 2FA</h3>
          <p className="text-sm text-muted-foreground mb-3">مفعّلة لجميع المستخدمين ذوي الصلاحيات المالية والإدارية.</p>
          <Badge tone="success">مفعّلة لـ 24 مستخدم</Badge>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">سياسة كلمات المرور</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• الحد الأدنى 12 حرفاً</li>
            <li>• تجديد كل 90 يوم</li>
            <li>• حظر آخر 5 كلمات مرور</li>
            <li>• قفل بعد 5 محاولات فاشلة</li>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
