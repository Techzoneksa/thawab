import { toast } from "sonner";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { X, MoreHorizontal, Download, Printer, Loader2, type LucideIcon } from "lucide-react";
import { Btn } from "@/components/erp/AppShell";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  if (type === "success") toast.success(message);
  else if (type === "error") toast.error(message);
  else toast.info(message);
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "تأكيد الإجراء",
  message = "هل أنت متأكد من هذا الإجراء؟",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              variant === "destructive" ? buttonVariants({ variant: "destructive" }) : undefined
            }
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface Action {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
}

export interface EntityFormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSave: () => void;
  saveText?: string;
  loading?: boolean;
}

export function EntityFormDrawer({
  open,
  onClose,
  title,
  children,
  onSave,
  saveText = "حفظ",
  loading = false,
}: EntityFormDrawerProps) {
  const isMobile = useIsMobile();
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showClose={false}
        className={cn(
          "flex flex-col p-0 gap-0",
          isMobile
            ? "max-h-[90dvh] rounded-t-2xl pb-safe [&_[data-radix-dialog-content]]:rounded-t-2xl"
            : "w-full max-w-xl start-0",
        )}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b px-4 sm:px-5 py-3 sm:py-4 shrink-0 relative safe-area-top">
          <SheetTitle className="text-base truncate">{title}</SheetTitle>
          <SheetClose className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors shrink-0">
            <X size={22} />
          </SheetClose>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        <SheetFooter className="flex-row items-center gap-2 border-t px-5 py-4 shrink-0">
          <Btn variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={onSave} disabled={loading}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {saveText}
          </Btn>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export interface ActionMenuProps {
  actions: Action[];
}

export function ActionMenu({ actions }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border hover:bg-muted transition-colors"
          aria-label="الإجراءات"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              onClick={action.onClick}
              className={cn(
                action.variant === "destructive" && "text-destructive focus:text-destructive",
              )}
            >
              {Icon && <Icon size={16} />}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function generateCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        const str = val == null ? "" : String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(","),
  );
  return [headers.join(","), ...rows].join("\r\n");
}

export function ExportButton({
  data,
  filename = "export.csv",
  label = "تصدير CSV",
}: {
  data: Record<string, unknown>[];
  filename?: string;
  label?: string;
}) {
  const handleExport = useCallback(() => {
    const csv = generateCSV(data);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;bom" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("تم تصدير الملف بنجاح", "success");
  }, [data, filename]);
  return (
    <Btn variant="outline" onClick={handleExport}>
      <Download size={15} />
      {label}
    </Btn>
  );
}

export function PrintButton({
  label = "طباعة",
  onPrint,
  className,
}: {
  label?: string;
  onPrint?: () => void;
  className?: string;
}) {
  const handlePrint = useCallback(() => {
    onPrint?.();
    window.print();
    showToast("تم تجهيز الملف للطباعة", "info");
  }, [onPrint]);
  return (
    <Btn variant="outline" onClick={handlePrint} className={className}>
      <Printer size={15} />
      {label}
    </Btn>
  );
}

export interface BulkActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onClear: () => void;
  actions: Action[];
}

export function BulkActionBar({ selectedCount, totalCount, onClear, actions }: BulkActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-surface/95 backdrop-blur-xl safe-area-bottom shadow-[0_-2px_8px_rgba(0,0,0,0.08)] lg:sticky lg:bottom-0 animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">
            تم تحديد {selectedCount}
            {totalCount != null ? ` من ${totalCount}` : ""}
          </span>
          <button onClick={onClear} className="text-xs text-primary hover:underline font-semibold">
            إلغاء التحديد
          </button>
        </div>
        <div className="flex items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const variant = action.variant === "destructive" ? "outline" : "default";
            return (
              <Btn
                key={action.label}
                variant={variant}
                onClick={action.onClick}
                className={
                  action.variant === "destructive"
                    ? "text-destructive border-destructive/30 hover:bg-destructive/10"
                    : ""
                }
              >
                {Icon && <Icon size={15} />}
                {action.label}
              </Btn>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title = "لا توجد نتائج مطابقة",
  description = "حاول تعديل معايير البحث أو التصفية",
  icon,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon ? (
        <div className="mb-4 text-muted-foreground">{icon}</div>
      ) : (
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      )}
      <h3 className="text-lg font-bold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PrintStyle() {
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "erp-print-style";
    style.textContent = `
      @media print {
        body {
          direction: rtl !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          padding: 0 !important;
          margin: 0 !important;
          color: #000 !important;
          background: #fff !important;
        }
        .no-print { display: none !important; }
        nav, header, footer:not(.print-footer), .sidebar,
        .fixed, .sticky:not(.print-sticky) { display: none !important; }
        @page { margin: 1.5cm; }
        * { box-shadow: none !important; text-shadow: none !important; }
        .print-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          border-bottom: 2px solid #000 !important;
          padding-bottom: 8px !important;
          margin-bottom: 16px !important;
        }
        .print-header .org-name {
          font-size: 18px !important;
          font-weight: 800 !important;
        }
        .print-header .doc-meta {
          font-size: 11px !important;
          text-align: left !important;
          direction: ltr !important;
        }
        .print-footer {
          display: flex !important;
          justify-content: space-between !important;
          border-top: 1px solid #ccc !important;
          padding-top: 8px !important;
          margin-top: 24px !important;
          font-size: 10px !important;
          color: #666 !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("erp-print-style");
      if (el) el.remove();
    };
  }, []);
  return null;
}

export function addAuditLog(action: string, entityType: string, entityId: string, note?: string) {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user: "سعد الغامدي",
    action,
    entityType,
    entityId,
    timestamp: new Date().toLocaleString("ar-SA"),
    ...(note ? { note } : {}),
  };
}
