import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge, Btn, MobilePageHeader } from "@/components/erp/AppShell";
import { ALERTS } from "@/data/sample";
import { Bell, AlertTriangle, Info, CheckCircle2, BellRing, Plus, Eye, Check } from "lucide-react";
import { useState } from "react";
import { showToast, EntityFormDrawer, ActionMenu } from "@/components/erp/actions";

type AlertItem = { tone: string; text: string; time: string; read: boolean };

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "التنبيهات — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<AlertItem[]>(
      [...ALERTS, ...ALERTS, ...ALERTS].map((a) => ({ ...a, read: false })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [formText, setFormText] = useState("");
    const [formTone, setFormTone] = useState("info");

    const icon: Record<string, typeof AlertTriangle> = {
      destructive: AlertTriangle,
      warning: BellRing,
      info: Info,
      success: CheckCircle2,
    };

    const handleAdd = () => {
      if (!formText.trim()) {
        showToast("يرجى إدخال نص التنبيه", "error");
        return;
      }
      setData([{ tone: formTone, text: formText, time: "الآن", read: false }, ...data]);
      showToast("تم إضافة التنبيه بنجاح", "success");
      setFormOpen(false);
      setFormText("");
      setFormTone("info");
    };

    const markRead = (idx: number) => {
      const d = [...data];
      d[idx] = { ...d[idx], read: true };
      setData(d);
      showToast("تم تحديد التنبيه كمقروء", "success");
    };

    const unread = data.filter((a) => !a.read).length;

    return (
      <AppShell
        breadcrumb={["الرئيسية", "التنبيهات"]}
        title="مركز التنبيهات"
        actions={
          <>
            <Btn
              variant="outline"
              onClick={() => {
                const d = data.map((a) => ({ ...a, read: true }));
                setData(d);
                showToast("تم تحديد الكل كمقروء", "success");
              }}
            >
              <Check size={15} /> تحديد الكل مقروء
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setFormText("");
                setFormTone("info");
                setFormOpen(true);
              }}
            >
              <Plus size={15} /> إضافة تنبيه
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="مركز التنبيهات" count={`${unread} غير مقروء`} />
        <Card className="p-2">
          <ul className="divide-y">
            {data.map((a, i) => {
              const Icon = icon[a.tone] || Info;
              return (
                <li
                  key={i}
                  className={`flex items-start gap-3 p-4 hover:bg-muted/50 ${a.read ? "opacity-60" : ""}`}
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${a.tone === "destructive" ? "bg-destructive/10 text-destructive" : a.tone === "warning" ? "bg-warning/20 text-warning-foreground" : a.tone === "success" ? "bg-success/10 text-success" : "bg-info/10 text-info"}`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{a.text}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.time}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!a.read && <Badge tone="warning">جديد</Badge>}
                    <ActionMenu
                      actions={[
                        { label: "عرض", icon: Eye, onClick: () => showToast(a.text, "info") },
                        ...(!a.read
                          ? [{ label: "تحديد كمقروء", icon: Check, onClick: () => markRead(i) }]
                          : []),
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة تنبيه"
          onSave={handleAdd}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">نص التنبيه</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[80px]"
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTone}
              onChange={(e) => setFormTone(e.target.value)}
            >
              <option value="info">معلومات</option>
              <option value="warning">تحذير</option>
              <option value="destructive">حرج</option>
              <option value="success">نجاح</option>
            </select>
          </div>
        </EntityFormDrawer>
      </AppShell>
    );
  },
});
