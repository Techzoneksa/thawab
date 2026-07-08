import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import {
  AppShell,
  Card,
  SectionTitle,
  Btn,
  Badge,
  statusTone,
  Table,
  Td,
  MobileActionChips,
  MobileKPIGrid,
} from "@/components/erp/AppShell";
import {
  KPIS,
  DONATIONS_BY_PROJECT,
  CASH_FLOW_12M,
  TOP_DONORS,
  RECENT_TRANSACTIONS,
  BANK_ACCOUNTS,
  APPROVALS,
  ALERTS,
  fmtSAR,
  fmtNum,
  PROJECTS,
} from "@/data/sample";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Plus,
  Filter,
  TrendingUp,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Info,
  BadgeDollarSign,
  Wallet,
  Users,
  FolderKanban,
  Target,
  Eye,
  FileBarChart,
  Printer,
} from "lucide-react";
import { showToast } from "@/components/erp/actions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات التنفيذية — ثواب" },
      {
        name: "description",
        content:
          "لوحة معلومات تنفيذية للجمعيات الخيرية تعرض التبرعات والمصروفات والمشاريع والمستفيدين.",
      },
    ],
  }),
  component: Dashboard,
});

const KpiIcon: Record<string, React.ComponentType<{ size?: number }>> = {
  primary: BadgeDollarSign,
  success: TrendingUp,
  warning: Wallet,
  info: Users,
};

function KpiCard({ k }: { k: (typeof KPIS)[number] }) {
  const Icon =
    k.unit === "%"
      ? Target
      : k.label.includes("مشاريع")
        ? FolderKanban
        : KpiIcon[k.tone] || BadgeDollarSign;
  const up = k.delta >= 0;
  const value =
    k.unit === "ر.س" ? fmtSAR(k.value) : k.unit === "%" ? `${k.value}%` : fmtNum(k.value);
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground font-medium truncate">{k.label}</div>
          <div className="mt-1 lg:mt-2 text-xl lg:text-2xl font-extrabold tracking-tight truncate">
            {value}
          </div>
          <div
            className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}
          >
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(k.delta)}%
          </div>
        </div>
        <div className="grid h-10 w-10 lg:h-11 lg:w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}

function DonationsByProjectChart() {
  const max = Math.max(...DONATIONS_BY_PROJECT.map((d) => d.value));
  return (
    <div className="space-y-2 lg:space-y-3">
      {DONATIONS_BY_PROJECT.map((d) => (
        <div key={d.name}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium truncate ml-1">{d.name}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{fmtSAR(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-primary to-info"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CashFlowChart() {
  const max = Math.max(...CASH_FLOW_12M.map((c) => Math.max(c.in, c.out)));
  return (
    <div>
      <div className="flex items-end gap-1 lg:gap-2 h-36 lg:h-48">
        {CASH_FLOW_12M.map((c) => (
          <div key={c.m} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end gap-0.5 h-28 lg:h-40">
              <div
                className="flex-1 bg-gradient-to-t from-primary to-info/70 rounded-t transition-all"
                style={{ height: `${(c.in / max) * 100}%` }}
              />
              <div
                className="flex-1 bg-gradient-to-t from-warning/80 to-warning/40 rounded-t transition-all"
                style={{ height: `${(c.out / max) * 100}%` }}
              />
            </div>
            <div className="text-[9px] lg:text-[10px] text-muted-foreground truncate w-full text-center">
              {c.m}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 lg:gap-4 text-xs text-muted-foreground mt-2 lg:mt-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary shrink-0"></span> الواردات
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warning shrink-0"></span> المصروفات
        </span>
        <span className="ms-auto text-[10px]">القيم بالآلاف</span>
      </div>
    </div>
  );
}

const alertIcon = {
  destructive: AlertTriangle,
  warning: BellRing,
  info: Info,
  success: CheckCircle2,
} as const;

function Dashboard() {
  const navigate = useNavigate();
  const exportDashboard = () => {
    const rows = KPIS.map((k) => ({
      المؤشر: k.label,
      القيمة: k.value,
      الوحدة: k.unit,
      التغيير: `${k.delta >= 0 ? "+" : ""}${k.delta}%`,
    }));
    const csv = [
      "المؤشر,القيمة,الوحدة,التغيير",
      ...rows.map((r) => [r.المؤشر, r.القيمة, r.الوحدة, r.التغيير].join(",")),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;bom" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "لوحة-المعلومات.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("تم تصدير لوحة المعلومات", "success");
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "لوحة المعلومات التنفيذية"]}
      title="لوحة المعلومات التنفيذية"
      actions={
        <>
          <Btn variant="outline" onClick={() => navigate({ to: "/approvals" })}>
            <FileBarChart size={15} /> الموافقات
          </Btn>
          <Btn variant="outline" onClick={exportDashboard}>
            <Download size={15} /> تصدير
          </Btn>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Btn variant="primary">
                <Plus size={15} /> إجراء سريع
              </Btn>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[240px]">
              <DropdownMenuItem onSelect={() => navigate({ to: "/donations/new" })}>
                <Plus size={14} /> تسجيل تبرع جديد
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/donors/new" })}>
                <Plus size={14} /> إضافة متبرع جديد
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/beneficiaries/new" })}>
                <Plus size={14} /> تسجيل مستفيد جديد
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/projects/new" })}>
                <Plus size={14} /> إنشاء مشروع جديد
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/finance/journal/new" })}>
                <Plus size={14} /> قيد يومية جديد
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/finance/budgets/new" })}>
                <Plus size={14} /> موازنة جديدة
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/aid/new" })}>
                <Plus size={14} /> صرف مساعدة
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/procurement/requests/new" })}>
                <Plus size={14} /> طلب شراء جديد
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/procurement/orders/new" })}>
                <Plus size={14} /> أمر شراء جديد
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/inventory/items/new" })}>
                <Plus size={14} /> إضافة صنف
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate({ to: "/inventory/stocktake/new" })}>
                <Plus size={14} /> جرد جديد
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/assets/new" })}>
                <Plus size={14} /> تسجيل أصل ثابت
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {/* Mobile quick action chips */}
      <MobileActionChips
        items={[
          { label: "تبرع جديد", icon: Plus, onClick: () => navigate({ to: "/donations" }) },
          {
            label: "مشروع جديد",
            icon: FolderKanban,
            onClick: () => navigate({ to: "/projects" }),
          },
          {
            label: "قيد يومية",
            icon: FileBarChart,
            onClick: () => navigate({ to: "/finance/journal" }),
          },
          { label: "تقرير سريع", icon: Eye, onClick: () => navigate({ to: "/reports" }) },
          { label: "طباعة", icon: Printer, onClick: () => window.print() },
        ]}
      />

      <MobileKPIGrid>
        {KPIS.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </MobileKPIGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        <Card className="p-4 lg:p-5 xl:col-span-2">
          <SectionTitle
            title="التدفق النقدي"
            hint="واردات مقابل مصروفات"
            action={
              <Btn variant="ghost" onClick={exportDashboard}>
                <Download size={14} /> تصدير
              </Btn>
            }
          />
          <CashFlowChart />
        </Card>
        <Card className="p-4 lg:p-5">
          <SectionTitle title="التبرعات حسب المشروع" hint="أعلى 7 مشاريع" />
          <DonationsByProjectChart />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        {/* Recent Transactions - Desktop Table / Mobile Cards */}
        <div className="lg:col-span-2">
          <Card className="p-4 lg:p-5">
            <SectionTitle
              title="آخر العمليات المالية"
              hint="آخر القيود المرحلة"
              action={
                <Btn variant="ghost" onClick={() => navigate({ to: "/finance/journal" })}>
                  عرض الكل
                </Btn>
              }
            />

            {/* Desktop Table */}
            <div className="hidden lg:block">
              <div className="overflow-x-auto -mx-5">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-right text-muted-foreground border-b">
                      <th className="px-5 py-2 font-medium whitespace-nowrap">رقم القيد</th>
                      <th className="px-5 py-2 font-medium whitespace-nowrap">التاريخ</th>
                      <th className="px-5 py-2 font-medium">الوصف</th>
                      <th className="px-5 py-2 font-medium whitespace-nowrap">المبلغ</th>
                      <th className="px-5 py-2 font-medium whitespace-nowrap">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_TRANSACTIONS.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-5 py-3 font-mono text-xs">{t.id}</td>
                        <td className="px-5 py-3 text-muted-foreground">{t.date}</td>
                        <td className="px-5 py-3">{t.desc}</td>
                        <td
                          className={`px-5 py-3 tabular-nums font-semibold ${t.amount >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {t.amount >= 0 ? "+" : ""}
                          {fmtSAR(Math.abs(t.amount))}
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-2">
              {RECENT_TRANSACTIONS.map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-tight line-clamp-2">
                        {t.desc}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.id} · {t.date}
                      </div>
                    </div>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </div>
                  <div
                    className={`mt-2 text-base font-bold tabular-nums ${t.amount >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {fmtSAR(Math.abs(t.amount))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Approval Alerts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="تنبيهات الموافقات" hint="بانتظار إجراءك" />
          <ul className="space-y-2 lg:space-y-3">
            {APPROVALS.slice(0, 4).map((a) => (
              <li
                key={a.id}
                className="rounded-lg border p-3 hover:border-primary transition-colors active:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold leading-tight line-clamp-2 flex-1">
                    {a.subject}
                  </div>
                  <Badge
                    tone={
                      a.priority === "عالية"
                        ? "destructive"
                        : a.priority === "متوسطة"
                          ? "warning"
                          : "muted"
                    }
                  >
                    {a.priority}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {a.requester} · {a.date}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm lg:text-base font-bold tabular-nums">
                    {fmtSAR(a.amount)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => showToast(`تم اعتماد الطلب "${a.subject}" بنجاح`, "success")}
                      className="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-semibold min-h-[32px]"
                    >
                      اعتماد
                    </button>
                    <button
                      onClick={() => showToast(`تم رفض الطلب "${a.subject}"`, "info")}
                      className="rounded-md bg-destructive/15 text-destructive px-3 py-1.5 text-xs font-semibold min-h-[32px]"
                    >
                      رفض
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        {/* Bank Accounts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="الحسابات البنكية" hint="الأرصدة الحالية" />
          <ul className="space-y-2 lg:space-y-3">
            {BANK_ACCOUNTS.map((b) => (
              <li key={b.iban} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold truncate">{b.bank}</div>
                  <span className="tabular-nums font-bold shrink-0">{fmtSAR(b.balance)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{b.type}</div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Top Donors */}
        <Card className="p-4 lg:p-5">
          <SectionTitle
            title="أكبر المتبرعين"
            hint="هذا العام"
            action={
              <Btn variant="ghost" onClick={() => navigate({ to: "/donors" })}>
                الكل
              </Btn>
            }
          />
          <ul className="space-y-2">
            {TOP_DONORS.map((d, i) => (
              <li
                key={d.name}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 active:bg-muted/80"
              >
                <div className="grid h-8 w-8 lg:h-9 lg:w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground">{d.type}</div>
                </div>
                <div className="tabular-nums font-bold text-sm shrink-0">{fmtSAR(d.total)}</div>
              </li>
            ))}
          </ul>
        </Card>

        {/* System Alerts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="تنبيهات النظام" hint="آخر التحديثات" />
          <ul className="space-y-2">
            {ALERTS.map((a, i) => {
              const Icon = alertIcon[a.tone as keyof typeof alertIcon] || Info;
              const color =
                a.tone === "destructive"
                  ? "text-destructive bg-destructive/10"
                  : a.tone === "warning"
                    ? "text-warning-foreground bg-warning/20"
                    : a.tone === "success"
                      ? "text-success bg-success/10"
                      : "text-info bg-info/10";
              return (
                <li key={i} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm">{a.text}</div>
                    <div className="text-[11px] text-muted-foreground">{a.time}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Projects Status */}
      <div className="mt-4 lg:mt-6">
        <Card className="p-4 lg:p-5">
          <SectionTitle
            title="حالة المشاريع"
            hint="نسبة الإنجاز وتنفيذ الميزانية"
            action={
              <Btn variant="ghost" onClick={() => navigate({ to: "/projects" })}>
                عرض جميع المشاريع
              </Btn>
            }
          />

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table
              columns={[
                "المشروع",
                "المدير",
                "الميزانية",
                "المنصرف",
                "التبرعات",
                "المستفيدون",
                "الإنجاز",
                "الحالة",
              ]}
              rows={PROJECTS.slice(0, 6)}
              renderRow={(p) => (
                <>
                  <Td>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{p.id}</div>
                  </Td>
                  <Td className="text-muted-foreground">{p.manager}</Td>
                  <Td className="tabular-nums">{fmtSAR(p.budget)}</Td>
                  <Td className="tabular-nums">{fmtSAR(p.spent)}</Td>
                  <Td className="tabular-nums text-success font-semibold">{fmtSAR(p.donations)}</Td>
                  <Td className="tabular-nums">{fmtNum(p.beneficiaries)}</Td>
                  <Td>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-primary to-info"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">{p.progress}%</span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </Td>
                </>
              )}
            />
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden grid grid-cols-1 gap-3">
            {PROJECTS.slice(0, 6).map((p) => (
              <div key={p.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.manager}</div>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>الميزانية: {fmtSAR(p.budget)}</span>
                  <span className="tabular-nums">{fmtNum(p.beneficiaries)} مستفيد</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-l from-primary to-info"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums font-bold">{p.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
