import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil, BookOpen } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getCashbox, getBankAccount, getCashboxLedger, getBankLedger } from "@/lib/api/cash-bank";
import type { DocumentDefinition } from "@/lib/documents/types";

type Kind = "cash" | "bank";
const parseKind = (s: Record<string, unknown>): { kind: Kind } => ({
  kind: s.kind === "bank" ? "bank" : "cash",
});

export const Route = createFileRoute("/finance/cash-bank_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل النقد/البنك — ثواب" }] }),
  validateSearch: parseKind,
  component: CashBankDetailPage,
});

function CashBankDetailPage() {
  const { id } = useParams({ from: "/finance/cash-bank_/$id" });
  const { kind } = Route.useSearch();
  const isBank = kind === "bank";
  const nav = useNavigate();
  const { user } = useAuth();
  const [asOf, setAsOf] = useState("");
  const canUpdate = userCan(user, isBank ? "finance.bank.update" : "finance.cash.update");

  const q = useQuery({
    queryKey: [kind, id, asOf],
    queryFn: () =>
      isBank ? getBankAccount(id, { asOf: asOf || undefined }) : getCashbox(id, asOf || undefined),
  });
  const ledgerQ = useQuery({
    queryKey: [kind, id, "ledger"],
    queryFn: () => (isBank ? getBankLedger(id) : getCashboxLedger(id)),
    retry: false,
  });
  const d = q.data;
  const back = () => nav({ to: "/finance/cash-bank" });
  const entityName = d ? (isBank ? d.item.bankName : d.item.name) : "";

  const buildDoc = (): DocumentDefinition => ({
    title: isBank ? "كشف حركة حساب بنكي" : "كشف حركة صندوق",
    subtitle: `${d!.item.code} — ${entityName}`,
    date: new Date().toISOString().slice(0, 10),
    orientation: "landscape",
    meta: [
      { label: "العملة", value: d!.item.currency },
      { label: "الرصيد الختامي", value: fmtSAR(d!.balance.closingBalance) },
    ],
    columns: [
      { key: "date", label: "التاريخ", type: "date" },
      { key: "number", label: "القيد" },
      { key: "source", label: "المصدر" },
      { key: "debit", label: "مدين", type: "money" },
      { key: "credit", label: "دائن", type: "money" },
      { key: "balance", label: "الرصيد", type: "money" },
    ],
    rows: (ledgerQ.data?.movements || []).map((m: any) => ({
      date: m.date,
      number: m.number,
      source: m.source,
      debit: m.debit || 0,
      credit: m.credit || 0,
      balance: m.runningBalance,
    })),
    totals: [
      { label: "الرصيد الختامي", value: d!.balance.closingBalance, type: "money", strong: true },
    ],
    signature: true,
    fileBase: `${isBank ? "bank" : "cash"}-statement-${d!.item.code}`,
  });

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: entityName, url });
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

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "النقد والبنوك", d?.item?.code || "تفاصيل"]}
      title={entityName || (isBank ? "حساب بنكي" : "صندوق")}
      actions={
        <>
          {d && ledgerQ.data && <DocumentActions document={buildDoc} />}
          {d && canUpdate && (
            <Btn
              variant="ghost"
              onClick={() =>
                nav({
                  to: "/finance/cash-bank/$id/edit",
                  params: { id } as any,
                  search: { kind } as any,
                })
              }
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
        <div className="p-8 text-center text-destructive">تعذّر جلب البيانات</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">
                {d.item.code} — {entityName}
              </div>
              <Badge tone={d.item.status === "active" ? "success" : "muted"}>
                {d.item.status === "active" ? "نشط" : "معطّل"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="العملة" value={d.item.currency} />
              <KV
                label="الحساب المرتبط"
                value={
                  d.linkedAccount
                    ? `${d.linkedAccount.code} — ${d.linkedAccount.name}`
                    : d.item.linkedAccountId
                }
              />
              {isBank ? <KV label="الآيبان" value={d.item.ibanMasked || "—"} /> : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">الرصيد من دفتر الأستاذ</div>
              <input
                type="date"
                className="inp !w-auto !py-1 text-xs"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                title="الرصيد كما في تاريخ"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV label="رصيد أول المدة" value={fmtSAR(d.balance.openingBalance)} />
              <KV label="مدين الفترة" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="دائن الفترة" value={fmtSAR(d.balance.periodCredit)} />
              <KV
                label={asOf ? `الرصيد كما في ${asOf}` : "الرصيد الختامي"}
                value={fmtSAR(d.balance.closingBalance)}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              كل الأرصدة محسوبة من القيود المُرحّلة/المعكوسة في الأستاذ العام — لا رصيد مخزّن.
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">الحركة من دفتر الأستاذ</div>
              <Btn
                variant="ghost"
                onClick={() =>
                  nav({
                    to: "/finance/ledger",
                    search: { accountId: d.item.linkedAccountId } as any,
                  })
                }
                title="فتح دفتر الأستاذ الكامل"
              >
                <BookOpen size={14} /> الأستاذ الكامل
              </Btn>
            </div>
            {ledgerQ.isLoading ? (
              <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
            ) : ledgerQ.error ? (
              <div className="text-xs text-destructive">
                {(ledgerQ.error as Error).message || "لا تملك صلاحية عرض الحركة"}
              </div>
            ) : (ledgerQ.data?.movements.length ?? 0) === 0 ? (
              <EmptyState title="لا توجد حركات" description="لا توجد حركات مُرحّلة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-muted-foreground text-right">
                    <tr>
                      <th className="py-1 pe-2">التاريخ</th>
                      <th className="py-1 pe-2">القيد</th>
                      <th className="py-1 pe-2">المصدر</th>
                      <th className="py-1 pe-2 text-left">مدين</th>
                      <th className="py-1 pe-2 text-left">دائن</th>
                      <th className="py-1 pe-2 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQ.data!.movements.map((m: any) => (
                      <tr key={m.lineId} className="border-t">
                        <td className="py-1 pe-2 tabular-nums">{m.date}</td>
                        <td className="py-1 pe-2 font-mono">{m.number}</td>
                        <td className="py-1 pe-2">{m.source}</td>
                        <td className="py-1 pe-2 text-left tabular-nums">
                          {m.debit ? fmtSAR(m.debit) : "—"}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums">
                          {m.credit ? fmtSAR(m.credit) : "—"}
                        </td>
                        <td className="py-1 pe-2 text-left tabular-nums font-semibold">
                          {fmtSAR(m.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
