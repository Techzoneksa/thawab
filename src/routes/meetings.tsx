import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import {
  CalendarDays,
  Plus,
  Vote,
  Paperclip,
  Edit,
  Trash2,
  Eye,
  FileText,
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";

type MeetingItem = {
  id: string;
  title: string;
  date: string;
  attendees: number;
  status: string;
  decisions: number;
};

export const Route = createFileRoute("/meetings")({
  head: () => ({ meta: [{ title: "الاجتماعات — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<MeetingItem[]>([]);
    const [formOpen, setFormOpen] = useState(false);
    const [minutesOpen, setMinutesOpen] = useState(false);
    const [decisionOpen, setDecisionOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formTitle, setFormTitle] = useState("");
    const [formDate, setFormDate] = useState("");
    const [minutesTitle, setMinutesTitle] = useState("");
    const [minutesContent, setMinutesContent] = useState("");
    const [decisionTitle, setDecisionTitle] = useState("");
    const [decisionDesc, setDecisionDesc] = useState("");

    const nextId = () => `MTG-${String(100 + data.length + 1).slice(-3)}`;

    const handleAddMeeting = () => {
      if (!formTitle.trim()) {
        showToast("يرجى إدخال عنوان الاجتماع", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          title: formTitle,
          date: formDate || new Date().toLocaleDateString("ar-SA"),
          attendees: 0,
          status: "مجدول",
          decisions: 0,
        },
        ...data,
      ]);
      showToast("تم إضافة الاجتماع بنجاح", "success");
      setFormOpen(false);
      setFormTitle("");
      setFormDate("");
    };

    const handleAddMinutes = () => {
      if (!minutesTitle.trim()) {
        showToast("يرجى إدخال عنوان المحضر", "error");
        return;
      }
      showToast(`تم إضافة محضر الاجتماع "${minutesTitle}" بنجاح`, "success");
      setMinutesOpen(false);
      setMinutesTitle("");
      setMinutesContent("");
    };

    const handleAddDecision = () => {
      if (!decisionTitle.trim()) {
        showToast("يرجى إدخال عنوان القرار", "error");
        return;
      }
      showToast(`تم إضافة القرار "${decisionTitle}" بنجاح`, "success");
      setDecisionOpen(false);
      setDecisionTitle("");
      setDecisionDesc("");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الاجتماع", "success");
      setConfirmIdx(-1);
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "الاجتماعات"]}
        title="الاجتماعات والقرارات"
        actions={
          <>
            <Btn
              variant="outline"
              onClick={() => {
                setDecisionTitle("");
                setDecisionDesc("");
                setDecisionOpen(true);
              }}
            >
              <Vote size={15} /> إضافة قرار
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                setMinutesTitle("");
                setMinutesContent("");
                setMinutesOpen(true);
              }}
            >
              <FileText size={15} /> إضافة محضر اجتماع
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setFormTitle("");
                setFormDate("");
                setFormOpen(true);
              }}
            >
              <Plus size={15} /> إضافة اجتماع
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="الاجتماعات والقرارات" count={`${data.length} اجتماع`} />
        {data.length === 0 && (
          <EmptyState title="لا توجد اجتماعات" description="ابدأ بإضافة أول اجتماع" />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.map((m, idx) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold">{m.title}</h3>
                    <div className="text-xs text-muted-foreground">
                      {m.date}هـ · {m.attendees} حاضر
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  <ActionMenu
                    actions={[
                      { label: "عرض", icon: Eye, onClick: () => showToast(m.title, "info") },
                      {
                        label: "تعديل",
                        icon: Edit,
                        onClick: () => {
                          setFormTitle(m.title);
                          setFormDate(m.date);
                          setFormOpen(true);
                        },
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmIdx(idx),
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-[10px] text-muted-foreground">قرارات</div>
                  <div className="text-sm font-bold mt-0.5">{m.decisions}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-[10px] text-muted-foreground">تصويتات</div>
                  <div className="text-sm font-bold mt-0.5 inline-flex items-center gap-1">
                    <Vote size={12} /> {m.decisions}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-[10px] text-muted-foreground">مرفقات</div>
                  <div className="text-sm font-bold mt-0.5 inline-flex items-center gap-1">
                    <Paperclip size={12} /> {m.status === "منعقد" ? 3 : 0}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة اجتماع"
          onSave={handleAddMeeting}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">عنوان الاجتماع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="عنوان الاجتماع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التاريخ</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={minutesOpen}
          onClose={() => setMinutesOpen(false)}
          title="إضافة محضر اجتماع"
          onSave={handleAddMinutes}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">عنوان المحضر</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={minutesTitle}
              onChange={(e) => setMinutesTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المحتوى</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[120px]"
              value={minutesContent}
              onChange={(e) => setMinutesContent(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={decisionOpen}
          onClose={() => setDecisionOpen(false)}
          title="إضافة قرار"
          onSave={handleAddDecision}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">عنوان القرار</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={decisionTitle}
              onChange={(e) => setDecisionTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الوصف</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[120px]"
              value={decisionDesc}
              onChange={(e) => setDecisionDesc(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الاجتماع؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
