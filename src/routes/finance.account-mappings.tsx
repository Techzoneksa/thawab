import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { getAccountMappings, setInputVatAccount } from "@/lib/api/account-mappings";

export const Route = createFileRoute("/finance/account-mappings")({
  head: () => ({ meta: [{ title: "ربط الحسابات النظامية — ثواب" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = userCan(user, "finance.account_mapping.update");
  const canView = userCan(user, "finance.accounts.view");

  const mapQ = useQuery({ queryKey: ["account-mappings"], queryFn: getAccountMappings });
  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  const [accountId, setAccountId] = useState("");

  const mut = useMutation({
    mutationFn: () => setInputVatAccount(accountId),
    onSuccess: () => {
      showToast("تم تعيين حساب ضريبة المدخلات", "success");
      setAccountId("");
      qc.invalidateQueries({ queryKey: ["account-mappings"] });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (!canView) {
    return (
      <AppShell
        breadcrumb={["الرئيسية", "المالية", "ربط الحسابات النظامية"]}
        title="ربط الحسابات النظامية"
      >
        <EmptyState title="غير مصرّح" description="لا تملك صلاحية عرض هذه الصفحة" />
      </AppShell>
    );
  }

  const pf = mapQ.data?.inputVat.preflight;
  const configured = pf?.configured || null;

  // Candidate accounts for Input VAT: active, postable (non-parent), asset.
  const candidates = (acctQ.data?.items || []).filter(
    (a: Account) => a.postable && a.status === "active" && a.classification === "asset",
  );

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "ربط الحسابات النظامية"]}
      title="ربط الحسابات النظامية"
    >
      <div className="max-w-3xl space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold">حساب ضريبة القيمة المضافة — المدخلات (Input VAT)</div>
            {configured ? (
              <Badge tone="success">مُهيّأ</Badge>
            ) : (
              <Badge tone="warning">غير مُهيّأ</Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            عند ترحيل فاتورة مورد خاضعة للضريبة، يُقيَّد مبلغ الضريبة على هذا الحساب (طرف مدين). لا
            يختار النظام الحساب تلقائياً — يجب أن يحدده مسؤول مالي صراحةً. الفواتير غير الخاضعة
            للضريبة لا تتطلب هذا الربط.
          </p>

          {configured ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm mb-3">
              <div className="font-mono font-semibold">
                {configured.code} — {configured.name}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                التصنيف: {configured.classification} · {configured.active ? "نشط" : "غير نشط"} ·{" "}
                {configured.postable ? "قابل للترحيل" : "غير قابل للترحيل"}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs mb-3">
              لا يوجد حساب ضريبة مدخلات مُهيّأ. لن يمكن ترحيل فواتير الموردين الخاضعة للضريبة حتى
              يتم تعيين الحساب.
            </div>
          )}

          {canEdit ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1 block">
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  {configured ? "تغيير الحساب المرتبط" : "تعيين الحساب"} (أصل قابل للترحيل)
                </div>
                <select
                  className="inp"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">— اختر حساب أصل —</option>
                  {candidates.map((a: Account) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <Btn
                variant="primary"
                disabled={!accountId || mut.isPending}
                onClick={() => mut.mutate()}
              >
                حفظ الربط
              </Btn>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              تعديل الربط يتطلب صلاحية «تهيئة ربط الحسابات النظامية».
            </div>
          )}
        </Card>

        {pf ? (
          <Card className="p-4">
            <div className="text-xs font-bold mb-2">تشخيص الربط (قراءة فقط)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Diag
                label="عدد مرات الربط (يجب ≤ 1)"
                value={pf.duplicateMappingCount}
                warn={pf.duplicateMappingCount > 1}
              />
              <Diag label="فواتير خاضعة للضريبة" value={pf.taxableInvoiceCount} />
              <Diag label="فواتير خاضعة مُرحَّلة" value={pf.postedTaxableInvoiceCount} />
              <Diag
                label="فواتير خاضعة معلّقة بسبب غياب الربط"
                value={pf.taxableInvoicesBlockedByMissingMapping}
                warn={pf.taxableInvoicesBlockedByMissingMapping > 0}
              />
              <Diag label="الحساب 110306 موجود؟" value={pf.code110306Exists ? "نعم" : "لا"} />
              <Diag label="مفتاح النظام على 110306" value={pf.code110306SystemKey || "—"} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              التشخيص لا يربط أي حساب تلقائياً ولا يستنتج الربط من الاسم أو الرقم.
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

function Diag({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${warn ? "border-warning/50 bg-warning/5" : "bg-muted/20"}`}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{String(value)}</div>
    </div>
  );
}
