import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Btn,
  Card,
  Badge,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { GRANTS, fmtSAR } from "@/data/sample";
import { Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type GrantItem = {
  id: string;
  donor: string;
  project: string;
  amount: number;
  disbursed: number;
  status: string;
  end: string;
};

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "المنح — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<GrantItem[]>(GRANTS as GrantItem[]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formDonor, setFormDonor] = useState("");
    const [formProject, setFormProject] = useState("");
    const [formAmount, setFormAmount] = useState("");

    const nextId = () => `GRT-${String(100 + data.length + 1).slice(-3)}`;

    const handleSave = () => {
      if (!formDonor.trim()) {
        showToast("يرجى إدخال اسم الجهة المانحة", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          donor: formDonor,
          project: formProject || "—",
          amount: Number(formAmount) || 0,
          disbursed: 0,
          status: "نشطة",
          end: "—",
        },
        ...data,
      ]);
      showToast("تم إضافة المنحة بنجاح", "success");
      setFormOpen(false);
      setFormDonor("");
      setFormProject("");
      setFormAmount("");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف المنحة", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "المنح"]}
          title="إدارة المنح"
          actions={
            <>
              <ExportButton data={data} filename="grants.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormDonor("");
                  setFormProject("");
                  setFormAmount("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة منحة
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="إدارة المنح" count={`${data.length} منحة`} />
            <MobileTable
              columns={[
                "الرقم",
                "الجهة المانحة",
                "المشروع",
                "قيمة المنحة",
                "المصروف",
                "النسبة",
                "ينتهي في",
                "الحالة",
                "",
              ]}
              rows={data}
              renderRow={(g, idx) => {
                const pct = Math.round((g.disbursed / g.amount) * 100) || 0;
                return (
                  <>
                    <Td className="font-mono text-xs">{g.id}</Td>
                    <Td className="font-semibold">{g.donor}</Td>
                    <Td>{g.project}</Td>
                    <Td className="tabular-nums font-bold">{fmtSAR(g.amount)}</Td>
                    <Td className="tabular-nums">{fmtSAR(g.disbursed)}</Td>
                    <Td>
                      <div className="flex items-center gap-2 w-32">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs">{pct}%</span>
                      </div>
                    </Td>
                    <Td className="text-muted-foreground">{g.end}</Td>
                    <Td>
                      <Badge tone={statusTone(g.status)}>{g.status}</Badge>
                    </Td>
                    <Td>
                      <ActionMenu
                        actions={[
                          {
                            label: "عرض",
                            icon: Eye,
                            onClick: () => showToast(`${g.donor} - ${fmtSAR(g.amount)}`, "info"),
                          },
                          {
                            label: "حذف",
                            icon: Trash2,
                            variant: "destructive" as const,
                            onClick: () => setConfirmIdx(idx),
                          },
                        ]}
                      />
                    </Td>
                  </>
                );
              }}
              mobileCard={(g) => {
                const pct = Math.round((g.disbursed / g.amount) * 100) || 0;
                return (
                  <Card key={g.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Badge tone={statusTone(g.status)}>{g.status}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{g.id}</span>
                    </div>
                    <div className="font-semibold">{g.donor}</div>
                    <div className="text-xs text-muted-foreground mt-1">{g.project}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="tabular-nums font-bold">{fmtSAR(g.amount)}</span>
                      <span className="text-xs text-muted-foreground">{g.end}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs">{pct}%</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      مصروف: {fmtSAR(g.disbursed)}
                    </div>
                  </Card>
                );
              }}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة منحة"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الجهة المانحة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDonor}
              onChange={(e) => setFormDonor(e.target.value)}
              placeholder="اسم الجهة"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formProject}
              onChange={(e) => setFormProject(e.target.value)}
              placeholder="المشروع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">قيمة المنحة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف المنحة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
