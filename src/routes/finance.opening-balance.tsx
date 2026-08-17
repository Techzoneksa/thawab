import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Trash2, CheckCircle2, Loader2 } from "lucide-react";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { getOpeningBalances, postOpeningBalance } from "@/lib/api/opening-balance";

export const Route = createFileRoute("/finance/opening-balance")({
  head: () => ({ meta: [{ title: "الأرصدة الافتتاحية — ثواب" }] }),
  component: Page,
});

interface Row {
  id: number;
  accountId: string;
  debit: string;
  credit: string;
}

let _rid = 1;
const blank = (): Row => ({ id: _rid++, accountId: "", debit: "", credit: "" });

function Page() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(`${today.slice(0, 4)}-01-01`);
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);

  const { data: accData } = useQuery({
    queryKey: ["accounts", "postable"],
    queryFn: () => getAccounts({}),
  });
  const accounts: Account[] = useMemo(
    () => (accData?.items ?? []).filter((a) => a.postable && a.status === "active"),
    [accData],
  );

  const { data: existing } = useQuery({
    queryKey: ["opening-balances"],
    queryFn: getOpeningBalances,
  });

  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 0.005 && totalDebit > 0;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const mutation = useMutation({
    mutationFn: () =>
      postOpeningBalance({
        date,
        lines: rows
          .filter((r) => r.accountId && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0))
          .map((r) => ({
            accountId: r.accountId,
            debit: parseFloat(r.debit) || 0,
            credit: parseFloat(r.credit) || 0,
          })),
      }),
    onSuccess: () => {
      showToast("تم ترحيل الأرصدة الافتتاحية إلى دفتر الأستاذ", "success");
      setRows([blank(), blank()]);
      queryClient.invalidateQueries({ queryKey: ["opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell breadcrumb={["الرئيسية", "المالية", "الأرصدة الافتتاحية"]} title="الأرصدة الافتتاحية">
      <div className="max-w-4xl space-y-4">
        <div className="rounded-xl border bg-info/5 p-3 text-xs text-muted-foreground leading-6">
          الأرصدة الافتتاحية تُرحَّل كـ
          <strong className="text-foreground"> قيد محاسبي متوازن</strong> في دفتر الأستاذ (وميزان
          المراجعة والقوائم المالية) — وليست رقماً مخزّناً على الحساب. يُسمح بترحيل رصيد افتتاحي
          واحد لكل سنة مالية، ويجب أن تكون الفترة مفتوحة والقيد متوازناً.
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">تاريخ الافتتاح</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
                className="rounded-lg border bg-background px-3 py-2 text-sm min-h-[40px]"
              />
            </div>
            <Badge tone={balanced ? "success" : "warning"}>
              {balanced ? "متوازن" : `فرق: ${fmtSAR(diff)}`}
            </Badge>
          </div>

          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">الحساب</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-36">مدين</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-36">دائن</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <select
                          value={r.accountId}
                          onChange={(e) => update(r.id, { accountId: e.target.value })}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                        >
                          <option value="">— اختر حساباً —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={r.debit}
                          onChange={(e) => update(r.id, { debit: e.target.value, credit: "" })}
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={r.credit}
                          onChange={(e) => update(r.id, { credit: e.target.value, debit: "" })}
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="حذف السطر"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-bold tabular-nums">
                    <td className="px-3 py-2">الإجمالي</td>
                    <td className="px-3 py-2 font-mono">{fmtSAR(totalDebit)}</td>
                    <td className="px-3 py-2 font-mono">{fmtSAR(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <Btn variant="ghost" onClick={() => setRows((p) => [...p, blank()])}>
              <Plus size={15} /> إضافة سطر
            </Btn>
            <Btn
              variant="primary"
              onClick={() => mutation.mutate()}
              disabled={!balanced || mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              ترحيل الأرصدة الافتتاحية
            </Btn>
          </div>
        </Card>

        {(existing?.items?.length ?? 0) > 0 && (
          <Card className="p-4">
            <div className="text-sm font-bold mb-2">الأرصدة الافتتاحية المُرحّلة</div>
            <div className="space-y-1">
              {existing!.items.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-sm border-b py-1.5 last:border-0"
                >
                  <span>
                    {e.number} · {e.date?.slice(0, 10)}
                  </span>
                  <span className="font-bold tabular-nums">{fmtSAR(e.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
