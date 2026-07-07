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
import { Plus, Eye, Printer, XCircle, PackageCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  PrintButton,
} from "@/components/erp/actions";

type OrderItem = {
  id: string;
  sup: string;
  subject: string;
  amount: number;
  date: string;
  status: string;
};

export const Route = createFileRoute("/procurement/orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: () => {
    const initialRows: OrderItem[] = [
      {
        id: "PO-2406-0124",
        sup: "شركة تموين السعودية",
        subject: "سلال غذائية × 1000",
        amount: 82400,
        date: "1446/10/12",
        status: "جديد",
      },
      {
        id: "PO-2406-0123",
        sup: "مؤسسة العلا للتجهيزات",
        subject: "بطانيات شتوية × 2000",
        amount: 96000,
        date: "1446/10/08",
        status: "مؤكد",
      },
      {
        id: "PO-2406-0122",
        sup: "شركة الحلول التقنية",
        subject: "أجهزة حاسب × 6",
        amount: 38400,
        date: "1446/10/10",
        status: "جديد",
      },
      {
        id: "PO-2406-0121",
        sup: "مؤسسة البناء المتكامل",
        subject: "مواد بناء مسجد القرية",
        amount: 64500,
        date: "1446/10/05",
        status: "مستلم",
      },
    ];
    const [data, setData] = useState<OrderItem[]>(initialRows);
    const [formOpen, setFormOpen] = useState(false);
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [confirmAction, setConfirmAction] = useState("");
    const [detailIdx, setDetailIdx] = useState(-1);
    const [formSup, setFormSup] = useState("");
    const [formSubject, setFormSubject] = useState("");
    const [formDate, setFormDate] = useState("");
    const [formDelivery, setFormDelivery] = useState("");
    const [formNotes, setFormNotes] = useState("");
    const [receiveNotes, setReceiveNotes] = useState("");

    const nextId = () => `PO-${1446}-${String(100 + data.length + 1).slice(-4)}`;

    const handleSave = () => {
      if (!formSup.trim() || !formSubject.trim()) {
        showToast("يرجى إدخال البيانات المطلوبة", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          sup: formSup,
          subject: formSubject,
          amount: 0,
          date: formDate || new Date().toLocaleDateString("ar-SA"),
          status: "جديد",
        },
        ...data,
      ]);
      showToast("تم إنشاء أمر الشراء بنجاح", "success");
      setFormOpen(false);
      setFormSup("");
      setFormSubject("");
      setFormDate("");
      setFormDelivery("");
      setFormNotes("");
    };

    const handleReceive = () => {
      showToast(`تم استلام الأصناف بنجاح${receiveNotes ? ` (${receiveNotes})` : ""}`, "success");
      setReceiveOpen(false);
      setReceiveNotes("");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف أمر الشراء بنجاح", "success");
      setConfirmIdx(-1);
    };

    const handleStatus = (idx: number, s: string) => {
      const d = [...data];
      d[idx] = { ...d[idx], status: s };
      setData(d);
      showToast(`تم تغيير الحالة إلى ${s}`, "success");
    };

    const statusColor = (s: string) => {
      if (s === "مستلم") return "success";
      if (s === "ملغي") return "destructive";
      if (s === "مؤكد") return "info";
      return "warning";
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء"]}
          title="أوامر الشراء"
          actions={
            <>
              <ExportButton data={data} filename="purchase-orders.csv" />
              <PrintButton label="طباعة" />
              <Btn variant="primary" onClick={() => setFormOpen(true)}>
                <Plus size={15} />
                إنشاء أمر شراء
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="أوامر الشراء" count={`${data.length} أمر`} />
            <MobileTable
              columns={["الرقم", "المورد", "الموضوع", "المبلغ", "التاريخ", "الحالة", ""]}
              rows={data}
              renderRow={(r, idx) => (
                <>
                  <Td className="font-mono text-xs">{r.id}</Td>
                  <Td className="font-semibold">{r.sup}</Td>
                  <Td>{r.subject}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                  <Td className="text-muted-foreground">{r.date}</Td>
                  <Td>
                    <Badge tone={statusColor(r.status) as any}>{r.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        { label: "عرض", icon: Eye, onClick: () => setDetailIdx(idx) },
                        {
                          label: "طباعة",
                          icon: Printer,
                          onClick: () => showToast("تم تجهيز المستند للطباعة", "info"),
                        },
                        {
                          label: "تسجيل دفعة",
                          icon: PackageCheck,
                          onClick: () => {
                            setReceiveNotes("");
                            setReceiveOpen(true);
                          },
                        },
                        {
                          label: "إغلاق",
                          icon: XCircle,
                          onClick: () => handleStatus(idx, "مستلم"),
                        },
                        {
                          label: "حذف",
                          icon: Trash2,
                          variant: "destructive" as const,
                          onClick: () => {
                            setConfirmIdx(idx);
                            setConfirmAction("delete");
                          },
                        },
                      ]}
                    />
                  </Td>
                </>
              )}
              mobileCard={(r, idx) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusColor(r.status) as any}>{r.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  </div>
                  <div className="font-semibold">{r.subject}</div>
                  <div className="text-xs text-muted-foreground mt-1">{r.sup}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => setDetailIdx(idx)}
                    >
                      تفاصيل
                    </button>
                    <button
                      className="flex-1 rounded-lg bg-success/15 text-success text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => {
                        setReceiveNotes("");
                        setReceiveOpen(true);
                      }}
                    >
                      استلام
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
          title="إنشاء أمر شراء"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المورد</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSup}
              onChange={(e) => setFormSup(e.target.value)}
              placeholder="اسم المورد"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الموضوع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSubject}
              onChange={(e) => setFormSubject(e.target.value)}
              placeholder="وصف الأمر"
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
          <div>
            <label className="text-xs font-semibold text-muted-foreground">تاريخ التوريد</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="date"
              value={formDelivery}
              onChange={(e) => setFormDelivery(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1">
              <option>جديد</option>
              <option>مؤكد</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[80px]"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          title="استلام الأصناف"
          onSave={handleReceive}
          saveText="تأكيد الاستلام"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات الاستلام</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[80px]"
              value={receiveNotes}
              onChange={(e) => setReceiveNotes(e.target.value)}
              placeholder="حالة الأصناف المستلمة..."
            />
          </div>
        </EntityFormDrawer>

        {confirmAction === "delete" && (
          <ConfirmDialog
            open
            onClose={() => {
              setConfirmIdx(-1);
              setConfirmAction("");
            }}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف أمر الشراء هذا؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}

        {detailIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setDetailIdx(-1)}
            onConfirm={() => setDetailIdx(-1)}
            title={data[detailIdx]?.subject || ""}
            message={`المورد: ${data[detailIdx]?.sup}\nالمبلغ: ${fmtSAR(data[detailIdx]?.amount || 0)}\nالحالة: ${data[detailIdx]?.status}\nالتاريخ: ${data[detailIdx]?.date}`}
            confirmText="إغلاق"
            cancelText=""
          />
        )}
      </>
    );
  },
});
