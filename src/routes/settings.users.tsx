import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { showToast, ConfirmDialog, ActionMenu, ExportButton } from "@/components/erp/actions";
import { UserCog, Plus, Pencil, Ban, CheckCircle2, KeyRound } from "lucide-react";
import { getUsers, updateUser, disableUser, type AppUser } from "@/lib/api/users";
import { label } from "@/lib/i18n/labels";
import { UserStatus } from "@/lib/enums";

export const Route = createFileRoute("/settings/users")({
  head: () => ({ meta: [{ title: "المستخدمون — ثواب" }] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => getUsers() });
  const users = data?.items ?? [];
  const roles = data?.roles ?? [];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const updateMut = useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      invalidate();
      showToast("تم حفظ التغييرات", "success");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const openCreate = () => navigate({ to: "/settings/users/new" });
  const openEdit = (u: AppUser) =>
    navigate({ to: "/settings/users/$id/edit", params: { id: u.id } });

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
