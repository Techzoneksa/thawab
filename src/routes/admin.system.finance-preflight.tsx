import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { useAuth, userCan } from "@/lib/api/auth";
import { fmtSAR } from "@/data/sample";
import { CheckCircle2, XCircle, ShieldAlert, Loader2, Clock, Copy } from "lucide-react";
import { useState } from "react";
import { getPreflight, applyFinanceMigrations, certifyPhase1A } from "@/lib/api/finance-preflight";

export const Route = createFileRoute("/admin/system/finance-preflight")({
  head: () => ({ meta: [{ title: "اعتماد الجاهزية المالية — ثواب" }] }),
  component: Page,
});

type CertStatus =
  "PRODUCTION_BLOCKED" | "PENDING_MIGRATIONS" | "READY_TO_CERTIFY" | "PRODUCTION_READY";

const STATUS_META: Record<
  CertStatus,
  { label: string; tone: "success" | "warning" | "destructive"; border: string }
> = {
  PRODUCTION_READY: {
    label: "✅ المرحلة 1أ — جاهز للإنتاج (PRODUCTION READY)",
    tone: "success",
    border: "border-success",
  },
  READY_TO_CERTIFY: {
    label: "🟦 جاهز للاعتماد (READY TO CERTIFY)",
    tone: "success",
    border: "border-info",
  },
  PENDING_MIGRATIONS: {
    label: "⏳ بانتظار تطبيق الترحيلات (PENDING MIGRATIONS)",
    tone: "warning",
    border: "border-warning",
  },
  PRODUCTION_BLOCKED: {
    label: "❌ محجوب — يوجد عوائق نزاهة (PRODUCTION BLOCKED)",
    tone: "destructive",
    border: "border-destructive",
  },
};

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

/** Build a plain-text certificate for copying (no PII/secrets — metrics only). */
function buildCertText(data: any): string {
  const s = data.snapshot;
  const cert = data.certification;
  const L: string[] = [];
  L.push("========================================");
  L.push("THAWAB — FINANCE PHASE 1A CERTIFICATION");
  L.push("========================================");
  L.push(`Status:            ${data.status}`);
  L.push(`Environment:       ${data.environment ?? "production"}`);
  L.push(`Application commit: ${data.applicationCommit ?? "unknown"}`);
  if (cert) {
    L.push(`Certificate ID:    ${cert.id}`);
    L.push(`Certified by:      ${cert.certifiedByName ?? cert.certifiedBy ?? "-"}`);
    L.push(`Certified at:      ${cert.certifiedAt ?? "-"}`);
  } else {
    L.push("Certificate ID:    (no certificate for this deployed commit)");
  }
  L.push("");
  L.push("-- Accounting integrity --------------------");
  L.push(
    `General Ledger:    ${s.generalLedger.balanced ? "BALANCED" : "UNBALANCED"} (diff ${s.generalLedger.difference})`,
  );
  L.push(
    `Trial Balance:     ${s.trialBalance.balanced ? "BALANCED" : "UNBALANCED"} (diff ${s.trialBalance.difference}, ${s.trialBalance.account_count} accounts)`,
  );
  L.push(
    `Financial Position:${s.financialPosition.balanced ? " BALANCED" : " UNRECONCILED"} (diff ${s.financialPosition.equation_difference})`,
  );
  L.push(
    `Performance:       revenue ${s.financialPerformance.revenue}, expenses ${s.financialPerformance.expenses}, surplus ${s.financialPerformance.surplus_deficit}`,
  );
  L.push(
    `Fiscal integrity:  invalid_ranges ${s.fiscalIntegrity.invalid_ranges}, overlaps ${s.fiscalIntegrity.overlaps}, gaps ${s.fiscalIntegrity.critical_gaps}`,
  );
  L.push(`Source integrity:  duplicates ${s.sourceIntegrity.duplicate_protected_sources}`);
  L.push(
    `Reversal integrity:${s.reversalIntegrity.available ? ` net ${s.reversalIntegrity.net_effect} (${s.reversalIntegrity.valid ? "VALID" : "INVALID"})` : " N/A (none in production)"}`,
  );
  L.push(`Source of truth:   ${s.legacyBalance.accounting_source_of_truth}`);
  L.push(
    `Legacy balances:   ${s.legacyBalance.legacy_nonzero_accounts} non-zero, ${s.legacyBalance.legacy_inconsistencies} inconsistencies (review-only)`,
  );
  L.push("");
  L.push("-- Migration integrity ---------------------");
  L.push(`0011 import/source-unique: ${s.migrationIntegrity["0011"] ? "PRESENT" : "MISSING"}`);
  L.push(`0012 period valid-range:   ${s.migrationIntegrity["0012"] ? "PRESENT" : "MISSING"}`);
  L.push(`0013 period overlap-guard: ${s.migrationIntegrity["0013"] ? "PRESENT" : "MISSING"}`);
  L.push(`0014 certification store:  ${s.migrationIntegrity["0014"] ? "PRESENT" : "MISSING"}`);
  L.push(
    `All required objects:      ${s.migrationIntegrity.required_objects_present ? "PRESENT" : "MISSING"}`,
  );
  L.push("");
  L.push("-- History integrity (immutability) --------");
  L.push(
    `Fingerprint match:  ${s.historyIntegrity.fingerprint_match ? "YES" : "NO"} (${s.historyIntegrity.fingerprint_before} -> ${s.historyIntegrity.fingerprint_after})`,
  );
  L.push(
    `Journal entries:    ${s.historyIntegrity.journal_entries_before} -> ${s.historyIntegrity.journal_entries_after} (${s.historyIntegrity.journal_entries_match ? "unchanged" : "CHANGED"})`,
  );
  L.push(
    `Journal lines:      ${s.historyIntegrity.journal_lines_before} -> ${s.historyIntegrity.journal_lines_after} (${s.historyIntegrity.journal_lines_match ? "unchanged" : "CHANGED"})`,
  );
  L.push("========================================");
  return L.join("\n");
}

function Page() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmCertify, setConfirmCertify] = useState(false);
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
      else if (r.migration === "MIGRATION_SUCCESS")
        showToast(`تم تطبيق الترحيلات: ${r.applied?.join("، ") || "لا جديد"}`, "success");
      else showToast("لم تكتمل الترحيلات — راجع النتيجة", "error");
      queryClient.invalidateQueries({ queryKey: ["finance-preflight"] });
      setConfirmApply(false);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const certifyMut = useMutation({
    mutationFn: certifyPhase1A,
    onSuccess: (r) => {
      if (r.certified)
        showToast(
          r.idempotent ? "الشهادة موجودة مسبقاً لهذه النسخة" : "تم إصدار شهادة الاعتماد",
          "success",
        );
      else showToast(`غير مؤهّل للاعتماد: ${r.reasons?.join("، ") || r.status}`, "error");
      queryClient.invalidateQueries({ queryKey: ["finance-preflight"] });
      setConfirmCertify(false);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (!isSuperAdmin) {
    return (
      <AppShell title="اعتماد الجاهزية المالية" breadcrumb={["الإعدادات", "النظام"]}>
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
  const status: CertStatus | undefined = data?.status;
  const meta = status ? STATUS_META[status] : null;
  const cert = data?.certification;

  const copyCert = async () => {
    try {
      await navigator.clipboard.writeText(buildCertText(data));
      showToast("تم نسخ شهادة الاعتماد", "success");
    } catch {
      showToast("تعذّر النسخ", "error");
    }
  };

  return (
    <AppShell
      title="اعتماد الجاهزية المالية"
      breadcrumb={["الإعدادات", "النظام", "اعتماد الجاهزية المالية"]}
      actions={
        <Btn variant="outline" onClick={() => refetch()}>
          إعادة الفحص
        </Btn>
      }
    >
      <div className="max-w-5xl space-y-4">
        <div className="rounded-xl border bg-info/5 p-3 text-xs text-muted-foreground">
          بيئة الإنتاج · يُنفَّذ فحص تشخيصي للقراءة فقط (GET) تلقائياً عند فتح الصفحة — لا يعدّل أي
          بيانات محاسبية ولا يُصدر شهادة. تطبيق الترحيلات وإصدار الشهادة إجراءان صريحان بضغطة من
          مدير النظام.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin" />
          </div>
        ) : error ? (
          <Card className="p-6 text-center text-destructive">{(error as Error).message}</Card>
        ) : data && meta && c ? (
          <>
            {/* Certification panel */}
            <Card className={`p-5 border-2 ${meta.border}`}>
              <div className="flex items-start gap-3">
                {status === "PRODUCTION_READY" || status === "READY_TO_CERTIFY" ? (
                  <CheckCircle2 size={32} className="text-success shrink-0" />
                ) : status === "PENDING_MIGRATIONS" ? (
                  <Clock size={32} className="text-warning shrink-0" />
                ) : (
                  <XCircle size={32} className="text-destructive shrink-0" />
                )}
                <div className="flex-1">
                  <div className="text-lg font-extrabold">{meta.label}</div>
                  <div className="mt-1 grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      نسخة التطبيق (commit):{" "}
                      <b className="tabular-nums">{data.applicationCommit}</b>
                    </div>
                    <div>
                      جاهزية المحاسبة: <b>{data.migrationReady ? "سليمة" : "غير سليمة"}</b>
                    </div>
                    <div>
                      نسخة محدّدة بدقة: <b>{data.commitResolved ? "نعم" : "لا (غير محدّدة)"}</b>
                    </div>
                    {cert ? (
                      <>
                        <div>
                          رقم الشهادة: <b className="tabular-nums">{cert.id}</b>
                        </div>
                        <div>
                          اعتُمدت بواسطة: <b>{cert.certifiedByName || cert.certifiedBy}</b>
                        </div>
                        <div>
                          تاريخ الاعتماد: <b className="tabular-nums">{cert.certifiedAt}</b>
                        </div>
                      </>
                    ) : (
                      <div className="sm:col-span-2">
                        لا توجد شهادة لهذه النسخة (commit) — تُصدَر بضغطة «اعتماد المرحلة 1أ» عند
                        بلوغ الحالة READY&nbsp;TO&nbsp;CERTIFY.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {status === "READY_TO_CERTIFY" && (
                    <Btn
                      variant="primary"
                      onClick={() => setConfirmCertify(true)}
                      disabled={certifyMut.isPending}
                    >
                      {certifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                      اعتماد المرحلة 1أ
                    </Btn>
                  )}
                  <Btn variant="outline" onClick={copyCert}>
                    <Copy size={14} /> نسخ الشهادة
                  </Btn>
                </div>
              </div>

              {data.blockingIssues?.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm border-t pt-3">
                  {data.blockingIssues.map((b: any, i: number) => (
                    <li key={i} className="text-destructive">
                      <b>{b.severity}</b> — {b.message}
                    </li>
                  ))}
                </ul>
              )}
              {status === "PENDING_MIGRATIONS" && (
                <div className="mt-3 border-t pt-3 text-sm text-warning-foreground">
                  الفحص المحاسبي سليم، لكن كائنات النزاهة في قاعدة البيانات (0011–0014) غير مكتملة
                  بعد. طبّق الترحيلات أدناه لإكمال البنية ثم اعتمد.
                </div>
              )}
              {status === "READY_TO_CERTIFY" && (
                <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                  الفحص المحاسبي سليم وكل كائنات قاعدة البيانات موجودة، ولا توجد شهادة لهذه النسخة
                  بعد. اضغط «اعتماد المرحلة 1أ» لإصدار شهادة غير قابلة للتعديل لهذه النسخة تحديداً.
                </div>
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
                title="كائنات قاعدة البيانات (0011–0014)"
                ok={Object.values(c.migrationObjects).every(Boolean)}
              >
                {Object.entries(c.migrationObjects).map(([k, v]) => (
                  <Stat key={k} label={k} value={v ? "موجود" : "غير موجود"} ok={Boolean(v)} />
                ))}
              </CheckCard>
            </div>

            {/* Legacy data review — kept separate from GL (source of truth) */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold">
                  مراجعة البيانات القديمة (accounts.balance) — للاطّلاع فقط
                </h3>
                <Badge tone={c.legacyInconsistencies === 0 ? "success" : "warning"}>
                  {c.legacyInconsistencies === 0 ? "لا تعارضات" : "يتطلّب مراجعة"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                مصدر الحقيقة المحاسبية هو دفتر الأستاذ (GL). هذه القيم القديمة تُعرض للمراجعة فقط
                ولا تُصلَّح أو تُرحَّل تلقائياً.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="إجمالي الحسابات" value={String(c.legacyBalances.total_accounts)} />
                <Stat
                  label="أرصدة غير صفرية"
                  value={String(c.legacyBalances.nonzero_legacy_balance)}
                />
                <Stat
                  label="تعارضات محتملة مع GL"
                  value={String(c.legacyInconsistencies)}
                  ok={c.legacyInconsistencies === 0}
                />
                <Stat label="أرصدة صفرية" value={String(c.legacyBalances.zero_legacy_balance)} />
              </div>
            </Card>

            {/* Immutable history integrity */}
            {data.snapshot?.historyIntegrity && (
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-2">
                  سلامة التاريخ المحاسبي (عدم القابلية للتغيير)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Stat
                    label="بصمة التاريخ متطابقة"
                    value={data.snapshot.historyIntegrity.fingerprint_match ? "نعم ✓" : "لا ✗"}
                    ok={data.snapshot.historyIntegrity.fingerprint_match}
                  />
                  <Stat
                    label="عدد القيود (قبل/بعد)"
                    value={`${data.snapshot.historyIntegrity.journal_entries_before} / ${data.snapshot.historyIntegrity.journal_entries_after}`}
                    ok={data.snapshot.historyIntegrity.journal_entries_match}
                  />
                  <Stat
                    label="عدد البنود (قبل/بعد)"
                    value={`${data.snapshot.historyIntegrity.journal_lines_before} / ${data.snapshot.historyIntegrity.journal_lines_after}`}
                    ok={data.snapshot.historyIntegrity.journal_lines_match}
                  />
                </div>
              </Card>
            )}

            {/* Migration application (only meaningful when PENDING_MIGRATIONS) */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-bold">تطبيق كائنات النزاهة المالية (0011–0014)</div>
                  <div className="text-xs text-muted-foreground">
                    يطبّق بنية الشهادات (0014) ثم يعيد الفحص المحاسبي ويطبّق الترحيلات المشروطة
                    (0011–0013) إن لم توجد عوائق. لا يغيّر أي تاريخ محاسبي ولا يُصدر شهادة —
                    الاعتماد إجراء منفصل.
                  </div>
                </div>
                <Btn
                  variant="primary"
                  disabled={status !== "PENDING_MIGRATIONS" || applyMut.isPending}
                  onClick={() => setConfirmApply(true)}
                >
                  {applyMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                  تطبيق الترحيلات
                </Btn>
              </div>
              {applyMut.data && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                  <div>
                    النتيجة: <b>{applyMut.data.migration}</b>
                  </div>
                  <div>المطبّقة: {applyMut.data.applied?.join("، ") || "لا جديد"}</div>
                  <div>
                    بصمة التاريخ المحاسبي متطابقة قبل/بعد:{" "}
                    <b>
                      {applyMut.data.snapshot?.historyIntegrity?.fingerprint_match
                        ? "نعم ✓"
                        : "لا ✗"}
                    </b>
                  </div>
                </div>
              )}
            </Card>

            {/* Certification ledger (recent immutable records) */}
            {data.certifications?.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-bold mb-2">سجل الاعتمادات</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground text-right">
                        <th className="py-1 pe-3 font-medium">رقم الشهادة</th>
                        <th className="py-1 pe-3 font-medium">الحالة</th>
                        <th className="py-1 pe-3 font-medium">النسخة</th>
                        <th className="py-1 pe-3 font-medium">بواسطة</th>
                        <th className="py-1 pe-3 font-medium">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.certifications.map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="py-1 pe-3 tabular-nums">{r.id}</td>
                          <td className="py-1 pe-3">
                            <Badge tone="success">{r.status}</Badge>
                          </td>
                          <td className="py-1 pe-3 tabular-nums">{r.applicationCommit}</td>
                          <td className="py-1 pe-3">{r.certifiedByName}</td>
                          <td className="py-1 pe-3 tabular-nums">{r.certifiedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmApply}
        onClose={() => setConfirmApply(false)}
        onConfirm={() => applyMut.mutate()}
        title="تطبيق كائنات النزاهة المالية"
        message="ستُطبَّق بنية الشهادات (0014) ثم يُعاد الفحص المحاسبي؛ إن لم توجد عوائق ستُطبَّق الترحيلات 0011–0013. لا يُعدَّل أي قيد محاسبي ولا تُصدَر شهادة. متابعة؟"
        confirmText="تطبيق"
        cancelText="إلغاء"
        variant="default"
      />

      <ConfirmDialog
        open={confirmCertify}
        onClose={() => setConfirmCertify(false)}
        onConfirm={() => certifyMut.mutate()}
        title="اعتماد المرحلة 1أ للإنتاج"
        message="سيُعاد تنفيذ جميع فحوص النزاهة على الخادم، وإن نجحت جميعها ستُصدَر شهادة اعتماد غير قابلة للتعديل لهذه النسخة (commit) تحديداً وباسمك. لا يمكن تعديل الشهادة أو حذفها لاحقاً. متابعة؟"
        confirmText="اعتماد"
        cancelText="إلغاء"
        variant="default"
      />
    </AppShell>
  );
}
