import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { Warehouse, Plus, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type WH = { n: string; m: string; items: number; cap: number; loc: string; active: boolean };

export const Route = createFileRoute("/inventory/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<WH[]>([
      {
        n: "المستودع الرئيسي - الرياض",
        m: "حمد العنزي",
        items: 1240,
        cap: 85,
        loc: "الرياض",
        active: true,
      },
      {
        n: "مستودع كسوة الشتاء",
        m: "خالد الدوسري",
        items: 1840,
        cap: 62,
        loc: "الرياض",
        active: true,
      },
      { n: "مستودع الأدوية", m: "د. أحمد الشهري", items: 86, cap: 28, loc: "الرياض", active: true },
      { n: "مستودع الفرع - جدة", m: "محمد العمري", items: 980, cap: 72, loc: "جدة", active: true },
      {
        n: "مستودع حفظ النعمة",
        m: "ياسر القرني",
        items: 420,
        cap: 45,
        loc: "الرياض",
        active: true,
      },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formLoc, setFormLoc] = useState("");
    const [formManager, setFormManager] = useState("");
    const [formCap, setFormCap] = useState("");

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم المستودع", "error");
        return;
      }
      if (editIdx >= 0) {
        const d = [...data];
        d[editIdx] = {
          ...d[editIdx],
          n: formName,
          loc: formLoc,
          m: formManager,
          cap: Number(formCap) || 0,
        };
        setData(d);
        showToast("تم تعديل المستودع بنجاح", "success");
      } else {
        setData([
          {
            n: formName,
            m: formManager,
            items: 0,
            cap: Number(formCap) || 0,
            loc: formLoc,
            active: true,
          },
          ...data,
        ]);
        showToast("تم إضافة المستودع بنجاح", "success");
      }
      setFormOpen(false);
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف المستودع", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المخزون", "المستودعات"]}
          title="المستودعات"
          actions={
            <>
              <ExportButton
                data={data.map((x) => ({
                  الاسم: x.n,
                  الموقع: x.loc,
                  المسؤول: x.m,
                  السعة: x.cap,
                  الحالة: x.active ? "نشط" : "متوقف",
                  الاصناف: x.items,
                }))}
                filename="warehouses.csv"
              />
              <Btn
                variant="primary"
                onClick={() => {
                  setEditIdx(-1);
                  setFormName("");
                  setFormLoc("");
                  setFormManager("");
                  setFormCap("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} />
                إضافة مستودع
              </Btn>
            </>
          }
        >
          <MobilePageHeader title="المستودعات" count={`${data.length} مستودع`} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((x, idx) => (
              <Card key={x.n} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Warehouse size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold truncate">{x.n}</h3>
                      <div className="text-xs text-muted-foreground">المشرف: {x.m}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={x.active ? "success" : "muted"}>
                      {x.active ? "نشط" : "متوقف"}
                    </Badge>
                    <ActionMenu
                      actions={[
                        {
                          label: "تعديل",
                          icon: Edit,
                          onClick: () => {
                            setEditIdx(idx);
                            setFormName(x.n);
                            setFormLoc(x.loc);
                            setFormManager(x.m);
                            setFormCap(String(x.cap));
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
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <div className="text-xs text-muted-foreground">عدد الأصناف</div>
                    <div className="font-bold">{x.items}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">نسبة الإشغال</div>
                    <div className="font-bold">{x.cap}%</div>
                  </div>
                </div>
                <div className="h-2 mt-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${x.cap}%` }} />
                </div>
              </Card>
            ))}
          </div>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editIdx >= 0 ? "تعديل مستودع" : "إضافة مستودع"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم المستودع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الموقع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formLoc}
              onChange={(e) => setFormLoc(e.target.value)}
              placeholder="الموقع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المسؤول</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formManager}
              onChange={(e) => setFormManager(e.target.value)}
              placeholder="اسم المسؤول"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">السعة (%)</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              min="0"
              max="100"
              value={formCap}
              onChange={(e) => setFormCap(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1">
              <option>نشط</option>
              <option>متوقف</option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف المستودع؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
