import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil, CheckCircle, Lock, Unlock } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import { label } from "@/lib/i18n/labels";
import { BudgetStatus } from "@/lib/enums";
import {
  getBudget,
  approveBudget,
  lockBudget,
  unlockBudget,
  type BudgetLine,
} from "@/lib/api/budgets";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/finance/budgets_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الموازنة — ثواب" }] }),
  component: BudgetDetailPage,
});

function BudgetDetailPage() {
  const { id } = useParams({ from: "/finance/budgets_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({ queryKey: ["budget", id], queryFn: () => getBudget(id) });
  const d = q.data;
  const back = () => nav({ to: "/finance/budgets" });

  const actionMut = useMutation({
    mutationFn: async (action: "approve" | "lock" | "unlock") => {
      const fns = { approve: approveBudget, lock: lockBudget, unlock: unlockBudget };
      return fns[action]({ id, userId: user?.id, userName: user?.name });
    },
    onSuccess: (_r, action) => {
      const labels = {
        approve: "تم اعتماد الموازنة",
        lock: "تم قفل الموازنة",
        unlock: "تم فتح قفل الموازنة",
      };
      showToast(labels[action], "success");
      qc.invalidateQueries({ queryKey: ["budget", id] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    return {
      title: "الموازنة",
      subtitle: it.name,
      date: new Date().toISOString().slice(0, 10),
      orientation: "landscape",
      meta: [
        { label: "السنة", value: String(it.year) },
        { label: "الحالة", value: label("budgetStatus", it.status) },
        { label: "القسم", value: it.department || "—" },
        { label: "العملة", value: it.currency },
      ],
      columns: [
        { key: "account", label: "الحساب", width: "34%" },
        { key: "cc", label: "مركز التكلفة", width: "20%" },
        { key: "planned", label: "المخطط", type: "money" },
        { key: "actual", label: "الفعلي", type: "money" },
        { key: "variance", label: "الفرق", type: "money" },
      ],
      rows: (d!.lines || []).map((l: BudgetLine) => ({
        account: `${l.accountCode} - ${l.accountName}`,
        cc: l.costCenterName || "—",
        planned: l.plannedAmount,
        actual: l.actualAmount,
        variance: l.variance || 0,
      })),
      totals: [
        { label: "إجمالي المخطط", value: d!.totals.planned, type: "money", strong: true },
        { label: "إجمالي الفعلي", value: d!.totals.actual, type: "money" },
        { label: "الفرق", value: d!.totals.variance, type: "money" },
      ],
      notes: d!.item.description || undefined,
      signature: true,
      fileBase: `budget-${it.name}-${it.year}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: `الموازنة ${d?.item?.name || ""}`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ الرابط", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  const st = d?.item.status;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموازنات", d?.item?.name || "موازنة"]}
      title={d?.item?.name || "الموازنة"}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && st === BudgetStatus.DRAFT && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/finance/budgets/$id/edit", params: { id } as any })}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب الموازنة</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={statusTone(d.item.status)}>{label("budgetStatus", d.item.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV label="السنة" value={String(d.item.year)} />
              <KV label="القسم" value={d.item.department || "—"} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="الحالة" value={label("budgetStatus", d.item.status)} />
            </div>
            {d.item.description ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                {d.item.description}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              مقارنة المخطط بالفعلي
            </div>
            <div className="space-y-2">
              {d.lines.length === 0 ? (
                <div className="text-xs text-muted-foreground">لا توجد سطور</div>
              ) : (
                d.lines.map((l: BudgetLine) => (
                  <div key={l.id} className="rounded-lg border p-2 bg-muted/30">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold">
                        {l.accountCode} - {l.accountName}
                      </span>
                      <span className="text-muted-foreground">{l.costCenterName || ""}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-info/10 p-1.5 text-center">
                        <div className="text-muted-foreground">المخطط</div>
                        <div className="font-bold tabular-nums">{fmtSAR(l.plannedAmount)}</div>
                      </div>
                      <div className="rounded bg-success/10 p-1.5 text-center">
                        <div className="text-success">الفعلي</div>
                        <div className="font-bold tabular-nums text-success">
                          {fmtSAR(l.actualAmount)}
                        </div>
                      </div>
                      <div
                        className={`rounded p-1.5 text-center ${
                          (l.variance || 0) < 0 ? "bg-destructive/10" : "bg-warning/10"
                        }`}
                      >
                        <div className="text-muted-foreground">الفرق</div>
                        <div className="font-bold tabular-nums">{fmtSAR(l.variance || 0)}</div>
                      </div>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${(l.utilization || 0) > 90 ? "bg-destructive" : (l.utilization || 0) > 70 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, l.utilization || 0)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 text-center">
                      {l.utilization || 0}% استخدام
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-3 bg-primary/10">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-muted-foreground">إجمالي المخطط</div>
                <div className="font-bold tabular-nums">{fmtSAR(d.totals.planned)}</div>
              </div>
              <div className="text-center">
                <div className="text-success">إجمالي الفعلي</div>
                <div className="font-bold tabular-nums text-success">{fmtSAR(d.totals.actual)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">الفرق</div>
                <div className="font-bold tabular-nums">{fmtSAR(d.totals.variance)}</div>
              </div>
            </div>
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === BudgetStatus.DRAFT && (
              <Btn
                variant="primary"
                onClick={() => actionMut.mutate("approve")}
                disabled={actionMut.isPending}
              >
                <CheckCircle size={14} /> اعتماد
              </Btn>
            )}
            {st === BudgetStatus.APPROVED && (
              <Btn
                variant="outline"
                onClick={() => actionMut.mutate("lock")}
                disabled={actionMut.isPending}
              >
                <Lock size={14} /> قفل
              </Btn>
            )}
            {st === BudgetStatus.LOCKED && (
              <Btn
                variant="outline"
                onClick={() => actionMut.mutate("unlock")}
                disabled={actionMut.isPending}
              >
                <Unlock size={14} /> فتح القفل
              </Btn>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
