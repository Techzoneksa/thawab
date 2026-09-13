import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { label } from "@/lib/i18n/labels";
import { ArrowRight, Share2, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { getApproval, actOnApproval, type ApprovalAction } from "@/lib/api/approvals";
import { ApprovalStatus, Priority } from "@/lib/enums";

export const Route = createFileRoute("/approvals_/$id")({
  head: () => ({ meta: [{ title: "مراجعة طلب موافقة — ثواب" }] }),
  component: ApprovalDetailPage,
});

function ApprovalDetailPage() {
  const { id } = useParams({ from: "/approvals_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  // Pending reject/return awaiting a required reason.
  const [reason, setReason] = useState<{ action: ApprovalAction; title: string } | null>(null);

  const q = useQuery({ queryKey: ["approval", id], queryFn: () => getApproval(id) });
  const d = q.data;

  const actMut = useMutation({
    mutationFn: (p: { action: ApprovalAction; note?: string }) =>
      actOnApproval(id, p.action, p.note),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["approval", id] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      const msg =
        v.action === "approve"
          ? "تم اعتماد الطلب"
          : v.action === "reject"
            ? "تم رفض الطلب"
            : "تم إرجاع الطلب للتصحيح";
      showToast(msg, v.action === "reject" ? "info" : "success");
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const back = () => nav({ to: "/approvals" });
  const isPending = d?.status === ApprovalStatus.PENDING;
  const priorityTone = (p: string) =>
    p === Priority.HIGH || p === Priority.URGENT
      ? "destructive"
      : p === Priority.MEDIUM
        ? "warning"
        : "muted";

  const share = async () => {
    const url = window.location.href;
    const title = `طلب موافقة ${d?.id || ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط الطلب", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الموافقات", d?.subject || "مراجعة"]}
      title={`مراجعة الطلب: ${d?.id || ""}`}
      actions={
        <>
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات الطلب</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">{d.id}</span>
              <Badge tone="primary">{d.type}</Badge>
              <Badge tone={priorityTone(d.priority)}>{label("priority", d.priority)}</Badge>
              <Badge tone={statusTone(d.status)}>{label("approvalStatus", d.status)}</Badge>
            </div>
            <h2 className="text-lg font-bold">{d.subject}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="مقدم الطلب" value={d.requester || "—"} />
              <KV label="مستوى الاعتماد" value={String(d.level)} />
              <KV label="المبلغ" value={fmtSAR(d.amount)} />
              <KV
                label="تاريخ الإنشاء"
                value={d.createdAt?.slice(0, 16).replace("T", " ") || "—"}
              />
              {d.projectId ? <KV label="المشروع" value={d.projectId} /> : null}
            </div>
          </Card>

          {d.notes ? (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground">ملاحظات</div>
              <div className="text-sm mt-1 whitespace-pre-line">{d.notes}</div>
            </Card>
          ) : null}

          {isPending ? (
            <Card className="p-3 flex flex-wrap gap-1.5">
              <Btn
                variant="primary"
                disabled={actMut.isPending}
                onClick={() => actMut.mutate({ action: "approve" })}
              >
                <CheckCircle2 size={14} /> اعتماد
              </Btn>
              <Btn
                variant="outline"
                disabled={actMut.isPending}
                onClick={() => setReason({ action: "return", title: "إرجاع الطلب للتصحيح" })}
              >
                <RotateCcw size={14} /> إعادة
              </Btn>
              <Btn
                variant="outline"
                disabled={actMut.isPending}
                onClick={() => setReason({ action: "reject", title: "رفض الطلب" })}
              >
                <XCircle size={14} /> رفض
              </Btn>
            </Card>
          ) : (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              تمت معالجة هذا الطلب — لا توجد إجراءات متاحة.
            </div>
          )}
        </div>
      )}

      {reason && (
        <ReasonDialog
          title={reason.title}
          onCancel={() => setReason(null)}
          onConfirm={(r) => actMut.mutate({ action: reason.action, note: r })}
          loading={actMut.isPending}
        />
      )}
    </AppShell>
  );
}

function KV({ label: lbl, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{lbl}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ReasonDialog({
  title,
  onCancel,
  onConfirm,
  loading,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [r, setR] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">{title}</div>
        <textarea
          className="inp"
          rows={3}
          placeholder="اكتب السبب (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد
          </Btn>
        </div>
      </div>
    </div>
  );
}
