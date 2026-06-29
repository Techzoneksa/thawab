import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, EntityFormDrawer, ActionMenu } from "@/components/erp/actions";
import {
  DatabaseBackup,
  CheckCircle2,
  Download,
  RotateCcw,
  Trash2,
  Settings as Cog,
} from "lucide-react";

export const Route = createFileRoute("/settings/backup")({
  head: () => ({ meta: [{ title: "النسخ الاحتياطي — ثواب" }] }),
  component: () => {
    const [backups, setBackups] = useState([
      { d: "1446/10/12 03:00", size: "1.84 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/11 03:00", size: "1.82 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/10 03:00", size: "1.80 GB", type: "تلقائي يومي", status: "ناجح" },
      { d: "1446/10/05 14:20", size: "1.79 GB", type: "يدوي", status: "ناجح" },
      { d: "1446/10/01 03:00", size: "1.74 GB", type: "أرشيف شهري", status: "ناجح" },
    ]);

    const [loading, setLoading] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
    const [restoreOpen, setRestoreOpen] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState("");

    const [schedFreq, setSchedFreq] = useState("يومي");
    const [schedTime, setSchedTime] = useState("03:00");
    const [schedRetain, setSchedRetain] = useState("30");

    function handleCreateBackup() {
      setLoading(true);
      setTimeout(() => {
        const now = new Date();
        const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const newBackup = {
          d: `${dateStr} ${timeStr}`,
          size: "1.85 GB",
          type: "يدوي",
          status: "ناجح",
        };
        setBackups([newBackup, ...backups]);
        setLoading(false);
        showToast("تم إنشاء النسخة الاحتياطية بنجاح", "success");
      }, 1500);
    }

    function handleRestore(b: any) {
      setRestoreTarget(b.d);
      setRestoreOpen(true);
      setConfirmAction(() => () => {
        showToast(`تمت استعادة النسخة الاحتياطية ${b.d} بنجاح`, "success");
      });
    }

    function handleDownload(b: any) {
      showToast(`بدء تحميل النسخة الاحتياطية ${b.d} (${b.size})`, "success");
    }

    function handleDelete(i: number) {
      setConfirmAction(() => () => {
        setBackups(backups.filter((_, idx) => idx !== i));
        showToast("تم حذف النسخة الاحتياطية", "success");
      });
      setConfirmOpen(true);
    }

    function handleSaveSettings() {
      showToast("تم حفظ إعدادات النسخ الاحتياطي", "success");
      setSettingsOpen(false);
    }

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "النسخ الاحتياطي"]}
        title="النسخ الاحتياطي والاستعادة"
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="outline" onClick={() => setSettingsOpen(true)}>
              <Cog size={15} />
              <span className="hidden md:inline">الإعدادات</span>
            </Btn>
            <Btn variant="primary" onClick={handleCreateBackup} disabled={loading}>
              <DatabaseBackup size={15} className={loading ? "animate-pulse" : ""} />
              {loading ? "جارٍ الإنشاء..." : "نسخة احتياطية الآن"}
            </Btn>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">آخر نسخة احتياطية</div>
            <div className="text-xl font-extrabold mt-1">قبل 6 ساعات</div>
            <Badge tone="success">
              <CheckCircle2 size={11} className="inline ms-1" />
              ناجحة
            </Badge>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">حجم البيانات</div>
            <div className="text-xl font-extrabold mt-1">1.84 GB</div>
            <div className="text-xs text-muted-foreground mt-1">مشفّرة AES-256</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">موقع التخزين</div>
            <div className="text-xl font-extrabold mt-1">السعودية</div>
            <Badge tone="info">3 نسخ جغرافية</Badge>
          </Card>
        </div>
        <MobilePageHeader title="النسخ الاحتياطي" count={`${backups.length} نسخة`} />
        <MobileActionRow>
          <Btn variant="outline" onClick={() => setSettingsOpen(true)}>
            <Cog size={15} /> إعدادات
          </Btn>
          <Btn variant="primary" onClick={handleCreateBackup} disabled={loading}>
            <DatabaseBackup size={15} className={loading ? "animate-pulse" : ""} />
            {loading ? "جارٍ..." : "إنشاء نسخة"}
          </Btn>
        </MobileActionRow>
        <div className="mt-3 lg:mt-0" />
        <MobileTable
          columns={["التاريخ والوقت", "الحجم", "النوع", "الحالة", ""]}
          rows={backups}
          renderRow={(b, i) => (
            <>
              <Td className="font-mono text-xs">{b.d}</Td>
              <Td className="tabular-nums">{b.size}</Td>
              <Td>{b.type}</Td>
              <Td>
                <Badge tone="success">{b.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    { label: "استعادة", icon: RotateCcw, onClick: () => handleRestore(b) },
                    { label: "تحميل", icon: Download, onClick: () => handleDownload(b) },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive",
                      onClick: () => handleDelete(i),
                    },
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(b, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone="success">{b.status}</Badge>
                <Badge tone="info">{b.type}</Badge>
              </div>
              <div className="font-mono text-xs">{b.d}</div>
              <div className="tabular-nums text-sm font-semibold mt-1">{b.size}</div>
              <div className="flex gap-2 mt-2">
                <Btn variant="primary" className="flex-1 text-xs" onClick={() => handleDownload(b)}>
                  <Download size={12} /> تحميل
                </Btn>
                <Btn variant="outline" className="flex-1 text-xs" onClick={() => handleRestore(b)}>
                  <RotateCcw size={12} /> استعادة
                </Btn>
                <Btn variant="outline" className="flex-1 text-xs" onClick={() => handleDelete(i)}>
                  <Trash2 size={12} />
                </Btn>
              </div>
            </Card>
          )}
        />

        <EntityFormDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="إعدادات النسخ الاحتياطي"
          onSave={handleSaveSettings}
          saveText="حفظ الإعدادات"
        >
          <div>
            <label className="text-xs text-muted-foreground">التكرار</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={schedFreq}
              onChange={(e) => setSchedFreq(e.target.value)}
            >
              <option>يومي</option>
              <option>أسبوعي</option>
              <option>شهري</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الوقت</label>
            <input
              type="time"
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={schedTime}
              onChange={(e) => setSchedTime(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الاحتفاظ بـ (عدد النسخ)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={schedRetain}
              onChange={(e) => setSchedRetain(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            confirmAction();
            setConfirmOpen(false);
          }}
          title="تأكيد حذف النسخة الاحتياطية"
          message="هل أنت متأكد من حذف هذه النسخة الاحتياطية؟"
          confirmText="حذف"
          cancelText="إلغاء"
          variant="destructive"
        />

        <ConfirmDialog
          open={restoreOpen}
          onClose={() => setRestoreOpen(false)}
          onConfirm={() => {
            confirmAction();
            setRestoreOpen(false);
          }}
          title="تأكيد استعادة النسخة الاحتياطية"
          message={`سيتم استعادة البيانات من النسخة "${restoreTarget}". هل أنت متأكد؟`}
          confirmText="استعادة"
          cancelText="إلغاء"
          variant="default"
        />
      </AppShell>
    );
  },
});
