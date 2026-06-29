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
import { ASSETS, fmtSAR } from "@/data/sample";
import { Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type AssetItem = {
  id: string;
  name: string;
  category: string;
  location: string;
  cost: number;
  depYear: number;
  status: string;
  project: string;
};

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "الأصول الثابتة — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<AssetItem[]>(ASSETS as AssetItem[]);
    const [formOpen, setFormOpen] = useState(false);
    const [depFormOpen, setDepFormOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState("");
    const [formLocation, setFormLocation] = useState("");
    const [formCost, setFormCost] = useState("");
    const [formStatus, setFormStatus] = useState("تشغيل");
    const [depAmount, setDepAmount] = useState("");

    const nextId = () => `AST-${String(data.length + 1).padStart(3, "0")}`;

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الأصل", "error");
        return;
      }
      if (editIdx >= 0) {
        const d = [...data];
        d[editIdx] = {
          ...d[editIdx],
          name: formName,
          category: formCategory,
          location: formLocation,
          cost: Number(formCost) || 0,
          status: formStatus,
        };
        setData(d);
        showToast("تم تعديل الأصل بنجاح", "success");
      } else {
        setData([
          {
            id: nextId(),
            name: formName,
            category: formCategory || "أجهزة مكتبية",
            location: formLocation,
            cost: Number(formCost) || 0,
            depYear: 0,
            status: formStatus,
            project: "—",
          },
          ...data,
        ]);
        showToast("تم إضافة الأصل بنجاح", "success");
      }
      setFormOpen(false);
    };

    const handleAddDep = () => {
      showToast(`تم إضافة إهلاك بقيمة ${fmtSAR(Number(depAmount) || 0)}`, "success");
      setDepFormOpen(false);
      setDepAmount("");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الأصل", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "الموارد", "الأصول الثابتة"]}
          title="الأصول الثابتة"
          actions={
            <>
              <ExportButton data={data} filename="assets.csv" />
              <Btn variant="outline" onClick={() => setDepFormOpen(true)}>
                إضافة إهلاك
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  setEditIdx(-1);
                  setFormName("");
                  setFormCategory("");
                  setFormLocation("");
                  setFormCost("");
                  setFormStatus("تشغيل");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة أصل ثابت
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="الأصول الثابتة" count={`${data.length} أصل`} />
            <MobileTable
              columns={[
                "الرقم",
                "الأصل",
                "الفئة",
                "الموقع",
                "التكلفة",
                "الإهلاك السنوي",
                "الحالة",
                "",
              ]}
              rows={data}
              renderRow={(a, idx) => (
                <>
                  <Td className="font-mono text-xs">{a.id}</Td>
                  <Td className="font-semibold">{a.name}</Td>
                  <Td>
                    <Badge tone="info">{a.category}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{a.location}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(a.cost)}</Td>
                  <Td className="tabular-nums">{fmtSAR(a.depYear)}</Td>
                  <Td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${a.name} - تكلفة: ${fmtSAR(a.cost)}`, "info"),
                        },
                        {
                          label: "تعديل",
                          icon: Edit,
                          onClick: () => {
                            setEditIdx(idx);
                            setFormName(a.name);
                            setFormCategory(a.category);
                            setFormLocation(a.location);
                            setFormCost(String(a.cost));
                            setFormStatus(a.status);
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
                  </Td>
                </>
              )}
              mobileCard={(a, idx) => (
                <Card key={a.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                  </div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge tone="info">{a.category}</Badge>
                    <span className="text-xs text-muted-foreground">{a.location}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(a.cost)}</span>
                    <span className="text-xs text-muted-foreground">
                      إهلاك: {fmtSAR(a.depYear)}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => {
                        setEditIdx(idx);
                        setFormName(a.name);
                        setFormCategory(a.category);
                        setFormLocation(a.location);
                        setFormCost(String(a.cost));
                        setFormStatus(a.status);
                        setFormOpen(true);
                      }}
                    >
                      تعديل
                    </button>
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => setDepFormOpen(true)}
                    >
                      إهلاك
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
          title={editIdx >= 0 ? "تعديل أصل" : "إضافة أصل ثابت"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم الأصل"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="مركبات/أجهزة مكتبية..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الموقع</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="الموقع"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">التكلفة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formCost}
              onChange={(e) => setFormCost(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              <option>تشغيل</option>
              <option>صيانة</option>
              <option>وقف</option>
              <option>مستبعد</option>
            </select>
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={depFormOpen}
          onClose={() => setDepFormOpen(false)}
          title="إضافة إهلاك"
          onSave={handleAddDep}
          saveText="إضافة"
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">قيمة الإهلاك</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={depAmount}
              onChange={(e) => setDepAmount(e.target.value)}
              placeholder="0"
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الأصل؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
