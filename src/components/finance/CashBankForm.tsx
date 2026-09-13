import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import {
  getCashbox,
  getBankAccount,
  createCashbox,
  updateCashbox,
  createBankAccount,
  updateBankAccount,
} from "@/lib/api/cash-bank";
import { maskIban } from "@/lib/iban";

type Kind = "cash" | "bank";

/** Shared full-page form for cash boxes and bank accounts (create + edit). */
export function CashBankForm({ kind, id }: { kind: Kind; id?: string }) {
  const isBank = kind === "bank";
  const isEdit = !!id;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const permBase = isBank ? "finance.bank" : "finance.cash";
  const allowed = userCan(user, isEdit ? `${permBase}.update` : `${permBase}.create`);

  const acctQ = useQuery({ queryKey: ["accounts-for-mapping"], queryFn: () => getAccounts({}) });
  const accounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.classification === "asset" && a.postable && a.status === "active",
  );

  const detailQ = useQuery({
    queryKey: [kind, id, "edit"],
    queryFn: () => (isBank ? getBankAccount(id!, {}) : getCashbox(id!)),
    enabled: isEdit,
  });

  const [f, setF] = useState<any>({
    code: "",
    name: "",
    bankName: "",
    accountName: "",
    iban: "",
    linkedAccountId: "",
    currency: "SAR",
    notes: "",
  });
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  if (isEdit && detailQ.data && !seeded) {
    setSeeded(true);
    const it: any = detailQ.data.item;
    setF({
      code: it.code || "",
      name: it.name || "",
      bankName: it.bankName || "",
      accountName: it.accountName || "",
      iban: "",
      linkedAccountId: it.linkedAccountId || "",
      currency: it.currency || "SAR",
      notes: it.notes || "",
    });
  }

  const done = () => {
    if (isEdit)
      nav({ to: "/finance/cash-bank/$id", params: { id } as any, search: { kind } as any });
    else nav({ to: "/finance/cash-bank" });
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (isBank) {
        const body: any = {
          id,
          code: f.code,
          bankName: f.bankName,
          accountName: f.accountName,
          iban: f.iban || undefined,
          linkedAccountId: f.linkedAccountId,
          currency: f.currency,
          notes: f.notes,
        };
        return isEdit ? updateBankAccount(body) : createBankAccount(body);
      }
      const body: any = {
        id,
        code: f.code,
        name: f.name,
        linkedAccountId: f.linkedAccountId,
        currency: f.currency,
        notes: f.notes,
      };
      return isEdit ? updateCashbox(body) : createCashbox(body);
    },
    onSuccess: () => {
      showToast(isEdit ? "تم الحفظ" : "تم الإنشاء", "success");
      qc.invalidateQueries({ queryKey: ["cashboxes"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      done();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const canSubmit =
    !!f.code.trim() &&
    !!f.linkedAccountId &&
    (isBank ? !!f.bankName.trim() : !!f.name.trim()) &&
    !mut.isPending;

  const title = `${isEdit ? "تعديل" : "إضافة"} ${isBank ? "حساب بنكي" : "صندوق"}`;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "النقد والبنوك", isEdit ? "تعديل" : "جديد"]}
      title={title}
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
      ) : (
        <div className="mx-auto max-w-2xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
            <Field label="الرمز *">
              <input className="inp" value={f.code} onChange={(e) => set("code", e.target.value)} />
            </Field>
            {isBank ? (
              <>
                <Field label="اسم البنك *">
                  <input
                    className="inp"
                    value={f.bankName}
                    onChange={(e) => set("bankName", e.target.value)}
                  />
                </Field>
                <Field label="اسم الحساب">
                  <input
                    className="inp"
                    value={f.accountName}
                    onChange={(e) => set("accountName", e.target.value)}
                  />
                </Field>
                <Field
                  label={isEdit ? "الآيبان (اتركه فارغاً للإبقاء على الحالي)" : "الآيبان (IBAN)"}
                >
                  <input
                    className="inp font-mono"
                    value={f.iban}
                    onChange={(e) => set("iban", e.target.value)}
                    placeholder="SA.."
                  />
                  {f.iban ? (
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                      {maskIban(f.iban)}
                    </div>
                  ) : null}
                </Field>
              </>
            ) : (
              <Field label="الاسم *">
                <input
                  className="inp"
                  value={f.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
            )}
            <Field label="الحساب المحاسبي المرتبط * (أصول قابل للترحيل)">
              <select
                className="inp"
                value={f.linkedAccountId}
                onChange={(e) => set("linkedAccountId", e.target.value)}
                disabled={isEdit}
              >
                <option value="">— اختر حساباً —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              {isEdit ? (
                <div className="text-[10px] text-warning-foreground mt-1">
                  لا يمكن تغيير الحساب المرتبط بعد وجود حركة مُرحّلة. للتصحيح: عطّل الكيان وأنشئ
                  آخر.
                </div>
              ) : null}
            </Field>
            <Field label="العملة">
              <input
                className="inp"
                value={f.currency}
                onChange={(e) => set("currency", e.target.value)}
              />
            </Field>
            <Field label="ملاحظات">
              <textarea
                className="inp"
                rows={2}
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="p-3 flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
              إلغاء
            </Btn>
            <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
              {mut.isPending ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إنشاء"}
            </Btn>
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
