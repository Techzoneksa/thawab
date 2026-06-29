import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, FilterBar, Select, Btn, Table, Td, statusTone } from "@/components/erp/AppShell";
import { APPROVALS, fmtSAR } from "@/data/sample";
import { CheckCircle2, XCircle, RotateCcw, Inbox, Clock, Filter, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "صندوق الموافقات — ثواب" }] }),
  component: Page,
});

function Page() {
  const tabs = [
    { name: "بانتظار موافقتي", count: 12, icon: Inbox, active: true },
    { name: "قمت بإنشائها", count: 8, icon: Clock },
    { name: "معتمدة", count: 142 },
    { name: "مرفوضة", count: 6 },
    { name: "مُعادة للتصحيح", count: 3 },
  ];
  return (
    <AppShell breadcrumb={["الرئيسية", "الموافقات"]} title="صندوق الموافقات" actions={<><Btn variant="outline"><Filter size={15} />تصفية</Btn><Btn variant="primary">اعتماد المحدد</Btn></>}>
      <div className="flex flex-wrap items-center gap-1 border-b mb-4">
        {tabs.map((t) => (
          <button key={t.name} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${t.active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.name} <span className="mr-1 text-xs rounded-full bg-muted px-2 py-0.5">{t.count}</span>
          </button>
        ))}
      </div>
      <FilterBar>
        <Select label="النوع" options={["الكل", "قيد يومية", "طلب شراء", "مساعدة", "ميزانية مشروع", "فاتورة مورد"]} />
        <Select label="الأولوية" options={["الكل", "عالية", "متوسطة", "منخفضة"]} />
        <Select label="المُنشِئ" options={["الكل", "محاسب", "مشتريات", "باحث", "م. المشاريع"]} />
        <Select label="الفترة" options={["اليوم", "هذا الأسبوع", "هذا الشهر"]} />
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-3">
          {APPROVALS.map((a, i) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" defaultChecked={i === 0} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>
                    <Badge tone="primary">{a.type}</Badge>
                    <Badge tone={a.priority === "عالية" ? "destructive" : a.priority === "متوسطة" ? "warning" : "muted"}>{a.priority}</Badge>
                  </div>
                  <h4 className="mt-1 font-semibold">{a.subject}</h4>
                  <div className="mt-1 text-xs text-muted-foreground">{a.requester} · المستوى: {a.level} · {a.date}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="tabular-nums font-bold text-base">{fmtSAR(a.amount)}</span>
                    <div className="flex gap-2">
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 text-success px-3 py-1.5 text-xs font-semibold hover:bg-success/25"><CheckCircle2 size={14} /> اعتماد</button>
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-warning/20 text-warning-foreground px-3 py-1.5 text-xs font-semibold hover:bg-warning/30"><RotateCcw size={14} /> إعادة</button>
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 text-destructive px-3 py-1.5 text-xs font-semibold hover:bg-destructive/25"><XCircle size={14} /> رفض</button>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><ArrowLeft size={14} /> التفاصيل</button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="lg:col-span-2 p-5 h-fit sticky top-20">
          <h3 className="font-bold mb-1">{APPROVALS[0].subject}</h3>
          <p className="text-xs text-muted-foreground">{APPROVALS[0].id} · {APPROVALS[0].type}</p>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div><div className="text-muted-foreground text-xs">المبلغ</div><div className="font-bold tabular-nums">{fmtSAR(APPROVALS[0].amount)}</div></div>
            <div><div className="text-muted-foreground text-xs">مقدم الطلب</div><div className="font-semibold">{APPROVALS[0].requester}</div></div>
            <div><div className="text-muted-foreground text-xs">المركز</div><div>المركز المالي 41</div></div>
            <div><div className="text-muted-foreground text-xs">المشروع</div><div>السلال الغذائية الشهرية</div></div>
          </div>

          <div className="mt-5">
            <h4 className="font-semibold text-sm mb-3">مسار الاعتماد</h4>
            <ol className="relative border-r-2 border-muted pr-4 space-y-4">
              {[
                { who: "محاسب: سارة الزهراني", when: "أمس 16:40", state: "تم الإنشاء", tone: "success" as const },
                { who: "محاسب أول: محمد الغامدي", when: "اليوم 09:12", state: "تمت المراجعة", tone: "success" as const },
                { who: "المدير المالي: سعد الغامدي", when: "بانتظار", state: "بانتظار الاعتماد", tone: "warning" as const },
                { who: "المدير التنفيذي", when: "—", state: "غير مفعّل", tone: "muted" as const },
              ].map((s, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -right-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-card ${s.tone === "success" ? "bg-success" : s.tone === "warning" ? "bg-warning" : "bg-muted-foreground/40"}`} />
                  <div className="text-sm font-semibold">{s.who}</div>
                  <div className="text-xs text-muted-foreground">{s.when}</div>
                  <Badge tone={s.tone}>{s.state}</Badge>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5">
            <h4 className="font-semibold text-sm mb-2">ملاحظات</h4>
            <textarea rows={3} className="w-full rounded-lg border bg-background p-2 text-sm" placeholder="اكتب ملاحظتك على الموافقة..." />
            <div className="flex justify-end gap-2 mt-2">
              <Btn variant="outline">حفظ كمسودة</Btn>
              <Btn variant="primary">اعتماد وإرسال</Btn>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
