import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Printer, Download, Plus, Eye, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
} from "@/components/erp/actions";

type ReceiptItem = {
  id: string;
  donor: string;
  amount: number;
  date: string;
  channel: string;
  status: string;
};

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "الإيصالات الإلكترونية — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<ReceiptItem[]>(
      Array.from({ length: 10 }).map((_, i) => ({
        id: `RCT-2406-0${188 - i}`,
        donor: [
          "مؤسسة الراجحي الإنسانية",
          "عبدالله العتيبي",
          "شركة أرامكو",
          "نورة القحطاني",
          "خالد الدوسري",
        ][i % 5],
        amount: [600000, 12000, 250000, 5000, 800][i % 5],
        date: `1446/10/${12 - i}`,
        channel: ["البوابة الإلكترونية", "تطبيق الجوال", "مقر الجمعية"][i % 3],
        status: "مصروف",
      })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formDonor, setFormDonor] = useState("");
    const [formAmount, setFormAmount] = useState("");
    const [formChannel, setFormChannel] = useState("نقدي");

    const nextId = () => `RCT-2406-0${String(200 + data.length + 1).slice(-3)}`;

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
          date: new Date().toLocaleDateString("ar-SA"),
          channel: formChannel,
          status: "مصروف",
        },
        ...data,
      ]);
      showToast("تم إصدار الإيصال بنجاح", "success");
      setFormOpen(false);
      setFormDonor("");
      setFormAmount("");
      setFormChannel("نقدي");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الإيصال", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "التبرعات", "الإيصالات"]}
          title="الإيصالات الإلكترونية"
          actions={
            <>
              <ExportButton data={data} filename="receipts.csv" />
              <PrintButton label="طباعة دفعية" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormDonor("");
                  setFormAmount("");
                  setFormChannel("نقدي");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إصدار إيصال
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="الإيصالات الإلكترونية" count={`${data.length} إيصال`} />
            <MobileTable
              columns={["رقم الإيصال", "المتبرع", "المبلغ", "التاريخ", "القناة", "الحالة", ""]}
              rows={data}
              renderRow={(r, idx) => (
                <>
                  <Td className="font-mono text-xs">{r.id}</Td>
                  <Td className="font-semibold">{r.donor}</Td>
                  <Td className="tabular-nums font-bold text-success">{fmtSAR(r.amount)}</Td>
                  <Td className="text-muted-foreground">{r.date}</Td>
                  <Td>{r.channel}</Td>
                  <Td>
                    <Badge tone="success">{r.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "طباعة",
                          icon: Printer,
                          onClick: () => showToast("تم تجهيز الإيصال للطباعة", "info"),
                        },
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${r.donor} - ${fmtSAR(r.amount)}`, "info"),
                        },
                        {
                          label: "حذف",
                          icon: XCircle,
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
                    <span className="font-semibold">{r.donor}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  </div>
                  <div className="text-lg font-bold text-success">{fmtSAR(r.amount)}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                    <span className="text-xs">{r.channel}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => showToast("تم تجهيز الإيصال للطباعة", "info")}
                    >
                      <Printer size={13} className="inline ms-1" /> طباعة
                    </button>
                    <button className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]">
                      PDF
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
          title="إصدار إيصال"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المتبرع</label>
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
            <label className="text-xs font-semibold text-muted-foreground">القناة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formChannel}
              onChange={(e) => setFormChannel(e.target.value)}
            >
              <option>نقدي</option>
              <option>تحويل بنكي</option>
              <option>مدى</option>
              <option>Apple Pay</option>
              <option>STC Pay</option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الإيصال؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
