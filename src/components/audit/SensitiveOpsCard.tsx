import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Card, SectionTitle, Btn } from "@/components/erp/AppShell";
import { getAuditEntries } from "@/lib/api/audit";
import { useCan } from "@/lib/api/auth";
import {
  classifyAuditAction,
  SENSITIVE_LABELS,
  auditEntityLabel,
  type SensitiveKind,
} from "@/lib/audit-sensitive";

const TONE: Record<SensitiveKind, string> = {
  delete: "bg-destructive/10 text-destructive",
  unpost: "bg-destructive/10 text-destructive",
  cancel: "bg-warning/15 text-warning",
  reverse: "bg-warning/15 text-warning",
  reject: "bg-warning/15 text-warning",
  reopen: "bg-info/10 text-info",
  edit: "bg-primary/10 text-primary",
};

function when(ts: string) {
  const d = new Date(ts);
  if (isNaN(+d)) return ts;
  return d.toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Dashboard card: the latest sensitive operations across the platform (deletes,
 * cancellations, un-postings, reversals, rejections, re-openings and edits of
 * journals, invoices, vouchers…) with WHO did it and when. Audit viewers only.
 */
export function SensitiveOpsCard() {
  const can = useCan();
  const nav = useNavigate();
  const allowed = can("audit.view");
  const { data, isLoading } = useQuery({
    queryKey: ["audit-sensitive-dashboard"],
    queryFn: () => getAuditEntries({ sensitive: true, limit: 8 }),
    enabled: allowed,
    refetchInterval: 60_000,
  });
  if (!allowed) return null;
  const items = data?.items ?? [];

  return (
    <Card className="p-4 lg:p-5 mt-4 lg:mt-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ShieldAlert size={18} className="mt-0.5 text-destructive shrink-0" />
          <SectionTitle
            title="سجل العمليات الحساسة"
            hint="آخر عمليات الحذف والإلغاء وإلغاء الترحيل والتعديل — ومن نفّذها"
          />
        </div>
        <Btn variant="ghost" onClick={() => nav({ to: "/audit", search: { sensitive: "1" } })}>
          السجل الكامل
        </Btn>
      </div>
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          لا توجد عمليات حساسة مسجّلة
        </div>
      ) : (
        <ul className="mt-2 divide-y">
          {items.map((a) => {
            const kind = classifyAuditAction(a.action);
            return (
              <li
                key={a.id}
                onClick={() => nav({ to: "/audit/$id", params: { id: a.id } })}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40"
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    kind ? TONE[kind] : "bg-muted text-muted-foreground"
                  }`}
                >
                  {kind ? SENSITIVE_LABELS[kind] : a.action}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {a.description || `${auditEntityLabel(a.entityType)} ${a.entityId}`}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {auditEntityLabel(a.entityType)} · بواسطة{" "}
                    <b className="text-foreground">{a.userName || "النظام"}</b> · {when(a.timestamp)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
