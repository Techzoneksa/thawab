import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  MobileActionRow,
} from "@/components/erp/AppShell";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";
import {
  UserCog,
  Plus,
  ShieldCheck,
  UserPlus,
  Mail,
  RotateCcw,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Ban,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/settings/users")({
  head: () => ({ meta: [{ title: "المستخدمون — ثواب" }] }),
  component: () => {
    const [users, setUsers] = useState([
      {
        id: "USR-001",
        name: "د. عبدالله السبيعي",
        email: "ceo@albir.org.sa",
        role: "المدير التنفيذي",
        twofa: true,
        last: "اليوم 11:24",
        status: "نشط",
      },
      {
        id: "USR-002",
        name: "سعد الغامدي",
        email: "cfo@albir.org.sa",
        role: "المدير المالي",
        twofa: true,
        last: "اليوم 10:40",
        status: "نشط",
      },
      {
        id: "USR-003",
        name: "سارة الزهراني",
        email: "s.zahrani@albir.org.sa",
        role: "محاسب",
        twofa: true,
        last: "اليوم 09:58",
        status: "نشط",
      },
      {
        id: "USR-004",
        name: "فهد العتيبي",
        email: "f.otaibi@albir.org.sa",
        role: "مدير المشاريع",
        twofa: false,
        last: "أمس 17:12",
        status: "نشط",
      },
      {
        id: "USR-005",
        name: "خالد الدوسري",
        email: "k.dossari@albir.org.sa",
        role: "أخصائي مشتريات",
        twofa: true,
        last: "أمس 14:20",
        status: "إجازة",
      },
      {
        id: "USR-006",
        name: "منى السلمي",
        email: "m.salmi@albir.org.sa",
        role: "باحث اجتماعي",
        twofa: false,
        last: "1446/10/10",
        status: "نشط",
      },
    ]);

    const [addOpen, setAddOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editUser, setEditUser] = useState<any>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

    const [formName, setFormName] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formRole, setFormRole] = useState("محاسب");
    const [formBranch, setFormBranch] = useState("الفرع الرئيسي");
    const [formStatus, setFormStatus] = useState("نشط");
    const [formPerms, setFormPerms] = useState("صلاحيات مالية");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("محاسب");
    const [inviteMsg, setInviteMsg] = useState("");

    const roles = [
      "المدير التنفيذي",
      "المدير المالي",
      "محاسب",
      "مدير المشاريع",
      "أخصائي مشتريات",
      "باحث اجتماعي",
    ];
    const branches = ["الفرع الرئيسي", "فرع جدة", "فرع الدمام", "فرع أبها"];
    const permsOptions = [
      "صلاحيات مالية",
      "صلاحيات مشاريع",
      "صلاحيات مشتريات",
      "صلاحيات إدارية",
      "صلاحيات تقارير",
    ];

    function handleAdd() {
      if (!formName.trim() || !formEmail.trim()) {
        showToast("يرجى تعبئة الحقول المطلوبة", "error");
        return;
      }
      const newUser = {
        id: `USR-${String(users.length + 1).padStart(3, "0")}`,
        name: formName,
        email: formEmail,
        role: formRole,
        twofa: false,
        last: "—",
        status: formStatus,
      };
      setUsers([...users, newUser]);
      showToast(`تم إضافة المستخدم ${formName} بنجاح`, "success");
      setAddOpen(false);
      setFormName("");
      setFormEmail("");
      setFormPhone("");
      setFormRole("محاسب");
      setFormBranch("الفرع الرئيسي");
      setFormStatus("نشط");
      setFormPerms("صلاحيات مالية");
    }

    function handleInvite() {
      if (!inviteEmail.trim()) {
        showToast("يرجى إدخال البريد الإلكتروني", "error");
        return;
      }
      showToast(`تم إرسال دعوة التسجيل إلى ${inviteEmail}`, "success");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("محاسب");
      setInviteMsg("");
    }

    function handleEdit(u: any) {
      setEditUser(u);
      setFormName(u.name);
      setFormEmail(u.email);
      setFormPhone("");
      setFormRole(u.role);
      setFormBranch("الفرع الرئيسي");
      setFormStatus(u.status);
      setFormPerms("صلاحيات مالية");
      setEditOpen(true);
    }

    function handleSaveEdit() {
      if (!editUser) return;
      setUsers(
        users.map((u) =>
          u.id === editUser.id
            ? { ...u, name: formName, email: formEmail, role: formRole, status: formStatus }
            : u,
        ),
      );
      showToast(`تم تعديل المستخدم ${formName} بنجاح`, "success");
      setEditOpen(false);
      setEditUser(null);
    }

    function toggleStatus(u: any) {
      const newStatus = u.status === "نشط" ? "موقوف" : "نشط";
      setUsers(users.map((x) => (x.id === u.id ? { ...x, status: newStatus } : x)));
      showToast(`تم ${newStatus === "نشط" ? "تفعيل" : "إيقاف"} المستخدم ${u.name}`, "success");
    }

    function handleDelete(u: any) {
      if (u.name === "سعد الغامدي") {
        showToast("لا يمكن حذف المستخدم سعد الغامدي", "error");
        return;
      }
      setConfirmAction(() => () => {
        setUsers(users.filter((x) => x.id !== u.id));
        showToast(`تم حذف المستخدم ${u.name}`, "success");
      });
      setConfirmOpen(true);
    }

    function handleResetPassword(u: any) {
      showToast(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${u.email}`, "success");
    }

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الإعدادات", "المستخدمون"]}
        title="إدارة المستخدمين"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              data={users.map((u) => ({
                الرقم: u.id,
                الاسم: u.name,
                البريد: u.email,
                الدور: u.role,
                الحالة: u.status,
              }))}
              filename="users.csv"
            />
            <Btn variant="outline" onClick={() => setInviteOpen(true)}>
              <Mail size={15} />
              <span className="hidden md:inline">دعوة مستخدم</span>
            </Btn>
            <Btn variant="primary" onClick={() => setAddOpen(true)}>
              <Plus size={15} />
              مستخدم جديد
            </Btn>
          </div>
        }
      >
        <MobilePageHeader title="إدارة المستخدمين" count={`${users.length} مستخدم`} />
        <MobileActionRow>
          <Btn variant="outline" onClick={() => setInviteOpen(true)}>
            <Mail size={15} />
            دعوة مستخدم
          </Btn>
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={15} />
            إضافة مستخدم
          </Btn>
        </MobileActionRow>
        <div className="mt-3 lg:mt-0" />
        <MobileTable
          columns={["الرقم", "المستخدم", "البريد", "الدور", "2FA", "آخر دخول", "الحالة", ""]}
          rows={users}
          renderRow={(u) => (
            <>
              <Td className="font-mono text-xs">{u.id}</Td>
              <Td className="font-semibold">
                <UserCog size={13} className="inline ms-1 text-primary" />
                {u.name}
              </Td>
              <Td className="font-mono text-xs text-muted-foreground">{u.email}</Td>
              <Td>{u.role}</Td>
              <Td>
                {u.twofa ? (
                  <Badge tone="success">
                    <ShieldCheck size={11} className="inline ms-1" />
                    مفعّل
                  </Badge>
                ) : (
                  <Badge tone="warning">غير مفعّل</Badge>
                )}
              </Td>
              <Td className="text-muted-foreground text-xs">{u.last}</Td>
              <Td>
                <Badge tone={statusTone(u.status)}>{u.status}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => handleEdit(u) },
                    {
                      label: u.status === "نشط" ? "تعطيل" : "تفعيل",
                      icon: u.status === "نشط" ? Ban : CheckCircle2,
                      onClick: () => toggleStatus(u),
                    },
                    {
                      label: "إعادة تعيين كلمة المرور",
                      icon: RotateCcw,
                      onClick: () => handleResetPassword(u),
                    },
                    {
                      label: "حذف مستخدم",
                      icon: Trash2,
                      variant: "destructive",
                      onClick: () => handleDelete(u),
                    },
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(u) => {
            const initial = u.name
              .split(" ")
              .map((s) => s[0])
              .join("");
            return (
              <Card key={u.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {initial}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.role}</div>
                    </div>
                  </div>
                  <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                </div>
                <div className="font-mono text-xs text-muted-foreground">{u.email}</div>
                <div className="flex items-center justify-between mt-2">
                  {u.twofa ? (
                    <Badge tone="success">
                      <ShieldCheck size={11} className="inline ms-1" />
                      مفعّل
                    </Badge>
                  ) : (
                    <Badge tone="warning">غير مفعّل</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">آخر دخول: {u.last}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Btn variant="outline" className="flex-1 text-xs" onClick={() => handleEdit(u)}>
                    <Pencil size={12} /> تعديل
                  </Btn>
                  <Btn variant="outline" className="flex-1 text-xs" onClick={() => toggleStatus(u)}>
                    {u.status === "نشط" ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                    {u.status === "نشط" ? "تعطيل" : "تفعيل"}
                  </Btn>
                  <Btn
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => handleResetPassword(u)}
                  >
                    <RotateCcw size={12} />
                  </Btn>
                </div>
              </Card>
            );
          }}
        />

        <EntityFormDrawer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title="إضافة مستخدم جديد"
          onSave={handleAdd}
          saveText="إضافة"
        >
          <div>
            <label className="text-xs text-muted-foreground">الاسم *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">البريد الإلكتروني *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">رقم الجوال</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الدور</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الفرع</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formBranch}
              onChange={(e) => setFormBranch(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
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
          <div>
            <label className="text-xs text-muted-foreground">الصلاحيات</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formPerms}
              onChange={(e) => setFormPerms(e.target.value)}
            >
              {permsOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title="دعوة مستخدم جديد"
          onSave={handleInvite}
          saveText="إرسال الدعوة"
        >
          <div>
            <label className="text-xs text-muted-foreground">البريد الإلكتروني *</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الدور</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">رسالة الترحيب</label>
            <textarea
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm min-h-[80px]"
              value={inviteMsg}
              onChange={(e) => setInviteMsg(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        <EntityFormDrawer
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditUser(null);
          }}
          title="تعديل المستخدم"
          onSave={handleSaveEdit}
          saveText="حفظ التغييرات"
        >
          <div>
            <label className="text-xs text-muted-foreground">الاسم</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">البريد الإلكتروني</label>
            <input
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">الدور</label>
            <select
              className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
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
          title="تأكيد حذف المستخدم"
          message="هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء."
          confirmText="حذف"
          cancelText="إلغاء"
          variant="destructive"
        />
      </AppShell>
    );
  },
});
