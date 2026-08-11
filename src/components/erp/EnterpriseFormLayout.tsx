import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Lock, AlertTriangle, Loader2, Save, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface EnterpriseTab {
  id: string;
  label: string;
  badge?: string | number;
  content: ReactNode;
}

export interface EnterpriseFormLayoutProps {
  breadcrumb?: { label: string; to?: string }[];
  title: string;
  subtitle?: string;
  draftNumber?: string;
  status?: { label: string; tone: "muted" | "success" | "warning" | "destructive" | "info" | "primary" };
  isReadOnly?: boolean;
  readonlyReason?: string;
  validationErrors?: string[];
  loading?: boolean;
  tabs: EnterpriseTab[];
  defaultTab?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  showSecondary?: boolean;
  extraActions?: ReactNode;
  onPrimary: () => void;
  onSecondary?: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

const TONE: Record<string, string> = {
  muted: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  primary: "bg-primary/10 text-primary",
};

export function EnterpriseFormLayout({
  breadcrumb,
  title,
  subtitle,
  draftNumber,
  status,
  isReadOnly = false,
  readonlyReason,
  validationErrors = [],
  loading = false,
  tabs,
  defaultTab,
  primaryLabel = "حفظ",
  secondaryLabel = "حفظ وإغلاق",
  showSecondary = true,
  extraActions,
  onPrimary,
  onSecondary,
  onCancel,
  children,
}: EnterpriseFormLayoutProps) {
  const activeTab = defaultTab ?? tabs[0]?.id;
  const canEdit = !isReadOnly && !loading;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-7rem)] -mx-3 sm:-mx-4 lg:-mx-8 -mt-4 lg:-mt-6 bg-background">
      {/* Sticky header */}
      <div className="sticky top-14 lg:top-16 z-20 bg-surface/95 backdrop-blur border-b shadow-sm">
        <div className="px-3 sm:px-4 lg:px-8 pt-3 pb-2">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2 overflow-x-auto no-scrollbar">
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1 whitespace-nowrap shrink-0">
                  {b.to ? (
                    <Link
                      to={b.to}
                      className="hover:text-foreground hover:underline font-medium"
                    >
                      {b.label}
                    </Link>
                  ) : (
                    <span>{b.label}</span>
                  )}
                  {i < breadcrumb.length - 1 && (
                    <ChevronLeft size={12} className="shrink-0 opacity-50" />
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight truncate">
                  {title}
                </h1>
                {draftNumber && (
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md whitespace-nowrap">
                    {draftNumber}
                  </span>
                )}
                {status && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      TONE[status.tone],
                    )}
                  >
                    {status.label}
                  </span>
                )}
                {isReadOnly && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground">
                    <Lock size={11} />
                    للقراءة فقط
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
              )}
            </div>
            {/* Desktop top action bar */}
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              {extraActions}
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px] disabled:opacity-50"
              >
                <X size={15} />
                إلغاء
              </button>
              {showSecondary && onSecondary && (
                <button
                  type="button"
                  onClick={onSecondary}
                  disabled={!canEdit}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  {secondaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onPrimary}
                disabled={!canEdit}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {primaryLabel}
              </button>
            </div>
          </div>
        </div>
        {tabs.length > 1 && (
          <div className="px-3 sm:px-4 lg:px-8 border-t bg-surface">
            <Tabs value={activeTab} dir="rtl" className="w-full">
              <TabsList className="h-auto p-0 bg-transparent rounded-none justify-start gap-0 overflow-x-auto no-scrollbar -mx-1">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    disabled={isReadOnly && t.id !== activeTab}
                    className={cn(
                      "rounded-none border-b-2 border-transparent px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0",
                      "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none",
                      "hover:text-foreground transition-colors",
                    )}
                  >
                    {t.label}
                    {t.badge != null && (
                      <span className="ms-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {t.badge}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>

      {/* Read-only banner */}
      {isReadOnly && readonlyReason && (
        <div className="mx-3 sm:mx-4 lg:mx-8 mt-3 lg:mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 sm:px-4 py-2.5 flex items-start gap-2 text-sm">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold text-warning-foreground">السجل في وضع القراءة فقط</div>
            <div className="text-xs text-muted-foreground mt-0.5">{readonlyReason}</div>
          </div>
        </div>
      )}

      {/* Validation banner */}
      {validationErrors.length > 0 && (
        <div className="mx-3 sm:mx-4 lg:mx-8 mt-3 lg:mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 sm:px-4 py-2.5">
          <div className="flex items-start gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>لا يمكن الحفظ — يرجى تصحيح الأخطاء التالية:</div>
          </div>
          <ul className="ms-7 mt-1 space-y-0.5 text-xs text-destructive">
            {validationErrors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 px-3 sm:px-4 lg:px-8 py-4 lg:py-6 overflow-x-hidden">
        {tabs.length > 1 ? (
          <Tabs value={activeTab} className="w-full">
            {tabs.map((t) => (
              <TabsContent key={t.id} value={t.id} className="mt-0 focus-visible:outline-none">
                {t.content}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          tabs[0]?.content
        )}
        {children}
      </div>

      {/* Mobile bottom action bar — sits above BottomNav */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 border-t bg-surface/95 backdrop-blur-xl shadow-[0_-2px_8px_rgba(0,0,0,0.08)] safe-area-bottom">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50 active:bg-muted transition-colors"
          >
            <X size={15} />
            إلغاء
          </button>
          {showSecondary && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              disabled={!canEdit}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed active:bg-muted transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            disabled={!canEdit}
            className="flex-[1.5] inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:opacity-80 transition-opacity"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
