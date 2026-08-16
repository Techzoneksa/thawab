import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  exportData,
  downloadTemplate,
  parseJournalFile,
  parseBudgetFile,
  runImport,
  type JournalPreview,
  type BudgetPreview,
} from "@/lib/api/data-io";

export const Route = createFileRoute("/data")({
  head: () => ({ meta: [{ title: "الاستيراد والتصدير — ثواب" }] }),
  component: Page,
});

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 mt-3">
      <div className="flex items-center gap-2 text-warning-foreground text-xs font-bold mb-1">
        <AlertTriangle size={14} /> تنبيهات ({fmtNum(warnings.length)})
      </div>
      <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto list-disc pr-4">
        {warnings.slice(0, 30).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function JournalCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<JournalPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrors([]);
    try {
      const p = await parseJournalFile(file);
      setPreview(p);
      if (p.entryCount === 0) showToast("لم يُعثر على قيود في الملف", "error");
    } catch (err) {
      setPreview(null);
      showToast(err instanceof Error ? err.message : "تعذّرت قراءة الملف", "error");
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await runImport({ type: "journal", entries: preview.entries });
      if (res.ok) {
        showToast(`تم استيراد ${res.created} قيد كمسودة`, "success");
        setPreview(null);
        queryClient.invalidateQueries({ queryKey: ["journal"] });
      } else {
        setErrors(res.errors || []);
        showToast(`فشل الاستيراد — ${res.errorCount ?? res.errors?.length ?? 0} خطأ`, "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الاستيراد", "error");
    } finally {
      setBusy(false);
    }
  };

  const balanced = preview ? Math.abs(preview.totalDebit - preview.totalCredit) < 0.005 : true;

  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileSpreadsheet size={18} className="text-primary" />
        <h2 className="text-base font-bold">القيود المحاسبية</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        صدّر كل القيود إلى Excel، أو استورد قيوداً جديدة من ملف Excel (تُنشأ كمسودات ثم تُراجَع
        وتُرحَّل). كل مجموعة أسطر لها نفس «رقم القيد» تُكوّن قيداً واحداً ويجب أن تكون متوازنة.
      </p>

      <div className="flex flex-wrap gap-2">
        <Btn
          variant="outline"
          onClick={() => exportData("journal").catch((e) => showToast(e.message, "error"))}
        >
          <Download size={15} /> تصدير القيود
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => downloadTemplate("journal").catch((e) => showToast(e.message, "error"))}
        >
          <FileDown size={15} /> تحميل القالب
        </Btn>
        <Btn variant="primary" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> اختيار ملف للاستيراد
        </Btn>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} className="hidden" />
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold">معاينة الاستيراد</div>
            <Badge tone={balanced ? "success" : "destructive"}>
              {balanced ? "متوازن" : "غير متوازن"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="عدد القيود" value={fmtNum(preview.entryCount)} />
            <StatBox label="عدد الأسطر" value={fmtNum(preview.lineCount)} />
            <StatBox label="إجمالي المدين" value={fmtSAR(preview.totalDebit)} />
            <StatBox label="إجمالي الدائن" value={fmtSAR(preview.totalCredit)} />
          </div>
          <WarningsList warnings={preview.warnings} />
          <div className="flex items-center gap-2 mt-3">
            <Btn variant="primary" onClick={doImport} disabled={busy || preview.entryCount === 0}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              استيراد {fmtNum(preview.entryCount)} قيد
            </Btn>
            <Btn variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              إلغاء
            </Btn>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-destructive text-xs font-bold mb-1">
            <AlertTriangle size={14} /> أخطاء منعت الاستيراد ({fmtNum(errors.length)})
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 max-h-48 overflow-y-auto list-disc pr-4">
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function BudgetCard() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BudgetPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrors([]);
    try {
      const p = await parseBudgetFile(file);
      setPreview(p);
      if (p.budgetCount === 0) showToast("لم يُعثر على موازنات في الملف", "error");
    } catch (err) {
      setPreview(null);
      showToast(err instanceof Error ? err.message : "تعذّرت قراءة الملف", "error");
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await runImport({ type: "budget", budgets: preview.budgets });
      if (res.ok) {
        showToast(`تم استيراد ${res.created} موازنة كمسودة`, "success");
        setPreview(null);
        queryClient.invalidateQueries({ queryKey: ["budgets"] });
      } else {
        setErrors(res.errors || []);
        showToast(`فشل الاستيراد — ${res.errorCount ?? res.errors?.length ?? 0} خطأ`, "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الاستيراد", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-2 mb-1">
        <FileSpreadsheet size={18} className="text-primary" />
        <h2 className="text-base font-bold">الموازنات</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        ارفع موازنة كاملة من ملف Excel مخصّص. كل الأسطر التي لها نفس «اسم الموازنة» و«السنة» تُكوّن
        موازنة واحدة ببنودها، وتُنشأ كمسودة قابلة للاعتماد لاحقاً.
      </p>

      <div className="flex flex-wrap gap-2">
        <Btn
          variant="outline"
          onClick={() => exportData("budget").catch((e) => showToast(e.message, "error"))}
        >
          <Download size={15} /> تصدير الموازنات
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => downloadTemplate("budget").catch((e) => showToast(e.message, "error"))}
        >
          <FileDown size={15} /> تحميل القالب
        </Btn>
        <Btn variant="primary" onClick={() => fileRef.current?.click()}>
          <Upload size={15} /> اختيار ملف للاستيراد
        </Btn>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} className="hidden" />
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border bg-card p-3">
          <div className="text-sm font-bold mb-3">معاينة الاستيراد</div>
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="عدد الموازنات" value={fmtNum(preview.budgetCount)} />
            <StatBox label="عدد البنود" value={fmtNum(preview.lineCount)} />
            <StatBox label="إجمالي المخطّط" value={fmtSAR(preview.totalPlanned)} />
          </div>
          <WarningsList warnings={preview.warnings} />
          <div className="flex items-center gap-2 mt-3">
            <Btn variant="primary" onClick={doImport} disabled={busy || preview.budgetCount === 0}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              استيراد {fmtNum(preview.budgetCount)} موازنة
            </Btn>
            <Btn variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              إلغاء
            </Btn>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-destructive text-xs font-bold mb-1">
            <AlertTriangle size={14} /> أخطاء منعت الاستيراد ({fmtNum(errors.length)})
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 max-h-48 overflow-y-auto list-disc pr-4">
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Page() {
  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "الاستيراد والتصدير"]}
      title="الاستيراد والتصدير"
    >
      <div className="space-y-4 max-w-4xl">
        <div className="rounded-xl border bg-info/5 p-3 text-xs text-muted-foreground">
          استخدم القوالب المرفقة لضمان تطابق الأعمدة. الاستيراد «الكل أو لا شيء»: إذا وُجد أي خطأ لا
          يُنشأ أي سجل، فتصحّح الملف وتعيد الرفع. السجلّات المستوردة تُنشأ كمسودات.
        </div>
        <JournalCard />
        <BudgetCard />
      </div>
    </AppShell>
  );
}
