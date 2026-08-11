import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  EmptyState,
} from "@/components/erp/actions";
import { KeyRound, Plus, Pencil, Copy, Trash2, ShieldPlus } from "lucide-react";

type RoleRow = { role: string; [key: string]: string };
const PERMISSIONS_MATRIX: RoleRow[] = [];

export const Route = createFileRoute("/permissions")({
  head: () => ({ meta: [{ title: "الصلاحيات — ثواب" }] }),
  component: Page,
});

function tone(v: string) {
  if (v === "كامل") return "success";
  if (v === "اعتماد") return "primary";
  if (v === "إدخال" || v === "طلب") return "info";
  if (v === "قراءة" || v === "محدود") return "muted";
  return "muted";
}

const modules = ["finance", "donations", "projects", "procurement", "reports", "settings"] as const;
const labels: Record<string, string> = {
  finance: "المالية",
  donations: "التبرعات",
  projects: "المشاريع",
  procurement: "المشتريات",
  reports: "التقارير",
  settings: "الإعدادات",
};
const permLevels = ["—", "قراءة", "محدود", "إدخال", "طلب", "اعتماد", "كامل"];

function Page() {
  const [matrix, setMatrix] = useState(PERMISSIONS_MATRIX.map((r) => ({ ...r })));

  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [addPermOpen, setAddPermOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const [formRole, setFormRole] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPerms, setFormPerms] = useState<string[]>(["المالية"]);
  const [permName, setPermName] = useState("");
  const [permModule, setPermModule] = useState("المالية");

  const permOptions = ["المالية", "التبرعات", "المشاريع", "المشتريات", "التقارير", "الإعدادات"];

  function resetForm() {
    setFormRole("");
    setFormDesc("");
    setFormPerms(["المالية"]);
  }

  function handleAddRole() {
    if (!formRole.trim()) {
      showToast("يرجى إدخال اسم الدور", "error");
      return;
    }
    const newRole: any = { role: formRole };
    modules.forEach((m) => {
      newRole[m] = "قراءة";
    });
    setMatrix([...matrix, newRole]);
    showToast(`تم إضافة الدور ${formRole} بنجاح`, "success");
    setAddRoleOpen(false);
    resetForm();
  }

  function handleAddPerm() {
    if (!permName.trim()) {
      showToast("يرجى إدخال اسم الصلاحية", "error");
      return;
    }
    showToast(`تم إضافة الصلاحية ${permName} لوحدة ${permModule}`, "success");
    setAddPermOpen(false);
    setPermName("");
    setPermModule("المالية");
  }

  function handleEdit(i: number) {
    setEditIdx(i);
    setFormRole(matrix[i].role);
    setAddRoleOpen(false);
    setEditOpen(true);
  }

  function handleSaveEdit() {
    if (editIdx === null) return;
    const updated = [...matrix];
    updated[editIdx] = { ...updated[editIdx], role: formRole };
    setMatrix(updated);
    showToast(`تم تعديل الدور ${formRole} بنجاح`, "success");
    setEditOpen(false);
    setEditIdx(null);
  }

  function handleDuplicate(i: number) {
    const newRole = { ...matrix[i], role: `${matrix[i].role} (نسخة)` };
    setMatrix([...matrix, newRole]);
    showToast(`تم نسخ الدور ${matrix[i].role}`, "success");
  }

  function handleDelete(i: number) {
    setConfirmAction(() => () => {
      setMatrix(matrix.filter((_, idx) => idx !== i));
      showToast("تم حذف الدور", "success");
    });
    setConfirmOpen(true);
  }

  function handlePermChange(idx: number, mod: string, val: string) {
    const updated = [...matrix];
    (updated[idx] as any)[mod] = val;
    setMatrix(updated);
    showToast(
      `تم تحديث صلاحية ${mod === "finance" ? "المالية" : labels[mod] || mod} لـ ${updated[idx].role}`,
      "success",
    );
  }

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التقارير والحوكمة", "الصلاحيات"]}
      title="مصفوفة الصلاحيات (RBAC)"
      actions={
        <div className="flex items-center gap-2">
          <Btn
            variant="outline"
            onClick={() => {
              setPermName("");
              setPermModule("المالية");
              setAddPermOpen(true);
            }}
          >
            <ShieldPlus size={15} />
            <span className="hidden md:inline">إضافة صلاحية</span>
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setAddRoleOpen(true);
            }}
          >
            <Plus size={15} />
            دور جديد
          </Btn>
        </div>
      }
    >
      <MobilePageHeader title="مصفوفة الصلاحيات" count={`${matrix.length} دور`} />
      <MobileActionRow>
        <Btn
          variant="outline"
          onClick={() => {
            setPermName("");
            setPermModule("المالية");
            setAddPermOpen(true);
          }}
        >
          <ShieldPlus size={15} /> إضافة صلاحية
        </Btn>
        <Btn
          variant="primary"
          onClick={() => {
            resetForm();
            setAddRoleOpen(true);
          }}
        >
          <Plus size={15} /> إضافة دور
        </Btn>
      </MobileActionRow>
      <div className="mt-3 lg:mt-0" />
      {matrix.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<KeyRound size={40} />}
            title="لا توجد أدوار مُعرّفة"
            description="تُدار الصلاحيات عبر الأدوار. استخدم زر «دور جديد» لإضافة أول دور وتحديد صلاحياته."
          />
        </Card>
      ) : (
      <MobileTable
        columns={["الدور", ...modules.map((m) => labels[m]), ""]}
        rows={matrix}
        renderRow={(r, i) => (
          <>
            <Td className="font-semibold">
              <KeyRound size={14} className="inline ms-1 text-primary" />
              {r.role}
            </Td>
            {modules.map((m) => (
              <Td key={m} className="text-center">
                <select
                  className="appearance-none rounded-lg border bg-background px-2 py-1 text-xs min-h-[32px] cursor-pointer"
                  value={(r as any)[m]}
                  onChange={(e) => handlePermChange(i, m, e.target.value)}
                >
                  {permLevels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Td>
            ))}
            <Td>
              <ActionMenu
                actions={[
                  { label: "تعديل", icon: Pencil, onClick: () => handleEdit(i) },
                  { label: "نسخ الدور", icon: Copy, onClick: () => handleDuplicate(i) },
                  {
                    label: "حذف",
                    icon: Trash2,
                    variant: "destructive",
                    onClick: () => handleDelete(i),
                  },
                ]}
              />
            </Td>
          </>
        )}
        mobileCard={(r, i) => (
          <Card key={r.role} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">
                <KeyRound size={14} className="inline ms-1 text-primary" />
                {r.role}
              </div>
              <ActionMenu
                actions={[
                  { label: "تعديل", icon: Pencil, onClick: () => handleEdit(i) },
                  { label: "نسخ الدور", icon: Copy, onClick: () => handleDuplicate(i) },
                  {
                    label: "حذف",
                    icon: Trash2,
                    variant: "destructive",
                    onClick: () => handleDelete(i),
                  },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {modules.map((m) => (
                <div key={m} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{labels[m]}:</span>
                  <select
                    className="appearance-none rounded-lg border bg-background px-1.5 py-0.5 text-xs"
                    value={(r as any)[m]}
                    onChange={(e) => handlePermChange(i, m, e.target.value)}
                  >
                    {permLevels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        )}
      />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card className="p-5">
          <h3 className="font-bold mb-3">فصل المهام (SoD)</h3>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>✓ المنشئ ≠ المعتمِد للقيود المالية</li>
            <li>✓ المشتريات ≠ السداد</li>
            <li>✓ صرف المساعدة يتطلب 3 مستويات اعتماد</li>
            <li>✓ تعديل الميزانية يتطلب موافقة المجلس</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">المصادقة الثنائية 2FA</h3>
          <p className="text-sm text-muted-foreground mb-3">
            مفعّلة لجميع المستخدمين ذوي الصلاحيات المالية والإدارية.
          </p>
          <Badge tone="success">مفعّلة</Badge>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-3">سياسة كلمات المرور</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• الحد الأدنى 12 حرفاً</li>
            <li>• تجديد كل 90 يوم</li>
            <li>• حظر آخر 5 كلمات مرور</li>
            <li>• قفل بعد 5 محاولات فاشلة</li>
          </ul>
        </Card>
      </div>

      <EntityFormDrawer
        open={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        title="إضافة دور جديد"
        onSave={handleAddRole}
        saveText="إضافة"
      >
        <div>
          <label className="text-xs text-muted-foreground">اسم الدور *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الوصف</label>
          <textarea
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm min-h-[80px]"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الصلاحيات</label>
          <div className="mt-1 space-y-2">
            {permOptions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={formPerms.includes(p)}
                  onChange={(e) => {
                    if (e.target.checked) setFormPerms([...formPerms, p]);
                    else setFormPerms(formPerms.filter((x) => x !== p));
                  }}
                />
                {p}
              </label>
            ))}
          </div>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={addPermOpen}
        onClose={() => setAddPermOpen(false)}
        title="إضافة صلاحية جديدة"
        onSave={handleAddPerm}
        saveText="إضافة"
      >
        <div>
          <label className="text-xs text-muted-foreground">اسم الصلاحية *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={permName}
            onChange={(e) => setPermName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الوحدة</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={permModule}
            onChange={(e) => setPermModule(e.target.value)}
          >
            {permOptions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditIdx(null);
        }}
        title="تعديل الدور"
        onSave={handleSaveEdit}
        saveText="حفظ التغييرات"
      >
        <div>
          <label className="text-xs text-muted-foreground">اسم الدور</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
          />
        </div>
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmAction();
          setConfirmOpen(false);
        }}
        title="تأكيد حذف الدور"
        message="هل أنت متأكد من حذف هذا الدور؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
