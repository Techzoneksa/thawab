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
import { fmtSAR, fmtNum } from "@/data/sample";
import { label } from "@/lib/i18n/labels";
import { getCampaigns, updateCampaign, deleteCampaign, type Campaign } from "@/lib/api/campaigns";
import { CampaignStatus } from "@/lib/enums";
import { Plus, Megaphone, Pencil, Trash2, Eye, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{ title: "حملات التبرع — ثواب" }] }),
  component: () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
      queryKey: ["campaigns"],
      queryFn: () => getCampaigns(),
    });
    const items: Campaign[] = data?.items ?? [];
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });

    const statusMutation = useMutation({
      mutationFn: updateCampaign,
      onSuccess: (c) => {
        invalidate();
        showToast(`تم تغيير الحالة إلى ${label("campaignStatus", c.status)}`, "success");
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteCampaign,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف الحملة", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    return (
      <AppShell
        breadcrumb={["الرئيسية", "التبرعات", "الحملات"]}
        title="حملات التبرع"
        actions={
          <>
            <ExportButton
              data={items as unknown as Record<string, unknown>[]}
              filename="campaigns.csv"
            />
            <Btn variant="primary" onClick={() => navigate({ to: "/campaigns/new" })}>
              <Plus size={15} /> إضافة حملة
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="حملات التبرع" count={`${items.length} حملة`} />
        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الحملات</div>
        )}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState title="لا توجد حملات" description="ابدأ بإضافة أول حملة تبرع" />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((c) => {
            const pct = Math.round((c.raised / c.goal) * 100) || 0;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Megaphone size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{c.name}</h3>
                      <div className="text-xs text-muted-foreground font-mono">{c.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge tone={statusTone(c.status)}>{label("campaignStatus", c.status)}</Badge>
                    <ActionMenu
                      actions={[
                        {
                          label: "تعديل",
                          icon: Pencil,
                          onClick: () =>
                            navigate({ to: "/campaigns/$id/edit", params: { id: c.id } }),
                        },
                        {
                          label: "إنهاء",
                          icon: CheckCircle,
                          onClick: () =>
                            statusMutation.mutate({ id: c.id, status: CampaignStatus.COMPLETED }),
                        },
                        {
                          label: "إلغاء",
                          icon: XCircle,
                          onClick: () =>
                            statusMutation.mutate({ id: c.id, status: CampaignStatus.CANCELLED }),
                        },
                        {
                          label: "حذف",
                          icon: Trash2,
                          variant: "destructive" as const,
                          onClick: () => setConfirmId(c.id),
                        },
                      ]}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold tabular-nums">{fmtSAR(c.raised)}</span>
                    <span className="text-muted-foreground">من {fmtSAR(c.goal)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${pct >= 100 ? "bg-success" : "bg-gradient-to-l from-primary to-info"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {pct}% من الهدف · {fmtNum(c.donorCount ?? 0)} متبرع
                    {c.endDate ? ` · حتى ${c.endDate}` : ""}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الحملة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
