import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/procurement/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار — ثواب" }] }),
  component: () => {
    const quotes = [
      { sup: "شركة تموين السعودية", price: 82_400, delivery: "5 أيام", warranty: "—", rating: 4.6, winner: true },
      { sup: "مؤسسة العلا للتجهيزات", price: 86_900, delivery: "4 أيام", warranty: "—", rating: 4.4, winner: false },
      { sup: "شركة الإمداد الذهبي", price: 91_200, delivery: "3 أيام", warranty: "—", rating: 4.7, winner: false },
    ];
    return (
      <AppShell breadcrumb={["الرئيسية", "المشتريات", "عروض الأسعار"]} title="مقارنة عروض الأسعار — PR-2406-0073"
        actions={<Btn variant="primary">اعتماد المورد المختار</Btn>}
      >
        <Card className="p-5 mb-4">
          <div className="text-sm text-muted-foreground">الموضوع: <b className="text-foreground">مستلزمات سلال غذائية - 1000 سلة</b> · المشروع: PRJ-017 · الميزانية المعتمدة: {fmtSAR(95_000)}</div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {quotes.map((q) => (
            <Card key={q.sup} className={`p-5 ${q.winner ? "ring-2 ring-success" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold">{q.sup}</h3>
                {q.winner && <Badge tone="success"><CheckCircle2 size={11} className="inline ms-1" />الموصى به</Badge>}
              </div>
              <div className="text-3xl font-extrabold tabular-nums mt-3">{fmtSAR(q.price)}</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-muted-foreground">مدة التسليم</span><b>{q.delivery}</b></li>
                <li className="flex justify-between"><span className="text-muted-foreground">الضمان</span><b>{q.warranty}</b></li>
                <li className="flex justify-between"><span className="text-muted-foreground">تقييم المورد</span><b>{q.rating} / 5</b></li>
              </ul>
              <Btn variant={q.winner ? "primary" : "outline"} className="w-full mt-4 justify-center">{q.winner ? "اختيار" : "عرض التفاصيل"}</Btn>
            </Card>
          ))}
        </div>
      </AppShell>
    );
  },
});
