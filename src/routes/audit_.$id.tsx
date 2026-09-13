import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { ArrowRight, Share2 } from "lucide-react";
import { getAuditEntry } from "@/lib/api/audit";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/audit_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل سجل التدقيق — ثواب" }] }),
  component: AuditDetailPage,
});

function AuditDetailPage() {
  const { id } = useParams({ from: "/audit_/$id" });
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["audit-entry", id],
    queryFn: () => getAuditEntry(id),
  });
  const d = q.data;
  const back = () => nav({ to: "/audit" });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    const meta: DocMeta[] = [
      { label: "المستخدم", value: it.userName || "—" },
      { label: "الإجراء", value: it.action },
      { label: "نوع الكيان", value: it.entityType },
      { label: "رقم السجل", value: it.entityId },
      { label: "الوقت", value: it.timestamp || "—" },
    ];
    if (it.ip) meta.push({ label: "IP", value: it.ip });
    if (it.description) meta.push({ label: "الوصف", value: it.description });
    return {
      title: "سجل تدقيق",
      date: it.timestamp ? it.timestamp.slice(0, 10) : undefined,
      orientation: "portrait",
      meta,
      columns: [
        { key: "field", label: "الحقل", width: "34%" },
        { key: "before", label: "قبل", width: "33%" },
        { key: "after", label: "بعد", width: "33%" },
      ],
      rows: diffRows(d!.before, d!.after),
      fileBase: `audit-${it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `سجل تدقيق ${d?.item?.entityId || ""}`;
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
      showToast("تم نسخ رابط السجل", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "سجل التدقيق", d?.item?.entityId || "سجل"]}
      title={`السجل: ${d?.item?.entityId || ""}`}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات السجل</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailRow label="المستخدم" value={d.item.userName || "—"} />
              <DetailRow label="الإجراء" value={d.item.action} />
              <DetailRow label="نوع الكيان" value={d.item.entityType} />
              <DetailRow label="رقم السجل" value={d.item.entityId} />
              <DetailRow label="الوقت" value={d.item.timestamp || "—"} />
              {d.item.ip && <DetailRow label="IP" value={d.item.ip} />}
            </div>
          </Card>

          {d.item.description && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-1">الوصف</div>
              <div className="text-sm">{d.item.description}</div>
            </Card>
          )}

          {(Boolean(d.before) || Boolean(d.after)) && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                التغييرات (Before / After)
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <SnapshotPanel title="قبل" data={d.before} tone="destructive" />
                <SnapshotPanel title="بعد" data={d.after} tone="success" />
              </div>
            </Card>
          )}

          <Card className="p-3 bg-info/10 border-info">
            <div className="text-xs text-muted-foreground">
              ⚠ سجل التدقيق للقراءة فقط — لا يمكن تعديل أو حذف السجلات من الواجهة.
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function diffRows(before: unknown, after: unknown): Array<Record<string, unknown>> {
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : null;
  const a = after && typeof after === "object" ? (after as Record<string, unknown>) : null;
  if (!b && !a) return [];
  const keys = Array.from(new Set([...(b ? Object.keys(b) : []), ...(a ? Object.keys(a) : [])]));
  return keys.map((k) => ({
    field: k,
    before: b ? fmtVal(b[k]) : "—",
    after: a ? fmtVal(a[k]) : "—",
  }));
}

function fmtVal(v: unknown): string {
  if (v == null) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold break-words">{value}</div>
    </div>
  );
}

function SnapshotPanel({
  title,
  data,
  tone,
}: {
  title: string;
  data: unknown;
  tone: "success" | "destructive";
}) {
  return (
    <div
      className={`rounded-lg border p-2 ${tone === "success" ? "bg-success/10" : "bg-destructive/10"}`}
    >
      <div className="text-[10px] font-semibold text-muted-foreground mb-1">{title}</div>
      {data == null ? (
        <div className="text-xs text-muted-foreground italic">لا توجد بيانات</div>
      ) : typeof data === "object" ? (
        <pre className="text-[10px] font-mono whitespace-pre-wrap break-words leading-relaxed">
          {String(JSON.stringify(data, null, 2))}
        </pre>
      ) : (
        <div className="text-xs break-words">{String(data)}</div>
      )}
    </div>
  );
}
