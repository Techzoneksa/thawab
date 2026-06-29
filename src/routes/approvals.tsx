import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  Table,
  Td,
  statusTone,
  MobileTabBar,
  MobileFilterDrawer,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { APPROVALS, fmtSAR } from "@/data/sample";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Inbox,
  Clock,
  Filter,
  ArrowLeft,
  Download,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  PrintButton,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "صندوق الموافقات — ثواب" }] }),
  component: Page,
});

function Page() {
  const [tab, setTab] = useState("بانتظار موافقتي");
  const [filterOpen, setFilterOpen] = useState(false);
  const [approvals, setApprovals] = useState(
    APPROVALS.map((a) => ({ ...a, status: "بانتظار الموافقة" as string })),
  );
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [priorityFilter, setPriorityFilter] = useState("الكل");

  const tabs = [
    { name: "بانتظار موافقتي", count: 12, icon: Inbox },
    { name: "قمت بإنشائها", count: 8, icon: Clock },
    { name: "معتمدة", count: 142 },
    { name: "مرفوضة", count: 6 },
    { name: "مُعادة للتصحيح", count: 3 },
  ];
  const tabNames = tabs.map((t) => t.name);
  const [mobileTab, setMobileTab] = useState(tabNames[0]);

  const filtered = approvals.filter((a) => {
    if (typeFilter !== "الكل" && a.type !== typeFilter) return false;
    if (priorityFilter !== "الكل" && a.priority !== priorityFilter) return false;
    if (tab === "معتمدة" && a.status !== "معتمد") return false;
    if (tab === "مرفوضة" && a.status !== "مرفوض") return false;
    if (tab === "مُعادة للتصحيح" && a.status !== "مُعاد") return false;
    if (tab === "بانتظار موافقتي" && a.status !== "بانتظار الموافقة") return false;
    return true;
  });

  const handleApprove = (id: string) => {
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "معتمد" } : a)));
    showToast("تم اعتماد الطلب بنجاح", "success");
  };

  const handleReject = (id: string) => {
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "مرفوض" } : a)));
    showToast("تم رفض الطلب", "success");
  };

  const handleReturn = (id: string) => {
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "مُعاد" } : a)));
    showToast("تم إرجاع الطلب للتصحيح", "info");
  };

  const openNote = (id: string) => {
    setNoteTarget(id);
    setNoteText("");
    setNoteOpen(true);
  };

  const handleSaveNote = () => {
    if (noteText.trim()) {
      showToast(`تم إضافة الملاحظة: ${noteText}`, "info");
      setNoteOpen(false);
      setNoteText("");
    } else {
      showToast("الرجاء كتابة الملاحظة", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الموافقات"]}
      title="صندوق الموافقات"
      actions={
        <>
          <ExportButton data={approvals} filename="الموافقات.csv" />
          <PrintButton />
          <Btn variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter size={15} />
            تصفية
          </Btn>
          <Btn variant="primary" onClick={() => showToast("تم اعتماد الطلبات المحددة", "success")}>
            اعتماد المحدد
          </Btn>
        </>
      }
    >
      <div className="hidden lg:flex flex-wrap items-center gap-1 border-b mb-4">
        {tabs.map((t) => (
          <button
            key={t.name}
            onClick={() => setTab(t.name)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.name}{" "}
            <span className="mr-1 text-xs rounded-full bg-muted px-2 py-0.5">{t.count}</span>
          </button>
        ))}
      </div>

      <MobilePageHeader title="صندوق الموافقات" />

      <div className="lg:hidden mb-3">
        <MobileTabBar tabs={tabNames} active={mobileTab} onChange={setMobileTab} />
      </div>

      <FilterBar>
        <Select
          label="النوع"
          options={["الكل", "قيد يومية", "طلب شراء", "مساعدة", "ميزانية مشروع", "فاتورة مورد"]}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
        <Select
          label="الأولوية"
          options={["الكل", "عالية", "متوسطة", "منخفضة"]}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        />
        <Select label="المُنشِئ" options={["الكل", "محاسب", "مشتريات", "باحث", "م. المشاريع"]} />
        <Select label="الفترة" options={["اليوم", "هذا الأسبوع", "هذا الشهر"]} />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 lg:gap-4">
        <div className="lg:col-span-3 space-y-3">
          {filtered.length === 0 && (
            <EmptyState title="لا توجد موافقات" description="جميع الطلبات تمت معالجتها" />
          )}
          {filtered.map((a, i) => (
            <Card key={a.id} className="p-3 lg:p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  defaultChecked={i === 0 && a.status === "بانتظار الموافقة"}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>
                    <Badge tone="primary">{a.type}</Badge>
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
                    {a.status !== "بانتظار الموافقة" && (
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    )}
                  </div>
                  <h4 className="mt-1 font-semibold text-sm">{a.subject}</h4>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {a.requester} · المستوى: {a.level} · {a.date}
                  </div>
                  <div className="mt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <span className="tabular-nums font-bold text-base lg:text-lg">
                      {fmtSAR(a.amount)}
                    </span>
                    {a.status === "بانتظار الموافقة" && (
                      <>
                        <div className="hidden lg:flex gap-2">
                          <button
                            onClick={() => handleApprove(a.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 text-success px-3 py-1.5 text-xs font-semibold hover:bg-success/25 min-h-[32px]"
                          >
                            <CheckCircle2 size={14} /> اعتماد
                          </button>
                          <button
                            onClick={() => handleReturn(a.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-warning/20 text-warning-foreground px-3 py-1.5 text-xs font-semibold hover:bg-warning/30 min-h-[32px]"
                          >
                            <RotateCcw size={14} /> إعادة
                          </button>
                          <button
                            onClick={() => handleReject(a.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 text-destructive px-3 py-1.5 text-xs font-semibold hover:bg-destructive/25 min-h-[32px]"
                          >
                            <XCircle size={14} /> رفض
                          </button>
                          <button
                            onClick={() => openNote(a.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted min-h-[32px]"
                          >
                            <ArrowLeft size={14} /> إضافة ملاحظة
                          </button>
                        </div>
                        <div className="lg:hidden grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleApprove(a.id)}
                            className="rounded-lg bg-success/15 text-success py-2.5 text-xs font-semibold min-h-[36px]"
                          >
                            <CheckCircle2 size={14} className="inline ml-1" /> اعتماد
                          </button>
                          <button
                            onClick={() => handleReject(a.id)}
                            className="rounded-lg bg-destructive/15 text-destructive py-2.5 text-xs font-semibold min-h-[36px]"
                          >
                            <XCircle size={14} className="inline ml-1" /> رفض
                          </button>
                          <button
                            onClick={() => handleReturn(a.id)}
                            className="rounded-lg bg-warning/20 text-warning-foreground py-2.5 text-xs font-semibold min-h-[36px]"
                          >
                            <RotateCcw size={14} className="inline ml-1" /> إعادة
                          </button>
                          <button
                            onClick={() => openNote(a.id)}
                            className="rounded-lg border py-2.5 text-xs font-semibold min-h-[36px]"
                          >
                            ملاحظة
                          </button>
                        </div>
                      </>
                    )}
                    {a.status !== "بانتظار الموافقة" && (
                      <div className="text-xs text-muted-foreground">تمت المعالجة · {a.status}</div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="hidden lg:block lg:col-span-2 p-5 h-fit sticky top-20">
          <h3 className="font-bold mb-1">{APPROVALS[0].subject}</h3>
          <p className="text-xs text-muted-foreground">
            {APPROVALS[0].id} · {APPROVALS[0].type}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">المبلغ</div>
              <div className="font-bold tabular-nums">{fmtSAR(APPROVALS[0].amount)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">مقدم الطلب</div>
              <div className="font-semibold">{APPROVALS[0].requester}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">المركز</div>
              <div>المركز المالي 41</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">المشروع</div>
              <div>السلال الغذائية الشهرية</div>
            </div>
          </div>

          <div className="mt-5">
            <h4 className="font-semibold text-sm mb-3">مسار الاعتماد</h4>
            <ol className="relative border-r-2 border-muted pr-4 space-y-4">
              {[
                {
                  who: "محاسب: سارة الزهراني",
                  when: "أمس 16:40",
                  state: "تم الإنشاء",
                  tone: "success" as const,
                },
                {
                  who: "محاسب أول: محمد الغامدي",
                  when: "اليوم 09:12",
                  state: "تمت المراجعة",
                  tone: "success" as const,
                },
                {
                  who: "المدير المالي: سعد الغامدي",
                  when: "بانتظار",
                  state: "بانتظار الاعتماد",
                  tone: "warning" as const,
                },
                { who: "المدير التنفيذي", when: "—", state: "غير مفعّل", tone: "muted" as const },
              ].map((s, i) => (
                <li key={i} className="relative">
                  <span
                    className={`absolute -right-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-card ${s.tone === "success" ? "bg-success" : s.tone === "warning" ? "bg-warning" : "bg-muted-foreground/40"}`}
                  />
                  <div className="text-sm font-semibold">{s.who}</div>
                  <div className="text-xs text-muted-foreground">{s.when}</div>
                  <Badge tone={s.tone}>{s.state}</Badge>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5">
            <h4 className="font-semibold text-sm mb-2">ملاحظات</h4>
            <textarea
              rows={3}
              className="w-full rounded-lg border bg-background p-2 text-sm"
              placeholder="اكتب ملاحظتك على الموافقة..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Btn variant="outline" onClick={() => setNoteText("")}>
                حفظ كمسودة
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  if (noteText.trim()) {
                    showToast(`تم إرسال الملاحظة: ${noteText}`, "success");
                    setNoteText("");
                  } else {
                    showToast("الرجاء كتابة الملاحظة", "error");
                  }
                }}
              >
                اعتماد وإرسال
              </Btn>
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:hidden fixed bottom-16 right-0 left-0 z-20 border-t bg-surface/95 backdrop-blur px-4 py-3 safe-area-bottom shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground truncate">{APPROVALS[0].subject}</div>
            <div className="text-sm font-bold tabular-nums">{fmtSAR(APPROVALS[0].amount)}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(APPROVALS[0].id)}
              className="rounded-lg bg-success/15 text-success px-4 py-2 text-xs font-semibold min-h-[36px]"
            >
              اعتماد
            </button>
            <button
              onClick={() => handleReject(APPROVALS[0].id)}
              className="rounded-lg bg-destructive/15 text-destructive px-4 py-2 text-xs font-semibold min-h-[36px]"
            >
              رفض
            </button>
          </div>
        </div>
      </div>

      <EntityFormDrawer
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="إضافة ملاحظة"
        onSave={handleSaveNote}
        saveText="إضافة"
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الملاحظة</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={5}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="اكتب ملاحظتك..."
          />
        </div>
      </EntityFormDrawer>

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>قيد يومية</option>
              <option>طلب شراء</option>
              <option>مساعدة</option>
              <option>ميزانية مشروع</option>
              <option>فاتورة مورد</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الأولوية</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option>الكل</option>
              <option>عالية</option>
              <option>متوسطة</option>
              <option>منخفضة</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفترة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]">
              <option>اليوم</option>
              <option>هذا الأسبوع</option>
              <option>هذا الشهر</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>
    </AppShell>
  );
}
