import { useRef, useState } from "react";
import { Btn, Badge } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  Upload,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  FileSpreadsheet,
} from "lucide-react";
import {
  downloadTemplate,
  parseJournalFile,
  runImport,
  type JournalPreview,
} from "@/lib/api/data-io";

/**
 * Bulk journal (JV) import from an Excel file, in a modal — same parse/preview/
 * import flow as the "الاستيراد والتصدير" screen, surfaced directly inside the
 * journal list so users can upload (e.g. 60 bank-charge lines) without leaving.
 * Imported entries are created as DRAFT and then reviewed/posted normally.
 */
export function JournalImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<JournalPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reset = () => {
    setPreview(null);
    setErrors([]);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

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
      const res = await runImport({
        type: "journal",
        entries: preview.entries,
        fileName: preview.fileName,
        fileHash: preview.fileHash,
      });
      if (res.duplicate) {
        setErrors([
          `تم استيراد هذا الملف مسبقاً — دفعة ${res.batch?.id} بتاريخ ${res.batch?.importedAt?.slice(0, 10)} (${res.batch?.journalCount} قيد). لم تُنشأ قيود مكرّرة.`,
        ]);
        showToast("ملف مكرّر — تم رفض الاستيراد", "error");
      } else if (res.ok) {
        showToast(`تم استيراد ${res.created} قيد كمسودة (دفعة ${res.batchId})`, "success");
        reset();
        onImported();
        onClose();
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

  if (!open) return null;
  const balanced = preview ? Math.abs(preview.totalDebit - preview.totalCredit) < 0.005 : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary" />
            <h2 className="text-base font-bold">استيراد قيود من Excel</h2>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          ارفع ملف Excel بحركاتك (مثلاً العمولات البنكية) دفعة واحدة. كل الأسطر التي لها نفس «تسلسل
          القيد» تُكوّن قيداً واحداً ويجب أن تكون متوازنة. تُنشأ القيود كمسودات ثم تُراجَع وتُرحَّل.
        </p>

        <div className="flex flex-wrap gap-2">
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
            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 mt-3">
                <div className="flex items-center gap-2 text-warning-foreground text-xs font-bold mb-1">
                  <AlertTriangle size={14} /> تنبيهات ({fmtNum(preview.warnings.length)})
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto list-disc pr-4">
                  {preview.warnings.slice(0, 30).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Btn variant="primary" onClick={doImport} disabled={busy || preview.entryCount === 0}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                استيراد {fmtNum(preview.entryCount)} قيد
              </Btn>
              <Btn variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
                إلغاء المعاينة
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
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
