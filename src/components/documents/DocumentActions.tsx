import { useState, useRef, useEffect } from "react";
import { Eye, Printer, FileText, FileSpreadsheet, MoreHorizontal, X, Loader2 } from "lucide-react";
import { useCan } from "@/lib/api/auth";
import type { DocumentDefinition } from "@/lib/documents/types";
import { DocumentLayout } from "./DocumentLayout";
import { printDocument } from "@/lib/documents/print";
import { exportExcel } from "@/lib/documents/excel";
import { hasPdfFont, exportPdf } from "@/lib/documents/pdf";

type Resolver = DocumentDefinition | (() => DocumentDefinition | Promise<DocumentDefinition>);

async function resolve(r: Resolver): Promise<DocumentDefinition> {
  return typeof r === "function" ? await (r as () => Promise<DocumentDefinition>)() : r;
}

interface Props {
  /** The document, or an async loader that fetches the FULL filtered dataset. */
  document: Resolver;
  /** Override permission keys (defaults to documents.*). */
  perms?: { preview?: string; print?: string; pdf?: string; excel?: string };
  className?: string;
}

export function DocumentActions({ document: docSource, perms, className = "" }: Props) {
  const can = useCan();
  const [active, setActive] = useState<DocumentDefinition | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<null | string>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // NOTE: all hooks must run unconditionally and BEFORE any early return,
  // otherwise the hook count changes once permissions finish loading and
  // React throws error #310 ("rendered more hooks than during the previous
  // render"), crashing every page that renders this component.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const P = {
    preview: perms?.preview ?? "documents.preview",
    print: perms?.print ?? "documents.print",
    pdf: perms?.pdf ?? "documents.export_pdf",
    excel: perms?.excel ?? "documents.export_excel",
  };
  const showPreview = can(P.preview);
  const showPrint = can(P.print);
  const showPdf = can(P.pdf);
  const showExcel = can(P.excel);
  if (!showPreview && !showPrint && !showPdf && !showExcel) return null;

  async function withDef(kind: string, fn: (d: DocumentDefinition) => void | Promise<void>) {
    setBusy(kind);
    setMenuOpen(false);
    try {
      const d = await resolve(docSource);
      setActive(d);
      await fn(d);
    } catch (e) {
      console.error("[documents]", e);
    } finally {
      setBusy(null);
    }
  }

  const doPreview = () => withDef("preview", () => setPreview(true));
  const doPrint = () =>
    withDef("print", () => {
      setPreview(false);
      printDocument();
    });
  const doExcel = () => withDef("excel", (d) => exportExcel(d));
  const doPdf = () =>
    withDef("pdf", async (d) => {
      if (hasPdfFont()) await exportPdf(d);
      else printDocument(); // browser "Save as PDF" — perfect Arabic shaping
    });

  const Icon = ({ k, fallback }: { k: string; fallback: React.ReactNode }) =>
    busy === k ? <Loader2 size={15} className="animate-spin" /> : <>{fallback}</>;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {/* Desktop */}
      <div className="hidden md:inline-flex items-center gap-1.5">
        {showPreview && (
          <button onClick={doPreview} className="doc-btn" title="معاينة">
            <Icon k="preview" fallback={<Eye size={15} />} /> <span>معاينة</span>
          </button>
        )}
        {showPrint && (
          <button onClick={doPrint} className="doc-btn" title="طباعة">
            <Icon k="print" fallback={<Printer size={15} />} /> <span>طباعة</span>
          </button>
        )}
        {showPdf && (
          <button onClick={doPdf} className="doc-btn" title="تنزيل PDF">
            <Icon k="pdf" fallback={<FileText size={15} />} /> <span>PDF</span>
          </button>
        )}
        {showExcel && (
          <button onClick={doExcel} className="doc-btn" title="تصدير Excel">
            <Icon k="excel" fallback={<FileSpreadsheet size={15} />} /> <span>Excel</span>
          </button>
        )}
      </div>

      {/* Mobile: More menu */}
      <div className="relative md:hidden" ref={menuRef}>
        <button onClick={() => setMenuOpen((v) => !v)} className="doc-btn">
          <MoreHorizontal size={16} /> <span>إجراءات</span>
        </button>
        {menuOpen && (
          <div className="absolute z-50 mt-1 end-0 min-w-[180px] rounded-lg border bg-background shadow-lg p-1">
            {showPreview && (
              <MenuItem onClick={doPreview} icon={<Eye size={15} />} label="معاينة" />
            )}
            {showPrint && <MenuItem onClick={doPrint} icon={<Printer size={15} />} label="طباعة" />}
            {showPdf && (
              <MenuItem onClick={doPdf} icon={<FileText size={15} />} label="تنزيل PDF" />
            )}
            {showExcel && (
              <MenuItem
                onClick={doExcel}
                icon={<FileSpreadsheet size={15} />}
                label="تصدير Excel"
              />
            )}
          </div>
        )}
      </div>

      {/* Hidden mount so window.print() can isolate the document */}
      {active && !preview && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            width: 0,
            height: 0,
            overflow: "hidden",
          }}
        >
          <DocumentLayout def={active} />
        </div>
      )}

      {/* Preview overlay */}
      {preview && active && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex flex-col"
          onClick={() => setPreview(false)}
        >
          <div
            className="flex items-center justify-between gap-2 p-2 bg-background border-b"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-semibold text-sm px-2">معاينة: {active.title}</div>
            <div className="flex items-center gap-1.5">
              {showPrint && (
                <button onClick={doPrint} className="doc-btn">
                  <Printer size={15} /> طباعة
                </button>
              )}
              {showPdf && (
                <button onClick={doPdf} className="doc-btn">
                  <FileText size={15} /> PDF
                </button>
              )}
              {showExcel && (
                <button onClick={doExcel} className="doc-btn">
                  <FileSpreadsheet size={15} /> Excel
                </button>
              )}
              <button onClick={() => setPreview(false)} className="doc-btn">
                <X size={15} />
              </button>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto p-4 flex justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shadow-2xl">
              <DocumentLayout def={active} />
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `.doc-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;
            padding:7px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--background,#fff);
            color:inherit;cursor:pointer;white-space:nowrap}
            .doc-btn:hover{background:var(--muted,#f3f4f6)}`,
        }}
      />
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted text-start"
    >
      {icon} {label}
    </button>
  );
}
