import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Td,
  Badge,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";
import { Plus, Edit, Trash2 } from "lucide-react";

export const Route = createFileRoute("/finance/cost-centers")({
  head: () => ({ meta: [{ title: "مراكز التكلفة — ثواب" }] }),
  component: Page,
});

function Page() {
  const [rows, setRows] = useState([
    {
      c: "CC-100",
      n: "مركز المشاريع التشغيلية",
      mgr: "فهد العتيبي",
      b: 8_400_000,
      s: 5_120_000,
      status: "نشط",
    },
    {
      c: "CC-200",
      n: "مركز المساعدات المباشرة",
      mgr: "منى السلمي",
      b: 12_200_000,
      s: 7_840_000,
      status: "نشط",
    },
    {
      c: "CC-300",
      n: "مركز الإدارة العامة",
      mgr: "سعد الغامدي",
      b: 2_400_000,
      s: 1_640_000,
      status: "نشط",
    },
    {
      c: "CC-400",
      n: "مركز جمع التبرعات",
      mgr: "نورة الشهري",
      b: 1_400_000,
      s: 720_000,
      status: "نشط",
    },
    {
      c: "CC-500",
      n: "مركز الأوقاف",
      mgr: "عبدالرحمن العمر",
      b: 980_000,
      s: 410_000,
      status: "نشط",
    },
  ]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    manager: "",
    budget: "",
    status: "نشط",
  });

  const resetForm = () => {
    setFormData({ code: "", name: "", manager: "", budget: "", status: "نشط" });
    setEditingCode(null);
  };

  const handleSave = () => {
    if (!formData.code || !formData.name) {
      showToast("يرجى ملء الرمز والاسم", "error");
      return;
    }
    if (editingCode) {
      setRows((prev) =>
        prev.map((r) =>
          r.c === editingCode
            ? {
                ...r,
                n: formData.name,
                mgr: formData.manager,
                b: Number(formData.budget) || r.b,
                status: formData.status,
              }
            : r,
        ),
      );
      showToast("تم تعديل مركز التكلفة بنجاح", "success");
    } else {
      setRows((prev) => [
        ...prev,
        {
          c: formData.code,
          n: formData.name,
          mgr: formData.manager,
          b: Number(formData.budget) || 0,
          s: 0,
          status: formData.status,
        },
      ]);
      showToast("تم إنشاء مركز التكلفة بنجاح", "success");
    }
    setFormOpen(false);
    resetForm();
  };

  const handleDelete = () => {
    if (!deleteCode) return;
    setRows((prev) => prev.filter((r) => r.c !== deleteCode));
    setConfirmOpen(false);
    setDeleteCode(null);
    showToast("تم حذف مركز التكلفة", "success");
  };

  const handleEdit = (row: (typeof rows)[0]) => {
    setFormData({
      code: row.c,
      name: row.n,
      manager: row.mgr,
      budget: String(row.b),
      status: row.status,
    });
    setEditingCode(row.c);
    setFormOpen(true);
  };

  const exportData = rows.map((r) => ({
    الرمز: r.c,
    المركز: r.n,
    المسؤول: r.mgr,
    الموازنة: r.b,
    المنصرف: r.s,
    النسبة: `${Math.round((r.s / r.b) * 100)}%`,
    الحالة: r.status,
  }));

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "مراكز التكلفة"]}
      title="مراكز التكلفة"
      actions={
        <>
          <ExportButton data={exportData} filename="cost-centers.csv" />
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            <Plus size={15} />
            مركز جديد
          </Btn>
        </>
      }
    >
      <>
        <MobilePageHeader title="مراكز التكلفة" count={`${rows.length} مركز`} />
        <MobileTable
          columns={["الرمز", "المركز", "المسؤول", "الموازنة", "المنصرف", "النسبة", "الحالة", ""]}
          rows={rows}
          renderRow={(r) => {
            const pct = Math.round((r.s / r.b) * 100);
            return (
              <>
                <Td className="font-mono text-xs">{r.c}</Td>
                <Td className="font-semibold">{r.n}</Td>
                <Td className="text-muted-foreground">{r.mgr}</Td>
                <Td className="tabular-nums">{fmtSAR(r.b)}</Td>
                <Td className="tabular-nums">{fmtSAR(r.s)}</Td>
                <Td>
                  <div className="flex items-center gap-2 w-32">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs">{pct}%</span>
                  </div>
                </Td>
                <Td>
                  <Badge tone={r.status === "نشط" ? "success" : "muted"}>{r.status}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      { label: "تعديل", icon: Edit, onClick: () => handleEdit(r) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        onClick: () => {
                          setDeleteCode(r.c);
                          setConfirmOpen(true);
                        },
                        variant: "destructive",
                      },
                    ]}
                  />
                </Td>
              </>
            );
          }}
          mobileCard={(r) => {
            const pct = Math.round((r.s / r.b) * 100);
            return (
              <Card key={r.c} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={r.status === "نشط" ? "success" : "muted"}>{r.status}</Badge>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{r.c}</span>
                    <ActionMenu
                      actions={[
                        { label: "تعديل", icon: Edit, onClick: () => handleEdit(r) },
                        {
                          label: "حذف",
                          icon: Trash2,
                          onClick: () => {
                            setDeleteCode(r.c);
                            setConfirmOpen(true);
                          },
                          variant: "destructive",
                        },
                      ]}
                    />
                  </div>
                </div>
                <div className="font-semibold">{r.n}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.mgr}</div>
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs">{pct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span>الموازنة: {fmtSAR(r.b)}</span>
                  <span>المنصرف: {fmtSAR(r.s)}</span>
                </div>
              </Card>
            );
          }}
        />
      </>

      <EntityFormDrawer
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          resetForm();
        }}
        title={editingCode ? "تعديل مركز تكلفة" : "إضافة مركز تكلفة"}
        onSave={handleSave}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">الرمز</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="مثال: CC-600"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">الاسم</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="اسم المركز"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">المدير</label>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="اسم المدير"
                value={formData.manager}
                onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">الميزانية</label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="0"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="نشط">نشط</option>
              <option value="موقوف">موقوف</option>
            </select>
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        message="هل أنت متأكد من حذف مركز التكلفة هذا؟"
        confirmText="حذف"
        variant="destructive"
      />
    </AppShell>
  );
}
