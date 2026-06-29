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
import { ENDOWMENTS, fmtSAR } from "@/data/sample";
import { Landmark, Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type EndowmentItem = {
  id: string;
  name: string;
  type: string;
  value: number;
  yearReturn: number;
  status: string;
};

export const Route = createFileRoute("/endowments")({
  head: () => ({ meta: [{ title: "الأوقاف — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<EndowmentItem[]>(ENDOWMENTS as EndowmentItem[]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState("نقدي");
    const [formValue, setFormValue] = useState("");

    const nextId = () => `WQF-${String(data.length + 1).padStart(3, "0")}`;

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الوقف", "error");
        return;
      }
      setData([
        {
          id: nextId(),
          name: formName,
          type: formType,
          value: Number(formValue) || 0,
          yearReturn: 0,
          status: "مستثمر",
        },
        ...data,
      ]);
      showToast("تم إضافة الوقف بنجاح", "success");
      setFormOpen(false);
      setFormName("");
      setFormType("نقدي");
      setFormValue("");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الوقف", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "الأوقاف"]}
          title="إدارة الأوقاف"
          actions={
            <>
              <ExportButton data={data} filename="endowments.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormName("");
                  setFormType("نقدي");
                  setFormValue("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة وقف
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { l: "إجمالي قيمة الأوقاف", v: fmtSAR(data.reduce((a, e) => a + e.value, 0)) },
              { l: "عوائد متوقعة سنوياً", v: fmtSAR(data.reduce((a, e) => a + e.yearReturn, 0)) },
              { l: "عدد الأوقاف", v: String(data.length) },
              {
                l: "نسبة العائد",
                v:
                  data.length > 0
                    ? `${Math.round((data.reduce((a, e) => a + e.yearReturn, 0) / data.reduce((a, e) => a + e.value, 0)) * 100)}%`
                    : "0%",
              },
            ].map((s) => (
              <Card key={s.l} className="p-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
              </Card>
            ))}
          </div>
          <>
            <MobilePageHeader title="إدارة الأوقاف" count={`${data.length} وقف`} />
            <MobileTable
              columns={["الرقم", "اسم الوقف", "النوع", "القيمة", "العائد السنوي", "الحالة", ""]}
              rows={data}
              renderRow={(w, idx) => (
                <>
                  <Td className="font-mono text-xs">{w.id}</Td>
                  <Td className="font-semibold">
                    <Landmark size={13} className="inline ms-1 text-primary" />
                    {w.name}
                  </Td>
                  <Td>
                    <Badge tone="info">{w.type}</Badge>
                  </Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(w.value)}</Td>
                  <Td className="tabular-nums text-success font-semibold">
                    {fmtSAR(w.yearReturn)}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${w.name} - ${fmtSAR(w.value)}`, "info"),
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
              mobileCard={(w) => (
                <Card key={w.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                    <Badge tone="info">{w.type}</Badge>
                  </div>
                  <div className="font-semibold">
                    <Landmark size={13} className="inline ms-1 text-primary" />
                    {w.name}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(w.value)}</span>
                    <span className="tabular-nums text-success font-semibold text-sm">
                      {fmtSAR(w.yearReturn)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">العائد السنوي</div>
                </Card>
              )}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة وقف"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم الوقف</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم الوقف"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              <option>نقدي</option>
              <option>عقاري</option>
              <option>أسهم</option>
              <option>صندوق استثماري</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">القيمة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الوقف؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
