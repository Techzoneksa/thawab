import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Repeat, Plus, Edit, Trash2, Eye, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type RecurringItem = {
  id: string;
  donor: string;
  amount: number;
  freq: string;
  project: string;
  next: string;
  status: string;
};

export const Route = createFileRoute("/recurring")({
  head: () => ({ meta: [{ title: "التبرعات المتكررة — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<RecurringItem[]>([
      {
        id: "RCR-101",
        donor: "شركة أرامكو السعودية",
        amount: 50000,
        freq: "شهري",
        project: "كفالة الأيتام",
        next: "1446/11/01",
        status: "نشط",
      },
      {
        id: "RCR-102",
        donor: "عبدالله العتيبي",
        amount: 800,
        freq: "شهري",
        project: "كفالة طفل يتيم",
        next: "1446/11/05",
        status: "نشط",
      },
      {
        id: "RCR-103",
        donor: "نورة القحطاني",
        amount: 1200,
        freq: "شهري",
        project: "السلال الغذائية",
        next: "1446/11/10",
        status: "نشط",
      },
      {
        id: "RCR-104",
        donor: "خالد الدوسري",
        amount: 500,
        freq: "أسبوعي",
        project: "صدقة جارية",
        next: "1446/10/18",
        status: "نشط",
      },
      {
        id: "RCR-105",
        donor: "هند السبيعي",
        amount: 2400,
        freq: "ربع سنوي",
        project: "كسوة الشتاء",
        next: "1447/01/01",
        status: "نشط",
      },
      {
        id: "RCR-106",
        donor: "فهد المالكي",
        amount: 300,
        freq: "شهري",
        project: "إفطار صائم",
        next: "—",
        status: "موقوف",
      },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formDonor, setFormDonor] = useState("");
    const [formAmount, setFormAmount] = useState("");
    const [formFreq, setFormFreq] = useState("شهري");
    const [formProject, setFormProject] = useState("");

    const nextId = () => `RCR-${String(100 + data.length + 1).slice(-3)}`;

    const handleSave = () => {
      if (!formDonor.trim() || !formAmount.trim()) {
        showToast("يرجى إدخال البيانات", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          donor: formDonor,
          amount: Number(formAmount),
          freq: formFreq,
          project: formProject || "—",
          next: "—",
          status: "نشط",
        },
        ...data,
      ]);
      showToast("تم إضافة التبرع المتكرر بنجاح", "success");
      setFormOpen(false);
      setFormDonor("");
      setFormAmount("");
      setFormFreq("شهري");
      setFormProject("");
    };

    const toggleStatus = (idx: number) => {
      const d = [...data];
      d[idx] = { ...d[idx], status: d[idx].status === "نشط" ? "موقوف" : "نشط" };
      setData(d);
      showToast(`تم ${d[idx].status === "نشط" ? "تفعيل" : "إيقاف"} التبرع المتكرر`, "success");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف التبرع المتكرر", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "التبرعات", "التبرعات المتكررة"]}
          title="التبرعات المتكررة"
          actions={
            <>
              <ExportButton data={data} filename="recurring.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormDonor("");
                  setFormAmount("");
                  setFormFreq("شهري");
                  setFormProject("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة تبرع متكرر
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { l: "تبرعات متكررة نشطة", v: String(data.filter((d) => d.status === "نشط").length) },
              {
                l: "إيراد شهري متوقع",
                v: fmtSAR(data.filter((d) => d.status === "نشط").reduce((a, d) => a + d.amount, 0)),
              },
              {
                l: "نسبة الاستمرارية",
                v: `${Math.round((data.filter((d) => d.status === "نشط").length / data.length) * 100)}%`,
              },
              { l: "عدد المشتركين", v: String(data.length) },
            ].map((s) => (
              <Card key={s.l} className="p-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
              </Card>
            ))}
          </div>
          <>
            <MobilePageHeader title="التبرعات المتكررة" count={`${data.length} تبرع`} />
            <MobileTable
              columns={[
                "الرقم",
                "المتبرع",
                "المبلغ",
                "التكرار",
                "المشروع",
                "الخصم القادم",
                "الحالة",
                "",
              ]}
              rows={data}
              renderRow={(r, idx) => (
                <>
                  <Td className="font-mono text-xs">{r.id}</Td>
                  <Td className="font-semibold">{r.donor}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                  <Td>
                    <Badge tone="info">
                      <Repeat size={11} className="inline ms-1" />
                      {r.freq}
                    </Badge>
                  </Td>
                  <Td>{r.project}</Td>
                  <Td className="text-muted-foreground">{r.next}</Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${r.donor} - ${fmtSAR(r.amount)}`, "info"),
                        },
                        {
                          label: r.status === "نشط" ? "إيقاف" : "تفعيل",
                          icon: r.status === "نشط" ? ToggleLeft : ToggleRight,
                          onClick: () => toggleStatus(idx),
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
              )}
              mobileCard={(r, idx) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    <Badge tone="info">
                      <Repeat size={11} className="inline ms-1" />
                      {r.freq}
                    </Badge>
                  </div>
                  <div className="font-semibold">{r.donor}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                    <span className="text-xs text-muted-foreground">{r.project}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">الخصم القادم: {r.next}</div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => toggleStatus(idx)}
                    >
                      {r.status === "نشط" ? "إيقاف" : "تفعيل"}
                    </button>
                  </div>
                </Card>
              )}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة تبرع متكرر"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم المتبرع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDonor}
              onChange={(e) => setFormDonor(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المبلغ</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التكرار</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formFreq}
              onChange={(e) => setFormFreq(e.target.value)}
            >
              <option>أسبوعي</option>
              <option>شهري</option>
              <option>ربع سنوي</option>
              <option>سنوي</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المشروع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formProject}
              onChange={(e) => setFormProject(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف التبرع المتكرر؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
