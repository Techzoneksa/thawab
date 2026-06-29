import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";
import { MapPin, Plus, Pencil, Ban, CheckCircle2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/settings/branches")({
  head: () => ({ meta: [{ title: "الفروع — ثواب" }] }),
  component: () => {
    const [branches, setBranches] = useState([
      {
        n: "الفرع الرئيسي - الرياض",
        city: "الرياض",
        mgr: "د. عبدالله السبيعي",
        phone: "920001234",
        email: "hq@albir.org.sa",
        emp: 32,
        prj: 18,
        status: "نشط",
      },
      {
        n: "فرع جدة",
        city: "جدة",
        mgr: "أ. محمد العمري",
        phone: "920001235",
        email: "jeddah@albir.org.sa",
        emp: 14,
        prj: 7,
        status: "نشط",
      },
      {
        n: "فرع الدمام",
        city: "الدمام",
        mgr: "أ. خالد الدوسري",
        phone: "920001236",
        email: "dammam@albir.org.sa",
        emp: 10,
        prj: 5,
        status: "نشط",
      },
      {
        n: "فرع أبها",
        city: "أبها",
        mgr: "أ. سعيد الغامدي",
        phone: "920001237",
        email: "abha@albir.org.sa",
        emp: 8,
        prj: 4,
        status: "نشط",
      },
    ]);

    const [addOpen, setAddOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

    const [formName, setFormName] = useState("");
    const [formCity, setFormCity] = useState("");
    const [formMgr, setFormMgr] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formStatus, setFormStatus] = useState("نشط");

    function resetForm() {
      setFormName("");
      setFormCity("");
      setFormMgr("");
      setFormPhone("");
      setFormEmail("");
      setFormStatus("نشط");
    }

    function handleAdd() {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الفرع", "error");
        return;
      }
      const newBranch = {
        n: formName,
        city: formCity || "—",
        mgr: formMgr || "—",
        phone: formPhone || "—",
        email: formEmail || "—",
        emp: 0,
        prj: 0,
        status: formStatus,
      };
      setBranches([...branches, newBranch]);
      showToast(`تم إضافة الفرع ${formName} بنجاح`, "success");
      setAddOpen(false);
      resetForm();
    }

    function handleEdit(i: number) {
      const b = branches[i];
      setEditIdx(i);
      setFormName(b.n);
      setFormCity(b.city);
      setFormMgr(b.mgr);
      setFormPhone(b.phone);
      setFormEmail(b.email);
      setFormStatus(b.status);
      setEditOpen(true);
    }

    function handleSaveEdit() {
      if (editIdx === null) return;
      const updated = [...branches];
      updated[editIdx] = {
        ...updated[editIdx],
        n: formName,
        city: formCity,
        mgr: formMgr,
        phone: formPhone,
        email: formEmail,
        status: formStatus,
      };
      setBranches(updated);
      showToast(`تم تعديل الفرع ${formName} بنجاح`, "success");
      setEditOpen(false);
      setEditIdx(null);
      resetForm();
    }

    function toggleStatus(i: number) {
      const updated = [...branches];
      updated[i] = { ...updated[i], status: updated[i].status === "نشط" ? "موقوف" : "نشط" };
      setBranches(updated);
      showToast(
        `تم ${updated[i].status === "نشط" ? "تفعيل" : "تعطيل"} الفرع ${updated[i].n}`,
        "success",
      );
    }

    function handleDelete(i: number) {
      setConfirmAction(() => () => {
        setBranches(branches.filter((_, idx) => idx !== i));
        showToast("تم حذف الفرع بنجاح", "success");
      });
      setConfirmOpen(true);
    }

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "الفروع"]}
        title="فروع الجمعية"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              data={branches.map((b) => ({
                الفرع: b.n,
                المدينة: b.city,
                المدير: b.mgr,
                الجوال: b.phone,
                البريد: b.email,
                الحالة: b.status,
              }))}
              filename="branches.csv"
            />
            <Btn
              variant="primary"
              onClick={() => {
                resetForm();
                setAddOpen(true);
              }}
            >
              <Plus size={15} />
              فرع جديد
            </Btn>
          </div>
        }
      >
        <MobilePageHeader title="فروع الجمعية" count={`${branches.length} فرع`} />
        <MobileActionRow>
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setAddOpen(true);
            }}
          >
            <Plus size={15} />
            إضافة فرع
          </Btn>
        </MobileActionRow>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 lg:mt-0">
          {branches.map((b, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <MapPin size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold truncate">{b.n}</h3>
                    <div className="text-xs text-muted-foreground">{b.city}</div>
                  </div>
                </div>
                <Badge tone={statusTone(b.status)}>{b.status}</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>المدير: {b.mgr}</div>
                <div>الجوال: {b.phone}</div>
                <div>البريد: {b.email}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3 text-center">
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-[11px] text-muted-foreground">الموظفون</div>
                  <div className="font-bold mt-0.5">{b.emp}</div>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <div className="text-[11px] text-muted-foreground">المشاريع</div>
                  <div className="font-bold mt-0.5">{b.prj}</div>
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => handleEdit(i) },
                    {
                      label: b.status === "نشط" ? "تعطيل" : "تفعيل",
                      icon: b.status === "نشط" ? Ban : CheckCircle2,
                      onClick: () => toggleStatus(i),
                    },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive",
                      onClick: () => handleDelete(i),
                    },
                  ]}
                />
              </div>
            </Card>
          ))}
        </div>

        <EntityFormDrawer
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            resetForm();
          }}
          title="إضافة فرع جديد"
          onSave={handleAdd}
          saveText="إضافة"
        >
          <div>
            <label className="text-xs text-muted-foreground">اسم الفرع *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدينة</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formCity}
              onChange={(e) => setFormCity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدير</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formMgr}
              onChange={(e) => setFormMgr(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الجوال</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">البريد</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الحالة</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              <option>نشط</option>
              <option>موقوف</option>
            </select>
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditIdx(null);
            resetForm();
          }}
          title="تعديل الفرع"
          onSave={handleSaveEdit}
          saveText="حفظ التغييرات"
        >
          <div>
            <label className="text-xs text-muted-foreground">اسم الفرع</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدينة</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formCity}
              onChange={(e) => setFormCity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">المدير</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formMgr}
              onChange={(e) => setFormMgr(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الجوال</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">البريد</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الحالة</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
            >
              <option>نشط</option>
              <option>موقوف</option>
            </select>
          </div>
        </EntityFormDrawer>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            confirmAction();
            setConfirmOpen(false);
          }}
          title="تأكيد حذف الفرع"
          message="هل أنت متأكد من حذف هذا الفرع؟"
          confirmText="حذف"
          cancelText="إلغاء"
          variant="destructive"
        />
      </AppShell>
    );
  },
});
