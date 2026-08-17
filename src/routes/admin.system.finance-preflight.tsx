import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth, userCan } from "@/lib/api/auth";
import { fmtSAR } from "@/data/sample";
import { CheckCircle2, XCircle, ShieldAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { getPreflight, applyFinanceMigrations } from "@/lib/api/finance-preflight";

export const Route = createFileRoute("/admin/system/finance-preflight")({
  head: () => ({ meta: [{ title: "فحص الجاهزية المالية — ثواب" }] }),
  component: Page,
});

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-bold tabular-nums mt-0.5 ${ok === false ? "text-destructive" : ok ? "text-success" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function CheckCard({
  title,
  ok,
  children,
}: {
  title: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <Badge tone={ok ? "success" : "destructive"}>{ok ? "سليم" : "تحذير"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </Card>
  );
}

function Page() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);
  const isSuperAdmin = userCan(user, "*");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["finance-preflight"],
    queryFn: getPreflight,
    enabled: isSuperAdmin,
    retry: false,
  });

  const applyMut = useMutation({
    mutationFn: applyFinanceMigrations,
    onSuccess: (r) => {
      if (r.blocked) showToast("مرفوض — يوجد عوائق في الفحص", "error");
      else showToast(`تم تطبيق: ${r.applied.join(", ") || "لا جديد"}`, "success");
      queryClient.invalidateQueries({ queryKey: ["finance-preflight"] });
      setConfirmApply(false);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (!isSuperAdmin) {
    return (
      <AppShell title="فحص الجاهزية المالية" breadcrumb={["الإعدادات", "النظام"]}>
        <Card className="p-8 text-center">
          <ShieldAlert size={40} className="mx-auto text-destructive mb-3" />
          <div className="font-bold">هذه الأداة لمدير النظام الأعلى فقط</div>
          <div className="text-sm text-muted-foreground mt-1">
            صلاحية النظام الكاملة (super admin) مطلوبة.
          </div>
        </Card>
      </AppShell>
    );
  }

  const c = data?.checks;
  const pass = data?.overall === "PASS";

  return (
    <AppShell
      title="فحص الجاهزية المالية"
      breadcrumb={["الإعدادات", "النظام", "فحص الجاهزية المالية"]}
      actions={
        <Btn variant="outline" onClick={() => refetch()}>
          إعادة الفحص
        </Btn>
      }
    >
      <div className="max-w-5xl space-y-4">
        <div className="rounded-xl border bg-info/5 p-3 text-xs text-muted-foreground">
          بيئة الإنتاج · فحص للقراءة فقط (READ-ONLY) — لا يعدّل أي بيانات محاسبية.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-destructive">{(error as Error).message}</Card>
        ) : data ? (
          <>
            <Card className={`p-5 border-2 ${pass ? "border-success" : "border-destructive"}`}>
              <div className="flex items-center gap-3">
                {pass ? (
                  <CheckCircle2 size={32} className="text-success" />
                ) : (
                  <XCircle size={32} className="text-destructive" />
                )}
                <div>
                  <div className="text-lg font-extrabold">
                    {pass ? "PASS — جاهز للترحيلات" : "FAIL — يوجد عوائق"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    الوضع: {data.mode} · جاهزية الترحيل: {data.migrationReady ? "نعم" : "لا"}
                  </div>
                </div>
              </div>
              {data.blockingIssues?.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {data.blockingIssues.map((b: any, i: number) => (
                    <li key={i} className="text-destructive">
                      <b>{b.severity}</b> — {b.message}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              <CheckCard title="دفتر الأستاذ (GL)" ok={c.generalLedger.balanced}>
                <Stat label="مدين" value={fmtSAR(c.generalLedger.total_debit)} />
                <Stat label="دائن" value={fmtSAR(c.generalLedger.total_credit)} />
                <Stat
                  label="الفرق"
                  value={fmtSAR(c.generalLedger.difference)}
                  ok={c.generalLedger.balanced}
                />
                <Stat
                  label="متوازن"
                  value={c.generalLedger.balanced ? "نعم" : "لا"}
                  ok={c.generalLedger.balanced}
                />
              </CheckCard>

              <CheckCard title="ميزان المراجعة" ok={c.trialBalance.balanced}>
                <Stat label="عدد الحسابات" value={String(c.trialBalance.account_count)} />
                <Stat
                  label="الفرق"
                  value={fmtSAR(c.trialBalance.difference)}
                  ok={c.trialBalance.balanced}
                />
                <Stat label="مدين" value={fmtSAR(c.trialBalance.total_debit)} />
                <Stat label="دائن" value={fmtSAR(c.trialBalance.total_credit)} />
              </CheckCard>

              <CheckCard title="المركز المالي" ok={c.financialPosition.balanced}>
                <Stat label="الأصول" value={fmtSAR(c.financialPosition.assets)} />
                <Stat label="الالتزامات" value={fmtSAR(c.financialPosition.liabilities)} />
                <Stat
                  label="صافي الأصول + الفائض"
                  value={fmtSAR(
                    c.financialPosition.net_assets_equity +
                      c.financialPosition.current_surplus_deficit,
                  )}
                />
                <Stat
                  label="فرق المعادلة"
                  value={fmtSAR(c.financialPosition.equation_difference)}
                  ok={c.financialPosition.balanced}
                />
              </CheckCard>

              <CheckCard title="الإيرادات والمصروفات" ok={true}>
                <Stat label="الإيرادات" value={fmtSAR(c.incomeExpense.revenue)} />
                <Stat label="المصروفات" value={fmtSAR(c.incomeExpense.expenses)} />
                <Stat label="الفائض/العجز" value={fmtSAR(c.incomeExpense.surplus_deficit)} />
                <Stat label="—" value="" />
              </CheckCard>

              <CheckCard
                title="الفترات المالية"
                ok={
                  c.fiscalPeriods.invalid_range_count === 0 && c.fiscalPeriods.overlap_count === 0
                }
              >
                <Stat
                  label="نطاقات غير صالحة"
                  value={String(c.fiscalPeriods.invalid_range_count)}
                  ok={c.fiscalPeriods.invalid_range_count === 0}
                />
                <Stat
                  label="تداخلات"
                  value={String(c.fiscalPeriods.overlap_count)}
                  ok={c.fiscalPeriods.overlap_count === 0}
                />
                <Stat label="فجوات" value={String(c.fiscalPeriods.gaps.length)} />
                <Stat label="عدد الفترات" value={String(c.fiscalPeriods.periods.length)} />
              </CheckCard>

              <CheckCard title="تفرّد مصادر القيود" ok={c.duplicates.count === 0}>
                <Stat
                  label="مجموعات مكرّرة"
                  value={String(c.duplicates.count)}
                  ok={c.duplicates.count === 0}
                />
                <Stat label="—" value="" />
                <Stat label="—" value="" />
                <Stat label="—" value="" />
              </CheckCard>

              <CheckCard
                title="الأرصدة القديمة (accounts.balance)"
                ok={c.legacyInconsistencies === 0}
              >
                <Stat label="إجمالي الحسابات" value={String(c.legacyBalances.total_accounts)} />
                <Stat label="غير صفرية" value={String(c.legacyBalances.nonzero_legacy_balance)} />
                <Stat
                  label="تعارضات مع GL"
                  value={String(c.legacyInconsistencies)}
                  ok={c.legacyInconsistencies === 0}
                />
                <Stat label="—" value="" />
              </CheckCard>

              <CheckCard
                title="سلامة العكس"
                ok={!c.reversal.available || c.reversal.combined_net_effect === 0}
              >
                {c.reversal.available ? (
                  <>
                    <Stat label="القيد الأصلي" value={c.reversal.original_journal_number} />
                    <Stat label="قيد العكس" value={c.reversal.reversal_journal_number || "—"} />
                    <Stat
                      label="الأثر الصافي"
                      value={fmtSAR(c.reversal.combined_net_effect)}
                      ok={c.reversal.combined_net_effect === 0}
                    />
                    <Stat label="—" value="" />
                  </>
                ) : (
                  <div className="col-span-2 text-xs text-muted-foreground">
                    لا يوجد قيد معكوس في الإنتاج للتحقق (لا يمنع الاعتماد).
                  </div>
                )}
              </CheckCard>

              <CheckCard
                title="جاهزية الترحيلات (0011–0013)"
                ok={Object.values(c.migrationObjects).every(Boolean)}
              >
                {Object.entries(c.migrationObjects).map(([k, v]) => (
                  <Stat key={k} label={k} value={v ? "موجود" : "غير موجود"} ok={Boolean(v)} />
                ))}
              </CheckCard>
            </div>

            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-bold">تطبيق ترحيلات النزاهة المالية (0011–0013)</div>
                  <div className="text-xs text-muted-foreground">
                    يُعيد الفحص قبل التطبيق ويرفض إن وُجدت عوائق. لا يغيّر أي تاريخ محاسبي.
                  </div>
                </div>
                <Btn
                  variant="primary"
                  disabled={!data.migrationReady || applyMut.isPending}
                  onClick={() => setConfirmApply(true)}
                >
                  {applyMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                  تطبيق الترحيلات
                </Btn>
              </div>
              {applyMut.data && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                  <div>المطبّقة: {applyMut.data.applied?.join("، ") || "لا جديد"}</div>
                  <div>
                    بصمة التاريخ المحاسبي متطابقة قبل/بعد:{" "}
                    <b>{applyMut.data.historyIntegrity?.fingerprintMatch ? "نعم ✓" : "لا ✗"}</b>
                  </div>
                  <div>
                    كائنات قاعدة البيانات:{" "}
                    {Object.values(applyMut.data.migrationObjects || {}).every(Boolean)
                      ? "كلها موجودة ✓"
                      : "ناقصة ✗"}
                  </div>
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmApply}
        onClose={() => setConfirmApply(false)}
        onConfirm={() => applyMut.mutate()}
        title="تطبيق ترحيلات النزاهة المالية"
        message="سيُعاد الفحص أولاً؛ إن لم توجد عوائق ستُطبَّق الترحيلات 0011–0013. لا يُعدَّل أي قيد محاسبي. متابعة؟"
        confirmText="تطبيق"
        cancelText="إلغاء"
        variant="default"
      />
    </AppShell>
  );
}
