import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  Table,
  Td,
  statusTone,
  SectionTitle,
  MobileTabBar,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { PROJECTS, BENEFICIARIES, DONATIONS, fmtSAR, fmtNum } from "@/data/sample";
import { Edit, Printer, Download, Paperclip } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "ملف المشروع — ثواب" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const p = PROJECTS.find((x) => x.id === id) || PROJECTS[0];
  const [tab, setTab] = useState("نظرة عامة");
  const [mobileTab, setMobileTab] = useState("نظرة عامة");
  const tabs = [
    "نظرة عامة",
    "الميزانية",
    "التبرعات",
    "المصروفات",
    "المستفيدون",
    "المهام",
    "التقارير",
    "المرفقات",
    "سجل التدقيق",
  ];
  const activeTab = typeof window !== "undefined" && window.innerWidth < 1024 ? mobileTab : tab;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع", p.name]}
      title={p.name}
      actions={
        <>
          <Btn variant="outline">
            <Printer size={15} />
            طباعة
          </Btn>
          <Btn variant="outline">
            <Download size={15} />
            تقرير المشروع
          </Btn>
          <Btn variant="primary">
            <Edit size={15} />
            تعديل
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3 mb-3 lg:mb-4">
        {[
          { l: "الميزانية المعتمدة", v: fmtSAR(p.budget) },
          { l: "إجمالي التبرعات", v: fmtSAR(p.donations), tone: "text-success" },
          { l: "إجمالي المنصرف", v: fmtSAR(p.spent), tone: "text-warning-foreground" },
          { l: "الرصيد المتاح", v: fmtSAR(p.donations - p.spent), tone: "text-primary" },
          { l: "المستفيدون", v: fmtNum(p.beneficiaries) },
        ].map((s) => (
          <Card key={s.l} className="p-3 lg:p-4">
            <div className="text-[10px] lg:text-xs text-muted-foreground truncate">{s.l}</div>
            <div
              className={`text-sm lg:text-lg font-extrabold mt-0.5 tabular-nums truncate ${s.tone || ""}`}
            >
              {s.v}
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-3 lg:mb-4 p-4 lg:p-5">
        <div className="flex items-center justify-between mb-2 text-xs lg:text-sm">
          <div>
            <b>نسبة الإنجاز:</b> {p.progress}%
          </div>
          <div className="text-muted-foreground">
            {p.start} ← {p.end}
          </div>
        </div>
        <div className="h-2 lg:h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-primary to-info"
            style={{ width: `${p.progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {["دراسة الجدوى", "التخطيط", "الإطلاق", "التنفيذ", "المتابعة", "الإغلاق"].map((s, i) => (
            <Badge key={s} tone={i < Math.floor(p.progress / 16) ? "success" : "muted"}>
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Desktop tabs */}
      <Card className="px-2 hidden lg:block">
        <div className="flex flex-wrap gap-1 border-b px-2 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Card>

      {/* Mobile tabs */}
      <div className="lg:hidden mb-3">
        <MobileTabBar tabs={tabs.slice(0, 5)} active={mobileTab} onChange={setMobileTab} />
      </div>

      <Card className="p-4 lg:p-5">
        {activeTab === "نظرة عامة" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
            <div>
              <SectionTitle title="وصف المشروع" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.name} هو أحد المشاريع الاستراتيجية للجمعية ويهدف إلى دعم{" "}
                {fmtNum(p.beneficiaries)} مستفيد من خلال تقديم خدمات نوعية ومستدامة. يدير المشروع
                الأستاذ {p.manager} ضمن إدارة المشاريع، ويتبع منهجية تنفيذ مرحلية مع متابعة دورية
                لمؤشرات الأداء وقياس الأثر.
              </p>
            </div>
            <div>
              <SectionTitle title="مؤشرات الأداء KPIs" />
              <div className="space-y-3">
                {[
                  { l: "نسبة تحقيق الهدف", v: 68 },
                  { l: "كفاءة الصرف", v: 84 },
                  { l: "رضا المستفيدين", v: 92 },
                  { l: "الالتزام بالجدول الزمني", v: 76 },
                ].map((k) => (
                  <div key={k.l}>
                    <div className="flex justify-between text-xs">
                      <span>{k.l}</span>
                      <span className="font-bold">{k.v}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full bg-success" style={{ width: `${k.v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "الميزانية" && (
          <div>
            <div className="hidden lg:block">
              <Table
                columns={["البند", "الميزانية المعتمدة", "المنصرف", "المتبقي", "النسبة"]}
                rows={[
                  { n: "مواد إغاثية", b: 1_200_000, s: 820_000 },
                  { n: "تشغيل ولوجستيات", b: 600_000, s: 420_000 },
                  { n: "متابعة ميدانية", b: 320_000, s: 180_000 },
                  { n: "إعلام وتسويق", b: 180_000, s: 90_000 },
                  { n: "إدارية", b: 280_000, s: 140_000 },
                ]}
                renderRow={(r) => (
                  <>
                    <Td className="font-semibold">{r.n}</Td>
                    <Td className="tabular-nums">{fmtSAR(r.b)}</Td>
                    <Td className="tabular-nums">{fmtSAR(r.s)}</Td>
                    <Td className="tabular-nums text-success">{fmtSAR(r.b - r.s)}</Td>
                    <Td>
                      <div className="flex items-center gap-2 w-32">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${(r.s / r.b) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">
                          {Math.round((r.s / r.b) * 100)}%
                        </span>
                      </div>
                    </Td>
                  </>
                )}
              />
            </div>
            <div className="lg:hidden space-y-2">
              {[
                { n: "مواد إغاثية", b: 1_200_000, s: 820_000 },
                { n: "تشغيل ولوجستيات", b: 600_000, s: 420_000 },
                { n: "متابعة ميدانية", b: 320_000, s: 180_000 },
                { n: "إعلام وتسويق", b: 180_000, s: 90_000 },
                { n: "إدارية", b: 280_000, s: 140_000 },
              ].map((r) => (
                <div key={r.n} className="rounded-lg border p-3">
                  <div className="text-sm font-bold">{r.n}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">المعتمد: </span>
                      <span className="font-semibold">{fmtSAR(r.b)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">المنصرف: </span>
                      <span className="font-semibold">{fmtSAR(r.s)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">المتبقي: </span>
                      <span className="font-semibold text-success">{fmtSAR(r.b - r.s)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">النسبة: </span>
                      <span className="font-semibold">{Math.round((r.s / r.b) * 100)}%</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(r.s / r.b) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "التبرعات" && (
          <div>
            <div className="hidden lg:block">
              <Table
                columns={["رقم", "المتبرع", "المبلغ", "التاريخ", "الحالة"]}
                rows={DONATIONS.slice(0, 5)}
                renderRow={(d) => (
                  <>
                    <Td className="font-mono text-xs">{d.id}</Td>
                    <Td>{d.donor}</Td>
                    <Td className="tabular-nums text-success font-bold">{fmtSAR(d.amount)}</Td>
                    <Td>{d.date}</Td>
                    <Td>
                      <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                    </Td>
                  </>
                )}
              />
            </div>
            <div className="lg:hidden space-y-2">
              {DONATIONS.slice(0, 5).map((d) => (
                <div key={d.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{d.donor}</div>
                      <div className="text-xs text-muted-foreground">{d.date}</div>
                    </div>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </div>
                  <div className="mt-2 text-base font-bold text-success tabular-nums">
                    {fmtSAR(d.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "المصروفات" && (
          <div className="text-sm text-muted-foreground">
            عرض تفصيلي لقيود الصرف المرتبطة بالمشروع — مرتبط مباشرة بمركز التكلفة ودفتر الأستاذ.
          </div>
        )}

        {activeTab === "المستفيدون" && (
          <div>
            <div className="hidden lg:block">
              <Table
                columns={["الرقم", "الاسم", "الفئة", "المدينة", "الحالة"]}
                rows={BENEFICIARIES.slice(0, 5)}
                renderRow={(b) => (
                  <>
                    <Td className="font-mono text-xs">{b.id}</Td>
                    <Td className="font-semibold">{b.name}</Td>
                    <Td>{b.category}</Td>
                    <Td className="text-muted-foreground">{b.city}</Td>
                    <Td>
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </Td>
                  </>
                )}
              />
            </div>
            <div className="lg:hidden space-y-2">
              {BENEFICIARIES.slice(0, 5).map((b) => (
                <div key={b.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info/15 text-info text-xs font-bold">
                      {b.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.category} · {b.city}
                      </div>
                    </div>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "المهام" && (
          <div className="space-y-2">
            {[
              {
                t: "إعداد الخطة التنفيذية للربع القادم",
                who: "فهد العتيبي",
                due: "1446/10/20",
                s: "قيد التنفيذ",
              },
              { t: "توقيع عقد المورد الرئيسي", who: "خالد الدوسري", due: "1446/10/18", s: "مكتمل" },
              {
                t: "زيارة ميدانية - منطقة عسير",
                who: "منى السلمي",
                due: "1446/10/25",
                s: "بانتظار الموافقة",
              },
            ].map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-3 min-h-[44px]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <label className="flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0">
                    <input type="checkbox" defaultChecked={t.s === "مكتمل"} className="shrink-0" />
                  </label>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{t.t}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.who} · يستحق {t.due}
                    </div>
                  </div>
                </div>
                <Badge tone={statusTone(t.s)}>{t.s}</Badge>
              </div>
            ))}
          </div>
        )}

        {activeTab === "التقارير" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "التقرير الربعي 1446-Q3",
              "تقرير الأثر الاجتماعي",
              "ملخص الميزانية والتنفيذ",
              "تقرير المستفيدين",
            ].map((n) => (
              <Card key={n} className="p-3 flex items-center justify-between">
                <span className="text-sm font-semibold truncate ml-2">{n}</span>
                <Btn variant="ghost">
                  <Download size={14} />
                </Btn>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "المرفقات" && (
          <div className="space-y-2">
            {[
              "موافقة المجلس.pdf",
              "خطة المشروع.docx",
              "صور ميدانية - رمضان.zip",
              "عقد المورد الرئيسي.pdf",
            ].map((f) => (
              <div
                key={f}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <span className="flex items-center gap-2 truncate">
                  <Paperclip size={14} className="shrink-0" /> {f}
                </span>
                <Btn variant="ghost">
                  <Download size={14} />
                </Btn>
              </div>
            ))}
          </div>
        )}

        {activeTab === "سجل التدقيق" && (
          <div>
            <ol className="relative border-r-2 border-muted pr-4 space-y-3 text-sm">
              {[
                { d: "1446/10/12 11:24", w: "سارة الزهراني", a: "تحديث ميزانية بند مواد إغاثية" },
                { d: "1446/10/10 09:11", w: "فهد العتيبي", a: "اعتماد خطة الربع الثالث" },
                { d: "1446/10/05 14:02", w: "سعد الغامدي", a: "ترحيل قيد توزيع مساعدات" },
              ].map((it, i) => (
                <li key={i} className="relative">
                  <span className="absolute -right-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
                  <div className="font-semibold">{it.a}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.w} · {it.d}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
