import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { fmtSAR, fmtNum } from "@/data/sample";
import {
  Edit,
  Printer,
  Download,
  Paperclip,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getProject, getProjectSummary, type Project } from "@/lib/api/projects";
import { showToast } from "@/components/erp/actions";

export const Route = createFileRoute("/projects/$id")({
  head: () => ({ meta: [{ title: "ملف المشروع — ثواب" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("نظرة عامة");
  const [mobileTab, setMobileTab] = useState("نظرة عامة");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProject(id),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["project-summary", id],
    queryFn: () => getProjectSummary(id),
  });

  const project: Project | undefined = projectData?.item;
  const donations = projectData?.donations || [];
  const aid = projectData?.aid || [];
  const beneficiaries = projectData?.beneficiaries || [];

  const tabs = [
    "نظرة عامة",
    "الميزانية",
    "التبرعات",
    "المساعدات",
    "المستفيدون",
    "التفاصيل",
    "سجل التدقيق",
  ];

  const activeTab = isMobile ? mobileTab : tab;

  const isReadOnly = project?.status === "مكتمل" || project?.status === "ملغي";

  if (isLoading) {
    return (
      <AppShell breadcrumb={["الرئيسية", "المشاريع"]} title="جاري التحميل...">
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell breadcrumb={["الرئيسية", "المشاريع"]} title="مشروع غير موجود">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-3">المشروع المطلوب غير موجود.</p>
          <a href="/projects" className="text-primary font-semibold">
            العودة إلى قائمة المشاريع
          </a>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشاريع", project.name]}
      title={project.name}
      actions={
        <>
          <Btn variant="outline" onClick={() => showToast("تم إرسال المشروع للطباعة", "info")}>
            <Printer size={15} /> طباعة
          </Btn>
          <Btn variant="outline" onClick={() => showToast("تم تصدير تقرير المشروع", "info")}>
            <Download size={15} /> تقرير
          </Btn>
          {!isReadOnly && (
            <Btn
              variant="primary"
              onClick={() => navigate({ to: "/projects/$id/edit", params: { id } })}
            >
              <Edit size={15} /> تعديل
            </Btn>
          )}
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3 mb-3 lg:mb-4">
        {[
          {
            l: "الميزانية المعتمدة",
            v: fmtSAR(project.budget),
          },
          {
            l: "إجمالي التبرعات",
            v: fmtSAR(project.donations),
            tone: "text-success",
          },
          {
            l: "إجمالي المنصرف",
            v: fmtSAR(project.spent),
            tone: "text-warning-foreground",
          },
          {
            l: "الرصيد المتاح",
            v: fmtSAR((project.budget > 0 ? project.budget : project.donations) - project.spent),
            tone: "text-primary",
          },
          { l: "المستفيدون", v: fmtNum(project.beneficiaryCount) },
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
        <div className="flex items-center justify-between mb-2 text-xs lg:text-sm flex-wrap gap-2">
          <div>
            <b>نسبة الإنجاز:</b> {project.progress}%
          </div>
          <div className="text-muted-foreground">
            {project.startDate || "—"} ← {project.endDate || "—"}
          </div>
        </div>
        <div className="h-2 lg:h-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-l from-primary to-info"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {["دراسة الجدوى", "التخطيط", "الإطلاق", "التنفيذ", "المتابعة", "الإغلاق"].map((s, i) => (
            <Badge key={s} tone={i < Math.floor(project.progress / 16) ? "success" : "muted"}>
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Status banner */}
      {isReadOnly && (
        <Card className="mb-3 lg:mb-4 p-3 bg-warning/10 border-warning">
          <div className="flex items-center gap-2 text-sm">
            <Badge tone="warning">للقراءة فقط</Badge>
            <span className="text-muted-foreground">
              المشروع بحالة "{project.status}" — لا يمكن التعديل، فقط الطباعة والتصدير.
            </span>
          </div>
        </Card>
      )}

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
                {project.description || "لا يوجد وصف."}
              </p>
              {project.notes && (
                <>
                  <SectionTitle title="ملاحظات" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.notes}</p>
                </>
              )}
            </div>
            <div>
              <SectionTitle title="مؤشرات الأداء" />
              <div className="space-y-3">
                {[
                  {
                    l: "نسبة تحقيق الهدف",
                    v: project.progress,
                  },
                  {
                    l: "كفاءة الصرف",
                    v: project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0,
                  },
                  {
                    l: "الالتزام بالجدول الزمني",
                    v: project.progress,
                  },
                  {
                    l: "نسبة جمع التبرعات",
                    v:
                      project.budget > 0
                        ? Math.round((project.donations / project.budget) * 100)
                        : 0,
                  },
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
                columns={["البند", "المخصص", "المنصرف", "المتبقي", "النسبة"]}
                rows={[
                  {
                    n: "إجمالي الميزانية",
                    b: project.budget,
                    s: project.spent,
                  },
                  {
                    n: "التبرعات المحصلة",
                    b: project.donations,
                    s: project.spent,
                  },
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
                            style={{ width: `${r.b > 0 ? Math.round((r.s / r.b) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">
                          {r.b > 0 ? Math.round((r.s / r.b) * 100) : 0}%
                        </span>
                      </div>
                    </Td>
                  </>
                )}
              />
            </div>
            <div className="lg:hidden space-y-2">
              <Card className="p-3">
                <div className="text-sm font-bold mb-2">إجمالي الميزانية</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">المخصص: </span>
                    <span className="font-semibold">{fmtSAR(project.budget)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المنصرف: </span>
                    <span className="font-semibold">{fmtSAR(project.spent)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المتبقي: </span>
                    <span className="font-semibold text-success">
                      {fmtSAR(project.budget - project.spent)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">النسبة: </span>
                    <span className="font-semibold">
                      {project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "التبرعات" && (
          <div>
            {donations.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تبرعات مرتبطة بهذا المشروع.</p>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table
                    columns={["رقم", "المبلغ", "التاريخ", "الحالة"]}
                    rows={donations}
                    renderRow={(d: any) => (
                      <>
                        <Td className="font-mono text-xs">{d.id}</Td>
                        <Td className="tabular-nums text-success font-bold">{fmtSAR(d.amount)}</Td>
                        <Td>{d.date || d.createdAt}</Td>
                        <Td>
                          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                        </Td>
                      </>
                    )}
                  />
                </div>
                <div className="lg:hidden space-y-2">
                  {donations.slice(0, 10).map((d: any) => (
                    <div key={d.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted-foreground font-mono">{d.id}</div>
                          <div className="text-base font-bold text-success tabular-nums mt-1">
                            {fmtSAR(d.amount)}
                          </div>
                        </div>
                        <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {d.date || d.createdAt}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "المساعدات" && (
          <div>
            {aid.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مساعدات مرتبطة بهذا المشروع.</p>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table
                    columns={["رقم", "المبلغ", "الحالة", "تاريخ التسليم"]}
                    rows={aid}
                    renderRow={(a: any) => (
                      <>
                        <Td className="font-mono text-xs">{a.id}</Td>
                        <Td className="tabular-nums font-bold">{fmtSAR(a.amount)}</Td>
                        <Td>
                          <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        </Td>
                        <Td className="text-muted-foreground text-xs">{a.deliveredAt || a.date}</Td>
                      </>
                    )}
                  />
                </div>
                <div className="lg:hidden space-y-2">
                  {aid.slice(0, 10).map((a: any) => (
                    <Card key={a.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      </div>
                      <div className="text-base font-bold tabular-nums">{fmtSAR(a.amount)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {a.deliveredAt || a.date}
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "المستفيدون" && (
          <div>
            {beneficiaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا يوجد مستفيدون مرتبطون بمساعدات مسلّمة من هذا المشروع.
              </p>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table
                    columns={["الرقم", "الاسم", "الفئة", "المدينة", "الحالة"]}
                    rows={beneficiaries}
                    renderRow={(b: any) => (
                      <>
                        <Td className="font-mono text-xs">{b.id}</Td>
                        <Td className="font-semibold">{b.name}</Td>
                        <Td>{b.category || "—"}</Td>
                        <Td className="text-muted-foreground">{b.city || "—"}</Td>
                        <Td>
                          <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                        </Td>
                      </>
                    )}
                  />
                </div>
                <div className="lg:hidden space-y-2">
                  {beneficiaries.slice(0, 10).map((b: any) => (
                    <div key={b.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-info/15 text-info text-xs font-bold">
                          {b.name[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{b.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {b.category || "—"} · {b.city || "—"}
                          </div>
                        </div>
                        <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "التفاصيل" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DetailRow label="رقم المشروع" value={project.code || project.id} />
            <DetailRow label="اسم المشروع" value={project.name} />
            <DetailRow label="الحالة" value={project.status} />
            <DetailRow label="التصنيف" value={project.category || "—"} />
            <DetailRow label="نوع المشروع" value={project.type || "—"} />
            <DetailRow label="الفرع" value={project.branch || "—"} />
            <DetailRow label="مدير المشروع" value={project.manager || "—"} />
            <DetailRow label="نسبة الإنجاز" value={`${project.progress}%`} />
            <DetailRow label="تاريخ البداية" value={project.startDate || "—"} />
            <DetailRow label="تاريخ النهاية" value={project.endDate || "—"} />
            <DetailRow label="أنشأ بواسطة" value={project.createdBy || "—"} />
            <DetailRow label="تاريخ الإنشاء" value={project.createdAt || "—"} />
          </div>
        )}

        {activeTab === "سجل التدقيق" && (
          <div>
            <p className="text-sm text-muted-foreground">
              يتم تسجيل جميع العمليات على هذا المشروع في سجل التدقيق (إضافة، تعديل، حذف، تغيير
              الحالة).
            </p>
            <div className="mt-4 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              للاطلاع على السجل الكامل، راجع صفحة التقارير أو سجل التدقيق العام.
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b pb-2">
      <span className="text-xs font-semibold text-muted-foreground min-w-[110px]">{label}</span>
      <span className="flex-1 font-semibold">{value}</span>
    </div>
  );
}
