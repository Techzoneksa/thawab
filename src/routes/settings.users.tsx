import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
  MobileTable,
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
import { UserCog, Plus, RotateCcw, Pencil, Ban, CheckCircle2, KeyRound } from "lucide-react";
import { getUsers, createUser, updateUser, disableUser, type AppUser } from "@/lib/api/users";
import { label } from "@/lib/i18n/labels";
import { UserStatus } from "@/lib/enums";

export const Route = createFileRoute("/settings/users")({
  head: () => ({ meta: [{ title: "المستخدمون — ثواب" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => getUsers() });
  const users = data?.items ?? [];
  const roles = data?.roles ?? [];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  // form state
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fRole, setFRole] = useState("");
  const [fStatus, setFStatus] = useState<string>(UserStatus.ACTIVE);
  const [fPassword, setFPassword] = useState("");
  const [fMustChange, setFMustChange] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: (res) => {
      invalidate();
      setDrawerOpen(false);
      if (res.tempPassword) {
        showToast(`تم إنشاء المستخدم. كلمة المرور المؤقتة: ${res.tempPassword} — شاركها معه`, "success");
      } else {
        showToast("تم إنشاء المستخدم بنجاح", "success");
      }
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const updateMut = useMutation({
    mutationFn: updateUser,
    onSuccess: (_r, vars) => {
      invalidate();
      setDrawerOpen(false);
      setEditUser(null);
      showToast(vars.password ? "تم تحديث كلمة المرور" : "تم حفظ التغييرات", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  function openCreate() {
    setEditUser(null);
    setFName("");
    setFEmail("");
    setFPhone("");
    setFRole(roles[0]?.id ?? "");
    setFStatus(UserStatus.ACTIVE);
    setFPassword("");
    setFMustChange(false);
    setDrawerOpen(true);
  }

  function openEdit(u: AppUser) {
    setEditUser(u);
    setFName(u.name);
    setFEmail(u.email);
    setFPhone(u.phone ?? "");
    setFRole(u.role);
    setFStatus(u.status);
    setFPassword("");
    setFMustChange(false);
    setDrawerOpen(true);
  }

  function handleSave() {
    if (editUser) {
      if (!fName.trim()) return showToast("الاسم مطلوب", "error");
      updateMut.mutate({
        id: editUser.id,
        name: fName.trim(),
        role: fRole,
        phone: fPhone,
        status: fStatus,
        ...(fPassword ? { password: fPassword, mustChangePassword: fMustChange } : {}),
      });
    } else {
      if (!fName.trim() || !fEmail.trim() || !fRole) return showToast("عبّئ الاسم والبريد والدور", "error");
      createMut.mutate({
        name: fName.trim(),
        email: fEmail.trim(),
        role: fRole,
        phone: fPhone || undefined,
        ...(fPassword ? { password: fPassword, mustChangePassword: fMustChange } : {}),
      });
    }
  }

  function toggleStatus(u: AppUser) {
    const next = u.status === UserStatus.ACTIVE ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    updateMut.mutate({ id: u.id, status: next });
  }

  function confirmDisable(u: AppUser) {
    setConfirmAction(() => async () => {
      try {
        await disableUser(u.id);
        invalidate();
        showToast(`تم تعطيل ${u.name}`, "success");
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    });
    setConfirmOpen(true);
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الإعدادات", "المستخدمون"]}
      title="إدارة المستخدمين"
      actions={
        <div className="flex items-center gap-2">
          <ExportButton
            data={users.map((u) => ({
              الاسم: u.name,
              البريد: u.email,
              الدور: roleName(u.role),
              الحالة: label("userStatus", u.status),
            }))}
            filename="users.csv"
          />
          <Btn variant="primary" onClick={openCreate}>
            <Plus size={15} /> مستخدم جديد
          </Btn>
        </div>
      }
    >
      <MobilePageHeader title="إدارة المستخدمين" count={`${users.length} مستخدم`} />
      <MobileActionRow>
        <Btn variant="primary" onClick={openCreate}>
          <Plus size={15} /> إضافة مستخدم
        </Btn>
      </MobileActionRow>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">جارٍ التحميل…</Card>
      ) : (
        <MobileTable
          columns={["المستخدم", "البريد", "الدور", "الحالة", ""]}
          rows={users}
          renderRow={(u) => (
            <>
              <Td className="font-semibold">
                <UserCog size={13} className="inline ms-1 text-primary" />
                {u.name}
              </Td>
              <Td className="font-mono text-xs text-muted-foreground">{u.email}</Td>
              <Td>{roleName(u.role)}</Td>
              <Td>
                <Badge tone={statusTone(u.status)}>{label("userStatus", u.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(u) },
                    {
                      label: u.status === UserStatus.ACTIVE ? "إيقاف" : "تفعيل",
                      icon: u.status === UserStatus.ACTIVE ? Ban : CheckCircle2,
                      onClick: () => toggleStatus(u),
                    },
                    { label: "تعيين كلمة مرور", icon: KeyRound, onClick: () => openEdit(u) },
                    {
                      label: "تعطيل المستخدم",
                      icon: Ban,
                      variant: "destructive",
                      onClick: () => confirmDisable(u),
                    },
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(u) => (
            <Card key={u.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">
                  <UserCog size={13} className="inline ms-1 text-primary" />
                  {u.name}
                </div>
                <Badge tone={statusTone(u.status)}>{label("userStatus", u.status)}</Badge>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
              <div className="text-xs text-muted-foreground mt-1">{roleName(u.role)}</div>
              <div className="flex gap-2 mt-2">
                <Btn variant="outline" className="flex-1 text-xs" onClick={() => openEdit(u)}>
                  <Pencil size={12} /> تعديل
                </Btn>
                <Btn variant="outline" className="flex-1 text-xs" onClick={() => toggleStatus(u)}>
                  {u.status === UserStatus.ACTIVE ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                  {u.status === UserStatus.ACTIVE ? "إيقاف" : "تفعيل"}
                </Btn>
              </div>
            </Card>
          )}
        />
      )}

      <EntityFormDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditUser(null);
        }}
        title={editUser ? "تعديل المستخدم" : "إضافة مستخدم جديد"}
        onSave={handleSave}
        saveText={editUser ? "حفظ التغييرات" : "إنشاء"}
      >
        <div>
          <label className="text-xs text-muted-foreground">الاسم *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">البريد الإلكتروني *</label>
          <input
            type="email"
            dir="ltr"
            disabled={!!editUser}
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm disabled:opacity-60"
            value={fEmail}
            onChange={(e) => setFEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">رقم الجوال</label>
          <input
            dir="ltr"
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={fPhone}
            onChange={(e) => setFPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الدور / الصلاحيات *</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={fRole}
            onChange={(e) => setFRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {editUser && (
          <div>
            <label className="text-xs text-muted-foreground">الحالة</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value={UserStatus.ACTIVE}>{label("userStatus", UserStatus.ACTIVE)}</option>
              <option value={UserStatus.INACTIVE}>{label("userStatus", UserStatus.INACTIVE)}</option>
              <option value={UserStatus.SUSPENDED}>{label("userStatus", UserStatus.SUSPENDED)}</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">
            {editUser ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور (اتركها فارغة لإنشاء دعوة بكلمة مؤقتة)"}
          </label>
          <input
            type="text"
            dir="ltr"
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={fPassword}
            placeholder="8 أحرف على الأقل"
            onChange={(e) => setFPassword(e.target.value)}
          />
        </div>
        {fPassword && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={fMustChange} onChange={(e) => setFMustChange(e.target.checked)} />
            إجبار تغيير كلمة المرور عند أول تسجيل دخول
          </label>
        )}
      </EntityFormDrawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmAction();
          setConfirmOpen(false);
        }}
        title="تعطيل المستخدم"
        message="سيتم تعطيل هذا المستخدم وإنهاء جلساته. يمكنك إعادة تفعيله لاحقاً."
        confirmText="تعطيل"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
