import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR, fmtNum } from "@/data/sample";
import { Plus, Megaphone, Edit, Trash2, Eye, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

type CampaignItem = {
  id: string;
  name: string;
  target: number;
  raised: number;
  donors: number;
  status: string;
  end: string;
};

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{ title: "حملات التبرع — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<CampaignItem[]>([]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formTarget, setFormTarget] = useState("");

    const nextId = () => `CMP-${String(100 + data.length + 1).slice(-3)}`;

    const handleSave = () => {
      if (!formName.trim() || !formTarget.trim()) {
        showToast("يرجى إدخال البيانات", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          name: formName,
          target: Number(formTarget),
          raised: 0,
          donors: 0,
          status: "نشطة",
          end: "—",
        },
        ...data,
      ]);
      showToast("تم إضافة الحملة بنجاح", "success");
      setFormOpen(false);
      setFormName("");
      setFormTarget("");
    };

    const changeStatus = (idx: number, status: string) => {
      const d = [...data];
      d[idx] = { ...d[idx], status };
      setData(d);
      showToast(`تم تغيير الحالة إلى ${status}`, "success");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الحملة", "success");
      setConfirmIdx(-1);
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "التبرعات", "الحملات"]}
        title="حملات التبرع"
        actions={
          <>
            <ExportButton data={data} filename="campaigns.csv" />
            <Btn
              variant="primary"
              onClick={() => {
                setFormName("");
                setFormTarget("");
                setFormOpen(true);
              }}
            >
              <Plus size={15} /> إضافة حملة
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="حملات التبرع" count={`${data.length} حملة`} />
        {data.length === 0 && (
          <EmptyState title="لا توجد حملات" description="ابدأ بإضافة أول حملة تبرع" />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((c, idx) => {
            const pct = Math.round((c.raised / c.target) * 100) || 0;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Megaphone size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{c.name}</h3>
                      <div className="text-xs text-muted-foreground font-mono">{c.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    <ActionMenu
                      actions={[
                        { label: "عرض", icon: Eye, onClick: () => showToast(c.name, "info") },
                        {
                          label: "إنهاء",
                          icon: CheckCircle,
                          onClick: () => changeStatus(idx, "مكتملة"),
                        },
                        {
                          label: "إلغاء",
                          icon: XCircle,
                          onClick: () => changeStatus(idx, "ملغاة"),
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
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold tabular-nums">{fmtSAR(c.raised)}</span>
                    <span className="text-muted-foreground">من {fmtSAR(c.target)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct >= 100 ? "bg-success" : "bg-gradient-to-l from-primary to-info"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {pct}% من الهدف · {fmtNum(c.donors)} متبرع · حتى {c.end}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة حملة"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم الحملة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الهدف</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الحملة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
