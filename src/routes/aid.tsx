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
import { HandHelping, Plus, Edit, Trash2, Eye, CheckCircle } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type AidItem = {
  id: string;
  b: string;
  type: string;
  amount: number;
  project: string;
  date: string;
  status: string;
};

export const Route = createFileRoute("/aid")({
  head: () => ({ meta: [{ title: "المساعدات — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<AidItem[]>([
      {
        id: "AID-5012",
        b: "أحمد محمد العمري",
        type: "مساعدة شهرية",
        amount: 1500,
        project: "كفالة الأيتام",
        date: "1446/10/12",
        status: "مصروف",
      },
      {
        id: "AID-5011",
        b: "فاطمة عبدالله السلمي",
        type: "سلة غذائية",
        amount: 350,
        project: "السلال الغذائية",
        date: "1446/10/12",
        status: "مصروف",
      },
      {
        id: "AID-5010",
        b: "أسرة سعيد الغامدي",
        type: "مساعدة عاجلة",
        amount: 8500,
        project: "—",
        date: "1446/10/11",
        status: "بانتظار الموافقة",
      },
      {
        id: "AID-5009",
        b: "محمد العتيبي",
        type: "علاج",
        amount: 12000,
        project: "علاج المرضى",
        date: "1446/10/10",
        status: "مصروف",
      },
      {
        id: "AID-5008",
        b: "أسرة خالد القرني",
        type: "كسوة شتاء",
        amount: 800,
        project: "كسوة الشتاء",
        date: "1446/10/09",
        status: "مصروف",
      },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formBeneficiary, setFormBeneficiary] = useState("");
    const [formType, setFormType] = useState("مساعدة عاجلة");
    const [formAmount, setFormAmount] = useState("");

    const nextId = () => `AID-${String(5000 + data.length + 1)}`;

    const handleSave = () => {
      if (!formBeneficiary.trim() || !formAmount.trim()) {
        showToast("يرجى إدخال البيانات", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          b: formBeneficiary,
          type: formType,
          amount: Number(formAmount),
          project: "—",
          date: new Date().toLocaleDateString("ar-SA"),
          status: "بانتظار الموافقة",
        },
        ...data,
      ]);
      showToast("تم إضافة المساعدة بنجاح", "success");
      setFormOpen(false);
      setFormBeneficiary("");
      setFormType("مساعدة عاجلة");
      setFormAmount("");
    };

    const handleApprove = (idx: number) => {
      const d = [...data];
      d[idx] = { ...d[idx], status: "مصروف" };
      setData(d);
      showToast("تم اعتماد صرف المساعدة", "success");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف المساعدة", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المشاريع والمستفيدون", "المساعدات"]}
          title="سجل المساعدات المصروفة"
          actions={
            <>
              <ExportButton data={data} filename="aid.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormBeneficiary("");
                  setFormType("مساعدة عاجلة");
                  setFormAmount("");
                  setFormOpen(true);
                }}
              >
                <HandHelping size={15} /> إضافة مساعدة
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { l: "مساعدات هذا الشهر", v: String(data.length) },
              {
                l: "قيمة المصروف",
                v: fmtSAR(
                  data.filter((d) => d.status === "مصروف").reduce((a, d) => a + d.amount, 0),
                ),
              },
              { l: "بانتظار الصرف", v: String(data.filter((d) => d.status !== "مصروف").length) },
              {
                l: "متوسط المساعدة",
                v: fmtSAR(Math.round(data.reduce((a, d) => a + d.amount, 0) / data.length) || 0),
              },
            ].map((s) => (
              <Card key={s.l} className="p-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className="text-lg font-extrabold mt-1">{s.v}</div>
              </Card>
            ))}
          </div>
          <MobilePageHeader title="سجل المساعدات المصروفة" count={`${data.length} عناصر`} />
          <MobileTable
            columns={["الرقم", "المستفيد", "النوع", "المبلغ", "المشروع", "التاريخ", "الحالة", ""]}
            rows={data}
            renderRow={(r, idx) => (
              <>
                <Td className="font-mono text-xs">{r.id}</Td>
                <Td className="font-semibold">{r.b}</Td>
                <Td>{r.type}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                <Td>{r.project}</Td>
                <Td className="text-muted-foreground">{r.date}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () => showToast(`${r.b} - ${fmtSAR(r.amount)}`, "info"),
                      },
                      ...(r.status !== "مصروف"
                        ? [
                            {
                              label: "اعتماد",
                              icon: CheckCircle,
                              onClick: () => handleApprove(idx),
                            },
                          ]
                        : []),
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
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                </div>
                <div className="font-semibold">{r.b}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.type}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                  <span className="text-xs text-muted-foreground">{r.project}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.date}</div>
                <div className="flex gap-2 mt-2">
                  {r.status !== "مصروف" && (
                    <button
                      className="flex-1 rounded-lg bg-success/15 text-success text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => handleApprove(idx)}
                    >
                      اعتماد
                    </button>
                  )}
                </div>
              </Card>
            )}
          />
        </AppShell>
        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة مساعدة"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المستفيد</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formBeneficiary}
              onChange={(e) => setFormBeneficiary(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              <option>مساعدة عاجلة</option>
              <option>مساعدة شهرية</option>
              <option>سلة غذائية</option>
              <option>علاج</option>
              <option>كسوة شتاء</option>
            </select>
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
        </EntityFormDrawer>
        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف المساعدة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
