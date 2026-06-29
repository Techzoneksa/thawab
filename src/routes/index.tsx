import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, SectionTitle, Btn, Badge, statusTone, Table, Td } from "@/components/erp/AppShell";
import {
  KPIS, DONATIONS_BY_PROJECT, CASH_FLOW_12M, TOP_DONORS, RECENT_TRANSACTIONS,
  BANK_ACCOUNTS, APPROVALS, ALERTS, fmtSAR, fmtNum, PROJECTS,
} from "@/data/sample";
import {
  ArrowUpRight, ArrowDownRight, Download, Plus, Filter, TrendingUp,
  AlertTriangle, BellRing, CheckCircle2, Info, BadgeDollarSign,
  Wallet, Users, FolderKanban, Target,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات التنفيذية — ثواب" },
      { name: "description", content: "لوحة معلومات تنفيذية للجمعيات الخيرية تعرض التبرعات والمصروفات والمشاريع والمستفيدين." },
    ],
  }),
  component: Dashboard,
});

const KpiIcon: Record<string, any> = { primary: BadgeDollarSign, success: TrendingUp, warning: Wallet, info: Users };

function KpiCard({ k }: { k: typeof KPIS[number] }) {
  const Icon = k.unit === "%" ? Target : k.label.includes("مشاريع") ? FolderKanban : KpiIcon[k.tone] || BadgeDollarSign;
  const up = k.delta >= 0;
  const value = k.unit === "ر.س" ? fmtSAR(k.value) : k.unit === "%" ? `${k.value}%` : fmtNum(k.value);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground font-medium">{k.label}</div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight truncate">{value}</div>
          <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-success" : "text-destructive"}`}>
            {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(k.delta)}% مقارنة بالشهر السابق
          </div>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-${k.tone === "primary" ? "primary" : k.tone === "success" ? "success" : k.tone === "warning" ? "warning" : "info"}/10 text-${k.tone === "warning" ? "warning-foreground" : k.tone}`}>
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}

function DonationsByProjectChart() {
  const max = Math.max(...DONATIONS_BY_PROJECT.map((d) => d.value));
  return (
    <div className="space-y-3">
      {DONATIONS_BY_PROJECT.map((d) => (
        <div key={d.name}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium">{d.name}</span>
            <span className="text-muted-foreground tabular-nums">{fmtSAR(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-l from-primary to-info" style={{ width: `${(d.value / max) * 100}%` }} />
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
      <div className="flex items-end gap-2 h-48">
        {CASH_FLOW_12M.map((c) => (
          <div key={c.m} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end gap-0.5 h-40">
              <div className="flex-1 bg-gradient-to-t from-primary to-info/70 rounded-t" style={{ height: `${(c.in / max) * 100}%` }} title={`واردات: ${c.in}K`} />
              <div className="flex-1 bg-gradient-to-t from-warning/80 to-warning/40 rounded-t" style={{ height: `${(c.out / max) * 100}%` }} title={`مصروفات: ${c.out}K`} />
            </div>
            <div className="text-[10px] text-muted-foreground truncate w-full text-center">{c.m}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary"></span> الواردات</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning"></span> المصروفات</span>
        <span className="ms-auto">القيم بالآلاف ر.س</span>
      </div>
    </div>
  );
}

const alertIcon = { destructive: AlertTriangle, warning: BellRing, info: Info, success: CheckCircle2 } as const;

function Dashboard() {
  return (
    <AppShell
      breadcrumb={["الرئيسية", "لوحة المعلومات التنفيذية"]}
      title="لوحة المعلومات التنفيذية"
      actions={
        <>
          <Btn variant="outline"><Filter size={15} /> تصفية</Btn>
          <Btn variant="outline"><Download size={15} /> تصدير</Btn>
          <Btn variant="primary"><Plus size={15} /> إجراء سريع</Btn>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {KPIS.map((k) => <KpiCard key={k.label} k={k} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-6">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="التدفق النقدي خلال 12 شهراً" hint="واردات مقابل مصروفات (هجري)" action={<Btn variant="ghost"><Download size={14} /> تصدير</Btn>} />
          <CashFlowChart />
        </Card>
        <Card className="p-5">
          <SectionTitle title="التبرعات حسب المشروع" hint="أعلى 7 مشاريع جامعة للتبرعات" />
          <DonationsByProjectChart />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="آخر العمليات المالية" hint="آخر القيود المرحلة وقيد الاعتماد" action={<Btn variant="ghost">عرض الكل</Btn>} />
          <div className="overflow-x-auto -mx-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-right text-muted-foreground border-b">
                  <th className="px-5 py-2 font-medium">رقم القيد</th>
                  <th className="px-5 py-2 font-medium">التاريخ</th>
                  <th className="px-5 py-2 font-medium">الوصف</th>
                  <th className="px-5 py-2 font-medium">المبلغ</th>
                  <th className="px-5 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_TRANSACTIONS.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs">{t.id}</td>
                    <td className="px-5 py-3 text-muted-foreground">{t.date}</td>
                    <td className="px-5 py-3">{t.desc}</td>
                    <td className={`px-5 py-3 tabular-nums font-semibold ${t.amount >= 0 ? "text-success" : "text-destructive"}`}>{t.amount >= 0 ? "+" : ""}{fmtSAR(Math.abs(t.amount))}</td>
                    <td className="px-5 py-3"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="تنبيهات الموافقات" hint="بانتظار إجراءك" />
          <ul className="space-y-3">
            {APPROVALS.slice(0, 4).map((a) => (
              <li key={a.id} className="rounded-lg border p-3 hover:border-primary transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold leading-tight">{a.subject}</div>
                  <Badge tone={a.priority === "عالية" ? "destructive" : a.priority === "متوسطة" ? "warning" : "muted"}>{a.priority}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{a.requester} · {a.date}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs font-semibold tabular-nums">{fmtSAR(a.amount)}</span>
                  <div className="flex gap-1">
                    <button className="rounded-md bg-success/15 text-success px-2 py-1 text-[11px] font-semibold">اعتماد</button>
                    <button className="rounded-md bg-destructive/15 text-destructive px-2 py-1 text-[11px] font-semibold">رفض</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-5">
          <SectionTitle title="ملخص الحسابات البنكية" hint="الأرصدة الحالية" />
          <ul className="space-y-3">
            {BANK_ACCOUNTS.map((b) => (
              <li key={b.iban} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{b.bank}</div>
                  <span className="tabular-nums font-bold">{fmtSAR(b.balance)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{b.type}</div>
                <div className="text-[11px] font-mono text-muted-foreground mt-0.5 truncate">{b.iban}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle title="أكبر المتبرعين" hint="هذا العام" action={<Btn variant="ghost">الكل</Btn>} />
          <ul className="space-y-2">
            {TOP_DONORS.map((d, i) => (
              <li key={d.name} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary font-bold">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground">{d.type} · {d.count} عملية</div>
                </div>
                <div className="tabular-nums font-bold text-sm">{fmtSAR(d.total)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle title="تنبيهات النظام" hint="آخر التحديثات" />
          <ul className="space-y-2">
            {ALERTS.map((a, i) => {
              const Icon = alertIcon[a.tone as keyof typeof alertIcon] || Info;
              const color = a.tone === "destructive" ? "text-destructive bg-destructive/10" : a.tone === "warning" ? "text-warning-foreground bg-warning/20" : a.tone === "success" ? "text-success bg-success/10" : "text-info bg-info/10";
              return (
                <li key={i} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${color}`}><Icon size={16} /></div>
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

      <div className="mt-6">
        <Card className="p-5">
          <SectionTitle title="حالة المشاريع والبرامج" hint="نسبة الإنجاز وتنفيذ الميزانية" action={<Btn variant="ghost">عرض جميع المشاريع</Btn>} />
          <Table
            columns={["المشروع", "المدير", "الميزانية", "المنصرف", "التبرعات", "المستفيدون", "الإنجاز", "الحالة"]}
            rows={PROJECTS.slice(0, 6)}
            renderRow={(p) => (
              <>
                <Td><div className="font-semibold">{p.name}</div><div className="text-[11px] text-muted-foreground font-mono">{p.id}</div></Td>
                <Td className="text-muted-foreground">{p.manager}</Td>
                <Td className="tabular-nums">{fmtSAR(p.budget)}</Td>
                <Td className="tabular-nums">{fmtSAR(p.spent)}</Td>
                <Td className="tabular-nums text-success font-semibold">{fmtSAR(p.donations)}</Td>
                <Td className="tabular-nums">{fmtNum(p.beneficiaries)}</Td>
                <Td>
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-l from-primary to-info" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-xs tabular-nums">{p.progress}%</span>
                  </div>
                </Td>
                <Td><Badge tone={statusTone(p.status)}>{p.status}</Badge></Td>
              </>
            )}
          />
        </Card>
      </div>
    </AppShell>
  );
}
