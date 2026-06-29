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
import { EMPLOYEES, fmtSAR } from "@/data/sample";
import { Plus, Briefcase, Calendar, FileText, BarChart3, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type EmployeeItem = {
  id: string;
  name: string;
  dept: string;
  title: string;
  salary: number;
  joined: string;
  status: string;
  phone: string;
};

export const Route = createFileRoute("/hr")({
  head: () => ({ meta: [{ title: "الموارد البشرية — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<EmployeeItem[]>(
      EMPLOYEES.map((e) => ({ ...e, phone: "05xxxxxxxx" })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formDept, setFormDept] = useState("");
    const [formTitle, setFormTitle] = useState("");
    const [formSalary, setFormSalary] = useState("");

    const nextId = () => `EMP-${String(data.length + 1).padStart(3, "0")}`;

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الموظف", "error");
        return;
      }
      if (editIdx >= 0) {
        const d = [...data];
        d[editIdx] = {
          ...d[editIdx],
          name: formName,
          dept: formDept,
          title: formTitle,
          salary: Number(formSalary) || 0,
        };
        setData(d);
        showToast("تم تعديل الموظف بنجاح", "success");
      } else {
        setData([
          {
            id: nextId(),
            name: formName,
            dept: formDept || "غير محدد",
            title: formTitle,
            salary: Number(formSalary) || 0,
            joined: new Date().toLocaleDateString("ar-SA"),
            status: "نشط",
            phone: "05xxxxxxxx",
          },
          ...data,
        ]);
        showToast("تم إضافة الموظف بنجاح", "success");
      }
      setFormOpen(false);
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الموظف", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "الموارد", "الموارد البشرية"]}
          title="الموارد البشرية"
          actions={
            <>
              <ExportButton data={data} filename="employees.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setEditIdx(-1);
                  setFormName("");
                  setFormDept("");
                  setFormTitle("");
                  setFormSalary("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة موظف
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3 lg:mb-4">
            {[
              { l: "إجمالي الموظفين", v: String(data.length), i: Briefcase },
              {
                l: "في إجازة",
                v: String(data.filter((e) => e.status === "إجازة").length),
                i: Calendar,
              },
              {
                l: "إجمالي الرواتب الشهرية",
                v: fmtSAR(data.reduce((a, e) => a + e.salary, 0)),
                i: FileText,
              },
              {
                l: "متوسط الراتب",
                v: fmtSAR(Math.round(data.reduce((a, e) => a + e.salary, 0) / data.length) || 0),
                i: BarChart3,
              },
            ].map((s) => (
              <Card key={s.l} className="p-3 lg:p-4 flex items-center gap-3">
                <div className="grid h-9 w-9 lg:h-10 lg:w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <s.i size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{s.l}</div>
                  <div className="text-base lg:text-lg font-extrabold tabular-nums truncate">
                    {s.v}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <MobilePageHeader title="الموظفون" count={`${data.length} موظف`} />

          <MobileTable
            columns={[
              "الرقم",
              "الموظف",
              "الإدارة",
              "المسمى الوظيفي",
              "الراتب",
              "تاريخ التعيين",
              "الحالة",
              "",
            ]}
            rows={data}
            renderRow={(e, idx) => (
              <>
                <Td className="font-mono text-xs">{e.id}</Td>
                <Td className="font-semibold">{e.name}</Td>
                <Td>{e.dept}</Td>
                <Td className="text-muted-foreground">{e.title}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(e.salary)}</Td>
                <Td className="text-muted-foreground">{e.joined}هـ</Td>
                <Td>
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () => showToast(`${e.name} - ${e.title}`, "info"),
                      },
                      {
                        label: "تعديل",
                        icon: Edit,
                        onClick: () => {
                          setEditIdx(idx);
                          setFormName(e.name);
                          setFormDept(e.dept);
                          setFormTitle(e.title);
                          setFormSalary(String(e.salary));
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
            mobileCard={(e, idx) => (
              <div key={e.id} className="rounded-xl border bg-card shadow-card p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {e.name.split(" ")[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate">{e.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{e.title}</div>
                      </div>
                      <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">الإدارة: </span>
                    <span className="font-semibold">{e.dept}</span>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">الراتب: </span>
                    <span className="font-bold tabular-nums">{fmtSAR(e.salary)}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{e.id}</span>
                  <span>تعيين: {e.joined}هـ</span>
                </div>
                <div className="mt-2 pt-2 border-t flex gap-2">
                  <button
                    className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                    onClick={() => showToast(`الملف الوظيفي لـ ${e.name}`, "info")}
                  >
                    عرض الملف الوظيفي
                  </button>
                  <button
                    className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                    onClick={() => {
                      setEditIdx(idx);
                      setFormName(e.name);
                      setFormDept(e.dept);
                      setFormTitle(e.title);
                      setFormSalary(String(e.salary));
                      setFormOpen(true);
                    }}
                  >
                    تعديل
                  </button>
                </div>
              </div>
            )}
          />
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editIdx >= 0 ? "تعديل موظف" : "إضافة موظف"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الإدارة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDept}
              onChange={(e) => setFormDept(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المسمى الوظيفي</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الراتب</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formSalary}
              onChange={(e) => setFormSalary(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الموظف؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
