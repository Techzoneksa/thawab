import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { CheckCircle2, Eye, ThumbsUp, ThumbsDown, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type QuoteItem = {
  sup: string;
  price: number;
  delivery: string;
  warranty: string;
  rating: number;
  winner: boolean;
  status: string;
};

export const Route = createFileRoute("/procurement/quotes")({
  head: () => ({ meta: [{ title: "عروض الأسعار — ثواب" }] }),
  component: () => {
    const [quotes, setQuotes] = useState<QuoteItem[]>([
      {
        sup: "شركة تموين السعودية",
        price: 82400,
        delivery: "5 أيام",
        warranty: "—",
        rating: 4.6,
        winner: true,
        status: "بانتظار",
      },
      {
        sup: "مؤسسة العلا للتجهيزات",
        price: 86900,
        delivery: "4 أيام",
        warranty: "—",
        rating: 4.4,
        winner: false,
        status: "بانتظار",
      },
      {
        sup: "شركة الإمداد الذهبي",
        price: 91200,
        delivery: "3 أيام",
        warranty: "—",
        rating: 4.7,
        winner: false,
        status: "بانتظار",
      },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formSup, setFormSup] = useState("");
    const [formPrice, setFormPrice] = useState("");
    const [formDelivery, setFormDelivery] = useState("");

    const handleAdd = () => {
      if (!formSup.trim() || !formPrice.trim()) {
        showToast("يرجى إدخال البيانات", "error");
        return;
      }
      setQuotes([
        ...quotes,
        {
          sup: formSup,
          price: Number(formPrice),
          delivery: formDelivery || "—",
          warranty: "—",
          rating: 0,
          winner: false,
          status: "بانتظار",
        },
      ]);
      showToast("تم إضافة عرض السعر بنجاح", "success");
      setFormOpen(false);
      setFormSup("");
      setFormPrice("");
      setFormDelivery("");
    };

    const handleAccept = (idx: number) => {
      const q = quotes.map((x, i) => ({
        ...x,
        winner: i === idx,
        status: i === idx ? "مقبول" : "مرفوض",
      }));
      setQuotes(q);
      showToast("تم قبول عرض السعر", "success");
    };

    const handleDelete = () => {
      setQuotes(quotes.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف عرض السعر", "success");
      setConfirmIdx(-1);
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "المشتريات", "عروض الأسعار"]}
        title="مقارنة عروض الأسعار — PR-2406-0073"
        actions={
          <>
            <ExportButton
              data={quotes.map((q) => ({
                المورد: q.sup,
                السعر: q.price,
                مدة_التسليم: q.delivery,
                الضمان: q.warranty,
                التقييم: q.rating,
                الحالة: q.status,
              }))}
              filename="quotes.csv"
            />
            <Btn variant="primary" onClick={() => setFormOpen(true)}>
              <Plus size={15} />
              إضافة عرض سعر
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="مقارنة عروض الأسعار" count={`${quotes.length} عرض`} />
        <Card className="p-5 mb-4">
          <div className="text-sm text-muted-foreground">
            الموضوع: <b className="text-foreground">مستلزمات سلال غذائية - 1000 سلة</b> · المشروع:
            PRJ-017 · الميزانية المعتمدة: {fmtSAR(95_000)}
          </div>
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {quotes.map((q, idx) => (
            <Card key={q.sup} className={`p-5 ${q.winner ? "ring-2 ring-success" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold">{q.sup}</h3>
                <ActionMenu
                  actions={[
                    {
                      label: "عرض",
                      icon: Eye,
                      onClick: () => showToast(`المورد: ${q.sup} - ${fmtSAR(q.price)}`, "info"),
                    },
                    { label: "قبول", icon: ThumbsUp, onClick: () => handleAccept(idx) },
                    {
                      label: "رفض",
                      icon: ThumbsDown,
                      onClick: () => {
                        const qq = [...quotes];
                        qq[idx] = { ...qq[idx], status: "مرفوض" };
                        setQuotes(qq);
                        showToast("تم رفض عرض السعر", "info");
                      },
                    },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive" as const,
                      onClick: () => setConfirmIdx(idx),
                    },
                  ]}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                {q.winner && (
                  <Badge tone="success">
                    <CheckCircle2 size={11} className="inline ms-1" />
                    الموصى به
                  </Badge>
                )}
                <Badge
                  tone={
                    q.status === "مقبول"
                      ? "success"
                      : q.status === "مرفوض"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {q.status}
                </Badge>
              </div>
              <div className="text-3xl font-extrabold tabular-nums mt-3">{fmtSAR(q.price)}</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-muted-foreground">مدة التسليم</span>
                  <b>{q.delivery}</b>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">الضمان</span>
                  <b>{q.warranty}</b>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">تقييم المورد</span>
                  <b>{q.rating} / 5</b>
                </li>
              </ul>
              <Btn
                variant={q.winner ? "primary" : "outline"}
                className="w-full mt-4 justify-center"
                onClick={() => handleAccept(idx)}
              >
                {q.winner ? "اختيار" : "عرض التفاصيل"}
              </Btn>
            </Card>
          ))}
        </div>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة عرض سعر"
          onSave={handleAdd}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم المورد</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSup}
              onChange={(e) => setFormSup(e.target.value)}
              placeholder="اسم المورد"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">السعر</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">مدة التسليم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDelivery}
              onChange={(e) => setFormDelivery(e.target.value)}
              placeholder="مثال: 5 أيام"
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف عرض السعر؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
