import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Edit, Printer, Download, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import {
  getBeneficiary,
  getBeneficiarySummary,
  type Beneficiary,
  type AidHistoryItem,
  type LinkedProject,
} from "@/lib/api/beneficiaries";
import { showToast } from "@/components/erp/actions";

export const Route = createFileRoute("/beneficiaries/$id")({
  head: () => ({ meta: [{ title: "ملف المستفيد — ثواب" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState("نظرة عامة");
  const [mobileTab, setMobileTab] = useState("نظرة عامة");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { data: beneficiaryData, isLoading } = useQuery({
    queryKey: ["beneficiary", id],
    queryFn: () => getBeneficiary(id),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["beneficiary-summary", id],
    queryFn: () => getBeneficiarySummary(id),
  });

  const beneficiary: Beneficiary | undefined = beneficiaryData?.item;
  const aidHistory: AidHistoryItem[] = beneficiaryData?.aidHistory || [];
  const linkedProjects: LinkedProject[] = beneficiaryData?.linkedProjects || [];

  const tabs = [
    "نظرة عامة",
    "البيانات الشخصية",
    "البيانات الأسرية",
    "سجل المساعدات",
    "المشاريع المرتبطة",
    "التفاصيل",
  ];

  const activeTab = isMobile ? mobileTab : tab;

  const isSuspended = beneficiary?.status === "موقوف";

  if (isLoading) {
    return (
      <AppShell breadcrumb={["الرئيسية", "المستفيدون"]} title="جاري التحميل...">
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!beneficiary) {
    return (
      <AppShell breadcrumb={["الرئيسية", "المستفيدون"]} title="مستفيد غير موجود">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-3">المستفيد المطلوب غير موجود.</p>
          <Link to="/beneficiaries" className="text-primary font-semibold">
            العودة إلى قائمة المستفيدين
          </Link>
        </Card>
      </AppShell>
    );
  }

  const totalAid = summaryData?.totalAid ?? beneficiary.totalAid ?? 0;
  const aidCount = summaryData?.aidCount ?? beneficiary.aidCount ?? 0;
  const pendingAidCount = summaryData?.pendingAidCount ?? beneficiary.pendingAidCount ?? 0;
  const lastAidDate = summaryData?.lastAidDate ?? beneficiary.lastAidDate ?? null;
  const linkedProjectsCount =
    summaryData?.linkedProjectsCount ?? beneficiary.linkedProjectsCount ?? linkedProjects.length;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المستفيدون", beneficiary.name]}
      title={beneficiary.name}
      actions={
        <>
          <Btn variant="outline" onClick={() => showToast("تم إرسال الملف للطباعة", "info")}>
            <Printer size={15} /> طباعة
          </Btn>
          <Btn variant="outline" onClick={() => showToast("تم تصدير تقرير المستفيد", "info")}>
            <Download size={15} /> تقرير
          </Btn>
          <Btn
            variant="primary"
            onClick={() => showToast("سيتم فتح نموذج تعديل المستفيد قريباً", "info")}
          >
            <Edit size={15} /> تعديل
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3 mb-3 lg:mb-4">
        {[
          { l: "إجمالي المساعدات", v: fmtSAR(totalAid), tone: "text-success" },
          { l: "عدد المساعدات", v: fmtNum(aidCount) },
          {
            l: "مساعدات قيد المعالجة",
            v: fmtNum(pendingAidCount),
            tone: "text-warning-foreground",
          },
          { l: "المشاريع المرتبطة", v: fmtNum(linkedProjectsCount), tone: "text-info" },
          { l: "عدد الأفراد", v: fmtNum(beneficiary.familyMembers || 1) },
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
        <div className="flex items-start gap-3 lg:gap-4">
          <div className="grid h-14 w-14 lg:h-16 lg:w-16 shrink-0 place-items-center rounded-full bg-info/15 text-info text-xl lg:text-2xl font-bold">
            {beneficiary.name?.[0] || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-base lg:text-lg font-bold truncate">{beneficiary.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  رقم الملف: {beneficiary.fileNumber || beneficiary.id}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{beneficiary.category}</span>
                  {beneficiary.city && <span>· {beneficiary.city}</span>}
                  {beneficiary.phone && <span>· {beneficiary.phone}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={statusTone(beneficiary.status)}>{beneficiary.status}</Badge>
                {lastAidDate && (
                  <span className="text-[10px] text-muted-foreground">
                    آخر مساعدة: {lastAidDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {isSuspended && (
        <Card className="mb-3 lg:mb-4 p-3 bg-warning/10 border-warning">
          <div className="flex items-center gap-2 text-sm">
            <Badge tone="warning">موقوف</Badge>
            <span className="text-muted-foreground">
              المستفيد موقوف — لا يمكن تسليم مساعدات جديدة له. المساعدات السابقة محفوظة.
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
              <SectionTitle title="ملخص المستفيد" />
              <div className="space-y-3">
                <SummaryRow label="الحالة" value={beneficiary.status} />
                <SummaryRow label="الفئة" value={beneficiary.category} />
                <SummaryRow label="المدينة" value={beneficiary.city || "—"} />
                <SummaryRow
                  label="عدد الأفراد"
                  value={`${fmtNum(beneficiary.familyMembers || 1)} فرد`}
                />
                <SummaryRow label="الدخل الشهري" value={fmtSAR(beneficiary.monthlyIncome || 0)} />
                <SummaryRow label="الحالة الاجتماعية" value={beneficiary.maritalStatus || "—"} />
              </div>
              {beneficiary.notes && (
                <>
                  <SectionTitle title="ملاحظات" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {beneficiary.notes}
                  </p>
                </>
              )}
            </div>
            <div>
              <SectionTitle title="مؤشرات الاستحقاق" />
              <div className="space-y-3">
                <KPIRow
                  label="نسبة الدخل لتغطية الأسرة"
                  v={
                    beneficiary.familyMembers && beneficiary.familyMembers > 0
                      ? Math.min(
                          100,
                          Math.round(
                            ((beneficiary.monthlyIncome || 0) /
                              (beneficiary.familyMembers * 1000)) *
                              100,
                          ),
                        )
                      : 0
                  }
                />
                <KPIRow label="استفادة من المساعدات" v={aidCount > 0 ? 100 : 0} />
                <KPIRow
                  label="مشاريع مرتبطة"
                  v={linkedProjectsCount > 0 ? Math.min(100, linkedProjectsCount * 25) : 0}
                />
                <KPIRow label="الجاهزية للاستلام" v={beneficiary.status === "مؤهل" ? 100 : 0} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "البيانات الشخصية" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DetailRow label="الاسم" value={beneficiary.name} />
            <DetailRow label="رقم الملف" value={beneficiary.fileNumber || beneficiary.id} />
            <DetailRow label="رقم الهوية" value={beneficiary.idNumber || "—"} />
            <DetailRow label="رقم الجوال" value={beneficiary.phone || "—"} />
            <DetailRow label="المدينة" value={beneficiary.city || "—"} />
            <DetailRow label="العنوان" value={beneficiary.address || "—"} />
            <DetailRow label="الفئة" value={beneficiary.category} />
            <DetailRow label="الحالة" value={beneficiary.status} />
          </div>
        )}

        {activeTab === "البيانات الأسرية" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DetailRow
              label="عدد الأفراد"
              value={`${fmtNum(beneficiary.familyMembers || 1)} فرد`}
            />
            <DetailRow label="الحالة الاجتماعية" value={beneficiary.maritalStatus || "—"} />
            <DetailRow label="الدخل الشهري" value={fmtSAR(beneficiary.monthlyIncome || 0)} />
            <DetailRow
              label="الدخل لكل فرد"
              value={
                beneficiary.familyMembers && beneficiary.familyMembers > 0
                  ? fmtSAR((beneficiary.monthlyIncome || 0) / beneficiary.familyMembers)
                  : "—"
              }
            />
          </div>
        )}

        {activeTab === "سجل المساعدات" && (
          <div>
            {aidHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مساعدات مسجلة لهذا المستفيد.</p>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table
                    columns={["رقم", "النوع", "المبلغ", "المشروع", "الحالة", "التاريخ"]}
                    rows={aidHistory}
                    renderRow={(a: AidHistoryItem) => (
                      <>
                        <Td className="font-mono text-xs">{a.id}</Td>
                        <Td className="text-sm">{a.type}</Td>
                        <Td className="tabular-nums font-bold">{fmtSAR(a.amount)}</Td>
                        <Td className="text-sm text-muted-foreground">{a.projectName || "—"}</Td>
                        <Td>
                          <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        </Td>
                        <Td className="text-muted-foreground text-xs">{a.createdAt}</Td>
                      </>
                    )}
                  />
                </div>
                <div className="lg:hidden space-y-2">
                  {aidHistory.slice(0, 10).map((a: AidHistoryItem) => (
                    <Card key={a.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-base font-bold tabular-nums">{fmtSAR(a.amount)}</div>
                        <div className="text-xs text-muted-foreground">{a.type}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex justify-between">
                        <span>{a.projectName || "—"}</span>
                        <span>{a.createdAt}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "المشاريع المرتبطة" && (
          <div>
            {linkedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد مشاريع مرتبطة بمساعدات لهذا المستفيد.
              </p>
            ) : (
              <>
                <div className="hidden lg:block">
                  <Table
                    columns={["رقم المشروع", "الاسم", "الحالة", ""]}
                    rows={linkedProjects}
                    renderRow={(p: LinkedProject) => (
                      <>
                        <Td className="font-mono text-xs">{p.code || p.id}</Td>
                        <Td className="font-semibold">{p.name}</Td>
                        <Td>
                          {p.status ? <Badge tone={statusTone(p.status)}>{p.status}</Badge> : "—"}
                        </Td>
                        <Td>
                          <Link
                            to="/projects/$id"
                            params={{ id: p.id }}
                            className="text-info text-xs font-semibold inline-flex items-center gap-1"
                          >
                            عرض <ArrowRight size={12} />
                          </Link>
                        </Td>
                      </>
                    )}
                  />
                </div>
                <div className="lg:hidden space-y-2">
                  {linkedProjects.map((p: LinkedProject) => (
                    <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
                      <Card className="p-3 hover:border-primary transition-colors">
                        <div className="text-xs text-muted-foreground font-mono">
                          {p.code || p.id}
                        </div>
                        <div className="text-sm font-bold mt-0.5">{p.name}</div>
                        {p.status && (
                          <div className="mt-1">
                            <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                          </div>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "التفاصيل" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <DetailRow label="المعرّف" value={beneficiary.id} />
            <DetailRow label="رقم الملف" value={beneficiary.fileNumber || "—"} />
            <DetailRow label="الاسم" value={beneficiary.name} />
            <DetailRow label="الحالة" value={beneficiary.status} />
            <DetailRow label="الفئة" value={beneficiary.category} />
            <DetailRow label="رقم الهوية" value={beneficiary.idNumber || "—"} />
            <DetailRow label="الجوال" value={beneficiary.phone || "—"} />
            <DetailRow label="المدينة" value={beneficiary.city || "—"} />
            <DetailRow label="العنوان" value={beneficiary.address || "—"} />
            <DetailRow
              label="عدد الأفراد"
              value={`${fmtNum(beneficiary.familyMembers || 1)} فرد`}
            />
            <DetailRow label="الحالة الاجتماعية" value={beneficiary.maritalStatus || "—"} />
            <DetailRow label="الدخل الشهري" value={fmtSAR(beneficiary.monthlyIncome || 0)} />
            <DetailRow label="أنشأ بواسطة" value={beneficiary.createdBy || "—"} />
            <DetailRow label="تاريخ الإنشاء" value={beneficiary.createdAt || "—"} />
            <DetailRow label="آخر تحديث" value={beneficiary.updatedAt || "—"} />
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function KPIRow({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-bold">{v}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
        <div className="h-full bg-success" style={{ width: `${v}%` }} />
      </div>
    </div>
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
