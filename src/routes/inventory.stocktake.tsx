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
import { Plus, PackageSearch, Eye, CheckCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type STK = { id: string; w: string; date: string; items: number; diff: number; status: string };

export const Route = createFileRoute("/inventory/stocktake")({
  head: () => ({ meta: [{ title: "الجرد — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<STK[]>([
      {
        id: "STK-014",
        w: "المستودع الرئيسي",
        date: "1446/10/01",
        items: 1240,
        diff: -8,
        status: "مكتمل",
      },
      {
        id: "STK-013",
        w: "مستودع كسوة الشتاء",
        date: "1446/09/15",
        items: 1840,
        diff: 0,
        status: "مكتمل",
      },
      {
        id: "STK-012",
        w: "مستودع الأدوية",
        date: "1446/09/01",
        items: 86,
        diff: -2,
        status: "مكتمل",
      },
      { id: "STK-015", w: "مستودع الفرع - جدة", date: "—", items: 0, diff: 0, status: "بانتظار" },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [detailIdx, setDetailIdx] = useState(-1);
    const [formWarehouse, setFormWarehouse] = useState("المستودع الرئيسي");
    const [formDate, setFormDate] = useState("");
    const [formNotes, setFormNotes] = useState("");

    const nextId = () => `STK-${String(100 + data.length + 1).slice(-3)}`;

    const handleSave = () => {
      setData([
        {
          id: nextId(),
          w: formWarehouse,
          date: formDate || new Date().toLocaleDateString("ar-SA"),
          items: 0,
          diff: 0,
          status: "بانتظار",
        },
        ...data,
      ]);
      showToast("تم إضافة الجرد بنجاح", "success");
      setFormOpen(false);
      setFormWarehouse("المستودع الرئيسي");
      setFormDate("");
      setFormNotes("");
    };

    const handleApprove = (idx: number) => {
      const d = [...data];
      d[idx] = { ...d[idx], status: "مكتمل" };
      setData(d);
      showToast("تم اعتماد الجرد", "success");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الجرد", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المخزون", "الجرد"]}
          title="الجرد الدوري"
          actions={
            <>
              <ExportButton
                data={data.map((r) => ({
                  الرقم: r.id,
                  المستودع: r.w,
                  التاريخ: r.date,
                  الاصناف: r.items,
                  الفروقات: r.diff,
                  الحالة: r.status,
                }))}
                filename="stocktake.csv"
              />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormWarehouse("المستودع الرئيسي");
                  setFormDate("");
                  setFormNotes("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} />
                إضافة جرد
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="الجرد الدوري" count={`${data.length} جرد`} />
            <MobileTable
              columns={["الرقم", "المستودع", "التاريخ", "عدد الأصناف", "الفروقات", "الحالة", ""]}
              rows={data}
              renderRow={(r, idx) => (
                <>
                  <Td className="font-mono text-xs">{r.id}</Td>
                  <Td className="font-semibold">
                    <PackageSearch size={13} className="inline ms-1 text-primary" />
                    {r.w}
                  </Td>
                  <Td className="text-muted-foreground">{r.date}</Td>
                  <Td className="tabular-nums">{r.items}</Td>
                  <Td
                    className={`tabular-nums font-bold ${r.diff < 0 ? "text-destructive" : r.diff > 0 ? "text-success" : ""}`}
                  >
                    {r.diff}
                  </Td>
                  <Td>
                    <Badge tone={r.status === "مكتمل" ? "success" : "warning"}>{r.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        { label: "عرض", icon: Eye, onClick: () => setDetailIdx(idx) },
                        ...(r.status !== "مكتمل"
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
                    <Badge tone={r.status === "مكتمل" ? "success" : "warning"}>{r.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  </div>
                  <div className="font-semibold">
                    <PackageSearch size={13} className="inline ms-1 text-primary" />
                    {r.w}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                    <span className="tabular-nums">{r.items} صنف</span>
                  </div>
                  <div
                    className={`text-sm font-bold mt-1 ${r.diff < 0 ? "text-destructive" : r.diff > 0 ? "text-success" : ""}`}
                  >
                    الفرق: {r.diff}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => setDetailIdx(idx)}
                    >
                      عرض
                    </button>
                    {r.status !== "مكتمل" && (
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
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة جرد"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المستودع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formWarehouse}
              onChange={(e) => setFormWarehouse(e.target.value)}
            >
              <option>المستودع الرئيسي</option>
              <option>مستودع كسوة الشتاء</option>
              <option>مستودع الأدوية</option>
              <option>مستودع الفرع - جدة</option>
            </select>
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
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <textarea
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[80px]"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {detailIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setDetailIdx(-1)}
            onConfirm={() => setDetailIdx(-1)}
            title="تفاصيل الجرد"
            message={`المستودع: ${data[detailIdx]?.w}\nالتاريخ: ${data[detailIdx]?.date}\nالأصناف: ${data[detailIdx]?.items}\nالفروقات: ${data[detailIdx]?.diff}\nالحالة: ${data[detailIdx]?.status}`}
            confirmText="إغلاق"
            cancelText=""
          />
        )}

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الجرد؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
