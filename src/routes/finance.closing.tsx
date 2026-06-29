import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { CheckCircle2, Lock, Calendar, GitBranch } from "lucide-react";

export const Route = createFileRoute("/finance/closing")({
  head: () => ({ meta: [{ title: "الإقفال المالي — ثواب" }] }),
  component: () => (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الإقفال المالي"]}
      title="الإقفال الشهري والسنوي"
      actions={
        <Btn variant="primary">
          <Lock size={15} />
          بدء إقفال شهر شوال
        </Btn>
      }
    >
      <MobilePageHeader title="الإقفال الشهري والسنوي" count="9 بنود" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Calendar size={14} />
            الشهر الحالي
          </div>
          <div className="text-2xl font-extrabold">شوال 1446</div>
          <div className="text-xs text-muted-foreground mt-1">ينتهي بعد 3 أيام</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <GitBranch size={14} />
            نسبة جاهزية الإقفال
          </div>
          <div className="text-2xl font-extrabold">82%</div>
          <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-success" style={{ width: "82%" }} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            آخر إقفال شهري
          </div>
          <div className="text-2xl font-extrabold">رمضان 1446</div>
          <Badge tone="success">مكتمل</Badge>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-bold mb-4">قائمة مراجعة الإقفال</h3>
        <ul className="space-y-2">
          {[
            { t: "ترحيل جميع قيود اليومية للشهر", d: true },
            { t: "مطابقة كشوف الحسابات البنكية", d: true },
            { t: "تحصيل الذمم المدينة المستحقة", d: true },
            { t: "اعتماد فواتير الموردين القائمة", d: true },
            { t: "احتساب الإهلاك الشهري للأصول", d: false },
            { t: "مراجعة الأموال المقيدة وغير المقيدة", d: false },
            { t: "إعداد القوائم المالية الأولية", d: false },
            { t: "اعتماد القوائم من المدير المالي", d: false },
            { t: "إقفال الفترة ومنع التعديل", d: false },
          ].map((it, i) => (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-lg border p-3 ${it.d ? "bg-success/5" : ""}`}
            >
              <div
                className={`grid h-7 w-7 place-items-center rounded-full ${it.d ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}
              >
                {it.d ? <CheckCircle2 size={16} /> : <span className="text-xs">{i + 1}</span>}
              </div>
              <span
                className={`text-sm ${it.d ? "line-through text-muted-foreground" : "font-medium"}`}
              >
                {it.t}
              </span>
              {it.d && <Badge tone="success">مكتمل</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  ),
});
