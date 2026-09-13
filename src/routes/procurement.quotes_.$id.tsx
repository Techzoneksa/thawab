import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import {
  ArrowRight,
  Share2,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Star,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import { QuoteStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import { getQuote, acceptQuote, rejectQuote, deleteQuote, type Quote } from "@/lib/api/quotes";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/quotes_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل عرض سعر — ثواب" }] }),
  component: QuoteDetailPage,
});

function quoteStatusTone(s: string): "success" | "destructive" | "warning" | "muted" {
  if (s === QuoteStatus.ACCEPTED) return "success";
  if (s === QuoteStatus.REJECTED) return "destructive";
  return "warning";
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function QuoteDetailPage() {
  const { id } = useParams({ from: "/procurement/quotes_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirmAction, setConfirmAction] = useState<"accept" | "reject" | "delete" | null>(null);

  const q = useQuery({ queryKey: ["quoteDetail", id], queryFn: () => getQuote(id) });
  const d: Quote | undefined = q.data?.item;

  const acceptMut = useMutation({
    mutationFn: () => acceptQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quoteDetail", id] });
      showToast("تم قبول العرض وتحديده كفائز", "success");
      setConfirmAction(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quoteDetail", id] });
      showToast("تم رفض عرض السعر", "info");
      setConfirmAction(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteQuote({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      showToast("تم حذف عرض السعر", "success");
      nav({ to: "/procurement/quotes" });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/procurement/quotes" });
  const isPending = d?.status === QuoteStatus.PENDING;

  const buildDoc = (): DocumentDefinition => {
    const v = d!;
    return {
      title: "عرض سعر",
      date: String(v.createdAt || "").slice(0, 10),
      orientation: "portrait",
      entity: { name: v.supplier },
      meta: [
        { label: "الحالة", value: label("quoteStatus", v.status) },
        { label: "الموصى به", value: v.winner ? "نعم" : "لا" },
        { label: "التقييم", value: `${v.rating || 0} / 5` },
        { label: "صالح حتى", value: v.validUntil || "—" },
      ],
      columns: [
        { key: "supplier", label: "المورد", width: "34%" },
        { key: "delivery", label: "مدة التسليم" },
        { key: "warranty", label: "الضمان" },
        { key: "price", label: "السعر", type: "money" },
      ],
      rows: [
        {
          supplier: v.supplier,
          delivery: v.delivery || "—",
          warranty: v.warranty || "—",
          price: v.price,
        },
      ],
      totals: [{ label: "السعر", value: v.price, type: "money", strong: true }],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `quote-${v.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `عرض سعر ${d?.supplier || ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط العرض", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "عروض الأسعار", d?.supplier || "عرض سعر"]}
      title={`تفاصيل عرض السعر: ${d?.supplier || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && isPending && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/procurement/quotes/$id/edit", params: { id } as any })}
            >
              <Pencil size={15} /> تعديل
            </Btn>
          )}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !d ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب عرض السعر</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className={`p-4 space-y-3 ${d.winner ? "ring-2 ring-success" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-base">{d.supplier}</div>
              <div className="flex items-center gap-2">
                {d.winner && (
                  <Badge tone="success">
                    <CheckCircle2 size={11} className="inline ms-1" />
                    الموصى به
                  </Badge>
                )}
                <Badge tone={quoteStatusTone(d.status)}>{label("quoteStatus", d.status)}</Badge>
              </div>
            </div>
            <div className="text-3xl font-extrabold tabular-nums">{fmtSAR(d.price)}</div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={13}
                  className={s <= d.rating ? "fill-warning text-warning" : "text-muted-foreground"}
                />
              ))}
              <span className="text-xs text-muted-foreground">({d.rating}/5)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="مدة التسليم" value={d.delivery || "—"} />
              <KV label="الضمان" value={d.warranty || "—"} />
              <KV label="صالح حتى" value={d.validUntil || "—"} />
            </div>
            {d.notes ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">{d.notes}</div>
            ) : null}
          </Card>

          {isPending && (
            <Card className="p-3 flex flex-wrap gap-1.5">
              <Btn
                variant="outline"
                onClick={() => nav({ to: "/procurement/quotes/$id/edit", params: { id } as any })}
              >
                <Pencil size={14} /> تعديل
              </Btn>
              <Btn variant="primary" onClick={() => setConfirmAction("accept")}>
                <ThumbsUp size={14} /> قبول
              </Btn>
              <Btn variant="outline" onClick={() => setConfirmAction("reject")}>
                <ThumbsDown size={14} /> رفض
              </Btn>
              <Btn variant="outline" onClick={() => setConfirmAction("delete")}>
                <Trash2 size={14} /> حذف
              </Btn>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction === "accept"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => acceptMut.mutate()}
        title="قبول عرض السعر"
        message={
          d
            ? `هل تريد قبول عرض "${d.supplier}" بسعر ${fmtSAR(d.price)}؟ سيتم ترميزه كعرض فائز ولن تستطيع تعديله بعد الآن.`
            : ""
        }
        confirmText="قبول العرض"
        cancelText="إلغاء"
      />
      <ConfirmDialog
        open={confirmAction === "reject"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => rejectMut.mutate()}
        title="رفض عرض السعر"
        message={d ? `هل تريد رفض عرض "${d.supplier}"؟` : ""}
        confirmText="رفض"
        cancelText="تراجع"
        variant="destructive"
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف عرض السعر"
        message={d ? `هل تريد حذف عرض السعر من "${d.supplier}"؟` : ""}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
