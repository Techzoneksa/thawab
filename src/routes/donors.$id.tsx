import { createFileRoute, Link } from "@tanstack/react-router";
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
import { DONORS, DONATIONS, fmtSAR } from "@/data/sample";
import {
  Phone,
  Mail,
  MapPin,
  Printer,
  MessageCircle,
  Edit,
  Repeat,
  Check,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  PrintButton,
  PrintStyle,
} from "@/components/erp/actions";

export const Route = createFileRoute("/donors/$id")({
  head: () => ({ meta: [{ title: "ملف المتبرع — ثواب" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const donor = DONORS.find((d) => d.id === id) || DONORS[0];
  const [tab, setTab] = useState("نظرة عامة");
  const [mobileTab, setMobileTab] = useState("نظرة عامة");
  const [editOpen, setEditOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(
    "متبرع منتظم منذ 1443هـ، يفضل التواصل عبر WhatsApp ودعم مشاريع الأيتام بشكل خاص. تم تكريمه في الحفل السنوي 1445.",
  );
  const [tasks, setTasks] = useState([
    { t: "إرسال رسالة شكر على التبرع الأخير", done: false },
    { t: "جدولة مكالمة شكر شخصية", done: true },
    { t: "تحديث بيانات المتبرع", done: false },
    { t: "إرسال تقرير ربع سنوي", done: false },
  ]);
  const [attachments, setAttachments] = useState([
    { n: "بطاقة المتبرع.pdf", s: "1446/05" },
    { n: "خطاب التكريم.pdf", s: "1445/09" },
  ]);
  const tabs = ["نظرة عامة", "التبرعات", "الإيصالات", "المهام", "المرفقات", "ملاحظات"];
  const activeTab = typeof window !== "undefined" && window.innerWidth < 1024 ? mobileTab : tab;
  const setActiveTab =
    typeof window !== "undefined" && window.innerWidth < 1024 ? setMobileTab : setTab;

  const toggleTask = (i: number) => {
    const d = [...tasks];
    d[i] = { ...d[i], done: !d[i].done };
    setTasks(d);
    showToast(d[i].done ? "تم إكمال المهمة" : "تم إلغاء إكمال المهمة", "success");
  };

  const handleAddAttachment = () => {
    setAttachments([{ n: "مرفق جديد.pdf", s: "الآن" }, ...attachments]);
    showToast("تم رفع المرفق بنجاح", "success");
  };

  const handleSaveNotes = () => {
    showToast("تم حفظ الملاحظات بنجاح", "success");
  };

  return (
    <>
      <AppShell
        breadcrumb={["الرئيسية", "المتبرعون", donor.name]}
        title={donor.name}
        actions={
          <>
            <PrintButton label="طباعة" />
            <Btn variant="outline">
              <MessageCircle size={15} />
              تواصل
            </Btn>
            <Btn variant="primary" onClick={() => setEditOpen(true)}>
              <Edit size={15} />
              تعديل
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 lg:gap-4">
          {/* Profile Card */}
          <Card className="p-4 lg:p-5 lg:col-span-1">
            <div className="flex lg:flex-col items-center lg:text-center gap-4 lg:gap-0">
              <div className="grid h-14 w-14 lg:h-20 lg:w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white text-lg lg:text-2xl font-extrabold">
                {donor.name[0]}
              </div>
              <div className="text-right lg:text-center flex-1">
                <h3 className="font-bold text-base lg:text-lg">{donor.name}</h3>
                <div className="text-xs text-muted-foreground font-mono">{donor.id}</div>
                <div className="mt-1.5 flex gap-1.5 flex-wrap lg:justify-center">
                  <Badge tone="info">{donor.type}</Badge>
                  <Badge tone={donor.tag === "ذهبي" ? "warning" : "muted"}>{donor.tag}</Badge>
                  {donor.recurring && <Badge tone="success">متكرر</Badge>}
                </div>
              </div>
            </div>
            <div className="mt-4 lg:mt-5 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone size={14} /> {donor.phone}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail size={14} /> donor@example.sa
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin size={14} /> {donor.city}، المملكة العربية السعودية
              </div>
            </div>
            <div className="mt-4 lg:mt-5 grid grid-cols-2 gap-3 border-t pt-4">
              <div>
                <div className="text-xs text-muted-foreground">إجمالي التبرعات</div>
                <div className="font-bold tabular-nums text-base lg:text-lg">
                  {fmtSAR(donor.total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">عدد العمليات</div>
                <div className="font-bold text-base lg:text-lg">{donor.donations}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">أول تبرع</div>
                <div className="font-semibold text-sm">1443/05/12</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">آخر تبرع</div>
                <div className="font-semibold text-sm">1446/10/12</div>
              </div>
            </div>
          </Card>

          {/* Tabs Section */}
          <div className="lg:col-span-3 space-y-3 lg:space-y-4">
            {/* Desktop tabs */}
            <Card className="px-2 hidden lg:block">
              <div className="flex flex-wrap gap-1 border-b px-2">
                {tabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Card>

            {/* Mobile header */}
            <MobilePageHeader title={donor.name} />

            {/* Mobile tabs */}
            <div className="lg:hidden">
              <MobileTabBar tabs={tabs.slice(0, 4)} active={mobileTab} onChange={setMobileTab} />
            </div>

            <Card className="p-4 lg:p-5">
              {activeTab === "نظرة عامة" && (
                <div>
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    {[
                      { l: "تبرعات هذا العام", v: fmtSAR(620_000) },
                      { l: "متوسط التبرع", v: fmtSAR(Math.round(donor.total / donor.donations)) },
                      { l: "أعلى تبرع", v: fmtSAR(600_000) },
                      { l: "حملات مدعومة", v: "4 حملات" },
                    ].map((s) => (
                      <div key={s.l} className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">{s.l}</div>
                        <div className="font-bold mt-1 tabular-nums text-base">{s.v}</div>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <SectionTitle title="مخطط التبرعات الشهرية" />
                      <div className="flex items-end gap-1 h-28 lg:h-32">
                        {[40, 65, 30, 80, 50, 95, 70, 100, 60, 75, 85, 55].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-gradient-to-t from-primary to-info/70 rounded-t"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "التبرعات" && (
                <div>
                  <div className="hidden lg:block">
                    <Table
                      columns={["رقم", "التاريخ", "المشروع", "المبلغ", "الطريقة", "الحالة"]}
                      rows={DONATIONS.slice(0, 6)}
                      renderRow={(d) => (
                        <>
                          <Td className="font-mono text-xs">{d.id}</Td>
                          <Td>{d.date}</Td>
                          <Td>{d.project}</Td>
                          <Td className="tabular-nums font-bold">{fmtSAR(d.amount)}</Td>
                          <Td>{d.method}</Td>
                          <Td>
                            <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                          </Td>
                        </>
                      )}
                    />
                  </div>
                  <div className="lg:hidden space-y-2">
                    {DONATIONS.slice(0, 6).map((d) => (
                      <div key={d.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold">{d.project}</div>
                            <div className="text-xs text-muted-foreground">
                              {d.date} · {d.method}
                            </div>
                          </div>
                          <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                        </div>
                        <div className="mt-2 text-base font-bold text-success tabular-nums">
                          {fmtSAR(d.amount)}
                        </div>
                      </div>
                    ))}
                    <Link
                      to="/donations"
                      className="block text-center text-sm text-primary font-semibold py-2 min-h-[44px]"
                    >
                      عرض الكل
                    </Link>
                  </div>
                </div>
              )}

              {activeTab === "الإيصالات" && (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="flex flex-col lg:flex-row lg:items-center justify-between rounded-lg border p-3 gap-2"
                    >
                      <div>
                        <div className="font-semibold">إيصال رقم RCT-2406-0{n}88</div>
                        <div className="text-xs text-muted-foreground">
                          صادر بتاريخ 1446/10/{12 - n} · بمبلغ {fmtSAR(250_000 - n * 10000)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Btn variant="outline">
                          <Printer size={14} />
                          طباعة
                        </Btn>
                        <Btn variant="ghost">تنزيل PDF</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "المهام" && (
                <div className="space-y-2">
                  {tasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 min-h-[44px]"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => toggleTask(i)}
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${task.done ? "bg-success border-success text-white" : "bg-muted"}`}
                        >
                          {task.done && <CheckCircle2 size={14} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`font-semibold text-sm truncate ${task.done ? "line-through text-muted-foreground" : ""}`}
                          >
                            {task.t}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <textarea
                      className="flex-1 rounded-lg border bg-background p-3 text-sm min-h-[44px]"
                      placeholder="أضف مهمة جديدة..."
                    />
                    <Btn
                      variant="primary"
                      onClick={() => showToast("تم إضافة المهمة بنجاح", "success")}
                    >
                      إضافة
                    </Btn>
                  </div>
                </div>
              )}

              {activeTab === "المرفقات" && (
                <div className="space-y-2">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Upload size={14} className="shrink-0" /> {a.n}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{a.s}</span>
                        <Btn variant="ghost" size="sm">
                          <Printer size={12} />
                        </Btn>
                      </div>
                    </div>
                  ))}
                  <Btn variant="outline" className="w-full mt-2" onClick={handleAddAttachment}>
                    <Upload size={15} /> رفع مرفق
                  </Btn>
                </div>
              )}
            </Card>
          </div>
        </div>
      </AppShell>

      <EntityFormDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل بيانات المتبرع"
        onSave={() => {
          showToast("تم تحديث بيانات المتبرع بنجاح", "success");
          setEditOpen(false);
        }}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            defaultValue={donor.name}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الجوال</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            defaultValue={donor.phone}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">البريد الإلكتروني</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            defaultValue="donor@example.sa"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">المدينة</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            defaultValue={donor.city}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الوسم</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            defaultValue={donor.tag}
          >
            <option>ذهبي</option>
            <option>فضي</option>
            <option>برونزي</option>
          </select>
        </div>
      </EntityFormDrawer>
      <PrintStyle />
    </>
  );
}
