import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { listCashboxes, listBankAccounts } from "@/lib/api/cash-bank";
import {
  getReceiptVoucher,
  createReceiptVoucher,
  updateReceiptVoucher,
} from "@/lib/api/receipt-vouchers";

type LineForm = { accountId: string; amount: string; description: string };

/** Shared full-page receipt-voucher (سند قبض) form for create and draft-edit. */
export function ReceiptVoucherForm({ voucherId }: { voucherId?: string }) {
  const isEdit = !!voucherId;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "finance.receipt.create");
  const canEdit = userCan(user, "finance.receipt.update_draft");
  const allowed = isEdit ? canEdit : canCreate;

  const cashQ = useQuery({
    queryKey: ["cashboxes", "active"],
    queryFn: () => listCashboxes(false),
  });
  const bankQ = useQuery({ queryKey: ["banks", "active"], queryFn: () => listBankAccounts(false) });
  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  const detailQ = useQuery({
    queryKey: ["receipt-voucher", voucherId, "edit"],
    queryFn: () => getReceiptVoucher(voucherId!),
    enabled: isEdit,
  });

  const [destKind, setDestKind] = useState<"cash" | "bank">("cash");
  const [f, setF] = useState<any>({
    voucherDate: new Date().toISOString().slice(0, 10),
    cashboxId: "",
    bankAccountId: "",
    payerName: "",
    externalReference: "",
    description: "",
  });
  const [lines, setLines] = useState<LineForm[]>([{ accountId: "", amount: "", description: "" }]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  if (isEdit && detailQ.data && !seeded) {
    setSeeded(true);
    const it = detailQ.data.item;
    setDestKind(it.bankAccountId ? "bank" : "cash");
    setF({
      voucherDate: it.voucherDate,
      cashboxId: it.cashboxId || "",
      bankAccountId: it.bankAccountId || "",
      payerName: it.payerName || "",
      externalReference: it.externalReference || "",
      description: it.description || "",
    });
    setLines(
      detailQ.data.lines.map((l) => ({
        accountId: l.accountId,
        amount: String(l.amount),
        description: l.description || "",
      })),
    );
  }

  const activeLinkedIds = useMemo(() => {
    const s = new Set<string>();
    (cashQ.data?.items || []).forEach((c: any) => s.add(c.linkedAccountId));
    (bankQ.data?.items || []).forEach((b: any) => s.add(b.linkedAccountId));
    return s;
  }, [cashQ.data, bankQ.data]);

  const creditAccounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.postable && a.status === "active" && !activeLinkedIds.has(a.id),
  );

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const destCurrency =
    destKind === "cash"
      ? (cashQ.data?.items || []).find((c: any) => c.id === f.cashboxId)?.currency || "SAR"
      : (bankQ.data?.items || []).find((b: any) => b.id === f.bankAccountId)?.currency || "SAR";

  const done = () => {
    if (isEdit) nav({ to: "/finance/receipt-vouchers/$id", params: { id: voucherId } as any });
    else nav({ to: "/finance/receipt-vouchers" });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        id: voucherId,
        voucherDate: f.voucherDate,
        cashboxId: destKind === "cash" ? f.cashboxId || null : null,
        bankAccountId: destKind === "bank" ? f.bankAccountId || null : null,
        payerName: f.payerName,
        externalReference: f.externalReference || null,
        description: f.description,
        currency: destCurrency,
        totalAmount: total,
        lines: lines
          .filter((l) => l.accountId && Number(l.amount) > 0)
          .map((l) => ({
            accountId: l.accountId,
            amount: Number(l.amount),
            description: l.description || undefined,
          })),
      };
      return isEdit ? updateReceiptVoucher(body) : createReceiptVoucher(body);
    },
    onSuccess: () => {
      showToast(isEdit ? "تم حفظ المسودة" : "تم إنشاء السند", "success");
      qc.invalidateQueries({ queryKey: ["receipt-vouchers"] });
      qc.invalidateQueries({ queryKey: ["receipt-voucher", voucherId] });
      done();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, { accountId: "", amount: "", description: "" }]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const dest = destKind === "cash" ? f.cashboxId : f.bankAccountId;
  const validLines = lines.filter((l) => l.accountId && Number(l.amount) > 0);
  const canSubmit = !!dest && !!f.payerName.trim() && validLines.length > 0 && !mut.isPending;
  const notDraft = isEdit && detailQ.data && detailQ.data.item.status !== "draft";

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "سندات القبض", isEdit ? "تعديل" : "جديد"]}
      title={isEdit ? "تعديل سند قبض" : "سند قبض جديد"}
      actions={
        <Btn variant="ghost" onClick={done}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      {!allowed ? (
        <EmptyState
          title="لا تملك صلاحية"
          description="تواصل مع مسؤول النظام لمنحك الصلاحية اللازمة"
        />
      ) : notDraft ? (
        <EmptyState
          title="لا يمكن تعديل سند غير مسودة"
          description="السندات المُرسلة/المعتمدة/المُرحّلة لا تُعدّل — افتح صفحة السند لعرضه أو عكسه."
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
            <Field label="تاريخ السند *">
              <input
                type="date"
                className="inp"
                value={f.voucherDate}
                onChange={(e) => set("voucherDate", e.target.value)}
              />
            </Field>

            <Field label="استلام في *">
              <div className="flex gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setDestKind("cash")}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${destKind === "cash" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                >
                  صندوق
                </button>
                <button
                  type="button"
                  onClick={() => setDestKind("bank")}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${destKind === "bank" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                >
                  حساب بنكي
                </button>
              </div>
              {destKind === "cash" ? (
                <select
                  className="inp"
                  value={f.cashboxId}
                  onChange={(e) => set("cashboxId", e.target.value)}
                >
                  <option value="">— اختر صندوقاً —</option>
                  {(cashQ.data?.items || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="inp"
                  value={f.bankAccountId}
                  onChange={(e) => set("bankAccountId", e.target.value)}
                >
                  <option value="">— اختر حساباً بنكياً —</option>
                  {(bankQ.data?.items || []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.bankName} · {b.ibanMasked || ""} ({b.currency})
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="استلمنا من (الدافع) *">
              <input
                className="inp"
                value={f.payerName}
                onChange={(e) => set("payerName", e.target.value)}
                placeholder="اسم الدافع"
              />
            </Field>
            <Field label="مرجع خارجي">
              <input
                className="inp"
                value={f.externalReference}
                onChange={(e) => set("externalReference", e.target.value)}
                placeholder="رقم شيك / حوالة / إيصال…"
              />
            </Field>
            <Field label="البيان">
              <textarea
                className="inp"
                rows={2}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">حسابات الطرف الدائن *</div>
              <Btn variant="ghost" onClick={addLine}>
                <Plus size={14} /> سطر
              </Btn>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <select
                    className="inp"
                    value={l.accountId}
                    onChange={(e) => setLine(i, "accountId", e.target.value)}
                  >
                    <option value="">— اختر حساباً دائناً —</option>
                    {creditAccounts.map((a: Account) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="المبلغ"
                      value={l.amount}
                      onChange={(e) => setLine(i, "amount", e.target.value)}
                    />
                    <input
                      className="inp"
                      placeholder="بيان السطر"
                      value={l.description}
                      onChange={(e) => setLine(i, "description", e.target.value)}
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="p-1.5 rounded hover:bg-muted text-destructive"
                        onClick={() => rmLine(i)}
                        title="حذف"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-xs font-semibold">الإجمالي (محسوب من السطور)</span>
              <span className="text-base font-extrabold tabular-nums">{fmtSAR(total)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              الترحيل: مدين = الحساب المرتبط بالصندوق/البنك، دائن = سطور السند. الرصيد يُحتسب من
              الأستاذ.
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">الإجمالي: </span>
              <span className="font-extrabold tabular-nums">{fmtSAR(total)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
                إلغاء
              </Btn>
              <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
                {mut.isPending ? "جارٍ الحفظ…" : isEdit ? "حفظ المسودة" : "إنشاء"}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
