import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Bell, CheckSquare, Wallet, BookOpen, FileSpreadsheet,
  PiggyBank, Calculator, FileBarChart, HeartHandshake, Users, ReceiptText,
  Repeat, Megaphone, FolderKanban, HandHelping, Map, BadgeDollarSign,
  Building2, Landmark, TrendingUp, ShoppingCart, FileText, ClipboardList,
  Truck, Warehouse, Boxes, PackageSearch, Layers, Briefcase, UsersRound,
  CalendarDays, FileSearch, ShieldCheck, KeyRound, Workflow, Settings as Cog,
  GitBranch, UserCog, Plug, DatabaseBackup, SlidersHorizontal, Search,
  ChevronDown, ChevronLeft, Sparkles, Globe, Menu, X, LogOut,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: any };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: "الرئيسية", items: [
    { to: "/", label: "لوحة المعلومات", icon: LayoutDashboard },
    { to: "/notifications", label: "التنبيهات", icon: Bell },
    { to: "/approvals", label: "الموافقات", icon: CheckSquare },
  ]},
  { label: "المالية", items: [
    { to: "/finance/accounts", label: "دليل الحسابات", icon: BookOpen },
    { to: "/finance/journal", label: "قيود اليومية", icon: FileSpreadsheet },
    { to: "/finance/ledger", label: "دفتر الأستاذ", icon: Wallet },
    { to: "/finance/budgets", label: "الموازنات", icon: Calculator },
    { to: "/finance/cost-centers", label: "مراكز التكلفة", icon: PiggyBank },
    { to: "/finance/closing", label: "الإقفال المالي", icon: GitBranch },
    { to: "/finance/statements", label: "القوائم المالية", icon: FileBarChart },
  ]},
  { label: "التبرعات والمتبرعون", items: [
    { to: "/donors", label: "المتبرعون", icon: HeartHandshake },
    { to: "/donations", label: "التبرعات", icon: Wallet },
    { to: "/receipts", label: "الإيصالات", icon: ReceiptText },
    { to: "/recurring", label: "التبرعات المتكررة", icon: Repeat },
    { to: "/campaigns", label: "الحملات", icon: Megaphone },
  ]},
  { label: "المشاريع والمستفيدون", items: [
    { to: "/projects", label: "المشاريع والبرامج", icon: FolderKanban },
    { to: "/beneficiaries", label: "المستفيدون", icon: Users },
    { to: "/aid", label: "المساعدات", icon: HandHelping },
    { to: "/distribution", label: "تقارير التوزيع", icon: Map },
  ]},
  { label: "المنح والأوقاف", items: [
    { to: "/grants", label: "المنح", icon: BadgeDollarSign },
    { to: "/donor-orgs", label: "الجهات المانحة", icon: Building2 },
    { to: "/endowments", label: "الأوقاف", icon: Landmark },
    { to: "/endowment-returns", label: "عوائد الأوقاف", icon: TrendingUp },
  ]},
  { label: "المشتريات والمخزون", items: [
    { to: "/procurement/requests", label: "طلبات الشراء", icon: ClipboardList },
    { to: "/procurement/quotes", label: "عروض الأسعار", icon: FileText },
    { to: "/procurement/orders", label: "أوامر الشراء", icon: ShoppingCart },
    { to: "/procurement/suppliers", label: "الموردون", icon: Truck },
    { to: "/inventory/warehouses", label: "المستودعات", icon: Warehouse },
    { to: "/inventory/items", label: "الأصناف", icon: Boxes },
    { to: "/inventory/stocktake", label: "الجرد", icon: PackageSearch },
  ]},
  { label: "الموارد", items: [
    { to: "/assets", label: "الأصول الثابتة", icon: Layers },
    { to: "/hr", label: "الموارد البشرية", icon: Briefcase },
    { to: "/memberships", label: "العضويات", icon: UsersRound },
    { to: "/meetings", label: "الاجتماعات", icon: CalendarDays },
  ]},
  { label: "التقارير والحوكمة", items: [
    { to: "/reports", label: "مركز التقارير", icon: FileBarChart },
    { to: "/audit", label: "سجل التدقيق", icon: FileSearch },
    { to: "/permissions", label: "الصلاحيات", icon: KeyRound },
    { to: "/workflows", label: "سير العمل", icon: Workflow },
  ]},
  { label: "الإعدادات", items: [
    { to: "/settings/org", label: "إعدادات الجمعية", icon: Cog },
    { to: "/settings/branches", label: "الفروع", icon: GitBranch },
    { to: "/settings/users", label: "المستخدمون", icon: UserCog },
    { to: "/settings/integrations", label: "التكاملات", icon: Plug },
    { to: "/settings/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
    { to: "/settings/system", label: "إعدادات النظام", icon: SlidersHorizontal },
  ]},
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed lg:sticky top-0 right-0 z-40 h-screen w-72 shrink-0 bg-nav text-nav-foreground flex flex-col transition-transform ${open ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-white font-extrabold">ث</div>
            <div className="min-w-0">
              <div className="font-extrabold truncate">ثواب</div>
              <div className="text-[11px] text-nav-muted truncate">نظام إدارة الجمعيات الخيرية</div>
            </div>
          </div>
          <button className="lg:hidden text-nav-muted" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-2 text-[11px] font-bold tracking-wide text-nav-muted uppercase">{group.label}</div>
              <ul className="space-y-0.5">
                {group.items.map((it) => {
                  const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-nav-active text-white font-semibold shadow-sm" : "text-nav-foreground/90 hover:bg-nav-hover"}`}
                      >
                        <Icon size={17} className="shrink-0 opacity-90" />
                        <span className="truncate">{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 font-bold">س</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">سعد الغامدي</div>
              <div className="text-[11px] text-nav-muted truncate">المدير المالي</div>
            </div>
            <button className="text-nav-muted hover:text-white" title="خروج"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-surface/80 backdrop-blur px-4 lg:px-6 h-16">
      <button className="lg:hidden text-foreground" onClick={onMenu} aria-label="القائمة"><Menu size={22} /></button>
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="بحث ذكي عن متبرع، مستفيد، مشروع، قيد..."
            className="w-full rounded-lg border bg-background py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="hidden md:flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
        <Globe size={14} /> جمعية البر الخيرية · الفرع الرئيسي · 1446هـ
      </div>
      <button
        onClick={() => setAiOpen(true)}
        className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary to-info px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
      >
        <Sparkles size={16} /> المساعد الذكي
      </button>
      <button className="relative rounded-lg border p-2 hover:bg-muted" aria-label="إشعارات">
        <Bell size={18} />
        <span className="absolute -top-1 -left-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">7</span>
      </button>
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </header>
  );
}

function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const suggestions = [
    "ما إجمالي التبرعات لمشروع كفالة الأيتام هذا الشهر؟",
    "توقّع التدفق النقدي للربع القادم",
    "أنشئ تقريراً تحليلياً عن أداء حملة كسوة الشتاء",
    "اكتشف المعاملات المالية غير الاعتيادية",
    "اقترح إعادة توزيع الميزانية بين المشاريع النشطة",
  ];
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />}
      <aside className={`fixed top-0 left-0 z-50 h-screen w-full sm:w-[420px] bg-surface border-l shadow-elevated transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-info text-white"><Sparkles size={18} /></div>
            <div>
              <div className="font-bold">المساعد الذكي</div>
              <div className="text-[11px] text-muted-foreground">مدعوم بنماذج ذكاء اصطناعي عربية</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto h-[calc(100vh-64px)]">
          <div className="rounded-xl bg-gradient-to-bl from-primary/10 to-info/10 p-4 text-sm leading-relaxed">
            <p className="font-semibold mb-1">مرحباً سعد،</p>
            <p>تحليل سريع: التبرعات هذا الشهر <b>4.58M ر.س</b> بنمو 12.4% مقارنة بالشهر السابق. لاحظت ارتفاعاً غير معتاد في تبرعات حملة <b>كفالة الأيتام</b> (+38%). هل تريد تقريراً تفصيلياً؟</p>
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">اقتراحات</div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s} className="w-full text-right rounded-lg border bg-background px-3 py-2 text-sm hover:border-primary hover:bg-muted/50">{s}</button>
              ))}
            </div>
          </div>
          <div className="relative pt-2">
            <input className="w-full rounded-xl border bg-background py-3 pr-4 pl-12 text-sm" placeholder="اسأل المساعد..." />
            <button className="absolute left-2 top-1/2 -translate-y-1/2 mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">إرسال</button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function AppShell({ children, title, breadcrumb, actions }: { children: ReactNode; title?: string; breadcrumb?: string[]; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex w-full bg-background" dir="rtl">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        {(title || breadcrumb || actions) && (
          <div className="border-b bg-surface px-4 lg:px-8 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                {breadcrumb && (
                  <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    {breadcrumb.map((b, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span>{b}</span>
                        {i < breadcrumb.length - 1 && <ChevronLeft size={12} />}
                      </span>
                    ))}
                  </nav>
                )}
                {title && <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}
        <main className="flex-1 px-4 lg:px-8 py-6">{children}</main>
        <footer className="border-t bg-surface px-6 py-3 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© 1446هـ — ثواب. مستضاف داخل المملكة العربية السعودية.</span>
          <span>نظام خاص لإدارة الجمعيات والجهات الخيرية</span>
        </footer>
      </div>
    </div>
  );
}

export function Badge({ tone = "muted", children }: { tone?: "muted" | "success" | "warning" | "destructive" | "info" | "primary"; children: ReactNode }) {
  const map: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
    primary: "bg-primary/10 text-primary",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{children}</span>;
}

export function statusTone(status: string): "muted" | "success" | "warning" | "destructive" | "info" | "primary" {
  const s = status.toLowerCase();
  if (["مكتمل", "معتمد", "مرحّل", "متصل", "نشط", "نشطة", "مكتملة", "تشغيل", "مستحق", "مستثمر", "جاهز"].some((k) => status.includes(k))) return "success";
  if (["بانتظار", "قيد", "صيانة", "إجازة", "مجدول", "بانتظار التفعيل"].some((k) => status.includes(k))) return "warning";
  if (["مرفوض", "موقوف", "متأخر"].some((k) => status.includes(k))) return "destructive";
  if (["تم التحويل", "وقف", "منعقد"].some((k) => status.includes(k))) return "info";
  return "muted";
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-base font-bold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Btn({ children, variant = "default", className = "", ...rest }: { children: ReactNode; variant?: "default" | "primary" | "ghost" | "outline" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const map: Record<string, string> = {
    default: "bg-background border hover:bg-muted",
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    ghost: "hover:bg-muted",
    outline: "border hover:bg-muted",
  };
  return <button {...rest} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${map[variant]} ${className}`}>{children}</button>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card mb-4">{children}</div>;
}

export function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <div className="relative">
        <select className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown size={14} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
      </div>
    </div>
  );
}

export function Table<T>({ columns, rows, renderRow }: { columns: string[]; rows: T[]; renderRow: (row: T, i: number) => ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/60 text-right">
            {columns.map((c) => <th key={c} className="px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
              {renderRow(r, i)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</td>;
}
