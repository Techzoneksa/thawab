import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { fmtSAR, fmtNum } from "@/data/sample";
import { getProjects, type Project } from "@/lib/api/projects";
import { getDonors } from "@/lib/api/donors";
import { getBeneficiaries } from "@/lib/api/beneficiaries";
import { getIncomeExpense } from "@/lib/api/financial-statements";
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
  TrendingUp,
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

interface DonationStats {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  byChannel: Record<string, number>;
  byCampaign: Record<string, number>;
  topDonors: Array<{ id: string; name: string; total: number; count: number }>;
}

type Kpi = {
  label: string;
  value: number;
  unit: "ر.س" | "%" | "";
  delta: number;
  tone: string;
};

const KpiIcon: Record<string, React.ComponentType<{ size?: number }>> = {
  primary: BadgeDollarSign,
  success: TrendingUp,
  warning: Wallet,
  info: Users,
};

function CardEmpty({ text = "لا توجد بيانات بعد" }: { text?: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function KpiCard({ k }: { k: Kpi }) {
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
          {k.delta !== 0 && (
            <div
              className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}
            >
              {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(k.delta)}%
            </div>
          )}
        </div>
        <div className="grid h-10 w-10 lg:h-11 lg:w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}

function DonationsByProjectChart({ items }: { items: Array<{ name: string; value: number }> }) {
  if (items.length === 0) return <CardEmpty />;
  const max = Math.max(...items.map((d) => d.value), 1);
  return (
    <div className="space-y-2 lg:space-y-3">
      {items.map((d) => (
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

function Dashboard() {
  const navigate = useNavigate();

  const { data: donationStats } = useQuery({
    queryKey: ["dashboard", "donation-stats"],
    queryFn: async (): Promise<DonationStats> => {
      const res = await fetch("/api/donations?stats=1");
      if (!res.ok) throw new Error("فشل في جلب إحصائيات التبرعات");
      return res.json();
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: () => getProjects({ limit: 100 }),
  });

  const { data: donorsData } = useQuery({
    queryKey: ["dashboard", "donors-count"],
    queryFn: () => getDonors({ limit: 1 }),
  });

  const { data: beneficiariesData } = useQuery({
    queryKey: ["dashboard", "beneficiaries-count"],
    queryFn: () => getBeneficiaries({ limit: 1 }),
  });

  const { data: incomeExpense } = useQuery({
    queryKey: ["dashboard", "income-expense"],
    queryFn: () => getIncomeExpense({}),
  });

  const ie = incomeExpense && incomeExpense.type === "income-expense" ? incomeExpense : null;
  const totalRevenue = ie?.totals.totalRevenue ?? 0;
  const totalExpense = ie?.totals.totalExpense ?? 0;

  const projects: Project[] = projectsData?.items ?? [];
  const topDonors = donationStats?.topDonors ?? [];

  const donationsByProject = [...projects]
    .filter((p) => (p.donations ?? 0) > 0)
    .sort((a, b) => (b.donations ?? 0) - (a.donations ?? 0))
    .slice(0, 7)
    .map((p) => ({ name: p.name, value: p.donations ?? 0 }));

  const kpis: Kpi[] = [
    {
      label: "إجمالي التبرعات",
      value: donationStats?.totalAmount ?? 0,
      unit: "ر.س",
      delta: 0,
      tone: "primary",
    },
    {
      label: "عدد المتبرعين",
      value: donorsData?.total ?? 0,
      unit: "",
      delta: 0,
      tone: "info",
    },
    {
      label: "عدد المشاريع",
      value: projectsData?.total ?? 0,
      unit: "",
      delta: 0,
      tone: "success",
    },
    {
      label: "عدد المستفيدين",
      value: beneficiariesData?.total ?? 0,
      unit: "",
      delta: 0,
      tone: "info",
    },
    {
      label: "إجمالي الإيرادات",
      value: totalRevenue,
      unit: "ر.س",
      delta: 0,
      tone: "success",
    },
    {
      label: "إجمالي المصروفات",
      value: totalExpense,
      unit: "ر.س",
      delta: 0,
      tone: "warning",
    },
  ];

  const exportDashboard = () => {
    const rows = kpis.map((k) => ({
      المؤشر: k.label,
      القيمة: k.value,
      الوحدة: k.unit || "عدد",
    }));
    const csv = [
      "المؤشر,القيمة,الوحدة",
      ...rows.map((r) => [r.المؤشر, r.القيمة, r.الوحدة].join(",")),
    ].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;bom" });
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
        {kpis.map((k) => (
          <KpiCard key={k.label} k={k} />
        ))}
      </MobileKPIGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        <Card className="p-4 lg:p-5 xl:col-span-2">
          <SectionTitle title="التدفق النقدي" hint="واردات مقابل مصروفات" />
          <CardEmpty />
        </Card>
        <Card className="p-4 lg:p-5">
          <SectionTitle title="التبرعات حسب المشروع" hint="أعلى 7 مشاريع" />
          <DonationsByProjectChart items={donationsByProject} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        {/* Recent Transactions */}
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
            <CardEmpty />
          </Card>
        </div>

        {/* Approval Alerts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="تنبيهات الموافقات" hint="بانتظار إجراءك" />
          <CardEmpty />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4 mt-4 lg:mt-6">
        {/* Bank Accounts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="الحسابات البنكية" hint="الأرصدة الحالية" />
          <CardEmpty />
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
          {topDonors.length === 0 ? (
            <CardEmpty />
          ) : (
            <ul className="space-y-2">
              {topDonors.slice(0, 5).map((d, i) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 active:bg-muted/80"
                >
                  <div className="grid h-8 w-8 lg:h-9 lg:w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtNum(d.count)} تبرع</div>
                  </div>
                  <div className="tabular-nums font-bold text-sm shrink-0">{fmtSAR(d.total)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* System Alerts */}
        <Card className="p-4 lg:p-5">
          <SectionTitle title="تنبيهات النظام" hint="آخر التحديثات" />
          <CardEmpty />
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

          {projects.length === 0 ? (
            <CardEmpty />
          ) : (
            <>
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
                  rows={projects.slice(0, 6)}
                  renderRow={(p) => (
                    <>
                      <Td>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{p.id}</div>
                      </Td>
                      <Td className="text-muted-foreground">{p.manager}</Td>
                      <Td className="tabular-nums">{fmtSAR(p.budget)}</Td>
                      <Td className="tabular-nums">{fmtSAR(p.spent)}</Td>
                      <Td className="tabular-nums text-success font-semibold">
                        {fmtSAR(p.donations ?? 0)}
                      </Td>
                      <Td className="tabular-nums">{fmtNum(p.beneficiaryCount ?? 0)}</Td>
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
                {projects.slice(0, 6).map((p) => (
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
                      <span className="tabular-nums">
                        {fmtNum(p.beneficiaryCount ?? 0)} مستفيد
                      </span>
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
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
