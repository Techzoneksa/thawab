import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/api/auth";
import {
  LayoutDashboard,
  Bell,
  CheckSquare,
  Wallet,
  BookOpen,
  FileSpreadsheet,
  PiggyBank,
  Calculator,
  FileBarChart,
  HeartHandshake,
  Users,
  ReceiptText,
  Repeat,
  Megaphone,
  FolderKanban,
  HandHelping,
  Map,
  BadgeDollarSign,
  Building2,
  Landmark,
  TrendingUp,
  ShoppingCart,
  FileText,
  ClipboardList,
  Truck,
  Warehouse,
  Boxes,
  PackageSearch,
  Layers,
  Briefcase,
  UsersRound,
  CalendarDays,
  FileSearch,
  ShieldCheck,
  KeyRound,
  Workflow,
  Settings as Cog,
  GitBranch,
  UserCog,
  Plug,
  DatabaseBackup,
  SlidersHorizontal,
  Search,
  ChevronDown,
  ChevronLeft,
  Sparkles,
  Globe,
  Menu,
  X,
  LogOut,
  ChevronRight,
  MoreHorizontal,
  ArrowLeft,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const AI_ASSISTANT_ENABLED = false;

const NAV: NavGroup[] = [
  {
    label: "الرئيسية",
    items: [
      { to: "/", label: "لوحة المعلومات", icon: LayoutDashboard },
      { to: "/notifications", label: "التنبيهات", icon: Bell },
      { to: "/approvals", label: "الموافقات", icon: CheckSquare },
    ],
  },
  {
    label: "المالية",
    items: [
      { to: "/finance/accounts", label: "دليل الحسابات", icon: BookOpen },
      { to: "/finance/journal", label: "قيود اليومية", icon: FileSpreadsheet },
      { to: "/finance/ledger", label: "دفتر الأستاذ", icon: Wallet },
      { to: "/finance/budgets", label: "الموازنات", icon: Calculator },
      { to: "/finance/cost-centers", label: "مراكز التكلفة", icon: PiggyBank },
      { to: "/finance/closing", label: "الإقفال المالي", icon: GitBranch },
      { to: "/finance/statements", label: "القوائم المالية", icon: FileBarChart },
    ],
  },
  {
    label: "التبرعات والمتبرعون",
    items: [
      { to: "/donors", label: "المتبرعون", icon: HeartHandshake },
      { to: "/donations", label: "التبرعات", icon: Wallet },
      { to: "/receipts", label: "الإيصالات", icon: ReceiptText },
      { to: "/recurring", label: "التبرعات المتكررة", icon: Repeat },
      { to: "/campaigns", label: "الحملات", icon: Megaphone },
    ],
  },
  {
    label: "المشاريع والمستفيدون",
    items: [
      { to: "/projects", label: "المشاريع والبرامج", icon: FolderKanban },
      { to: "/beneficiaries", label: "المستفيدون", icon: Users },
      { to: "/aid", label: "المساعدات", icon: HandHelping },
      { to: "/distribution", label: "تقارير التوزيع", icon: Map },
    ],
  },
  {
    label: "المنح والأوقاف",
    items: [
      { to: "/grants", label: "المنح", icon: BadgeDollarSign },
      { to: "/donor-orgs", label: "الجهات المانحة", icon: Building2 },
      { to: "/endowments", label: "الأوقاف", icon: Landmark },
      { to: "/endowment-returns", label: "عوائد الأوقاف", icon: TrendingUp },
    ],
  },
  {
    label: "المشتريات والمخزون",
    items: [
      { to: "/procurement/requests", label: "طلبات الشراء", icon: ClipboardList },
      { to: "/procurement/quotes", label: "عروض الأسعار", icon: FileText },
      { to: "/procurement/orders", label: "أوامر الشراء", icon: ShoppingCart },
      { to: "/procurement/suppliers", label: "الموردون", icon: Truck },
      { to: "/inventory/warehouses", label: "المستودعات", icon: Warehouse },
      { to: "/inventory/items", label: "الأصناف", icon: Boxes },
      { to: "/inventory/stocktake", label: "الجرد", icon: PackageSearch },
    ],
  },
  {
    label: "الموارد",
    items: [
      { to: "/assets", label: "الأصول الثابتة", icon: Layers },
      { to: "/hr", label: "الموارد البشرية", icon: Briefcase },
      { to: "/memberships", label: "العضويات", icon: UsersRound },
      { to: "/meetings", label: "الاجتماعات", icon: CalendarDays },
    ],
  },
  {
    label: "التقارير والحوكمة",
    items: [
      { to: "/reports", label: "مركز التقارير", icon: FileBarChart },
      { to: "/audit", label: "سجل التدقيق", icon: FileSearch },
      { to: "/permissions", label: "الصلاحيات", icon: KeyRound },
      { to: "/workflows", label: "سير العمل", icon: Workflow },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      { to: "/settings/org", label: "إعدادات الجمعية", icon: Cog },
      { to: "/settings/branches", label: "الفروع", icon: GitBranch },
      { to: "/settings/users", label: "المستخدمون", icon: UserCog },
      { to: "/settings/integrations", label: "التكاملات", icon: Plug },
      { to: "/settings/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup },
      { to: "/settings/system", label: "إعدادات النظام", icon: SlidersHorizontal },
    ],
  },
];

const BOTTOM_NAV_ITEMS = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/donations", label: "التبرعات", icon: Wallet },
  { to: "/projects", label: "المشاريع", icon: FolderKanban },
  { to: "/approvals", label: "الموافقات", icon: CheckSquare },
  { to: "#more", label: "المزيد", icon: MoreHorizontal },
];

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    const prevPadRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = prevPadRight;
    };
  }, [locked]);
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useBodyScrollLock(open);
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/55 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="القائمة الرئيسية"
        className={`fixed top-0 right-0 z-40 h-[100dvh] w-[85vw] max-w-[320px] shrink-0 bg-nav text-nav-foreground flex flex-col transition-transform duration-300 ease-out will-change-transform lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:max-w-none lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-info text-white font-extrabold">
              ث
            </div>
            <div className="min-w-0">
              <div className="font-extrabold truncate">ثواب</div>
              <div className="text-[11px] text-nav-muted truncate">نظام إدارة الجمعيات الخيرية</div>
            </div>
          </div>
          <button
            className="grid h-11 w-11 place-items-center rounded-lg text-nav-muted hover:bg-white/10 active:bg-white/20 transition-colors lg:hidden"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto scrollbar-thin overscroll-contain px-3 py-4 space-y-5">
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-2 text-[11px] font-bold tracking-wide text-nav-muted uppercase">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((it) => {
                  const active =
                    pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        onClick={onClose}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors min-h-[44px] ${active ? "bg-nav-active text-white font-semibold shadow-sm" : "text-nav-foreground/90 hover:bg-nav-hover active:bg-white/10"}`}
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
        <div className="border-t border-white/10 p-4 safe-area-bottom">
          <UserProfile />
        </div>
      </aside>
    </>
  );
}

function UserProfile() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const initials = user?.name ? user.name[0] : "؟";
  const roleLabel = user ? getRoleLabel(user.role) : "";
  const name = user?.name || (isLoading ? "..." : "مستخدم");

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white/5 p-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 font-bold">
          {isLoading ? <span className="animate-pulse">…</span> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{name}</div>
          <div className="text-[11px] text-nav-muted truncate">{roleLabel || "—"}</div>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors px-3 py-2 text-sm font-semibold text-white min-h-[40px] w-full"
        title="تسجيل الخروج"
        aria-label="تسجيل الخروج"
      >
        <LogOut size={16} />
        <span>تسجيل الخروج</span>
      </button>
    </div>
  );
}

function getRoleLabel(role: string) {
  const roleLabels: Record<string, string> = {
    "مدير النظام": "مدير النظام",
    محاسب: "محاسب",
    مدير: "مدير",
    "موظف تبرعات": "موظف تبرعات",
    "منسق مشاريع": "منسق مشاريع",
    employee: "موظف",
    admin: "مدير",
    manager: "مدير",
  };
  return roleLabels[role] || role;
}

function Topbar({
  onMenu,
  aiOpen,
  setAiOpen,
}: {
  onMenu: () => void;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageTitle =
    pathname === "/"
      ? "لوحة المعلومات"
      : pathname === "/donations"
        ? "التبرعات"
        : pathname === "/projects"
          ? "المشاريع"
          : pathname === "/approvals"
            ? "الموافقات"
            : pathname === "/donors"
              ? "المتبرعون"
              : pathname === "/beneficiaries"
                ? "المستفيدون"
                : pathname === "/reports"
                  ? "مركز التقارير"
                  : pathname === "/notifications"
                    ? "التنبيهات"
                    : pathname.startsWith("/finance")
                      ? "المالية"
                      : pathname.startsWith("/procurement")
                        ? "المشتريات"
                        : pathname.startsWith("/inventory")
                          ? "المخزون"
                          : pathname.startsWith("/settings")
                            ? "الإعدادات"
                            : "";

  return (
    <>
      <header className="hidden lg:flex sticky top-0 z-20 items-center gap-3 border-b bg-surface/80 backdrop-blur px-4 lg:px-6 h-16">
        <button
          className="grid h-11 w-11 place-items-center rounded-lg text-foreground hover:bg-muted transition-colors"
          onClick={onMenu}
          aria-label="القائمة"
        >
          <Menu size={22} />
        </button>
        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              placeholder="بحث ذكي عن متبرع، مستفيد، مشروع، قيد..."
              className="w-full rounded-lg border bg-background py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px]"
            />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
          <Globe size={14} /> جمعية البر الخيرية · الفرع الرئيسي · 1446هـ
        </div>
        {AI_ASSISTANT_ENABLED && (
          <button
            onClick={() => setAiOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary to-info px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 min-h-[40px]"
          >
            <Sparkles size={16} /> المساعد الذكي
          </button>
        )}
        <button
          className="relative grid h-11 w-11 place-items-center rounded-lg border hover:bg-muted transition-colors"
          aria-label="إشعارات"
        >
          <Bell size={18} />
          <span className="absolute top-1 left-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            7
          </span>
        </button>
        <button
          onClick={onMenu}
          className="flex items-center gap-2 rounded-lg border p-1.5 pr-2 hover:bg-muted transition-colors min-h-[40px]"
          aria-label="حسابي"
        >
          <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white text-[10px] font-bold">
            س
          </div>
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
            سعد الغامدي
          </span>
        </button>
      </header>

      <header className="lg:hidden sticky top-0 z-20 flex items-center gap-1 border-b bg-surface/95 backdrop-blur px-2 h-14 safe-area-top">
        <button
          onClick={onMenu}
          className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted active:bg-muted/80 transition-colors shrink-0"
          aria-label="القائمة"
        >
          <Menu size={22} />
        </button>
        <h1 className="flex-1 text-base font-bold truncate px-1 min-w-0">{pageTitle || "ثواب"}</h1>
        {AI_ASSISTANT_ENABLED && (
          <button
            onClick={() => setAiOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-lg text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors shrink-0"
            aria-label="المساعد الذكي"
            title="المساعد الذكي"
          >
            <Sparkles size={20} />
          </button>
        )}
        <button
          className="relative grid h-11 w-11 place-items-center rounded-lg hover:bg-muted active:bg-muted/80 transition-colors shrink-0"
          aria-label="إشعارات"
        >
          <Bell size={20} />
          <span className="absolute top-2 left-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-surface" />
        </button>
        <button
          onClick={onMenu}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white text-xs font-bold shadow-sm active:scale-95 transition-transform"
          aria-label="حسابي"
        >
          س
        </button>
      </header>
    </>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const isDesktop = useIsDesktop();
  const suggestions = [
    "ما إجمالي التبرعات لمشروع كفالة الأيتام هذا الشهر؟",
    "توقّع التدفق النقدي للربع القادم",
    "أنشئ تقريراً تحليلياً عن أداء حملة كسوة الشتاء",
    "اكتشف المعاملات المالية غير الاعتيادية",
    "اقترح إعادة توزيع الميزانية بين المشاريع النشطة",
  ];

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const transformStyle = isDesktop
    ? open
      ? "translateX(0)"
      : "translateX(100%)"
    : open
      ? "translateY(0)"
      : "translateY(100%)";

  const positionClasses = isDesktop
    ? "inset-y-0 start-0 top-0 bottom-auto h-screen w-[420px] max-w-[85vw]"
    : "inset-0";

  return (
    <>
      <div
        className={`fixed inset-0 z-[55] bg-black/55 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="المساعد الذكي"
        style={{ transform: transformStyle }}
        className={`fixed z-[60] bg-surface shadow-elevated flex flex-col transition-transform duration-300 ease-out will-change-transform ${positionClasses} ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 sm:px-5 py-3 sm:py-4 shrink-0 safe-area-top">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-info text-white">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-bold truncate">المساعد الذكي</div>
              <div className="text-[11px] text-muted-foreground truncate">
                مدعوم بنماذج ذكاء اصطناعي عربية
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors shrink-0"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
          <div className="rounded-xl bg-gradient-to-bl from-primary/10 to-info/10 p-4 text-sm leading-relaxed">
            <p className="font-semibold mb-1">مرحباً سعد،</p>
            <p>
              تحليل سريع: التبرعات هذا الشهر <b>4.58M ر.س</b> بنمو 12.4% مقارنة بالشهر السابق. لاحظت
              ارتفاعاً غير معتاد في تبرعات حملة <b>كفالة الأيتام</b> (+38%). هل تريد تقريراً
              تفصيلياً؟
            </p>
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-2">اقتراحات</div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="w-full text-right rounded-lg border bg-background px-3 py-2.5 text-sm hover:border-primary hover:bg-muted/50 active:bg-muted transition-colors min-h-[40px]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t bg-surface px-3 sm:px-4 py-3 shrink-0 safe-area-bottom">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border bg-background py-3 pr-4 pl-14 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[48px]"
              placeholder="اسأل المساعد..."
            />
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground min-h-[40px] hover:opacity-90 active:opacity-80 transition-opacity"
              aria-label="إرسال"
            >
              <Send size={14} />
              إرسال
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function AiFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="فتح المساعد الذكي"
      title="المساعد الذكي"
      className="lg:hidden fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white shadow-elevated active:scale-95 transition-transform"
    >
      <Sparkles size={22} />
    </button>
  );
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed bottom-0 right-0 left-0 z-30 border-t bg-surface/95 backdrop-blur-xl safe-area-bottom lg:hidden shadow-[0_-1px_3px_rgba(0,0,0,0.05)]"
    >
      <div className="flex items-center justify-around h-16">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active =
            item.to === "/"
              ? pathname === "/"
              : item.to !== "#more" && pathname.startsWith(item.to);
          const Icon = item.icon;
          if (item.to === "#more") {
            return (
              <button
                key={item.label}
                onClick={onMore}
                className="flex flex-col items-center justify-center gap-0.5 h-full min-w-[64px] px-1 rounded-lg text-muted-foreground hover:text-foreground active:bg-muted/50 transition-colors active:scale-95"
                aria-label="القائمة الكاملة"
              >
                <Icon size={22} className={active ? "text-primary" : ""} />
                <span className="text-[10px] font-semibold leading-none">{item.label}</span>
              </button>
            );
          }
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-0.5 h-full min-w-[64px] px-1 rounded-lg transition-colors active:bg-muted/50 active:scale-95 ${active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={item.label}
            >
              <Icon size={22} />
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({
  children,
  title,
  breadcrumb,
  actions,
}: {
  children: ReactNode;
  title?: string;
  breadcrumb?: string[];
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] flex w-full max-w-full bg-background mobile-container" dir="rtl">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 max-w-full pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0 overflow-x-hidden">
        <Topbar onMenu={() => setOpen(true)} aiOpen={aiOpen} setAiOpen={setAiOpen} />
        {(title || breadcrumb || actions) && (
          <div className="border-b bg-surface px-3 sm:px-4 lg:px-8 py-3 lg:py-4">
            <div className="flex flex-wrap items-end justify-between gap-2 lg:gap-3">
              <div className="min-w-0 flex-1">
                {breadcrumb && (
                  <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5 overflow-x-auto no-scrollbar">
                    {breadcrumb.map((b, i) => (
                      <span key={i} className="flex items-center gap-1 whitespace-nowrap shrink-0">
                        <span className="truncate max-w-[80px] sm:max-w-none">{b}</span>
                        {i < breadcrumb.length - 1 && (
                          <ChevronLeft size={12} className="shrink-0" />
                        )}
                      </span>
                    ))}
                  </nav>
                )}
                {title && (
                  <h1 className="text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight truncate">
                    {title}
                  </h1>
                )}
              </div>
              {actions && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
              )}
            </div>
          </div>
        )}
        <main className="flex-1 px-3 sm:px-4 lg:px-8 py-4 lg:py-6 overflow-x-hidden max-w-full">
          {children}
        </main>
        <footer className="hidden lg:flex border-t bg-surface px-6 py-3 text-[11px] text-muted-foreground flex-wrap items-center justify-between gap-2">
          <span>© 1446هـ — ثواب. مستضاف داخل المملكة العربية السعودية.</span>
          <span>نظام خاص لإدارة الجمعيات والجهات الخيرية</span>
        </footer>
      </div>
      <BottomNav onMore={() => setOpen(true)} />
      {AI_ASSISTANT_ENABLED && (
        <>
          <AiFab onClick={() => setAiOpen(true)} />
          <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
        </>
      )}
    </div>
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "success" | "warning" | "destructive" | "info" | "primary";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
    info: "bg-info/15 text-info",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(
  status: string,
): "muted" | "success" | "warning" | "destructive" | "info" | "primary" {
  const s = status.toLowerCase();
  if (
    [
      "مكتمل",
      "معتمد",
      "مرحّل",
      "متصل",
      "نشط",
      "نشطة",
      "مكتملة",
      "تشغيل",
      "مستحق",
      "مستثمر",
      "جاهز",
    ].some((k) => status.includes(k))
  )
    return "success";
  if (
    ["بانتظار", "قيد", "صيانة", "إجازة", "مجدول", "بانتظار التفعيل"].some((k) => status.includes(k))
  )
    return "warning";
  if (["مرفوض", "موقوف", "متأخر"].some((k) => status.includes(k))) return "destructive";
  if (["تم التحويل", "وقف", "منعقد"].some((k) => status.includes(k))) return "info";
  return "muted";
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold truncate">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Btn({
  children,
  variant = "default",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "default" | "primary" | "ghost" | "outline";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const map: Record<string, string> = {
    default: "bg-background border hover:bg-muted",
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    ghost: "hover:bg-muted",
    outline: "border hover:bg-muted",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[36px] ${map[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card mb-4">
      {children}
    </div>
  );
}

export function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <div className="relative">
        <select
          className="appearance-none rounded-lg border bg-background pr-3 pl-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[36px]"
          value={value}
          onChange={onChange}
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
        />
      </div>
    </div>
  );
}

export function Table<T>({
  columns,
  rows,
  renderRow,
}: {
  columns: string[];
  rows: T[];
  renderRow: (row: T, i: number) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-muted/60 text-right">
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap"
              >
                {c}
              </th>
            ))}
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

export function MobileTable<T>({
  columns,
  rows,
  renderRow,
  mobileCard,
}: {
  columns: string[];
  rows: T[];
  renderRow: (row: T, i: number) => ReactNode;
  mobileCard: (row: T, i: number) => ReactNode;
}) {
  return (
    <>
      <div className="hidden lg:block">
        <Table columns={columns} rows={rows} renderRow={renderRow} />
      </div>
      <div className="lg:hidden space-y-3">{rows.map((r, i) => mobileCard(r, i))}</div>
    </>
  );
}

export function MobileKPIGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3 lg:gap-4 mb-4">
      {children}
    </div>
  );
}

export function MobileFilterDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  return (
    <>
      <div
        className={`fixed inset-0 z-[55] bg-black/55 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="التصفية"
        className={`fixed bottom-0 right-0 left-0 z-[60] bg-surface rounded-t-2xl border shadow-elevated transition-transform duration-300 ease-out lg:hidden pb-safe will-change-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "85dvh" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b sticky top-0 bg-surface rounded-t-2xl safe-area-top">
          <span className="font-bold text-base">تصفية</span>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
          >
            <X size={22} />
          </button>
        </div>
        <div
          className="overflow-y-auto overscroll-contain p-5 space-y-4"
          style={{ maxHeight: "calc(85dvh - 64px)" }}
        >
          {children}
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-semibold text-sm min-h-[48px] hover:opacity-90 active:opacity-80 transition-opacity"
          >
            تطبيق التصفية
          </button>
        </div>
      </aside>
    </>
  );
}

export function MobileActionChips({
  items,
}: {
  items: { label: string; icon?: LucideIcon; onClick?: () => void }[];
}) {
  return (
    <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            onClick={item.onClick}
            className="flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-xs font-semibold whitespace-nowrap hover:bg-muted active:bg-muted/80 transition-colors shrink-0 min-h-[36px]"
          >
            {Icon && <Icon size={14} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function MobileActionRow({ children }: { children: ReactNode }) {
  return (
    <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
      {children}
    </div>
  );
}

export function MobileSearchInput({
  placeholder = "بحث...",
  value,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      <Search
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
      <input
        className="w-full rounded-xl border bg-background py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

export function MobilePageHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <div className="lg:hidden flex items-center justify-between mb-3 gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold truncate">{title}</h2>
        {count && <p className="text-xs text-muted-foreground truncate">{count}</p>}
      </div>
      {action}
    </div>
  );
}

export function MobileTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1 flex-nowrap">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[36px] shrink-0 ${
            t === active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
