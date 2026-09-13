import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { label } from "@/lib/i18n/labels";
import { ArrowRight, Share2 } from "lucide-react";
import {
  getJournalEntry,
  type JournalLine,
  type JournalEntry,
  type WorkflowEvent,
} from "@/lib/api/journal";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/finance/journal_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل قيد اليومية — ثواب" }] }),
  component: JournalDetailPage,
});

const WF_ACTION_LABEL: Record<string, string> = {
  create: "إنشاء",
  submit: "إرسال للاعتماد",
  approve: "اعتماد",
  post: "ترحيل",
  return: "إعادة",
  reject: "رفض",
  reverse: "عكس",
  cancel: "إلغاء",
};

function JournalDetailPage() {
  const { id } = useParams({ from: "/finance/journal_/$id" });
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: () => getJournalEntry(id),
  });
  const d = q.data;
  const back = () => nav({ to: "/finance/journal" });

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    return {
      title: "قيد يومية",
      number: v.number,
      date: v.date,
      orientation: "portrait",
      meta: [
        { label: "الحالة", value: label("journalStatus", v.status) },
        { label: "الصندوق", value: label("fund", v.fund) },
        { label: "الوصف", value: v.description || "—" },
      ],
      columns: [
        { key: "account", label: "الحساب", width: "40%" },
        { key: "debit", label: "مدين", type: "money" },
        { key: "credit", label: "دائن", type: "money" },
        { key: "description", label: "الوصف", width: "28%" },
      ],
      rows: d!.lines.map((l) => ({
        account: `${l.accountCode} - ${l.accountName}`,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || (l.costCenterName ? `مركز التكلفة: ${l.costCenterName}` : ""),
      })),
      totals: [
        { label: "إجمالي مدين", value: d!.totals.debit, type: "money", strong: true },
        { label: "إجمالي دائن", value: d!.totals.credit, type: "money", strong: true },
      ],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `journal-${v.number}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `قيد ${d?.item?.number || ""}`;
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
      showToast("تم نسخ رابط القيد", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "قيود اليومية", d?.item?.number || "قيد"]}
      title={`القيد: ${d?.item?.number || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات القيد</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Field label="الرقم" value={d.item.number} mono />
              <Field label="التاريخ" value={d.item.date} />
              <Field label="الحالة" value={label("journalStatus", d.item.status)} />
              <Field label="الصندوق" value={label("fund", d.item.fund)} />
            </div>
            {d.item.description && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground">الوصف</div>
                <div className="text-sm mt-1">{d.item.description}</div>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">السطور</div>
            <div className="space-y-1.5">
              {d.lines.map((l: JournalLine) => (
                <div key={l.id} className="rounded-lg border p-2 bg-muted/30 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-bold">
                      {l.accountCode} - {l.accountName}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {l.debit > 0 ? (
                        <span className="text-success font-bold">مدين {fmtSAR(l.debit)}</span>
                      ) : (
                        <span className="text-info font-bold">دائن {fmtSAR(l.credit)}</span>
                      )}
                    </span>
                  </div>
                  {l.description && (
                    <div className="text-muted-foreground mt-1">{l.description}</div>
                  )}
                  {l.costCenterName && (
                    <div className="text-muted-foreground mt-1">
                      مركز التكلفة: {l.costCenterName}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between rounded-lg bg-primary/10 p-2 text-sm font-bold">
              <span>الإجمالي</span>
              <span className="tabular-nums">
                مدين {fmtSAR(d.totals.debit)} | دائن {fmtSAR(d.totals.credit)}
              </span>
            </div>
            <div className="mt-1">
              <Badge tone={d.totals.balanced ? "success" : "destructive"}>
                {d.totals.balanced ? "متوازن ✓" : "غير متوازن ✗"}
              </Badge>
            </div>
          </Card>

          {d.item.notes && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground">ملاحظات</div>
              <div className="text-sm mt-1">{d.item.notes}</div>
            </Card>
          )}

          {(d.reversedOf || d.reversalEntries.length > 0) && (
            <Card className="p-3 bg-warning/10 text-xs space-y-1">
              {d.reversedOf && (
                <div>
                  هذا القيد عكس القيد: <span className="font-mono">{d.reversedOf.number}</span>
                </div>
              )}
              {d.reversalEntries.length > 0 && (
                <div>
                  عُكِس هذا القيد بواسطة:{" "}
                  {d.reversalEntries.map((r: JournalEntry) => (
                    <span key={r.id} className="font-mono me-2">
                      {r.number}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              مسار الاعتماد والترحيل
            </div>
            {d.workflowHistory && d.workflowHistory.length > 0 ? (
              <ol className="relative space-y-2 border-r-2 border-muted pr-3">
                {d.workflowHistory.map((w: WorkflowEvent) => (
                  <li key={w.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{WF_ACTION_LABEL[w.action] || w.action}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {w.createdAt?.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      بواسطة {w.userName || "—"}
                      {w.fromStatus && w.toStatus ? (
                        <>
                          {" "}
                          · {label("journalStatus", w.fromStatus)} →{" "}
                          {label("journalStatus", w.toStatus)}
                        </>
                      ) : null}
                    </div>
                    {w.reason ? (
                      <div className="mt-0.5 rounded bg-muted/40 px-2 py-1">السبب: {w.reason}</div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-muted-foreground">لا يوجد سجل مسار بعد.</div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label: lbl, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{lbl}</div>
      <div className={`font-semibold ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
