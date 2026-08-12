import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  statusTone,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { label } from "@/lib/i18n/labels";
import { getMemberships, deleteMembership, type Membership } from "@/lib/api/memberships";
import { MembershipType } from "@/lib/enums";
import { UsersRound, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/memberships")({
  head: () => ({ meta: [{ title: "العضويات — ثواب" }] }),
  component: () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
      queryKey: ["memberships"],
      queryFn: () => getMemberships(),
    });
    const items: Membership[] = data?.items ?? [];

    const deleteMutation = useMutation({
      mutationFn: deleteMembership,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["memberships"] });
        showToast("تم حذف العضو", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const countType = (t: string) => items.filter((m) => m.type === t).length;

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "العضويات"]}
        title="العضويات ومجلس الإدارة"
        actions={
          <>
            <ExportButton
              data={items as unknown as Record<string, unknown>[]}
              filename="memberships.csv"
            />
            <Btn variant="primary" onClick={() => navigate({ to: "/memberships/new" })}>
              <Plus size={15} /> إضافة عضو
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="العضويات ومجلس الإدارة" count={`${items.length} عضو`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { l: "إجمالي الأعضاء", v: String(items.length) },
            { l: "مجلس الإدارة", v: String(countType(MembershipType.BOARD)) },
            { l: "الجمعية العمومية", v: String(countType(MembershipType.GENERAL_ASSEMBLY)) },
            { l: "اللجان", v: String(countType(MembershipType.COMMITTEE)) },
          ].map((s) => (
            <Card key={s.l} className="p-4">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <h3 className="font-bold mb-3">الأعضاء</h3>
          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
          )}
          {error && (
            <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الأعضاء</div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <EmptyState title="لا يوجد أعضاء" description="ابدأ بإضافة أعضاء مجلس الإدارة" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {label("membershipRole", m.role)} · {label("membershipType", m.type)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={statusTone(m.status)}>{label("membershipStatus", m.status)}</Badge>
                  <ActionMenu
                    actions={[
                      {
                        label: "تعديل",
                        icon: Pencil,
                        onClick: () =>
                          navigate({ to: "/memberships/$id/edit", params: { id: m.id } }),
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmId(m.id),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف العضو؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
