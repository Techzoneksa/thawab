import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
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
import { Plus, Download, Eye, Edit, Trash2 } from "lucide-react";

export const Route = createFileRoute("/finance/budgets")({
  head: () => ({ meta: [{ title: "الموازنات — ثواب" }] }),
  component: Page,
});

function Page() {
  const [rows, setRows] = useState([
    {
      id: "1",
      dept: "إدارة المشاريع",
      budget: 8_400_000,
      spent: 5_120_000,
      period: "1446",
      notes: "",
    },
    {
      id: "2",
      dept: "إدارة المساعدات",
      budget: 12_200_000,
      spent: 7_840_000,
      period: "1446",
      notes: "",
    },
    {
      id: "3",
      dept: "الإدارة المالية",
      budget: 1_800_000,
      spent: 980_000,
      period: "1446",
      notes: "",
    },
    {
      id: "4",
      dept: "الموارد البشرية",
      budget: 2_400_000,
      spent: 1_640_000,
      period: "1446",
      notes: "",
    },
    {
      id: "5",
      dept: "تقنية المعلومات",
      budget: 1_200_000,
      spent: 720_000,
      period: "1446",
      notes: "",
    },
    {
      id: "6",
      dept: "العلاقات العامة",
      budget: 900_000,
      spent: 410_000,
      period: "1446",
      notes: "",
    },
  ]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ dept: "", budget: "", period: "1446", notes: "" });

  const resetForm = () => {
    setFormData({ dept: "", budget: "", period: "1446", notes: "" });
    setEditingId(null);
  };

  const handleSave = () => {
    if (!formData.dept || !formData.budget) {
      showToast("يرجى ملء اسم الإدارة والموازنة", "error");
      return;
    }
    if (editingId) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? {
                ...r,
                dept: formData.dept,
                budget: Number(formData.budget),
                period: formData.period,
                notes: formData.notes,
              }
            : r,
        ),
      );
      showToast("تم تعديل الموازنة بنجاح", "success");
    } else {
      setRows((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          dept: formData.dept,
          budget: Number(formData.budget),
          spent: 0,
          period: formData.period,
          notes: formData.notes,
        },
      ]);
      showToast("تم إنشاء الموازنة بنجاح", "success");
    }
    setFormOpen(false);
    resetForm();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteId));
    setConfirmOpen(false);
    setDeleteId(null);
    showToast("تم حذف الموازنة", "success");
  };

  const handleEdit = (row: (typeof rows)[0]) => {
    setFormData({
      dept: row.dept,
      budget: String(row.budget),
      period: row.period,
      notes: row.notes,
    });
    setEditingId(row.id);
    setFormOpen(true);
  };

  const exportData = rows.map((r) => ({
    الإدارة: r.dept,
    "السنة المالية": r.period,
    "الموازنة المعتمدة": r.budget,
    "المنصرف الفعلي": r.spent,
    المتبقي: r.budget - r.spent,
    "نسبة التنفيذ": `${Math.round((r.spent / r.budget) * 100)}%`,
    ملاحظات: r.notes,
  }));

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموازنات"]}
      title="الموازنات السنوية"
      actions={
        <>
          <ExportButton data={exportData} filename="budgets.csv" />
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
          >
            <Plus size={15} />
            موازنة جديدة
          </Btn>
        </>
      }
    >
      <>
        <MobilePageHeader title="الموازنات السنوية" count={`${rows.length} موازنة`} />
        <MobileTable
          columns={[
            "الإدارة",
            "السنة المالية",
            "الموازنة المعتمدة",
            "المنصرف الفعلي",
            "المتبقي",
            "نسبة التنفيذ",
            "الحالة",
            "",
          ]}
          rows={rows}
          renderRow={(r) => {
            const pct = Math.round((r.spent / r.budget) * 100);
            const status = pct > 90 ? "تجاوز متوقع" : pct > 70 ? "متقدم" : "ضمن المخطط";
            return (
              <>
                <Td className="font-semibold">{r.dept}</Td>
                <Td className="text-muted-foreground">{r.period}هـ</Td>
                <Td className="tabular-nums">{fmtSAR(r.budget)}</Td>
                <Td className="tabular-nums">{fmtSAR(r.spent)}</Td>
                <Td className="tabular-nums text-success">{fmtSAR(r.budget - r.spent)}</Td>
                <Td>
                  <div className="flex items-center gap-2 w-40">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{pct}%</span>
                  </div>
                </Td>
                <Td>
                  <Badge tone={pct > 90 ? "destructive" : pct > 70 ? "warning" : "success"}>
                    {status}
                  </Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () =>
                          showToast(`الموازنة: ${r.dept} - ${fmtSAR(r.budget)}`, "info"),
                      },
                      { label: "تعديل", icon: Edit, onClick: () => handleEdit(r) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        onClick: () => {
                          setDeleteId(r.id);
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
            const pct = Math.round((r.spent / r.budget) * 100);
            const status = pct > 90 ? "تجاوز متوقع" : pct > 70 ? "متقدم" : "ضمن المخطط";
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={pct > 90 ? "destructive" : pct > 70 ? "warning" : "success"}>
                    {status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.period}هـ</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{r.dept}</div>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () =>
                          showToast(`الموازنة: ${r.dept} - ${fmtSAR(r.budget)}`, "info"),
                      },
                      { label: "تعديل", icon: Edit, onClick: () => handleEdit(r) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        onClick: () => {
                          setDeleteId(r.id);
                          setConfirmOpen(true);
                        },
                        variant: "destructive",
                      },
                    ]}
                  />
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums">{pct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span>الموازنة: {fmtSAR(r.budget)}</span>
                  <span>المنصرف: {fmtSAR(r.spent)}</span>
                </div>
                <div className="text-xs text-success mt-1">
                  المتبقي: {fmtSAR(r.budget - r.spent)}
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
        title={editingId ? "تعديل موازنة" : "إضافة موازنة"}
        onSave={handleSave}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">اسم الإدارة</label>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="مثال: إدارة المشاريع"
              value={formData.dept}
              onChange={(e) => setFormData({ ...formData, dept: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">السنة المالية</label>
              <select
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
              >
                <option value="1446">1446هـ</option>
                <option value="1447">1447هـ</option>
                <option value="1448">1448هـ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">المبلغ المعتمد</label>
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
            <label className="block text-sm font-semibold mb-1">ملاحظات</label>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="ملاحظات اختيارية"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        message="هل أنت متأكد من حذف هذه الموازنة؟"
        confirmText="حذف"
        variant="destructive"
      />
    </AppShell>
  );
}
